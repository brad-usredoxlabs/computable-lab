/**
 * L2-CLARIFY-PICKER-1 — P1 intent-ranking comparator + focus-default (RED-first).
 *
 * Mirrors the 18-row `Add 100 ul of DMEM` clarification card from the
 * CLARIFY-WEIRD-1 receipts (report.md §1 W1/W10 + §2 repro): today the row-0
 * keyboard default is the COMPOSITION `DMEM + FBS` (a formulation, rank 0) while
 * the plain `DMEM` the prompt named is row 3 of the workspace — pressing Enter
 * commits the wrong material.
 *
 * The comparator this test targets is PURE (policy passed as an argument) and
 * exported from ./clarifyPickerRanking. It REORDERS; it never auto-selects,
 * auto-answers, or hides a candidate. The ranking POLICY (family rank integers,
 * can-be-default flags, the contains-section label template) is DATA — declared
 * on the registry `candidate_ranking` block and never hardcoded here (the
 * grep-clean source-pin assertion in resolvers.test.ts is the
 * source-pin).
 *
 * Bands (the algorithm is structural imperative code; the POLICY is data):
 *   1. label-equality with the query noun (trim + case-insensitive) FIRST;
 *   2. rows whose label merely CONTAINS the noun collapse under a section whose
 *      label comes from the data-declared `contains_section_label` template;
 *   3. within each band: declared family `rank`, then `title.localeCompare`;
 *   4. non-matching rows keep their declared-rank order BELOW the contains band.
 *
 * A composition row (aggregateComponentTokens(label).length > 1 — the L2-TERM-1
 * UC-D4 structural signal) OVERRIDES its category family to the `composition`
 * pseudo-family, whose `can_be_default` is false in the data: a composition can
 * NEVER hold the focused default, enforced against the data flag, not label shape.
 *
 * RED: these exports do not exist yet, and the row-0 = composition ordering is
 * the live bug — this suite fails at trunk tip and passes the moment the
 * comparator + data land.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  materialCandidates,
  consequenceFor,
  firstDefaultFocusIndex,
  applySelectionPolicies,
  type CandidateRankingPolicy,
  type MaterialCandidateItem,
  type RankedCandidateRow,
  type SelectionPolicy,
} from './clarifyPickerRanking'
import {
  __resetMaterialSelectionPolicies,
  __setCandidateRankingPolicy,
  __setMaterialSelectionPolicies,
  getCandidateRankingPolicy,
  getMaterialSelectionPolicies,
  PolicyGuardError,
} from './policy'
import { resolveMaterial } from './resolvers'
import type { MaterialSearchItem } from '../../api/client'
import type { SlashSuggestion } from './types'

/**
 * The declared candidate-ranking policy — byte-mirrors the
 * `schema/lab/material-profile.registry.yaml` `candidate_ranking` block (OQ2).
 * Used to seed the module cache so the resolver path is deterministic; the
 * comparator itself takes it as an argument (pure).
 */
const DECLARED: CandidateRankingPolicy = {
  containsSectionLabel: 'contains "{label}" ({count})',
  families: {
    'saved-stock': { rank: 0, canBeDefault: true },
    'vendor-reagent': { rank: 1, canBeDefault: true },
    'prepared-material': { rank: 2, canBeDefault: true },
    'biological-derived': { rank: 3, canBeDefault: true },
    'concept-only': { rank: 4, canBeDefault: true },
    composition: { rank: 4, canBeDefault: false },
  },
}

/**
 * The 18-row DMEM card, collapsed to the WORKSPACE rows the /m resolver ranks
 * (formulations + the material search page). The live card additionally carries
 * eight Exa web rows + the pinned mint floor; those stream in BELOW the first
 * paint (resolvers.ts) and are not part of the workspace comparator, so the
 * fixture is the workspace page the comparator actually orders. The row-0
 * composition `DMEM + FBS` (a formulation, `saved-stock`) and the plain concept
 * `DMEM` (row 3 in the live card) are both present — the whole point of the
 * reordering.
 */
const DMEM: MaterialCandidateItem[] = [
  // row 0 — the W1 keyboard-default bug: a COMPOSITION formulation, rank 0.
  { recordId: 'MSP-DRAFT-EVG_CELLROX-01', kind: 'material-spec', title: 'DMEM + FBS', category: 'saved-stock', subtitle: 'Formulation' },
  // row 1 — a 6-component aggregate composition formulation.
  { recordId: 'MSP-DRAFT-EVG_CELLROX-02', kind: 'material-spec', title: 'Thermo trypsin-EDTA + Thermo DMEM + Thermo FBS + HepG2 cells', category: 'saved-stock', subtitle: 'Formulation' },
  // row 3 — what the prompt meant: the plain concept record.
  { recordId: 'MAT-dmem-ykg0', kind: 'material', title: 'DMEM', category: 'concept-only' },
  // row 4 — a same-words composition as a LOCAL record (W2: different record).
  { recordId: 'MAT-dmem-fbs-9z9z', kind: 'material', title: 'DMEM + FBS', category: 'concept-only', subtitle: 'Local record' },
  { recordId: 'MAT-dmemhepg2-1a2b', kind: 'material', title: 'DMEMHepG2', category: 'concept-only' },
  { recordId: 'MAT-thermo-dmem-1vq1', kind: 'material', title: 'Thermo DMEM', category: 'concept-only' },
  // rows 5-8 — more aggregate compositions (W10: many spellings of one composition).
  { recordId: 'MSP-DRAFT-EVG_CELLROX-03', kind: 'material-spec', title: 'Thermo trypsin-EDTA / Thermo DMEM + 10% FBS with HepG2 cells', category: 'saved-stock' },
  { recordId: 'MSP-DRAFT-EVG_CELLROX-04', kind: 'material-spec', title: 'Thermo trypsin-EDTA + Thermo DMEM + 10% Thermo FBS + HepG2 cells', category: 'saved-stock' },
  // a non-matching row: must fall to band 4 (below the contains section).
  { recordId: 'MAT-trypan-blue-7f2a', kind: 'material', title: 'Trypan blue', category: 'vendor-reagent' },
]

