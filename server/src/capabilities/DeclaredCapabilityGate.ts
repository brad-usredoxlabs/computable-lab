/**
 * DeclaredCapabilityGate — the policy-free interpreter of the `x-capability-gate`
 * annotation (INSTR-COLLAPSE-1 C2, OQ-1 decision (a)).
 *
 * The DECLARATION lives in the schema YAML on the ref slot it governs
 * (precedents: `x-jsonld` on a schema property read by ContextBuilder.ts:154;
 * `derivedFrom.fn: <registered function name>` in verb-definition.schema.yaml).
 * This file is the single TS interpreter: it reads the payload's schema, finds
 * properties carrying `x-capability-gate`, resolves the verb strictly from
 * payload data via resolvers registered BY NAME, and asks
 * EquipmentCapabilityService.resolveEquipmentSupport (capabilityAuthorization.ts
 * {equipmentId, verbId, methodId?}) whether the equipment declares that verb.
 *
 * Hard-rule posture:
 * - H1: no device names, no id-prefix sniffs, no "only VERB-READ measures"
 *   rule here. The verb to check comes from the operation's own data.
 * - H2: no TS verb literal anywhere in this file.
 * - Fail closed: a gate whose verb chain cannot be resolved rejects with
 *   `capability_gate_verb_unresolvable` — a silent pass would make the gate
 *   theater (OQ-1 decision).
 * - Rip-out property: remove the annotation from the YAML and this gate does
 *   nothing (verified in DeclaredCapabilityGate.test.ts).
 */
import type { AjvValidator } from '../validation/AjvValidator.js';
import type { RecordStore, RecordEnvelope } from '../store/types.js';
import { EquipmentCapabilityService } from './EquipmentCapabilityService.js';

export type CapabilityGateCode =
  | 'capability_gate_unsupported'
  | 'capability_gate_verb_unresolvable';

export interface CapabilityGateViolation {
  code: CapabilityGateCode;
  message: string;
  equipmentId?: string;
  verbId?: string;
}

type SchemaNode = Record<string, unknown>;

interface GateAnnotation {
  verbFrom?: {
    resolver?: string;
    path?: string;
    graphPath?: string;
  };
}

interface ResolverContext {
  /** The object that CONTAINS the gated ref slot (sibling data lives here). */
  container: Record<string, unknown>;
  gate: GateAnnotation;
  store: Pick<RecordStore, 'get' | 'list'>;
}

type VerbResolver = (context: ResolverContext) => Promise<string | undefined>;

