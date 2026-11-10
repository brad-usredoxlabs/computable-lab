/**
 * Client-side reader for a planned run's ATTACHED protocols.
 *
 * This is a small local MIRROR of the server's
 * `server/src/protocol/runProtocolList.ts` (a separate ESM layer the app must
 * not import): `localProtocolRefs` is the ordered, canonical form and wins
 * over the legacy singular `localProtocolRef`; ids are de-duplicated
 * first-occurrence-wins. The client additionally accepts the PLR's
 * `protocolRef` / `sourceRef` — the pre-list read-compat fallback
 * `RunProtocolStepsLoader` has always used — so a planned run authored before
 * `localProtocolRefs` existed still shows its protocol on the run surface.
 *
 * No sorting and no truncation: the payload's order IS the lead-first
 * protocol order.
 */

export interface ReadProtocolRef {
  id: string
  label?: string
}

/** Read a ref node (or bare id string) into `{ id, label? }` — null when it names no id. */
function toRef(value: unknown): ReadProtocolRef | null {
  if (typeof value === 'string') return value.length > 0 ? { id: value } : null
  if (value === null || typeof value !== 'object') return null
  const obj = value as Record<string, unknown>
  if (typeof obj.id !== 'string' || obj.id.length === 0) return null
  const label = typeof obj.label === 'string' && obj.label.length > 0 ? obj.label : undefined
  return { id: obj.id, ...(label ? { label } : {}) }
}

/**
 * Return the ordered protocol refs carried by a planned-run payload.
 * Precedence: `localProtocolRefs` (when present and non-empty) is the answer;
 * otherwise `localProtocolRef`, then `protocolRef`, then `sourceRef`; `[]`
 * when the payload names no protocol at all.
 */
export function protocolRefsOf(payload: Record<string, unknown> | null | undefined): ReadProtocolRef[] {
  const body = payload ?? {}
  const list = body.localProtocolRefs
  if (Array.isArray(list) && list.length > 0) {
    const refs: ReadProtocolRef[] = []
    const seen = new Set<string>()
    for (const entry of list) {
      const ref = toRef(entry)
      if (ref && !seen.has(ref.id)) {
        seen.add(ref.id)
        refs.push(ref)
      }
    }
    return refs
  }
  const legacy = toRef(body.localProtocolRef)
  if (legacy) return [legacy]
  const fallback = toRef(body.protocolRef) ?? toRef(body.sourceRef)
  return fallback ? [fallback] : []
}