describe('L2-CLARIFY-PICKER-1 — P1 intent-ranking comparator (18-row DMEM)', () => {
  it('puts the exact-match concept row FIRST; the W1 row-0 composition is no longer the keyboard default', () => {
    const rows = materialCandidates(DMEM, 'DMEM', DECLARED)
    expect(rows.length).toBeGreaterThan(0)
    // The plain `DMEM` concept is the row the prompt named — it is first.
    expect(rows[0]).toMatchObject({
      key: 'material:MAT-dmem-ykg0',
      label: 'DMEM',
      canBeDefault: true,
    })
    // The W1 bug: today row 0 is the composition `DMEM + FBS` (a formulation).
    // The exact-match concept MUST beat it.
    const compositionIndex = rows.findIndex(
      (r) => r.key === 'material-spec:MSP-DRAFT-EVG_CELLROX-01',
    )
    expect(compositionIndex).toBeGreaterThan(0)
  })

  it('collapses contains-noun rows under the data-declared section label', () => {
    const rows = materialCandidates(DMEM, 'DMEM', DECLARED)
    const section = rows.find((r) => r.sectionLabel)
    expect(section).toBeTruthy()
    // The section label is DATA (the template filled with the noun + count) —
    // change the YAML and the label moves. `contains "DMEM" (n)`.
    expect(section!.sectionLabel).toMatch(/^contains "DMEM" \(\d+\)$/)
  })

  it('the contains count is the POST-DEDUPE rendered count: duplicate display labels do not inflate it (advc-c2 DEFECT 3)', () => {
    // Three rows sit in the contains band; two carry the SAME display label
    // (the downstream label dedupe — the same `menuLabelKey` the resolver
    // uses — drops the second). The section count must be the number of
    // rows that ACTUALLY RENDER in the band (2 unique display labels), not
    // the pre-dedupe band length (3): the pre-dedupe mutant
    // (`contains.length`) emits `contains "DMEM" (3)` and fails this pin.
    const fixture: MaterialCandidateItem[] = [
      { recordId: 'MAT-d-a', kind: 'material', title: 'DMEM', category: 'concept-only' },
      { recordId: 'MAT-d-b', kind: 'material', title: 'Thermo DMEM', category: 'concept-only' },
      { recordId: 'MAT-d-c', kind: 'material', title: 'Low-glucose DMEM', category: 'concept-only' },
      // DUPLICATE display label of the row above (different record): dropped
      // by the downstream dedupe — must not count in the section label.
      { recordId: 'MAT-d-dup', kind: 'material', title: 'Low-glucose DMEM', category: 'concept-only' },
    ]
    const rows = materialCandidates(fixture, 'DMEM', DECLARED)
    // Equality band: the exact 'DMEM' match leads.
    expect(rows[0]?.label).toBe('DMEM')
    const section = rows.find((r) => r.sectionLabel)
    // Exactly ONE section row carries the label — the FIRST rendered
    // contains row. Count = 2 (post-dedupe), not 3 (pre-dedupe band length).
    expect(section!.sectionLabel).toBe('contains "DMEM" (2)')
    expect(rows.filter((r) => r.sectionLabel !== undefined)).toHaveLength(1)
    // Within the band all rows share the declared family (rank 4), so
    // localeCompare orders them: 'Low-glucose DMEM' < 'Thermo DMEM'. The
    // duplicate row still renders (dedupe is the RESOLVER's; the comparator
    // never hides a candidate) — it carries NO section label and does not
    // inflate the count.
    expect(rows.map((r) => r.label)).toEqual([
      'DMEM',
      'Low-glucose DMEM',
      'Low-glucose DMEM',
      'Thermo DMEM',
    ])
  })

  it('orders equality > contains > family rank, with the localeCompare tie-break preserved', () => {
    const rows = materialCandidates(DMEM, 'DMEM', DECLARED)
    const order = rows.map((r) => r.label)
    // 1. exact match (equality) first.
    expect(order[0]).toBe('DMEM')
    // 2. then the contains band: the aggregate compositions that contain the
    //    noun, ranked by family (saved-stock formulations before concept-only
    //    locals), then localeCompare within a family.
    const containsFirst = order[1]
    expect(containsFirst).toMatch(/DMEM/)
    // The non-matching row (Trypan blue) is LAST (band 4, below contains).
    expect(order[order.length - 1]).toBe('Trypan blue')
    // No exact/contains row may sort BELOW the non-matching band.
    expect(order.indexOf('DMEMHepG2')).toBeGreaterThan(0)
    expect(order.indexOf('Thermo DMEM')).toBeGreaterThan(0)
  })

  it('never-default red case: a composition ranked 0 is still skipped by firstDefaultFocusIndex', () => {
    // Inject the composition pseudo-family rank to 0 (the data would never say
    // this, but the rule must hold REGARDLESS of rank values). `firstDefault-
    // FocusIndex` must still skip the composition row — enforcement is against
    // the `canBeDefault` data flag, never the rank value or label shape.
    const injected: CandidateRankingPolicy = {
      containsSectionLabel: 'contains "{label}" ({count})',
      families: {
        'saved-stock': { rank: 1, canBeDefault: true },
        'concept-only': { rank: 2, canBeDefault: true },
        // composition pinned to rank 0.
        composition: { rank: 0, canBeDefault: false },
      },
    }
    const items: MaterialCandidateItem[] = [
      // a COMPOSITION (multi-part aggregate — the pseudo-family signal) whose
      // label EQUALS the noun and whose family is injected to rank 0.
      { recordId: 'MSP-comp-0', kind: 'material-spec', title: 'DMEM + FBS', category: 'saved-stock' },
      // a plain concept (rank 2) that IS defaultable.
      { recordId: 'MAT-fbs-2b2b', kind: 'material', title: 'FBS', category: 'concept-only' },
    ]
    const rows = materialCandidates(items, 'DMEM + FBS', injected)
    // The composition is FIRST (equality band + injected rank 0) — but it is
    // the ONLY non-defaultable row.
    expect(rows[0]).toMatchObject({
      key: 'material-spec:MSP-comp-0',
      canBeDefault: false,
      family: 'composition',
    })
    // firstDefaultFocusIndex skips it and lands on the first defaultable row.
    const focus = firstDefaultFocusIndex(rows)
    expect(focus).toBe(1)
    expect(rows[focus]).toMatchObject({ key: 'material:MAT-fbs-2b2b', canBeDefault: true })
  })

  it('defaultability is the DATA flag only: the same composition label is defaultable when the data says can_be_default: true (advc-c1 DEFECT 1)', () => {
    // The family CLASSIFICATION comes from label shape (the spec-sanctioned
    // comparator algorithm — a multi-part aggregate is a composition under any
    // ontology). The DEFAULTABILITY decision must come ONLY from the data flag:
    // the reviewer probe set composition {rank:0, canBeDefault:TRUE} and the
    // row still came back canBeDefault:false from a hardcoded TS branch. With
    // the flag the data says true, the composition row IS defaultable — no TS
    // backstop may override the data. The composition protection lives in the
    // YAML declaration (can_be_default: false), not in TS.
    const dataTrue: CandidateRankingPolicy = {
      containsSectionLabel: 'contains "{label}" ({count})',
      families: {
        'saved-stock': { rank: 1, canBeDefault: true },
        'concept-only': { rank: 2, canBeDefault: true },
        composition: { rank: 0, canBeDefault: true },
      },
    }
    const rows = materialCandidates(
      [
        { recordId: 'MSP-comp-1', kind: 'material-spec', title: 'DMEM + FBS', category: 'saved-stock' },
        { recordId: 'MAT-fbs-2b2b', kind: 'material', title: 'FBS', category: 'concept-only' },
      ],
      'DMEM + FBS',
      dataTrue,
    )
    const compositionRow = rows.find((r) => r.family === 'composition')
    expect(compositionRow).toMatchObject({ key: 'material-spec:MSP-comp-1' })
    // DATA says true => the row carries canBeDefault:true.
    expect(compositionRow!.canBeDefault).toBe(true)
    expect(firstDefaultFocusIndex(rows)).toBe(0)
  })

  it('a flag ABSENT for a family means defaultable (never a TS fallback) (advc-c1 DEFECT 1, orch ruling)', () => {
    // The composition pseudo-family is classified from label shape; the data
    // OMITS the composition key entirely. Ruling: absent declaration =>
    // defaultable. The composition protection lives in the YAML declaration
    // (can_be_default: false), never in a TS backstop.
    const noComp: CandidateRankingPolicy = {
      containsSectionLabel: 'contains "{label}" ({count})',
      families: {
        'saved-stock': { rank: 0, canBeDefault: true },
        'concept-only': { rank: 4, canBeDefault: true },
      },
    }
    const rows = materialCandidates(
      [
        { recordId: 'MSP-c', kind: 'material-spec', title: 'A + B', category: 'saved-stock' },
        { recordId: 'MAT-a', kind: 'material', title: 'A', category: 'concept-only' },
      ],
      'A',
      noComp,
    )
    expect(rows[0]).toMatchObject({ key: 'material:MAT-a', canBeDefault: true })
    // A + B resolves to the composition pseudo-family; the flag is ABSENT =>
    // defaultable.
    const compositionRow = rows.find((r) => r.family === 'composition')
    expect(compositionRow).toMatchObject({ key: 'material-spec:MSP-c' })
    expect(compositionRow!.canBeDefault).toBe(true)
  })

  it('an UNDECLARED family is NON-RANKED: it lands AFTER all declared rows and keeps its RELATIVE INPUT ORDER (advc-c1 DEFECT 2 / orch ruling)', () => {
    // A new MaterialSearchItem['category'] the YAML does not name is never
    // given a rank. The comparator partitions the band: the declared rows
    // sort by (family rank, title.localeCompare); the undeclared rows keep
    // their RELATIVE INPUT ORDER and are placed AFTER all declared rows of
    // the band. The fixture is the reviewer's inversion case — an undeclared
    // family FIRST in the input, a declared family (rank 4) second — so the
    // fabricated-rank fallbacks each produce a DISTINCT wrong output:
    //   `?? 0`          => 'X one' at rank 0 sorts BEFORE rank 4  (X one first)
    //   `?? inputIndex` => 'C one' (idx 1) before 'X two' (idx 2)  (X one, C one, X two)
    //   non-ranked (correct) => 'C one' first, then 'X one', 'X two'
    const policy: CandidateRankingPolicy = {
      containsSectionLabel: 'contains "{label}" ({count})',
      families: { 'concept-only': { rank: 4, canBeDefault: true } },
    }
    const rows = materialCandidates(
      [
        // undeclared family, FIRST in the input (index 0 — the `?? inputIndex`
        // top-sort probe: index 0 is the smallest rank it could fabricate).
        { recordId: 'MAT-x1', kind: 'material', title: 'X one', category: 'future-category' },
        // declared family (rank 4), second in the input.
        { recordId: 'MAT-c1', kind: 'material', title: 'C one', category: 'concept-only' },
        // undeclared family, third in the input.
        { recordId: 'MAT-x2', kind: 'material', title: 'X two', category: 'future-category' },
      ],
      'zzz',
      policy,
    )
    // All three rows are non-matching (band 4: below the contains section).
    // The FULL ordered label list is the assertion — the declared row sorts
    // by its declared rank (rank 4 is the only declared rank, so it leads),
    // then the undeclared rows in RELATIVE INPUT ORDER (X one before X two —
    // the input order is the ONLY ordering they receive).
    expect(rows.map((r) => r.label)).toEqual(['C one', 'X one', 'X two'])
    // The undeclared rows land AFTER the declared row and keep their
    // relative input order (pinned by the full list; the filter view is the
    // explicit declared-vs-undeclared assertion).
    const declared = rows.filter((r) => r.family === 'concept-only').map((r) => r.label)
    const undeclared = rows.filter((r) => r.family === 'future-category').map((r) => r.label)
    expect(declared).toEqual(['C one'])
    expect(undeclared).toEqual(['X one', 'X two'])
    expect(rows[declared.length + 0]?.label).toBe('X one')
    expect(rows[declared.length + 1]?.label).toBe('X two')
  })
})

