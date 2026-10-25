/**
 * SAMPLE-CARD-1 — the typed stated-but-uncommitted fact gets its menu row.
 *
 * Origin: ARCHITECT DECISION W28-A5i (Q2 TASK SAMPLE-CARD-1). HEDGE-TYPE-1
 * instructs the emitter to type its stated-but-uncommitted facts with reason
 * 'not-stated' + actionLocation. Today the reason table has NO row for
 * 'not-stated', so menuForFact returns undefined and the fact never gets a
 * card (adapter header: "A fact whose reason has NO entry in the table has no
 * answer surface") — unanswerable-by-construction (W28-A5i Q1.2(i)). This task
 * adds ONE reason row + the labware argument override, same sanctioned
 * presentation-data class as ANSWER-SURFACE-1. NO schema change, NO picker
 * change, NO resolver change, NO drop-rule change: the shipped ANSWER-BIND-1
 * exact-identity join (b52f5dfc) IS the answer path once the card exists.
 *
 * Mint floor: the '/l' menu routes to resolveLabware, which emits no `mint:<q>`
 * floor row (resolvers.ts:67-92 — resolveMaterial alone emits it) and
 * ClarificationPicker's canMint is `resolver === resolveMaterial`
 * (ClarificationPicker.tsx:268), so a '/l' card has NO mint floor. The carded
 * not-stated labware fact therefore answers by PICKING, never minting
 * (W28-A5i Q3: material-only mint floor reaffirmed).
 *
 * RED at baseline: reason 'not-stated' has no menu row -> tests 1 and 2 fail
 * (heldFactToClarificationRequest returns null); test 3's pinned tables lack
 * the new rows.
 */
import { describe, expect, it } from 'vitest'
import {
  CLARIFICATION_MENU_BY_REASON,
  heldFactToClarificationRequest,
} from './ProtocolLocalizationThread.clarificationAdapter'

/** Minimal held-fact fixture: label + reason (+ optional wire extras). */
function fact(reason: string, extras: Record<string, unknown> = {}): Record<string, unknown> {
  return { label: 'the sample', reason, ...extras }
}

describe('clarificationAdapter — not-stated gets its card (SAMPLE-CARD-1, W28-A5i Q2)', () => {
  it('1. {reason:not-stated, actionLocation.argument=labware} maps to /l with NO mint floor', () => {
    const req = heldFactToClarificationRequest(
      fact('not-stated', {
        actionLocation: { actionIndex: 0, action: 'bead_beat', argument: 'labware' },
      }),
      0,
    )
    expect(req).not.toBeNull()
    expect(req!.menuProvider).toBe('/l')
    // '/l' is the no-mint-floor surface: ClarificationPicker's canMint is
    // resolver === resolveMaterial (ClarificationPicker.tsx:268) and '/l'
    // routes to resolveLabware, which emits no mint:<q> row (resolvers.ts:
    // 67-92). The card answers by PICKING [[labware:<id>|label]], never mint.
    expect(req!.menuProvider).not.toBe('/m')
    expect(req!.prompt).toBe('the sample')
  })

  it('2. an unlocated {reason:not-stated} without actionLocation maps to the table default /m', () => {
    const req = heldFactToClarificationRequest(fact('not-stated'), 0)
    expect(req).not.toBeNull()
    expect(req!.menuProvider).toBe('/m')
  })

  it('3. every EXISTING engine-reason card mapping is byte-identical (fallback rule pinned)', () => {
    // (reason,'*') table: the three engine rows keep their exact values; the
    // only addition is the new 'not-stated' row itself.
    // GAPCARD-1 DELIBERATE PIN UPDATE (same sanctioned pattern): the ONLY
    // further delta is the two prompt-declared model rows
    // (intent.compile.system.yaml:22) + the explicit declared-no-surface entry
    // for 'missing-required-argument' (null BY DATA, not by fallthrough).
    // MATRES-PANEL STEP-0 DELIBERATE PIN UPDATE (orch-ruled, same sanctioned
    // pattern): the ONLY further delta is the two MATRES-ELIG reason rows
    // (material-eligibility.yaml :91/:97 — declared vocabulary data).
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
    // Loop-pin each existing engine reason at (reason,'*') and at
    // (reason, labware): unchanged, byte-for-byte, exactly as ANSWER-SURFACE-1
    // shipped them.
    for (const reason of ['unknown-noun', 'ambiguous-noun', 'resolution-lookup-failed']) {
      expect(heldFactToClarificationRequest(fact(reason), 0)!.menuProvider).toBe('/m')
      expect(heldFactToClarificationRequest(fact(reason, {
        actionLocation: { actionIndex: 0, action: 'transfer', argument: 'labware' },
      }), 0)!.menuProvider).toBe('/l')
      // A non-labware argument keeps the (reason,'*') fallback.
      expect(heldFactToClarificationRequest(fact(reason, {
        actionLocation: { actionIndex: 0, action: 'add_material', argument: 'source' },
      }), 0)!.menuProvider).toBe('/m')
    }
    // A reason with NO menu row still returns null (no answer surface).
    expect(heldFactToClarificationRequest(fact('missing-required-argument'), 0)).toBeNull()
    expect(heldFactToClarificationRequest(fact('missing-required-argument', {
      actionLocation: { actionIndex: 0, action: 'add_material', argument: 'labware' },
    }), 0)).toBeNull()
  })

  it('4. not-stated with a NON-labware argument falls to the (reason,*) default /m', () => {
    const req = heldFactToClarificationRequest(
      fact('not-stated', { actionLocation: { actionIndex: 0, action: 'lyse', argument: 'reagent' } }),
      0,
    )
    expect(req).not.toBeNull()
    expect(req!.menuProvider).toBe('/m')
  })
})
