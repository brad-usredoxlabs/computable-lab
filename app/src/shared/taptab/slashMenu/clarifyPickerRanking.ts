/**
 * L2-CLARIFY-PICKER-1 P1 — the material clarification-candidate comparator.
 *
 * The comparator ALGORITHM is structural imperative code (it decides no
 * policy); the RANK TABLE, the can-be-default flags, and the contains-section
 * label are DATA — declared on the registry `candidate_ranking` block
 * (OQ2), served on `GET /materials/profiles` (OQ1), and read once through the
 * module cache in ./policy. The comparator takes the policy as an argument so
 * it stays PURE and unit-testable; `resolvers.ts` passes the cached policy.
 *
 * It REORDERS candidates; it never auto-selects, auto-answers, or hides one.
 * Bands (the algorithm):
 *   1. label-equality with the query noun (trim + case-insensitive) FIRST;
 *   2. rows whose label merely CONTAINS the noun collapse under a section
 *      whose label comes from the data-declared `containsSectionLabel`
 *      template (`contains "DMEM" (9)`);
 *   3. within each band: the row's declared family `rank`, then
 *      `title.localeCompare` (today's tie-break);
 *   4. non-matching rows keep their declared-rank order BELOW the contains band.
 *
 * The `composition` pseudo-family (aggregateComponentTokens(label).length > 1,
 * the L2-TERM-1 UC-D4 structural signal) OVERRIDES the row's category family —
 * a composition is a Composition under any ontology. Its `can_be_default` is
 * false in the data, so a composition row can NEVER hold the focused default
 * (the W1 bug). Enforcement is against the data flag, never label shape.
 *
 * ABSENT policy (the registry declares no candidate_ranking) => NO ranking at
 * all: the rows keep their resolver-emitted order (backend relevance). There
 * is no fallback table, ever — no rank integer survives in this file.
 */

/** The comparator's input row (a material search hit or formulation summary). */
export interface MaterialCandidateItem {
  recordId: string
  /** The material mention kind (`material`, `material-spec`, …). */
  kind: string
  /** The record's title/label. */
  title: string
  /** The search-category family key (`saved-stock`, …). */
  category: string
  /** Optional subtitle (the layer word). */
  subtitle?: string
}

/** The material mention kind a candidate row binds. */
export type MaterialCandidateKind =
  | 'material'
  | 'material-spec'
  | 'material-instance'
  | 'aliquot'
  | 'vendor-product'

/** One declared family in the candidate-ranking table (DATA). */
export interface CandidateRankingFamily {
  rank: number
  canBeDefault: boolean
}

/** The candidate-ranking declaration (DATA, from the registry). */
export interface CandidateRankingPolicy {
  /** The contains-noun section label template (`{label}`, `{count}`). */
  containsSectionLabel: string
  /** Family table keyed by search category + the `composition` pseudo-family. */
  families: Record<string, CandidateRankingFamily>
}

/** The comparator's output row (a rankable, renderable candidate). */
export interface RankedCandidateRow {
  key: string
  label: string
  /** The material mention kind the row binds. */
  mentionKind: MaterialCandidateKind
  /** The record id. */
  recordId: string
  /** The row's resolved family key (category, or `composition` when aggregate). */
  family: string
  /**
   * Whether the row may hold the focused default (the data flag). ABSENT when
   * no ranking is declared (byte-stability: the row carries no new fields at
   * all in that case) or when the family is defaultable; `false` ONLY for the
   * composition pseudo-family (the never-default rule, regardless of rank).
   */
  canBeDefault?: boolean
  /**
   * The per-row commit-consequence line (P2): what picking the row binds,
   * generated from the row's own record. Absent for a synthetic section header.
   */
  consequence?: string
  /**
   * The contains-section label for the FIRST row of a contains band (the
   * data-declared template filled in). Absent for all other rows.
   */
  sectionLabel?: string
}

/**
 * The aggregate structural signal (L2-TERM-1 UC-D4): a multi-part composite
 * label (the aggregate joiner the platform writes) reads as a composition.
 * A composition is not a term under any ontology. This is a search-shape
 * check, not a label heuristic — it keys on the structural token count only.
 */
const AGGREGATE_JOINERS = [' + ', ',', '/']

export function aggregateComponentTokens(label: string): string[] {
  if (!AGGREGATE_JOINERS.some((joiner) => label.includes(joiner))) return []
  let parts = [label]
  for (const joiner of AGGREGATE_JOINERS) {
    parts = parts.flatMap((part) => part.split(joiner))
  }
  const tokens: string[] = []
  for (const part of parts) {
    const token = part.trim()
    if (!token || tokens.includes(token)) continue
    tokens.push(token)
  }
  return tokens.length > 1 ? tokens : []
}

/** A row is a composition iff its label is a multi-part aggregate (UC-D4). */
export function isCompositionLabel(label: string): boolean {
  return aggregateComponentTokens(label).length > 1
}

function mentionKindOf(kind: string): MaterialCandidateKind {
  if (kind === 'material-spec') return 'material-spec'
  if (kind === 'material-instance') return 'material-instance'
  if (kind === 'aliquot') return 'aliquot'
  if (kind === 'vendor-product') return 'vendor-product'
  return 'material'
}

/**
 * P2 — the per-row commit-consequence line: what picking this row BINDS,
 * generated from the row's own record (no new chrome). Reuses the row's own
 * id/kind (the existing `detail` payload already carries them). A row that IS
 * a composition states `composition of N components` (N = its structural token
 * count); otherwise the row's own kind word. No new vocabulary: the kind words
 * are the existing ontology terms (concept / material-spec / instance /
 * aliquot / vendor-product).
 */