describe('L2-CLARIFY-PICKER-1 — P2 consequence wording (one kind-word vocabulary, advc-c1 DEFECT 3)', () => {
  it('emits the SPEC kind words: `(concept)` for a material record, `(formulation)` for a material-spec', () => {
    // The reviewer probe found `(material)` / `(material-spec)` — the raw
    // mention kind, which is not one of the sanctioned ontology terms and a
    // SECOND vocabulary against the answered-row helper. The consequence line
    // and the answered row share ONE kind-word table (tokens.ts).
    expect(
      consequenceFor({ recordId: 'MAT-dmem-ykg0', kind: 'material', title: 'DMEM', category: 'concept-only' }),
    ).toBe('binds material record MAT-dmem-ykg0 "DMEM" (concept)')
    expect(
      consequenceFor({ recordId: 'MSP-9', kind: 'material-spec', title: 'DMEM low glucose', category: 'saved-stock' }),
    ).toBe('binds formulation MSP-9 "DMEM low glucose" (formulation)')
  })

  it('a composition row states `binds {kind word} {id} (composition of N components)`', () => {
    expect(
      consequenceFor({ recordId: 'MSP-1', kind: 'material-spec', title: 'DMEM + FBS', category: 'saved-stock' }),
    ).toBe('binds formulation MSP-1 (composition of 2 components)')
    expect(
      consequenceFor({ recordId: 'MAT-9z', kind: 'material', title: 'DMEM, FBS, glutamine', category: 'concept-only' }),
    ).toBe('binds material record MAT-9z (composition of 3 components)')
  })
})

