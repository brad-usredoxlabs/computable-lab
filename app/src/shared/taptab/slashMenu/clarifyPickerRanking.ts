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
 * a composition is a Composition under any ontology. Whether a composition
 * row can hold the focused default is decided ONLY by the data flag: the
 * registry declares `can_be_default: false` for the composition family, so a
 * composition row is never the focused default (the W1 bug). Enforcement is
 * against the data flag, never label shape — the label shape only CLASSES the
 * row's family (the comparator's sanctioned algorithm); it never decides
 * defaultability. (A data flag of `true` — or an ABSENT declaration — makes
 * the row defaultable; the protection lives in the YAML, not in TS.)
 *
 * ABSENT policy (the registry declares no candidate_ranking) => NO ranking at
 * all: the rows keep their resolver-emitted order (backend relevance). There
 * is no fallback table, ever — no rank integer survives in this file.
 *
 * ABSENT family (a row's family is not in the declared table — e.g. a new
 * MaterialSearchItem['category'] the YAML does not name) => NON-RANKED: the
 * comparator partitions each band into the DECLARED rows (family has a
 * `policy.families` entry) and the UNDECLARED rows. The declared rows sort by
 * the existing band comparator (equality band, contains band, family rank,
 * `title.localeCompare`); the undeclared rows are NEVER ranked against them
 * (no numeric rank is ever fabricated in TS for an undeclared family) — they
 * keep their RELATIVE INPUT ORDER (stable sort) and are placed AFTER all
 * declared rows of the band. This convention is declared in ONE YAML comment
 * next to the `candidate_ranking` block — no magic integer in TS (the deleted
 * `?? 10` sent the unknown to the bottom; the interim `?? 0` / `?? inputIndex`
 * fabricated a rank it compared numerically against the declared 0-4; both
 * were silent policy in TS).
 */
import { ANSWER_KIND_WORD, KIND_WORD, menuLabelKey } from './tokens'

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
  /** ontology CURIE of the item — threaded through for policy attribution. */
  curie?: string
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

/**
 * A material selection policy record (CLIENT-SIDE view).
 *
 * Maps to the server-side `MaterialSelectionPolicyRecord` but carries only
 * the fields the picker needs: `recordId` (the record envelope's id),
 * `material_ref` (the concept being constrained),
 * `vendor_product_ref` (the chosen vendor product), and `selection`
 * (`only` | `default` | `alternative`). The client never imports server
 * types — it reads raw record envelopes and drops malformed entries.
 */
export interface SelectionPolicy {
  /** The record envelope's recordId (the policy record itself). */
  recordId: string
  /** The material concept this policy targets. */
  material_ref: { kind: 'ontology' | 'record'; id: string }
  /** The vendor product to select. */
  vendor_product_ref: { kind: 'ontology' | 'record'; id: string }
  /** The selection mode: `only` collapses to one row, `default` pre-selects. */
  selection: 'only' | 'default' | 'alternative'
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
  /** The source item's ontology CURIE (threaded through for policy attribution). */
  curie?: string
  /**
   * Whether the row may hold the focused default (the DATA flag). ABSENT when
   * no ranking is declared (byte-stability: the row carries no new fields at
   * all in that case) or when the data says the family is defaultable;
   * `false` ONLY when the data declares `can_be_default: false` for the
   * row's family (the composition protection lives in the YAML declaration,
   * never in a TS backstop — advc-c1 DEFECT 1).
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
  /**
   * Whether this row is pre-selected by a material-selection-policy
   * `default` or `only` record. ABSENT when no such policy applies;
   * `true` marks the row for keyboard focus. Never `false` — use
   * conditional spread (`...(cond ? {preselected: true} : {})`) to
   * respect `exactOptionalPropertyTypes`.
   */
  preselected?: boolean
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
 * count). The kind words come from the ONE shared vocabulary in ./tokens
 * (`ANSWER_KIND_WORD` / `KIND_WORD` — the same words the answered-row sentence
 * uses, so a row reads identically on screen in both places; advc-c1 DEFECT 3
 * killed the second vocabulary that spelled the raw mention kind).
 */
