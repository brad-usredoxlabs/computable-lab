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
import { describe, expect, it } from 'vitest'
import {
  materialCandidates,
  consequenceFor,
  firstDefaultFocusIndex,
  type CandidateRankingPolicy,
  type MaterialCandidateItem,
} from './clarifyPickerRanking'
import {
  __setCandidateRankingPolicy,
  getCandidateRankingPolicy,
} from './policy'

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
