/**
 * Local plan graph — the pure producer of a run's LOCAL plan from one bound
 * protocol. D8.3: a protocol is UNIVERSAL (it names roles, never a vendor or a
 * labware instance); the local plan exists only once those roles are bound.
 *
 * Input protocol is already resolved (the caller follows `inherits_from`); its
 * own `roles` declarations are the contract. Every object key ending in `Role`
 * is a role reference, whatever its domain: the walk is generic, so a new role
 * key needs no edit here. Each reference is replaced by the concrete ref object
 * stored in `bindings` — never by the role string, which would make the run lie
 * about what it will do.
 *
 * Failure is the deliverable (D8.4): an unbound or undeclared role yields a
 * NAMED error carrying roleId + stepId and NO events — never a partial graph,
 * never a guessed value. Nothing is measured here: no numeric is synthesized,
 * so details carry only what the protocol step already said.
 */

type Obj = Record<string, unknown>;
export interface BuildLocalPlanGraphInput {
  protocolId: string;
  protocol: unknown;
  bindings: unknown;
}

export interface LocalPlanEvent {
  eventId: string;
  stepId: string;
  event_type: string;
  details: Obj;
}

export type LocalPlanGraphErrorCode = 'UNBOUND_ROLE' | 'UNDECLARED_ROLE' | 'AMBIGUOUS_BINDING' | 'MALFORMED_PROTOCOL';

export type LocalPlanGraphResult =
  | { ok: true; protocolId: string; events: LocalPlanEvent[] }
  | { ok: false; code: 'UNBOUND_ROLE' | 'UNDECLARED_ROLE' | 'AMBIGUOUS_BINDING'; roleId: string; stepId: string }
  | { ok: false; code: 'MALFORMED_PROTOCOL'; message: string };

function asObject(value: unknown): Obj | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Obj) : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function malformed(message: string): LocalPlanGraphResult {
  return { ok: false, code: 'MALFORMED_PROTOCOL', message };
}

/** roleIds declared under any `roles.<key>[].roleId` array — declarations only. */
function declaredRoleIds(protocol: Obj): Set<string> {
  const declared = new Set<string>();
  const roles = asObject(protocol.roles);
  if (!roles) return declared;
  for (const entries of Object.values(roles)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const roleId = asObject(entry) ? asString(asObject(entry)!.roleId) : undefined;
      if (roleId) declared.add(roleId);
    }
  }
  return declared;
}

/**
 * The canonical ref key of each binding category, in schema order. Selection is
 * keyed, never positional: a LabwareBinding may also carry `labwareGeometryRef`,
 * and geometry is not the labware instance.
 */
const CANONICAL_REF_KEYS = [
  'labwareInstanceRef', 'materialRef', 'instrumentRef', 'contextRef', 'templateRef', 'libraryRef',
] as const;

/** A concrete ref is an object carrying a non-empty `kind`. */
function asRef(value: unknown): Obj | undefined {
  const obj = asObject(value);
  return obj && asString(obj.kind) ? obj : undefined;
}

interface RefResolution {
  ref: Obj;
}

/** undefined = the entry has no concrete ref; `ambiguous` = canonical keys disagree. */
type ConcreteRef = RefResolution | { ambiguous: true } | undefined;

/** The concrete ref of a binding entry, chosen by category key. */
function concreteRef(entry: Obj): ConcreteRef {
  const canonical = CANONICAL_REF_KEYS.map((key) => asRef(entry[key])).filter((ref): ref is Obj => ref !== undefined);
  const [canonicalRef] = canonical;
  // Two kind-bearing canonical keys on one binding: refuse rather than pick.
  if (canonicalRef) return canonical.length === 1 ? { ref: canonicalRef } : { ambiguous: true };
  // No canonical key present: the generic first-kind-value fallback applies.
  const generic = Object.entries(entry)
    .filter(([key]) => key !== 'roleId')
    .map(([, value]) => asRef(value))
    .filter((ref): ref is Obj => ref !== undefined);
  const [genericRef] = generic;
  if (!genericRef) return undefined;
  return generic.length === 1 ? { ref: genericRef } : { ambiguous: true };
}

