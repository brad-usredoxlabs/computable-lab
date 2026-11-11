/**
 * Protocol list helpers for run payloads.
 *
 * A run carries either:
 *  - localProtocolRef (legacy, single) — read-compat only, returns a one-element list
 *  - localProtocolRefs (ordered array) — the canonical form
 *
 * When both are present, the list wins and the singular ref is deduplicated
 * by id (first occurrence keeps its position).
 */

export interface ProtocolRef {
  kind: string;
  id: string;
  type?: string;
  [key: string]: unknown;
}

/** Extract the id from a ref entry (string or object with id). */
function refId(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.id === 'string' && obj.id.length > 0) return obj.id;
  }
  return undefined;
}

/**
 * Return the ordered protocol refs carried by a run payload.
 *
 * Precedence: localProtocolRefs > localProtocolRef > protocolRef > sourceRef.
 * sourceRef is consulted only when sourceType === 'protocol' (an event-graph
 * sourceRef names an event graph, not a protocol).
 * Dedupe by id — first occurrence keeps its position.
 */
export function protocolRefsOf(payload: Record<string, unknown>): ProtocolRef[] {
  const refs: ProtocolRef[] = [];
  const seen = new Set<string>();

  const push = (value: unknown) => {
    if (value !== null && typeof value === 'object') {
      const id = refId(value);
      if (id && !seen.has(id)) {
        seen.add(id);
        refs.push(value as ProtocolRef);
      }
    }
  };

  // 1. localProtocolRefs (ordered list — highest precedence)
  const maybeList = payload.localProtocolRefs;
  if (Array.isArray(maybeList)) {
    for (const entry of maybeList) {
      push(entry);
    }
  }

  // 2. localProtocolRef (legacy singular)
  const singular = payload.localProtocolRef;
  push(singular);

  // 3. protocolRef (lab-layer reference)
  const protocolRef = payload.protocolRef;
  push(protocolRef);

  // 4. sourceRef — only when sourceType is 'protocol'
  if (payload.sourceType === 'protocol') {
    const sourceRef = payload.sourceRef;
    push(sourceRef);
  }

  return refs;
}

/** Return the ids of the protocol refs in order. */
export function protocolIdsOf(payload: Record<string, unknown>): string[] {
  return protocolRefsOf(payload).map((ref) => ref.id);
}

/** Return the id of the first (lead) protocol ref, or undefined. */
export function leadProtocolId(payload: Record<string, unknown>): string | undefined {
  const refs = protocolRefsOf(payload);
  return refs[0]?.id;
}

/**
 * Attach a protocol ref to a run payload, returning a new payload.
 *
 * Idempotent: if the ref's id is already in the list, it is not added again.
 * If the payload only has the legacy singular form, the list form is returned
 * while the legacy field is preserved untouched (read-compat).
 */
export function withAttachedProtocol(
  payload: Record<string, unknown>,
  ref: ProtocolRef,
): Record<string, unknown> {
  const refIdValue = refId(ref);
  if (!refIdValue) return { ...payload };

  const existingIds = protocolIdsOf(payload);
  if (existingIds.includes(refIdValue)) {
    return { ...payload };
  }

  // Build new list: include all existing refs (list + legacy singular) + new ref
  const existingRefs = protocolRefsOf(payload);
  const newPayload: Record<string, unknown> = {
    ...payload,
    localProtocolRefs: existingRefs.concat([ref]),
  };

  return newPayload;
}

/**
 * Detach a protocol ref (by id) from a run payload, returning a new payload.
 *
 * Inverse of withAttachedProtocol; idempotent and never mutates the input.
 * Removes every matching list entry and deletes the legacy singular ref when
 * it names the same id, so protocolRefsOf cannot re-surface the detached ref.
 */
export function withDetachedProtocol(
  payload: Record<string, unknown>,
  protocolId: string,
): Record<string, unknown> {
  const maybeList = payload.localProtocolRefs;
  const list = Array.isArray(maybeList) ? maybeList : [];
  const filtered = list.filter((entry) => refId(entry) !== protocolId);
  const dropSingular = refId(payload.localProtocolRef) === protocolId;

  if (filtered.length === list.length && !dropSingular) {
    return { ...payload };
  }

  const newPayload: Record<string, unknown> = {
    ...payload,
    localProtocolRefs: filtered,
  };
  if (dropSingular) delete newPayload.localProtocolRef;

  return newPayload;
}
