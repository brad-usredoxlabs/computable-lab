/**
 * GC-13 (leg E) — ClaimWorkspace evidence-ledger model, as DATA.
 *
 * The ledger groups evidence bundles by the stance they take TOWARD THIS
 * CLAIM: directly (supports[]/refutes[]/assesses[] naming the claim ref) or
 * via the claim's assertions (the bundle targets an assertion whose
 * claim_ref names this claim — the D1 join semantics, reused). The
 * related-records scan is a full O(N) exact-string match (bait #7): its
 * refField output is NOT typed, so this module filters by schemaId and
 * re-reads each record's payload before believing it. No policy lives in
 * the component; the grouping rules are the pure functions here.
 */

export interface RelatedRecord {
  recordId: string
  schemaId: string
  kind: string
  title: string
  refField: string
}

export type Stance = 'supports' | 'refutes' | 'assesses'

export const STANCES: readonly Stance[] = ['supports', 'refutes', 'assesses']

/** The record kind from a schema id ('.../evidence.schema.yaml' ->
 *  'evidence'). The related-scan output is untyped (bait #7) — this is the
 *  client-side schemaId filter the spec mandates. */
export function schemaKind(schemaId: string): string | null {
  const m = /\/([a-z0-9-]+)\.schema\.yaml$/i.exec(schemaId)
  return m !== null ? m[1] : null
}

function refIds(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const x of v) {
    if (x !== null && typeof x === 'object') {
      const r = x as Record<string, unknown>
      if (r.kind === 'record' && typeof r.id === 'string') out.push(r.id)
    } else if (typeof x === 'string') {
      // the related-scan matches plain strings too — a stance array may
      // carry a bare id; treat it as a ref (loud, typed downstream).
      out.push(x)
    }
  }
  return out
}

/** The stance a bundle takes toward the claim, or null. Direct: one of the
 *  stance arrays names the claim. Via assertion: a stance array names an
 *  assertion that is in `assertionIdsOfClaim` (that assertion's claim_ref
 *  names this claim). */
export function stanceTowardClaim(
  evdPayload: Record<string, unknown>,
  claimId: string,
  assertionIdsOfClaim: ReadonlySet<string>,
): Stance | null {
  for (const stance of STANCES) {
    const ids = refIds(evdPayload[stance])
    if (ids.includes(claimId)) return stance
  }
  for (const stance of STANCES) {
    const ids = refIds(evdPayload[stance])
    if (ids.some((id) => assertionIdsOfClaim.has(id))) return stance
  }
  return null
}

/** The analysis-run (or run) ids a set of evidence bundles point at — the
 *  sources[] refs are the bundle's WHY/WHAT anchors; run-typed sources are
 *  the reciprocal run->claim link (the results surface's back-link). */
export function runIdsFromEvidence(payloads: Record<string, unknown>[]): string[] {
  const out = new Set<string>()
  for (const p of payloads) {
    const sources = p['sources']
    if (!Array.isArray(sources)) continue
    for (const s of sources) {
      if (s === null || typeof s !== 'object') continue
      const ref = (s as Record<string, unknown>)['ref']
      if (ref === null || typeof ref !== 'object') continue
      const r = ref as Record<string, unknown>
      if (r.kind === 'record' && typeof r.id === 'string' && (r.type === 'analysis-run' || r.type === 'run')) {
        out.add(r.id)
      }
    }
  }
  return [...out]
}

/** The claim ids a set of evidence bundles target (the bundle's stance
 *  arrays naming claim refs) — the reciprocal claim link per bundle. */
export function claimIdsFromEvidence(payloads: Record<string, unknown>[]): string[] {
  const out = new Set<string>()
  for (const p of payloads) {
    for (const stance of STANCES) {
      for (const x of Array.isArray(p[stance]) ? p[stance] : []) {
        if (x === null || typeof x !== 'object') continue
        const r = x as Record<string, unknown>
        if (r.kind === 'record' && typeof r.id === 'string' && r.type === 'claim') out.add(r.id)
      }
    }
  }
  return [...out]
}

/** The assertion ids a set of evidence bundles target (any stance array). */
export function assertionIdsFromEvidence(payloads: Record<string, unknown>[]): string[] {
  const out = new Set<string>()
  for (const p of payloads) {
    for (const stance of STANCES) {
      for (const id of refIds(p[stance])) {
        if (id !== '') out.add(id)
      }
    }
  }
  return [...out]
}
