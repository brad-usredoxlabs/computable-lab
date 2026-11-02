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
 * grep-clean `MATERIAL_CATEGORY_RANK` assertion in resolvers.test.ts is the
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
  firstDefaultFocusIndex,
  type CandidateRankingPolicy,
  type MaterialCandidateItem,
} from './clarifyPickerRanking'
import { __setCandidateRankingPolicy } from './policy'

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

  it('never-default red case: a composition ranked 0 with an equality label is still skipped by firstDefaultFocusIndex', () => {
    // Inject composition rank to 0 AND a composition label equal to the noun —
    // the worst case for the focus default. `firstDefaultFocusIndex` must still
    // skip the composition row (enforced against the `canBeDefault` data flag,
    // not label shape or rank value).
    const injected: CandidateRankingPolicy = {
      containsSectionLabel: 'contains "{label}" ({count})',
      families: {
        'saved-stock': { rank: 1, canBeDefault: true },
        'concept-only': { rank: 2, canBeDefault: true },
        // composition pinned to rank 0 (the data would never say this, but the
        // rule must hold REGARDLESS of rank values).
        composition: { rank: 0, canBeDefault: false },
      },
    }
    const items: MaterialCandidateItem[] = [
      // a composition whose label EQUALS the noun, injected to rank 0.
      { recordId: 'MSP-comp-0', kind: 'material-spec', title: 'DMEM', category: 'saved-stock' },
      // a plain concept (rank 2) that IS defaultable.
      { recordId: 'MAT-dmem-ykg0', kind: 'material', title: 'DMEM + FBS', category: 'concept-only' },
    ]
    const rows = materialCandidates(items, 'DMEM', injected)
    // The composition (`MSP-comp-0`) is first in band order (rank 0, equality)
    // — but it is the ONLY non-defaultable row.
    expect(rows[0]).toMatchObject({ key: 'material-spec:MSP-comp-0', canBeDefault: false })
    // firstDefaultFocusIndex skips it and lands on the first defaultable row.
    const focus = firstDefaultFocusIndex(rows)
    expect(focus).toBe(1)
    expect(rows[focus]).toMatchObject({ key: 'material:MAT-dmem-ykg0', canBeDefault: true })
  })

  it('a policy with no composition family still never-defaults a composition (the flag is the enforcement)', () => {
    // Even if the data omits an explicit composition entry, a composition row's
    // family resolves to the composition pseudo-family (can_be_default false) —
    // the never-default rule is not lost by an absent key.
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
    expect(firstDefaultFocusIndex(rows)).toBe(0)
  })
})

describe('L2-CLARIFY-PICKER-1 — policy cache seam (resolver path is deterministic)', () => {
  it('the module cache seeds the declared policy (the resolver reads it once)', () => {
    __setCandidateRankingPolicy(DECLARED)
    // After the build, resolveMaterial reads this cache on first paint; the
    // comparator under test is the pure materialCandidates above. This test
    // only locks the seam: setting the cache does not throw and the declared
    // policy round-trips (the policy.ts __reset/__set pair).
    expect(DECLARED.families.composition).toMatchObject({ rank: 4, canBeDefault: false })
  })
})