function refIdOf(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const id = (value as Record<string, unknown>).id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/**
 * Resolvers registered BY NAME — the annotation names the function (data-names-
 * a-registered-resolver precedent, verb-definition.schema.yaml `derivedFrom.fn`).
 * C2 ships exactly these two.
 */
const VERB_RESOLVERS: Record<string, VerbResolver> = {
  /** Pure path read: `<sibling>.id` on the same object as the gated slot
   *  (planned-run CompiledProtocolStep carries verbRef beside equipmentRef). */
  'sibling-verb-ref': async ({ container, gate }) => {
    const path = gate.verbFrom?.path;
    if (!path) return undefined;
    return refIdOf(container[path]);
  },

  /** The producing READ EVENT's data: payload's eventGraphRef -> stored
   *  event-graph -> the event whose eventId === readEventRef ->
   *  semanticKeyComponents.verb (a CANONICAL NAME string, data) -> mapped to
   *  the VERB-* record id through the verb-definition store, reusing the exact
   *  byCanonical index shape ProtocolCompiler.resolveVerbDefinitions uses. */
  'read-event-verb': async ({ container, gate, store }) => {
    const eventPath = gate.verbFrom?.path;
    const graphPath = gate.verbFrom?.graphPath;
    if (!eventPath || !graphPath) return undefined;

    const readEventRef = container[eventPath];
    const graphId = refIdOf(container[graphPath]);
    if (typeof readEventRef !== 'string' || readEventRef.length === 0 || !graphId) return undefined;

    const envelope: RecordEnvelope | null = await store.get(graphId);
    const graph = envelope?.payload as { events?: Array<Record<string, unknown>> } | undefined;
    const event = (graph?.events ?? []).find((candidate) => candidate.eventId === readEventRef);
    const components = event?.semanticKeyComponents as Record<string, unknown> | undefined;
    const canonical = components?.verb;
    if (typeof canonical !== 'string' || canonical.length === 0) return undefined;

    const verbEnvelopes = await store.list({ kind: 'verb-definition' });
    const verb = verbEnvelopes
      .map((candidate) => candidate.payload as { kind?: string; id?: string; canonical?: string })
      .find((payload) => payload?.kind === 'verb-definition' && payload.canonical === canonical);
    return verb?.id;
  },
};

/** Follow same-document JSON-Pointer refs (#/...) so gated $defs items resolve. */
function resolveLocalRef(node: SchemaNode, root: SchemaNode): SchemaNode | undefined {
  let current: SchemaNode | undefined = node;
  let guard = 0;
  while (current && typeof current.$ref === 'string' && current.$ref.startsWith('#/') && guard < 20) {
    guard += 1;
    let cursor: unknown = root;
    for (const rawSegment of current.$ref.slice(2).split('/')) {
      const segment = rawSegment.replace(/~1/g, '/').replace(/~0/g, '~');
      if (cursor === null || typeof cursor !== 'object') return undefined;
      cursor = (cursor as Record<string, unknown>)[segment];
    }
    if (cursor === null || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined;
    current = cursor as SchemaNode;
  }
  return current;
}

/** Walk schema and payload in parallel; report every gated slot the payload fills. */
function visitGatedSlots(
  schemaNode: SchemaNode,
  payloadNode: unknown,
  root: SchemaNode,
  report: (gate: GateAnnotation, slotValue: unknown, container: Record<string, unknown>) => void,
): void {
  const resolved = resolveLocalRef(schemaNode, root);
  if (!resolved || payloadNode === null || typeof payloadNode !== 'object') return;

  for (const combinator of ['allOf', 'anyOf', 'oneOf'] as const) {
    const subschemas = resolved[combinator];
    if (Array.isArray(subschemas)) {
      for (const sub of subschemas) {
        if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
          visitGatedSlots(sub as SchemaNode, payloadNode, root, report);
        }
      }
    }
  }

  if (!Array.isArray(payloadNode)) {
    const payload = payloadNode as Record<string, unknown>;
    const properties = resolved.properties;
    if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
      for (const [key, rawDef] of Object.entries(properties as Record<string, unknown>)) {
        const value = payload[key];
        if (value === undefined) continue;
        if (rawDef && typeof rawDef === 'object' && !Array.isArray(rawDef)) {
          const def = rawDef as SchemaNode;
          const gate = def['x-capability-gate'];
          if (gate && typeof gate === 'object' && !Array.isArray(gate)) {
            report(gate as GateAnnotation, value, payload);
          }
          visitGatedSlots(def, value, root, report);
        }
      }
    }
  }

  const items = resolved.items;
  if (items && Array.isArray(payloadNode)) {
    for (const element of payloadNode) {
      if (element && typeof element === 'object') {
        visitGatedSlots(items as SchemaNode, element, root, report);
      }
    }
  }
}

export interface DeclaredCapabilityGateInput {
  payload: Record<string, unknown>;
  schemaId: string;
  validator: Pick<AjvValidator, 'getSchema'>;
  store: Pick<RecordStore, 'get' | 'list'>;
}

/**
 * Evaluate every `x-capability-gate` the payload's schema declares for the
 * slots this payload fills. Returns the FIRST violation, or null when every
 * declared gate resolves to a supported capability.
 */
export async function evaluateDeclaredCapabilityGate(
  input: DeclaredCapabilityGateInput,
): Promise<CapabilityGateViolation | null> {
  const validateFn = input.validator.getSchema(input.schemaId) as { schema?: SchemaNode } | undefined;
  const root = validateFn?.schema;
  if (!root) return null;

  const gates: Array<{ gate: GateAnnotation; slotValue: unknown; container: Record<string, unknown> }> = [];
  visitGatedSlots(root, input.payload, root, (gate, slotValue, container) => {
    gates.push({ gate, slotValue, container });
  });
  if (gates.length === 0) return null;

  const capabilityService = new EquipmentCapabilityService(input.store);

  for (const { gate, slotValue, container } of gates) {
    const equipmentId = refIdOf(slotValue);
    if (!equipmentId) {
      return {
        code: 'capability_gate_unsupported',
        message: 'capability gate: the gated equipment ref slot carries no record id',
      };
    }

    const resolverName = gate.verbFrom?.resolver;
    const resolver = resolverName ? VERB_RESOLVERS[resolverName] : undefined;
    if (!resolver) {
      return {
        code: 'capability_gate_verb_unresolvable',
        equipmentId,
        message: `capability gate: resolver "${resolverName ?? '(missing)'}" is not registered (fail closed)`,
      };
    }

    const verbId = await resolver({ container, gate, store: input.store });
    if (!verbId) {
      return {
        code: 'capability_gate_verb_unresolvable',
        equipmentId,
        message: `capability gate: no verb-definition could be resolved from the payload data for equipment ${equipmentId} (fail closed)`,
      };
    }

    const support = await capabilityService.resolveEquipmentSupport({
      equipmentId,
      verbId,
    });
    if (!support.supported) {
      return {
        code: 'capability_gate_unsupported',
        equipmentId,
        verbId,
        message: `capability gate: equipment ${equipmentId} does not declare the ${verbId} capability required by this write`,
      };
    }
  }

  return null;
}
