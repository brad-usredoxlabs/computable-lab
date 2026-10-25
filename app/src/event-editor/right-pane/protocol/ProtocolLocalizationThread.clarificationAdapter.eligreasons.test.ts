/**
 * MATRES-PANEL STEP 0 (orch-ruled OQ-1, post-merge re-verify §3) — the two
 * MATRES-ELIG reason codes get their adapter rows. RED-first, committed
 * separately from the panel work.
 *
 * ELIG's merged data declares two NEW clarification reason codes:
 *   catalogScopeReason: vendor-scope-unknown   (material-eligibility.yaml:91)
 *   bindIncompleteReason: eligibility-incomplete (material-eligibility.yaml:97)
 * Both facts always carry actionLocation (resolutionEngine.ts:281, :353 ride
 * req.actionLocation). On trunk TODAY the adapter is blind to them:
 * menuForFact -> undefined -> null (clarificationAdapter.ts:186-187) AND the
 * gap-shape fallback is refused because the reason is unnamed while
 * hasSlotIdentity is true (:252-254). Result: an eligibility-incomplete slot
 * gets NO card and is unanswerable-by-construction — the exact SAMPLE-CARD-1
 * / GAPCARD-1 disease the table's own posture comments (:73-87) enumerate.
 *
 * The fix is two DATA rows mirroring the SAMPLE-CARD-1 posture verbatim:
 * without this row the fact gets NO card and is unanswerable-by-construction;
 * with it the shipped ANSWER-BIND-1 exact-identity join is the answer path —
 * zero new machinery.
 *
 * OQ-2 (orch-ruled): vendor-scope-unknown carries ZERO candidates by design
 * (AC-3 elicits scope, never fabricates product identity — engine :281). The
 * '/m' picker SEARCH is the answer surface; no new free-text mechanism rides
 * this diff.
 *
 * RED at base: foldCards on an 'eligibility-incomplete' fact returns NO card
 * (null) — the STEP-0 finding. GREEN only after the two table rows land.
 */
import { describe, expect, it } from 'vitest'
import {
  CLARIFICATION_MENU_BY_REASON,
  foldCards,
  heldFactToClarificationRequest,
} from './ProtocolLocalizationThread.clarificationAdapter'

/** A widened ELIG candidate (the merged candidateFact shape,
 *  resolutionEngine.ts:127-146 — tier/referentLevel/eligibility via
 *  conditional spread; shape-diffed against the blessed golden
 *  goldens/__records__/ambiguous-material.golden.json). */
function eligCandidate(label: string, referentLevel: string): Record<string, unknown> {
  return {
    label,
    confidence: 0.9,
    ref: 'MAT-fixture-1',
    tier: 1,
    referentLevel,
    eligibility: {
      display: 'incomplete',
      suppress: 'pass',
      bind: 'incomplete',
      policyIds: {
        display: 'display-tier-legal',
        suppress: 'suppress-unconstrained-presence',
        bind: 'bind-level-demanded',
      },
    },
  }
}

describe('clarificationAdapter — the two ELIG reason codes get their menu rows (MATRES-PANEL step 0)', () => {
  it('1. foldCards on an eligibility-incomplete fact (actionLocation + widened candidates) returns a /m card — RED at base: null, unanswerable-by-construction', () => {
    const cards = foldCards([{
      label: 'Trypsin-EDTA',
      reason: 'eligibility-incomplete',
      actionLocation: { actionIndex: 0, action: 'add_material', argument: 'material' },
      candidates: [eligCandidate('Thermo trypsin-EDTA', 'concept')],
    }])
    expect(cards.length, 'the ELIG bind-incomplete fact must get a card').toBe(1)
    expect(cards[0]!.menuProvider).toBe('/m')
    expect(cards[0]!.prompt).toBe('Trypsin-EDTA')
    expect(cards[0]!.options.map((o) => o.label)).toEqual(['Thermo trypsin-EDTA'])
  })

  it('2. foldCards on a vendor-scope-unknown fact (ZERO candidates by design) returns a /m card — the picker SEARCH is the answer surface (OQ-2)', () => {
    const cards = foldCards([{
      label: '5424R',
      reason: 'vendor-scope-unknown',
      actionLocation: { actionIndex: 1, action: 'add_material', argument: 'material' },
      candidates: [],
    }])
    expect(cards.length, 'the ELIG catalog-scope fact must get a card').toBe(1)
    expect(cards[0]!.menuProvider).toBe('/m')
    // Zero candidates by design (AC-3 elicits scope): the '/m' picker search
    // is the answer surface — the shipped ClarificationPicker, no new
    // free-text mechanism.
    expect(cards[0]!.options).toEqual([])
    expect(cards[0]!.query).toBe('5424R')
  })

  it('3. (reason, argument) overrides: a labware-semantic ELIG fact routes /l exactly like every other carded reason', () => {
    const labware = heldFactToClarificationRequest({
      label: 'standard plate',
      reason: 'eligibility-incomplete',
      actionLocation: { actionIndex: 0, action: 'transfer', argument: 'labware' },
      candidates: [eligCandidate('standard plate alpha', 'unknown')],
    }, 0)
    expect(labware).not.toBeNull()
    expect(labware!.menuProvider).toBe('/l')

    // W28-SOURCEROW-1 posture: 'source' IS labware-semantic by declared data.
    const source = heldFactToClarificationRequest({
      label: '5424R',
      reason: 'vendor-scope-unknown',
      actionLocation: { actionIndex: 1, action: 'transfer', argument: 'source' },
    }, 0)
    expect(source).not.toBeNull()
    expect(source!.menuProvider).toBe('/l')
  })

  it('4. the (reason,*) fallback for both codes is /m (a non-labware argument keeps the material funnel)', () => {
    expect(heldFactToClarificationRequest({
      label: 'Trypsin-EDTA',
      reason: 'eligibility-incomplete',
      actionLocation: { actionIndex: 0, action: 'add_material', argument: 'material' },
    }, 0)!.menuProvider).toBe('/m')
    expect(heldFactToClarificationRequest({
      label: 'Trypsin-EDTA',
      reason: 'eligibility-incomplete',
    }, 0)!.menuProvider).toBe('/m')
  })

  it('5. the reason table delta is EXACTLY the two ELIG rows (sanctioned deliberate pin update)', () => {
    expect({ ...CLARIFICATION_MENU_BY_REASON }).toEqual({
      'unknown-noun': '/m',
      'ambiguous-noun': '/m',
      'resolution-lookup-failed': '/m',
      'not-stated': '/m',
      'ambiguous': '/m',
      'contradicts-the-text': '/m',
      'missing-required-argument': null,
      'eligibility-incomplete': '/m',
      'vendor-scope-unknown': '/m',
    })
  })
})