export function consequenceFor(item: MaterialCandidateItem): string {
  const kind = mentionKindOf(item.kind)
  const kindWord = ANSWER_KIND_WORD[kind] ?? kind
  const compositionTokens = aggregateComponentTokens(item.title)
  if (compositionTokens.length > 1) {
    return `binds ${kindWord} ${item.recordId} (composition of ${compositionTokens.length} components)`
  }
  return `binds ${kindWord} ${item.recordId} "${item.title}" (${KIND_WORD[kind] ?? kind})`
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
 * data-declared `policy`. ALWAYS derives the per-row P2 fields (the
 * `canBeDefault` data flag + the `consequence` line) when a policy is
 * declared — the comparator decides the row's bind, so it derives it.
 * WHETHER those fields reach the RENDERED suggestion is the resolver's
 * decision (the `pickerRows` flag in materialSuggestions, advc-c1 DEFECT 8:
 * the doc-editor /m stays chrome-free; only picker-constructed rows attach
 * them). Returns a new array (input order is preserved when `policy` is null
 * — the ABSENT-declaration => no-ranking rule).
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
      const row: RankedCandidateRow = {
        key: `${kind}:${item.recordId}`,
        label: item.title,
        mentionKind: kind,
        recordId: item.recordId,
        family,
      }
      if (item.curie) row.curie = item.curie
      return row
    })
  }

  const nounLower = noun.trim().toLowerCase()
  // NON-RANKED convention (advc-c1 DEFECT 2 / orch ruling): a family the
  // declared table does NOT name is never ranked. The comparator partitions
  // each band into the DECLARED rows (family has a `policy.families` entry)
  // and the UNDECLARED rows; the declared rows sort by the band comparator
  // (family rank, `title.localeCompare`) and the undeclared rows are placed
  // AFTER all declared rows of the band, keeping their RELATIVE INPUT ORDER
  // (stable sort). No numeric rank is ever fabricated in TS for an undeclared
  // family — the deleted `?? 10` and the interim `?? 0` / `?? inputIndex`
  // each invented one and compared it numerically against the declared 0-4.
  // The convention is stated in ONE YAML comment next to the
  // `candidate_ranking` block (schema/lab/material-profile.registry.yaml);
  // no magic integer lives here.
  const isDeclared = (family: string): boolean =>
    policy.families[family] !== undefined
  // The defaultability decision comes ONLY from the data flag — never label
  // shape, never a TS backstop (advc-c1 DEFECT 1 / orch ruling). The label
  // shape (familyOf) only CLASSES the row's family; the declaration decides
  // defaultability: `can_be_default: false` in the YAML makes the row
  // non-defaultable; a flag of `true` — or an ABSENT declaration for the
  // family — makes it defaultable.
  const defaultableOf = (family: string): boolean =>
    policy.families[family]?.canBeDefault ?? true

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
    }
    if (item.curie) row.curie = item.curie
    // P2 fields are always DERIVED here (the row's own bind). The resolver
    // decides whether they ATTACH to the rendered suggestion (pickerRows —
    // advc-c1 DEFECT 8); the eOPT conditional spread lives there.
    // `canBeDefault` mirrors the DATA flag (true for a defaultable family,
    // false for a non-defaultable one) — the label shape only CLASSES the
    // family, it never decides defaultability (advc-c1 DEFECT 1).
    row.canBeDefault = defaultableOf(family)
    row.consequence = consequenceFor(item)
    if (sectionLabel !== undefined) row.sectionLabel = sectionLabel
    return row
  }

  const indexed = items.map((item, index) => ({ item, index }))
  const equality: { item: MaterialCandidateItem; index: number }[] = []
  const contains: { item: MaterialCandidateItem; index: number }[] = []
  const below: { item: MaterialCandidateItem; index: number }[] = []
  for (const entry of indexed) {
    const titleLower = entry.item.title.trim().toLowerCase()
    if (nounLower && titleLower === nounLower) equality.push(entry)
    else if (nounLower && titleLower.includes(nounLower)) contains.push(entry)
    else below.push(entry)
  }

  // advc-c1 DEFECT 8b: the contains-section count is the number of rows that
  // ACTUALLY RENDER in the contains band — computed on the SAME display-label
  // key the downstream dedupe uses (one source, ./tokens.menuLabelKey), not
  // the raw pre-dedupe band length. The section label rides the FIRST
  // surviving contains row.
  const dedupeContains = (band: { item: MaterialCandidateItem; index: number }[]) => {
    const seen = new Set<string>()
    return band.filter((entry) => {
      const key = menuLabelKey(mentionKindOf(entry.item.kind), entry.item.title)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  const containsRendered = dedupeContains(contains)
  const containsCount = containsRendered.length
  const sectionLabel =
    containsCount > 0
      ? policy.containsSectionLabel
          .replace(/\{label\}/g, noun)
          .replace(/\{count\}/g, String(containsCount))
      : undefined

  // Band order: equality, then the contains section, then the non-matching
  // rows (declared-rank order) below it. Within a band: the declared rows sort
  // by family rank, then localeCompare (today's tie-break, preserved); the
  // undeclared rows are NON-RANKED — after every declared row of the band, in
  // their RELATIVE INPUT ORDER (no numeric rank fabricated, see `isDeclared`
  // above and the YAML `candidate_ranking` comment).
  const compare = (
    a: { item: MaterialCandidateItem; index: number },
    b: { item: MaterialCandidateItem; index: number },
  ): number => {
    const da = isDeclared(familyOf(a.item))
    const db = isDeclared(familyOf(b.item))
    if (da !== db) return da ? -1 : 1
    if (!da) {
      // Two undeclared rows: NON-RANKED against each other — return 0 so the
      // (guaranteed-stable) sort keeps their RELATIVE INPUT ORDER. No rank,
      // no title reorder, no magic integer.
      return 0
    }
    // Both declared: the declared family rank, then localeCompare (today's
    // tie-break, preserved).
    const ra = policy.families[familyOf(a.item)].rank
    const rb = policy.families[familyOf(b.item)].rank
    if (ra !== rb) return ra - rb
    return a.item.title.localeCompare(b.item.title)
  }

  equality.sort(compare)
  contains.sort(compare)
  below.sort(compare)

  for (const entry of equality) rows.push(buildRow(entry.item))
  // The section label rides the FIRST row that ACTUALLY RENDERS in the
  // contains band (survives the display-label dedupe — the same key the
  // resolver's downstream dedupe uses); a duplicate row carries none.
  const renderedIndices = new Set(containsRendered.map((entry) => entry.index))
  let sectionPlaced = false
  for (const entry of contains) {
    if (renderedIndices.has(entry.index)) {
      rows.push(buildRow(entry.item, sectionPlaced ? undefined : sectionLabel))
      sectionPlaced = true
    } else {
      rows.push(buildRow(entry.item))
    }
  }
  for (const entry of below) rows.push(buildRow(entry.item))

  return rows
}

/**
 * P1 focus-default rule: the FIRST row index that may hold the focused
 * (keyboard) default — the first row whose `preselected === true`, then
 * the first row whose `canBeDefault !== false`. The `preselected` flag is
 * set by `applySelectionPolicies` when a `default` or `only` policy marks
 * a vendor product. When no row is preselected, falls back to the existing
 * `canBeDefault` scan (byte-stable). THIS is the single live rule:
 * `SlashSuggestionList` calls it (advc-c1 DEFECT 6 killed the duplicated
 * closure).
 *
 * Returns 0 when no row is defaultable (a safe no-op; the list stays empty of
 * a default rather than auto-selecting a composition).
 */
export function firstDefaultFocusIndex(
  rows: ReadonlyArray<{ canBeDefault?: boolean; preselected?: boolean }>,
): number {
  // PREFER a row marked preselected by selection policy
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]!.preselected === true) return i
  }
  // Fallback: the first row whose canBeDefault !== false (existing behavior)
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]!.canBeDefault !== false) return i
  }
  return 0
}