describe('L2-CLARIFY-PICKER-1 — policy cache seam (resolver path is deterministic)', () => {
  // advc-c1 DEFECT 7: the prior test asserted a local literal against itself
  // (`DECLARED.families.composition` — no code path exercised). This test
  // EXERCISES the seam: seed the cache, then read it back through
  // getCandidateRankingPolicy() — the exact function resolveMaterial awaits.
  it('the resolver reads the seeded declaration once through getCandidateRankingPolicy()', async () => {
    __setCandidateRankingPolicy(DECLARED)
    const first = await getCandidateRankingPolicy()
    const second = await getCandidateRankingPolicy()
    expect(first).not.toBeNull()
    expect(first!.families.composition).toEqual({ rank: 4, canBeDefault: false })
    // Cache, not re-fetch: the second read returns the same object.
    expect(second).toBe(first)
  })
})

describe('L2-MATERIAL-SELECTION-POLICY-1 — selection policy (only/default)', () => {
  const CONCEPT_CURIE = 'NCIT:C185409'

  /**
   * PRODUCER-SHAPED rows: the vendor-product catalog row carries NO `curie`
   * (classifyMaterialRecord never emits one for a vendor product). Its concept
   * link is its own schema-required `material_ref`, threaded as
   * `materialRefKind` + `materialRefId`. The term/concept row carries the
   * concept CURIE. Attribution must join on the ref's OWN discriminator.
   */
  function buildConceptRows(): RankedCandidateRow[] {
    return [
      { key: 'vendor-product:VP-A', label: 'Vendor Product A', mentionKind: 'vendor-product', recordId: 'VP-A', family: 'vendor-reagent', materialRefKind: 'ontology', materialRefId: CONCEPT_CURIE, canBeDefault: true },
      { key: 'vendor-product:VP-B', label: 'Vendor Product B', mentionKind: 'vendor-product', recordId: 'VP-B', family: 'vendor-reagent', materialRefKind: 'ontology', materialRefId: CONCEPT_CURIE, canBeDefault: true },
      { key: 'material:MAT-1', label: 'Material 1', mentionKind: 'material', recordId: 'MAT-1', family: 'concept-only', curie: CONCEPT_CURIE, canBeDefault: true },
    ]
  }

  /** Pin (a): `only` collapses to exactly one row with preselected: true */
  it('only — collapses to exactly one row (the policy vendor product) with preselected: true', () => {
    const rows = buildConceptRows()
    const policies: SelectionPolicy[] = [{
      recordId: 'POL-1',
      material_ref: { kind: 'ontology', id: CONCEPT_CURIE },
      vendor_product_ref: { kind: 'record', id: 'VP-A' },
      selection: 'only',
    }]
    const result = applySelectionPolicies(rows, policies)
    expect(result).toHaveLength(1)
    expect(result[0].recordId).toBe('VP-A')
    expect(result[0].preselected).toBe(true)
  })

  /** Pin (b): `default` keeps all rows, marks exactly one preselected, focus index matches */
  it('default — all rows survive, exactly one is preselected, focus index matches', () => {
    const rows = buildConceptRows()
    // Target VP-B (index 1, NOT index 0 — avoids the vacuous pin bait)
    const policies: SelectionPolicy[] = [{
      recordId: 'POL-1',
      material_ref: { kind: 'ontology', id: CONCEPT_CURIE },
      vendor_product_ref: { kind: 'record', id: 'VP-B' },
      selection: 'default',
    }]
    const result = applySelectionPolicies(rows, policies)
    // ALL rows survive in their ranked order
    expect(result).toHaveLength(3)
    expect(result.map((r) => r.recordId)).toEqual(['VP-A', 'VP-B', 'MAT-1'])
    // Exactly one row carries preselected: true
    const preselectedRows = result.filter((r) => r.preselected === true)
    expect(preselectedRows).toHaveLength(1)
    expect(preselectedRows[0].recordId).toBe('VP-B')
    // The other rows must NOT carry the key at all (exactOptionalPropertyTypes)
    expect('preselected' in result[0]).toBe(false)
    expect('preselected' in result[2]).toBe(false)
    // firstDefaultFocusIndex returns the preselected row's index
    const focus = firstDefaultFocusIndex(result)
    expect(focus).toBe(1)
  })

  /** Pin (c1): fail-open — policy vendor product not in rows */
  it('fail-open — policy vendor product NOT in rows leaves list unchanged', () => {
    const rows = buildConceptRows()
    const policies: SelectionPolicy[] = [{
      recordId: 'POL-1',
      material_ref: { kind: 'ontology', id: CONCEPT_CURIE },
      vendor_product_ref: { kind: 'record', id: 'VP-DOES-NOT-EXIST' },
      selection: 'only',
    }]
    const result = applySelectionPolicies(rows, policies)
    expect(result).toHaveLength(3)
    expect(result.map((r) => r.recordId)).toEqual(['VP-A', 'VP-B', 'MAT-1'])
    // No row should carry preselected
    for (const row of result) {
      expect('preselected' in row).toBe(false)
    }
  })

  /** Pin (c2): fail-open — two `only` policies for the same concept */
  it('fail-open — two only policies for the same concept leaves list unchanged', () => {
    const rows = buildConceptRows()
    const policies: SelectionPolicy[] = [
      {
        recordId: 'POL-1',
        material_ref: { kind: 'ontology', id: CONCEPT_CURIE },
        vendor_product_ref: { kind: 'record', id: 'VP-A' },
        selection: 'only',
      },
      {
        recordId: 'POL-2',
        material_ref: { kind: 'ontology', id: CONCEPT_CURIE },
        vendor_product_ref: { kind: 'record', id: 'VP-B' },
        selection: 'only',
      },
    ]
    const result = applySelectionPolicies(rows, policies)
    expect(result).toHaveLength(3)
    expect(result.map((r) => r.recordId)).toEqual(['VP-A', 'VP-B', 'MAT-1'])
    // No row should carry preselected
    for (const row of result) {
      expect('preselected' in row).toBe(false)
    }
  })

  /** Pin (d): no-policy byte-stability — empty policies return identical rows */
  it('no-policy — empty policies returns rows deep-equal to input with no preselected key', () => {
    const rows = buildConceptRows()
    const result = applySelectionPolicies(rows, [])
    // The rows are byte-identical to input — no preselected key on any row
    expect(result).toHaveLength(3)
    for (const row of result) {
      expect('preselected' in row).toBe(false)
    }
    // Deep equality
    expect(result.map((r) => ({ key: r.key, label: r.label, recordId: r.recordId, family: r.family })))
      .toEqual(rows.map((r) => ({ key: r.key, label: r.label, recordId: r.recordId, family: r.family })))
  })

  /** `only` with material_ref kind 'record' matches by the ref-carried recordId */
  it('only — material_ref kind=record matches the rows carrying that record ref', () => {
    // A record-kind concept: the vendor rows' material_ref carries the CONCEPT
    // record id (not the vendor recordId) — the producer-shaped link.
    const rows: RankedCandidateRow[] = [
      { key: 'vendor-product:VP-A', label: 'Vendor Product A', mentionKind: 'vendor-product', recordId: 'VP-A', family: 'vendor-reagent', materialRefKind: 'record', materialRefId: 'MAT-1', canBeDefault: true },
      { key: 'vendor-product:VP-B', label: 'Vendor Product B', mentionKind: 'vendor-product', recordId: 'VP-B', family: 'vendor-reagent', materialRefKind: 'record', materialRefId: 'MAT-1', canBeDefault: true },
      { key: 'material:MAT-1', label: 'Material 1', mentionKind: 'material', recordId: 'MAT-1', family: 'concept-only', canBeDefault: true },
    ]
    const policies: SelectionPolicy[] = [{
      recordId: 'POL-1',
      material_ref: { kind: 'record', id: 'MAT-1' },
      vendor_product_ref: { kind: 'record', id: 'VP-A' },
      selection: 'only',
    }]
    const result = applySelectionPolicies(rows, policies)
    expect(result).toHaveLength(1)
    expect(result[0].recordId).toBe('VP-A')
    expect(result[0].preselected).toBe(true)
  })

  /**
   * Unscoped-collapse guard (D4 bait): an `only` collapse is scoped to the
   * policy's OWN concept. Rows attributed to a DIFFERENT concept must survive
   * — the whole-array `result.length = 0` wipe is the data-loss shape.
   */
  it('only — rows attributed to a DIFFERENT concept survive the collapse', () => {
    const rows: RankedCandidateRow[] = [
      { key: 'vendor-product:VP-A', label: 'Vendor Product A', mentionKind: 'vendor-product', recordId: 'VP-A', family: 'vendor-reagent', materialRefKind: 'ontology', materialRefId: 'NCIT:C1', canBeDefault: true },
      { key: 'vendor-product:VP-B', label: 'Vendor Product B', mentionKind: 'vendor-product', recordId: 'VP-B', family: 'vendor-reagent', materialRefKind: 'ontology', materialRefId: 'NCIT:C1', canBeDefault: true },
      { key: 'material:MAT-B', label: 'Other Concept', mentionKind: 'material', recordId: 'MAT-B', family: 'concept-only', curie: 'NCIT:C2', canBeDefault: true },
      { key: 'vendor-product:VP-C', label: 'Other Vendor', mentionKind: 'vendor-product', recordId: 'VP-C', family: 'vendor-reagent', materialRefKind: 'ontology', materialRefId: 'NCIT:C2', canBeDefault: true },
    ]
    const policies: SelectionPolicy[] = [{
      recordId: 'POL-1',
      material_ref: { kind: 'ontology', id: 'NCIT:C1' },
      vendor_product_ref: { kind: 'record', id: 'VP-A' },
      selection: 'only',
    }]
    const result = applySelectionPolicies(rows, policies)
    expect(result.map((r) => r.recordId)).toEqual(['VP-A', 'MAT-B', 'VP-C'])
    expect(result[0].preselected).toBe(true)
    // The other concept's rows are untouched (no preselected key attached).
    expect('preselected' in result[1]).toBe(false)
    expect('preselected' in result[2]).toBe(false)
  })

  /** `alternative` policy has no picker effect */
  it('alternative — no effect on the picker', () => {
    const rows = buildConceptRows()
    const policies: SelectionPolicy[] = [{
      recordId: 'POL-1',
      material_ref: { kind: 'ontology', id: CONCEPT_CURIE },
      vendor_product_ref: { kind: 'record', id: 'VP-A' },
      selection: 'alternative',
    }]
    const result = applySelectionPolicies(rows, policies)
    expect(result).toHaveLength(3)
    expect(result).toBe(rows)
  })
})

