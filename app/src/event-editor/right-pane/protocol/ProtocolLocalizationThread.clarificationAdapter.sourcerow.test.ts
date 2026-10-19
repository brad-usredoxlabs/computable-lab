/**
 * W28-SOURCEROW-1 — the ('not-stated','source') row: a source-argument
 * not-stated fact answers on '/l' (RED-first, ARCHITECT DECISION W28-A5n Q2).
 *
 * Origin: r4 OBSERVATION-3 (receipts W28-A5D-R3/2026-10-19_1208-r4): the
 * 'the sample' fact (reason 'not-stated', actionLocation.argument 'source')
 * renders the '/m' MATERIAL funnel. W28-A5n Q2 rules this a domain misroute
 * of the DECLARED kind: schema/scientist-intent/scientist-intent-vocabulary.yaml
 * declares EVERY `source` argument (all 23 verbs) `kind: resolvable` +
 * `domain: labware` — the vocabulary NEVER declares a material-domain `source`
 * (material semantics live in the separately declared `material` /
 * `source_name` args). The r4 fixture proves the semantics from the other
 * side: the correct answer to 'the sample' is the seeded labware
 * lbw-seed-tube-1p5ml, which the completing '/l' path resolved verbatim.
 *
 * The fix is DATA-ONLY (one row of the declared presentation table
 * CLARIFICATION_MENU_BY_REASON_ARGUMENT, read by the ONE existing lookup
 * menuForFact): 'not-stated': { labware: '/l', source: '/l' }. No resolver,
 * picker, schema, or wire change. The (reason,'*') fallback row
 * CLARIFICATION_MENU_BY_REASON['not-stated'] = '/m' STAYS — a source-less
 * not-stated hedge keeps '/m' (W28-A5n Q2 verbatim).
 *
 * RED at baseline: (reason 'not-stated', argument 'source') falls through to
 * the (reason,'*') row and renders '/m' — this test fails with
 * `expected '/m' to be '/l'`. GREEN after the row ONLY.
 */
import { describe, expect, it } from 'vitest'
import { heldFactToClarificationRequest } from './ProtocolLocalizationThread.clarificationAdapter'

describe('clarificationAdapter — (not-stated, source) gets /l (W28-SOURCEROW-1, W28-A5n Q2)', () => {
  it('1. {reason:not-stated, actionLocation.argument=source} maps to /l (source is labware-semantic by declared vocabulary)', () => {
    const req = heldFactToClarificationRequest({
      label: 'the sample',
      reason: 'not-stated',
      actionLocation: { actionIndex: 0, action: 'bead_beat', argument: 'source' },
    }, 0)
    expect(req, 'a source-argument not-stated fact must get a card').not.toBeNull()
    expect(req!.menuProvider, "declared domain: labware — '/l' (resolveLabware, no mint floor), never the '/m' material funnel").toBe('/l')
  })

  it('2. the (reason,*) fallback STAYS: a not-stated fact with NO argument keeps /m (W28-A5n Q2 verbatim)', () => {
    const req = heldFactToClarificationRequest({ label: 'the sample', reason: 'not-stated' }, 0)
    expect(req).not.toBeNull()
    expect(req!.menuProvider).toBe('/m')
  })

  it('3. a not-stated fact with a NON-source, NON-labware argument still falls to /m (the row is keyed, not a blanket)', () => {
    const req = heldFactToClarificationRequest({
      label: 'the sample',
      reason: 'not-stated',
      actionLocation: { actionIndex: 0, action: 'lyse', argument: 'reagent' },
    }, 0)
    expect(req).not.toBeNull()
    expect(req!.menuProvider).toBe('/m')
  })
})