/** Flatten `bindings.<category>[].roleId` -> resolution, whatever the category. */
function bindingRefs(bindings: unknown): Map<string, ConcreteRef> {
  const index = new Map<string, ConcreteRef>();
  const root = asObject(bindings);
  if (!root) return index;
  for (const entries of Object.values(root)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const binding = asObject(entry);
      const roleId = binding ? asString(binding.roleId) : undefined;
      const resolution = binding ? concreteRef(binding) : undefined;
      if (roleId && resolution) index.set(roleId, resolution);
    }
  }
  return index;
}

/** Every role-reference string in the step, in traversal order. */
function roleReferences(value: unknown, out: string[]): void {
  if (Array.isArray(value)) {
    for (const child of value) roleReferences(child, out);
    return;
  }
  const obj = asObject(value);
  if (!obj) return;
  for (const [key, child] of Object.entries(obj)) {
    if (key.endsWith('Role') && typeof child === 'string') out.push(child);
    else roleReferences(child, out);
  }
}

/** Raised when the binding pass cannot resolve a role; converted to a named error. */
class RoleBindingFailure extends Error {
  constructor(readonly code: 'UNBOUND_ROLE' | 'AMBIGUOUS_BINDING', readonly roleId: string) {
    super(`${code}: ${roleId}`);
  }
}

/**
 * Same walk, replacing each role-reference string with its concrete ref. There
 * is NO fallback to the role string: a missing ref throws, so an abstract role
 * can never leak into the emitted plan.
 */
function bindRoleReferences(value: unknown, resolve: (roleId: string) => Obj): unknown {
  if (Array.isArray(value)) return value.map((child) => bindRoleReferences(child, resolve));
  const obj = asObject(value);
  if (!obj) return value;
  const bound: Obj = {};
  for (const [key, child] of Object.entries(obj)) {
    if (key.endsWith('Role') && typeof child === 'string') {
      bound[key] = resolve(child);
    } else {
      bound[key] = bindRoleReferences(child, resolve);
    }
  }
  return bound;
}

export function buildLocalPlanGraph(input: BuildLocalPlanGraphInput): LocalPlanGraphResult {
  const protocol = asObject(input.protocol);
  if (!protocol) return malformed('protocol is not an object');
  if (!Array.isArray(protocol.steps)) return malformed('protocol has no steps array');

  const declared = declaredRoleIds(protocol);
  const refs = bindingRefs(input.bindings);
  const events: LocalPlanEvent[] = [];

  for (let index = 0; index < protocol.steps.length; index += 1) {
    const step = asObject(protocol.steps[index]);
    if (!step) return malformed(`step ${index} is not an object`);
    const stepId = asString(step.stepId);
    const eventType = asString(step.kind);
    if (!stepId) return malformed(`step ${index} has no stepId`);
    if (!eventType) return malformed(`step ${index} has no kind`);

    const referenced: string[] = [];
    roleReferences(step, referenced);
    for (const roleId of referenced) {
      if (!declared.has(roleId)) return { ok: false, code: 'UNDECLARED_ROLE', roleId, stepId };
    }

    // The binding pass is the only source of a concrete ref; `resolve` throws
    // rather than substituting the role string, so absence cannot pass silently.
    const resolve = (roleId: string): Obj => {
      const resolution = refs.get(roleId);
      if (!resolution) throw new RoleBindingFailure('UNBOUND_ROLE', roleId);
      if ('ambiguous' in resolution) throw new RoleBindingFailure('AMBIGUOUS_BINDING', roleId);
      return resolution.ref;
    };

    let details: Obj;
    try {
      details = asObject(bindRoleReferences(step, resolve)) ?? {};
    } catch (error) {
      if (error instanceof RoleBindingFailure) return { ok: false, code: error.code, roleId: error.roleId, stepId };
      throw error;
    }

    events.push({ eventId: `${index}-${stepId}`, stepId, event_type: eventType, details });
  }

  return { ok: true, protocolId: input.protocolId, events };
}