describe('L2-MATERIAL-SELECTION-POLICY-1 — resolver scoping (D4: picker-only collapse)', () => {
  // Producer-shaped search page: vendor rows carry their own record's
  // material_ref (no CURIE); the concept row carries the CURIE; the FBS row
  // belongs to a DIFFERENT concept and must never be wiped by an `only`.
  const PAGE_ITEMS: MaterialSearchItem[] = [
    { recordId: 'VP-A', kind: 'vendor-product', title: 'Vendor Product A', category: 'vendor-reagent', subtitle: 'Sigma · A123', materialRefKind: 'ontology', materialRefId: 'NCIT:C185409' },
    { recordId: 'VP-B', kind: 'vendor-product', title: 'Vendor Product B', category: 'vendor-reagent', subtitle: 'Sigma · B456', materialRefKind: 'ontology', materialRefId: 'NCIT:C185409' },
    { recordId: 'MAT-1', kind: 'material', title: 'Material 1', category: 'concept-only', curie: 'NCIT:C185409' },
    { recordId: 'MAT-FBS', kind: 'material', title: 'FBS', category: 'concept-only', curie: 'NCIT:C999999' },
  ]

  const ONLY_POLICY: SelectionPolicy[] = [{
    recordId: 'POL-1',
    material_ref: { kind: 'ontology', id: 'NCIT:C185409' },
    vendor_product_ref: { kind: 'record', id: 'VP-A' },
    selection: 'only',
  }]

  const fetchSpy = vi.fn()

  beforeEach(() => {
    fetchSpy.mockReset()
    vi.stubGlobal('fetch', fetchSpy)
    fetchSpy.mockImplementation(async (url: string) => {
      const href = String(url)
      if (href.includes('/materials/formulations/summary')) {
        return { ok: true, json: async () => ({ items: [] }) }
      }
      return { ok: true, json: async () => ({ items: PAGE_ITEMS }) }
    })
    __setCandidateRankingPolicy(DECLARED)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    __resetMaterialSelectionPolicies()
  })

  /** JSON is the byte shape: functions (mint's resolveMention) drop out. */
  const bytes = (rows: SlashSuggestion[]): string => JSON.stringify(rows)

  /** `preselected` is a declared picker contract field (D7, open) — read structurally. */
  const isPreselected = (row: SlashSuggestion): boolean =>
    (row as { preselected?: boolean }).preselected === true

  /** The mention id when the union arm carries one. */
  const mentionId = (row: SlashSuggestion): string | undefined =>
    'id' in row.mention ? row.mention.id : undefined

  function editorCtx(): Parameters<typeof resolveMaterial>[1] {
    return { selection: null, signal: new AbortController().signal }
  }

  function pickerCtx(): Parameters<typeof resolveMaterial>[1] {
    return { selection: null, signal: new AbortController().signal, pickerRows: true }
  }

  it('pickerRows=false (doc-editor /m): an only policy leaves the list byte-identical to the no-policy list', async () => {
    __setMaterialSelectionPolicies([])
    const noPolicy = await resolveMaterial('dmem', editorCtx())
    __setMaterialSelectionPolicies(ONLY_POLICY)
    const withPolicy = await resolveMaterial('dmem', editorCtx())
    expect(bytes(withPolicy)).toBe(bytes(noPolicy))
    // The unrelated row is present in the same input and survives.
    expect(withPolicy.some((row) => mentionId(row) === 'MAT-FBS')).toBe(true)
    // No row carries preselected chrome on the editor path.
    expect(withPolicy.some((row) => isPreselected(row))).toBe(false)
  })

  it('pickerRows=true: the same only policy collapses the picker rows of that concept', async () => {
    __setMaterialSelectionPolicies(ONLY_POLICY)
    const picked = await resolveMaterial('dmem', pickerCtx())
    const workspace = picked.filter((row) => !row.pinBottom)
    // The concept's own rows collapse to the policy vendor product...
    expect(workspace.some((row) => mentionId(row) === 'VP-B')).toBe(false)
    expect(workspace.some((row) => mentionId(row) === 'MAT-1')).toBe(false)
    const chosen = workspace.find((row) => mentionId(row) === 'VP-A')
    expect(chosen).toBeTruthy()
    expect(isPreselected(chosen!)).toBe(true)
    // ...while the different-concept row is untouched.
    expect(workspace.some((row) => mentionId(row) === 'MAT-FBS')).toBe(true)
  })
})

