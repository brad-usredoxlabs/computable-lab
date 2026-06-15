/**
 * rankByLabelMatch — surface the closest term first in an ontology/result list.
 *
 * The resolve spine and OLS rank by relevance score, but a fetch window can
 * bury the bare term ("isopropanol") under longer derivatives ("isopropanol
 * dehydrogenase"). This re-ranks by how the label matches the query: exact →
 * prefix → substring → other; within a tier the SHORTER label wins. The sort is
 * stable, so items the caller already ordered by score keep that order within a
 * tie — no explicit score tiebreak needed (pass score-sorted input).
 */

/** 0 = exact, 1 = prefix, 2 = substring, 3 = no textual match. */
export function labelMatchTier(label: string, query: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 3
  const l = label.trim().toLowerCase()
  if (l === q) return 0
  if (l.startsWith(q)) return 1
  if (l.includes(q)) return 2
  return 3
}

export function rankByLabelMatch<T>(items: T[], getLabel: (item: T) => string, query: string): T[] {
  return [...items].sort((a, b) => {
    const ta = labelMatchTier(getLabel(a), query)
    const tb = labelMatchTier(getLabel(b), query)
    if (ta !== tb) return ta - tb
    return getLabel(a).length - getLabel(b).length
  })
}
