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
 * Precedence: localProtocolRefs (list) > localProtocolRef (singular).
 * When both are present, dedupe by id — the list entries keep their
 * positions and the singular ref is dropped if its id already appears.
 */
export function protocolRefsOf(payload: Record<string, unknown>): ProtocolRef[] {
  const maybeList = payload.localProtocolRefs;
  if (Array.isArray(maybeList) && maybeList.length > 0) {
    const refs: ProtocolRef[] = [];
    const seen = new Set<string>();
    for (const entry of maybeList) {
      if (entry !== null && typeof entry === 'object') {
        const id = refId(entry);
        if (id && !seen.has(id)) {
          seen.add(id);
          refs.push(entry as ProtocolRef);
        }
      }
    }
    // If both list and singular are present, check singular for dedupe
    const singular = payload.localProtocolRef;
    const singularId = refId(singular);
    if (singularId && !seen.has(singularId)) {
      seen.add(singularId);
      if (singular !== null && typeof singular === 'object') {
        refs.push(singular as ProtocolRef);
      }
    }
    return refs;
  }

  // Legacy singular path
  const singular = payload.localProtocolRef;
  if (singular !== null && typeof singular === 'object') {
    const id = refId(singular);
    if (id) return [singular as ProtocolRef];
  }

  return [];
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
 * Inverse of withAttachedProtocol. Idempotent: detaching an id that is not
 * present returns a copy unchanged, and the input payload is never mutated.
 * Every list entry whose id matches is removed; when the legacy singular ref
 * names the same id it is deleted too, otherwise protocolRefsOf would
 * re-surface it through the read-compat path.
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