/**
 * u2fix3: post-collapse suppression — when an `only` policy collapses to
 * exactly one row, the resolver must NOT append the mint floor or stream
 * ontology/vendor tiers. The collapse flag (`policyCollapsed`) is the
 * signal; the picker must never re-expand a closed list.
 */
describe('L2-MATERIAL-SELECTION-POLICY-1 — u2fix3 post-collapse suppression', () => {
  // All rows belong to the SAME concept so the `only` policy collapses to
  // exactly one row (no other concept rows survive the collapse).
  const SINGLE_CONCEPT_ITEMS: MaterialSearchItem[] = [
    { recordId: 'VP-A', kind: 'vendor-product', title: 'Vendor Product A', category: 'vendor-reagent', subtitle: 'Sigma · A123', materialRefKind: 'ontology', materialRefId: 'NCIT:C185409' },
    { recordId: 'VP-B', kind: 'vendor-product', title: 'Vendor Product B', category: 'vendor-reagent', subtitle: 'Sigma · B456', materialRefKind: 'ontology', materialRefId: 'NCIT:C185409' },
    { recordId: 'MAT-1', kind: 'material', title: 'Material 1', category: 'concept-only', curie: 'NCIT:C185409' },
  ]

  const ONLY_POLICY: SelectionPolicy[] = [{
    recordId: 'POL-1',
    material_ref: { kind: 'ontology', id: 'NCIT:C185409' },
    vendor_product_ref: { kind: 'record', id: 'VP-A' },
    selection: 'only',
  }]

  const fetchSpy = vi.fn()

  beforeEach(() => {
    fetchSpy.mockReset()
    vi.stubGlobal('fetch', fetchSpy)
    fetchSpy.mockImplementation(async (url: string) => {
      const href = String(url)
      if (href.includes('/materials/formulations/summary')) {
        return { ok: true, json: async () => ({ items: [] }) }
      }
      return { ok: true, json: async () => ({ items: SINGLE_CONCEPT_ITEMS }) }
    })
    __setCandidateRankingPolicy(DECLARED)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    __resetMaterialSelectionPolicies()
  })

  /**
   * RED test: with an `only` policy that collapses to exactly one row, the
   * resolver should return exactly one row, carry `policyCollapsed: true`,
   * and never call `onUpdate` (no streaming, no mint floor).
   */
  it('only — exactly one row with policyCollapsed, no mint row, onUpdate never called', async () => {
    __setMaterialSelectionPolicies(ONLY_POLICY)
    const onUpdateSpy = vi.fn()
    const ctx = {
      selection: null,
      signal: new AbortController().signal,
      pickerRows: true,
      onUpdate: onUpdateSpy,
    }
    const rows = await resolveMaterial('dmem', ctx as Parameters<typeof resolveMaterial>[1])

    // (a) Exactly ONE row — no mint floor, no extra rows
    expect(rows).toHaveLength(1)

    // (b) That row carries the collapse signal
    expect(rows[0].policyCollapsed).toBe(true)
    expect(rows[0].key).toBe('vendor-product:VP-A')

    // (c) onUpdate was NEVER called (no streaming)
    expect(onUpdateSpy).not.toHaveBeenCalled()
  })

  /** The doc-editor /m path (pickerRows absent) still gets the mint row and streams — byte-identical to no-policy. */
  it('doc-editor /m path (no pickerRows): only policy does NOT suppress mint row or streaming', async () => {
    __setMaterialSelectionPolicies(ONLY_POLICY)
    const onUpdateSpy = vi.fn()
    const ctx = {
      selection: null,
      signal: new AbortController().signal,
      onUpdate: onUpdateSpy,
    }
    const rows = await resolveMaterial('dmem', ctx as Parameters<typeof resolveMaterial>[1])

    // The doc-editor path is byte-identical to no-policy: mint row present
    const mintRow = rows.find((r) => r.pinBottom === true)
    expect(mintRow).toBeTruthy()
  })

  /** A `default` policy (not `only`) does NOT collapse — all rows + mint + streaming survive. */
  it('default policy — no collapse, all rows + mint row present', async () => {
    const DEFAULT_POLICY: SelectionPolicy[] = [{
      recordId: 'POL-1',
      material_ref: { kind: 'ontology', id: 'NCIT:C185409' },
      vendor_product_ref: { kind: 'record', id: 'VP-A' },
      selection: 'default',
    }]
    __setMaterialSelectionPolicies(DEFAULT_POLICY)
    const ctx = {
      selection: null,
      signal: new AbortController().signal,
      pickerRows: true,
      onUpdate: vi.fn(),
    }
    const rows = await resolveMaterial('dmem', ctx as Parameters<typeof resolveMaterial>[1])

    // All 3 workspace rows + mint floor
    expect(rows).toHaveLength(4)
    const mintRow = rows.find((r) => r.pinBottom === true)
    expect(mintRow).toBeTruthy()
    // No collapse flag on any row
    expect(rows.some((r) => r.policyCollapsed === true)).toBe(false)
  })
})

