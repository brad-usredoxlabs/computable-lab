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

export type LocalPlanGraphErrorCode = 'UNBOUND_ROLE' | 'UNDECLARED_ROLE' | 'MALFORMED_PROTOCOL';

export type LocalPlanGraphResult =
  | { ok: true; protocolId: string; events: LocalPlanEvent[] }
  | { ok: false; code: 'UNBOUND_ROLE' | 'UNDECLARED_ROLE'; roleId: string; stepId: string }
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

/** The concrete ref of a binding entry: its one object value (refs carry `kind`). */
function concreteRef(entry: Obj): Obj | undefined {
  for (const value of Object.values(entry)) {
    const ref = asObject(value);
    if (ref && asString(ref.kind)) return ref;
  }
  return undefined;
}

/** Flatten `bindings.<category>[].roleId` -> concrete ref, whatever the category. */
function bindingRefs(bindings: unknown): Map<string, Obj> {
  const index = new Map<string, Obj>();
  const root = asObject(bindings);
  if (!root) return index;
  for (const entries of Object.values(root)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const binding = asObject(entry);
      const roleId = binding ? asString(binding.roleId) : undefined;
      const ref = binding ? concreteRef(binding) : undefined;
      if (roleId && ref) index.set(roleId, ref);
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

/** Same walk, replacing each role-reference string with its concrete ref. */
function bindRoleReferences(value: unknown, refs: Map<string, Obj>): unknown {
  if (Array.isArray(value)) return value.map((child) => bindRoleReferences(child, refs));
  const obj = asObject(value);
  if (!obj) return value;
  const bound: Obj = {};
  for (const [key, child] of Object.entries(obj)) {
    if (key.endsWith('Role') && typeof child === 'string') {
      bound[key] = refs.get(child) ?? child;
    } else {
      bound[key] = bindRoleReferences(child, refs);
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
      if (!refs.has(roleId)) return { ok: false, code: 'UNBOUND_ROLE', roleId, stepId };
    }

    events.push({
      eventId: `${index}-${stepId}`,
      stepId,
      event_type: eventType,
      details: asObject(bindRoleReferences(step, refs)) ?? {},
    });
  }

  return { ok: true, protocolId: input.protocolId, events };
}