export function consequenceFor(item: MaterialCandidateItem): string {
  const kind = mentionKindOf(item.kind)
  const compositionTokens = aggregateComponentTokens(item.title)
  if (compositionTokens.length > 1) {
    return `binds ${kind} ${item.recordId} (composition of ${compositionTokens.length} components)`
  }
  const kindWord =
    kind === 'material' ? 'material record'
    : kind === 'material-instance' ? 'instance'
    : kind
  return `binds ${kindWord} ${item.recordId} "${item.title}" (${kind})`
}

/**
 * The row's family key: the `composition` pseudo-family OVERRIDES the category
 * for a multi-part aggregate label (UC-D4); otherwise the category family.
 */
function familyOf(item: MaterialCandidateItem): string {
  return isCompositionLabel(item.title) ? 'composition' : item.category
}

/**
 * The comparator (PURE). Reorders `items` for the query `noun` under the
 * data-declared `policy`. Returns a new array (input order is preserved when
 * `policy` is null — the ABSENT-declaration => no-ranking rule).
 */
export function materialCandidates(
  items: MaterialCandidateItem[],
  noun: string,
  policy: CandidateRankingPolicy | null,
): RankedCandidateRow[] {
  if (!policy) {
    // No ranking declared: the rows keep their resolver-emitted order (backend
    // relevance). No fallback table, ever. NO new fields attach either (the
    // byte-stability pin: a delimiter-free query with no declared policy must
    // serialize its rows identically to the pre-fix resolver), so every row is
    // defaultable and the focus default is row 0.
    return items.map((item) => {
      const kind = mentionKindOf(item.kind)
      const family = familyOf(item)
      return {
        key: `${kind}:${item.recordId}`,
        label: item.title,
        mentionKind: kind,
        recordId: item.recordId,
        family,
      }
    })
  }

  const nounLower = noun.trim().toLowerCase()
  const rankOf = (family: string): number => policy.families[family]?.rank ?? 0
  // The never-default rule is a STRUCTURAL invariant of the composition
  // pseudo-family (spec: "a composition row can NEVER hold the focused default
  // REGARDLESS of rank values — enforcement is against the data flag"). It
  // holds even when the family table omits the composition key: the flag is
  // read from the data when present, and the pseudo-family's own false when
  // absent. Every other family is defaultable (data says so; an absent key
  // means the platform never declared it non-defaultable).
  const defaultableOf = (family: string): boolean => {
    if (family === 'composition') return false
    return policy.families[family]?.canBeDefault ?? true
  }

  const rows: RankedCandidateRow[] = []
  const buildRow = (item: MaterialCandidateItem, sectionLabel?: string): RankedCandidateRow => {
    const kind = mentionKindOf(item.kind)
    const family = familyOf(item)
    const row: RankedCandidateRow = {
      key: `${kind}:${item.recordId}`,
      label: item.title,
      mentionKind: kind,
      recordId: item.recordId,
      family,
      canBeDefault: defaultableOf(family),
      consequence: consequenceFor(item),
    }
    if (sectionLabel !== undefined) row.sectionLabel = sectionLabel
    return row
  }

  const equality: MaterialCandidateItem[] = []
  const contains: MaterialCandidateItem[] = []
  const below: MaterialCandidateItem[] = []
  for (const item of items) {
    const titleLower = item.title.trim().toLowerCase()
    if (nounLower && titleLower === nounLower) equality.push(item)
    else if (nounLower && titleLower.includes(nounLower)) contains.push(item)
    else below.push(item)
  }

  const containsCount = contains.length
  const sectionLabel =
    containsCount > 0
      ? policy.containsSectionLabel
          .replace(/\{label\}/g, noun)
          .replace(/\{count\}/g, String(containsCount))
      : undefined

  // Band order: equality, then the contains section, then the non-matching
  // rows (declared-rank order) below it. Within a band: family rank, then
  // localeCompare (today's tie-break, preserved).
  const compare = (a: MaterialCandidateItem, b: MaterialCandidateItem): number => {
    const fa = familyOf(a)
    const fb = familyOf(b)
    const ra = rankOf(fa)
    const rb = rankOf(fb)
    if (ra !== rb) return ra - rb
    return a.title.localeCompare(b.title)
  }

  equality.sort(compare)
  contains.sort(compare)
  below.sort(compare)

  for (let i = 0; i < equality.length; i++) rows.push(buildRow(equality[i]))
  for (let i = 0; i < contains.length; i++) {
    // The section label rides the FIRST contains row only (the presentation).
    rows.push(buildRow(contains[i], i === 0 ? sectionLabel : undefined))
  }
  for (const item of below) rows.push(buildRow(item))

  return rows
}

/**
 * P1 focus-default rule: the FIRST row index that may hold the focused
 * (keyboard) default — the first row whose `canBeDefault !== false`. A
 * composition row (can_be_default false in the data) is ALWAYS skipped,
 * regardless of rank value or label shape. When every row is defaultable (the
 * slash editor, no ranking, or no composition), this is 0 — byte-stable.
 *
 * Returns 0 when no row is defaultable (a safe no-op; the list stays empty of
 * a default rather than auto-selecting a composition).
 */
export function firstDefaultFocusIndex(rows: RankedCandidateRow[]): number {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].canBeDefault !== false) return i
  }
  return 0
}