describe('L2-MATERIAL-SELECTION-POLICY-1 — firstDefaultFocusIndex with preselected', () => {
  it('prefers preselected row over canBeDefault row', () => {
    const rows = [
      { canBeDefault: true },
      { canBeDefault: true, preselected: true },
      { canBeDefault: true },
    ]
    expect(firstDefaultFocusIndex(rows)).toBe(1)
  })

  it('falls back to canBeDefault when no preselected row exists', () => {
    const rows = [
      { canBeDefault: false },
      { canBeDefault: true },
      { canBeDefault: true },
    ]
    expect(firstDefaultFocusIndex(rows)).toBe(1)
  })

  it('returns 0 when no row is defaultable and none is preselected', () => {
    const rows = [{ canBeDefault: false }, { canBeDefault: false }]
    expect(firstDefaultFocusIndex(rows)).toBe(0)
  })
})

describe('L2-MATERIAL-SELECTION-POLICY-1 — u2fix4 D2: duplicate-only guard on load path', () => {
  /**
   * D2: Two `only` policies for the same material concept must throw loudly
   * with BOTH record ids. Mirrors the server-side
   * normalizeMaterialSelectionPolicies contract (MaterialSelectionPolicy.ts:51-60).
   * The load-path guard is the sanctioned carrier because LintEngine
   * supports record scope only (LintEngine.ts:143).
   */
  it('__setMaterialSelectionPolicies throws when two only policies claim the same concept', () => {
    const duplicateOnly: SelectionPolicy[] = [
      {
        recordId: 'MSP-POL-1',
        material_ref: { kind: 'ontology', id: 'NCIT:C185409' },
        vendor_product_ref: { kind: 'record', id: 'VP-A' },
        selection: 'only',
      },
      {
        recordId: 'MSP-POL-2',
        material_ref: { kind: 'ontology', id: 'NCIT:C185409' },
        vendor_product_ref: { kind: 'record', id: 'VP-B' },
        selection: 'only',
      },
    ]
    expect(() => __setMaterialSelectionPolicies(duplicateOnly)).toThrow()
    expect(() => __setMaterialSelectionPolicies(duplicateOnly)).toThrow(/MSP-POL-1/)
    expect(() => __setMaterialSelectionPolicies(duplicateOnly)).toThrow(/MSP-POL-2/)
  })

  it('single only policy does not throw', () => {
    const singleOnly: SelectionPolicy[] = [
      {
        recordId: 'MSP-POL-1',
        material_ref: { kind: 'ontology', id: 'NCIT:C185409' },
        vendor_product_ref: { kind: 'record', id: 'VP-A' },
        selection: 'only',
      },
    ]
    expect(() => __setMaterialSelectionPolicies(singleOnly)).not.toThrow()
  })

  it('two only policies for DIFFERENT concepts do not throw', () => {
    const differentConcepts: SelectionPolicy[] = [
      {
        recordId: 'MSP-POL-1',
        material_ref: { kind: 'ontology', id: 'NCIT:C185409' },
        vendor_product_ref: { kind: 'record', id: 'VP-A' },
        selection: 'only',
      },
      {
        recordId: 'MSP-POL-2',
        material_ref: { kind: 'ontology', id: 'NCIT:C999999' },
        vendor_product_ref: { kind: 'record', id: 'VP-B' },
        selection: 'only',
      },
    ]
    expect(() => __setMaterialSelectionPolicies(differentConcepts)).not.toThrow()
  })

  it('only + default for the same concept does not throw', () => {
    const mixed: SelectionPolicy[] = [
      {
        recordId: 'MSP-POL-1',
        material_ref: { kind: 'ontology', id: 'NCIT:C185409' },
        vendor_product_ref: { kind: 'record', id: 'VP-A' },
        selection: 'only',
      },
      {
        recordId: 'MSP-POL-2',
        material_ref: { kind: 'ontology', id: 'NCIT:C185409' },
        vendor_product_ref: { kind: 'record', id: 'VP-B' },
        selection: 'default',
      },
    ]
    expect(() => __setMaterialSelectionPolicies(mixed)).not.toThrow()
  })
})