/**
 * Apply material-selection policies to ranked candidate rows.
 *
 * Attribution rule (row-to-concept):
 *   - `material_ref.kind === 'ontology'` && the row's item carries
 *     `curie === material_ref.id`, OR
 *   - `material_ref.kind === 'record'` && `row.recordId === material_ref.id`.
 *
 * Attribution rule (row-to-vendor-product):
 *   - `row.recordId === vendor_product_ref.id`.
 *
 * Behavior:
 *   - `only`: collapse the list to exactly the one matching vendor-product
 *     row, with `preselected: true`. If no matching vendor-product row exists
 *     among the candidates, leave the list unchanged (fail-open).
 *   - `default`: mark the matching vendor-product row with `preselected: true`;
 *     all other rows survive in their ranked order.
 *   - `alternative`: no effect on the picker (server-side lint owns this).
 *
 * SILent tie-break protection: if two `only` policies target the same concept,
 * the list is left UNCHANGED — the server loader rejects that state (the lint
 * rule fires), the picker must not crash or guess.
 *
 * Returns a new array (input rows are never mutated).
 */
export function applySelectionPolicies(
  rows: RankedCandidateRow[],
  policies: SelectionPolicy[],
): RankedCandidateRow[] {
  if (policies.length === 0) return rows

  // Group policies by concept key (kind:id)
  const byConcept = new Map<string, SelectionPolicy[]>()
  for (const policy of policies) {
    const conceptKey = `${policy.material_ref.kind}:${policy.material_ref.id}`
    const existing = byConcept.get(conceptKey)
    if (existing) existing.push(policy)
    else byConcept.set(conceptKey, [policy])
  }

  // Check for duplicate 'only' policies — fail open, never guess
  for (const [, group] of byConcept) {
    const onlyCount = group.filter((p) => p.selection === 'only').length
    if (onlyCount > 1) {
      // Server loader should reject; picker fails open
      return rows
    }
  }

  // Match rows to concepts and apply policies
  const conceptRows = new Map<string, RankedCandidateRow[]>()
  for (const row of rows) {
    // Attribution rule: row belongs to a concept when
    // - material_ref.kind === 'ontology' && row.curie === material_ref.id, OR
    // - material_ref.kind === 'record' && row.recordId === material_ref.id
    const rowConceptKeys: string[] = []
    if (row.curie) {
      rowConceptKeys.push(`ontology:${row.curie}`)
    }
    rowConceptKeys.push(`record:${row.recordId}`)

    for (const key of rowConceptKeys) {
      const existing = conceptRows.get(key)
      if (existing) existing.push(row)
      else conceptRows.set(key, [row])
    }
  }

  const result = [...rows]
  let modified = false

  for (const [conceptKey, group] of byConcept) {
    // Skip if duplicate 'only' (already checked above)
    const onlyPolicies = group.filter((p) => p.selection === 'only')
    if (onlyPolicies.length > 1) continue

    const rowsForConcept = conceptRows.get(conceptKey) ?? []

    for (const policy of group) {
      const vendorId = policy.vendor_product_ref.id
      const match = rowsForConcept.find((r) => r.recordId === vendorId)

      if (!match) continue // Vendor product not in rows — fail open

      if (policy.selection === 'only') {
        // Collapse to exactly this one row
        result.length = 0
        const collapsed = { ...match, preselected: true }
        result.push(collapsed)
        modified = true
        break // Only one 'only' policy per concept (guaranteed above)
      } else if (policy.selection === 'default') {
        // Mark this row as preselected
        const idx = result.indexOf(match)
        if (idx !== -1) {
          result[idx] = { ...result[idx], preselected: true }
          modified = true
        }
      }
      // 'alternative' — no picker effect
    }
  }

  return modified ? result : rows
}