describe('L2-MATERIAL-SELECTION-POLICY-1 — u2fix5: duplicate-only guard throw propagates on fetch path', () => {
  const fetchSpy = vi.fn()

  beforeEach(() => {
    fetchSpy.mockReset()
    vi.stubGlobal('fetch', fetchSpy)
    fetchSpy.mockImplementation(async (url: string) => {
      if (String(url).includes('material-selection-policy')) {
        return {
          ok: true,
          json: async () => ({
            records: [
              {
                recordId: 'POL-DUP-1',
                payload: {
                  material_ref: { kind: 'ontology', id: 'NCIT:C185409' },
                  vendor_product_ref: { kind: 'record', id: 'VP-A' },
                  selection: 'only',
                },
              },
              {
                recordId: 'POL-DUP-2',
                payload: {
                  material_ref: { kind: 'ontology', id: 'NCIT:C185409' },
                  vendor_product_ref: { kind: 'record', id: 'VP-B' },
                  selection: 'only',
                },
              },
            ],
            total: 2,
          }),
        }
      }
      return { ok: true, json: async () => ({ records: [], total: 0 }) }
    })
    __resetMaterialSelectionPolicies()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetch path with duplicate only policies rejects with PolicyGuardError, not fail-open []', async () => {
    let caught: unknown
    try {
      await getMaterialSelectionPolicies()
      expect.fail('should have thrown')
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(PolicyGuardError)
    expect((caught as Error).message).toMatch(/POL-DUP-1.*POL-DUP-2/)
  })
})
