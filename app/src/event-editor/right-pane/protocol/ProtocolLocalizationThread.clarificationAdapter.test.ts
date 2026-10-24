/**
 * ANSWER-SURFACE-1 — the clarification menu pick is keyed on
 * (reason, fact.actionLocation.argument), not reason alone.
 *
 * Origin: ARCHITECT DECISION W28-A5h (Q2 TASK ANSWER-SURFACE-1). A fact whose
 * actionLocation.argument === 'labware' is labware-semantic: its answer surface
 * must be the LABWARE menu ('/l' — ClarificationPicker routes '/l' to
 * resolveLabware, and because the mint floor row exists only in resolveMaterial
 * (resolvers.ts:67-92), a '/l' card has NO mint floor — its zero-hit copy says
 * plain 'No matches', never "keep typing to mint", FIX1 D1). Every other
 * (reason, argument) combination keeps the existing
 * CLARIFICATION_MENU_BY_REASON value byte-identically — the (reason,'*') row
 * is the single fallback, so every current card is unchanged.
 *
 * Presentation data only: `argument` is declared vocabulary data (the SPINE-1
 * frozen unresolved shape's actionLocation, workflow/scientist-intent.schema
 * .yaml:220-244) — reading it is a generic read of the wire fact, not a noun/
 * verb/protocol literal. No schema change, no server change, no new chrome.
 *
 * RED at baseline: the adapter keys on reason ONLY, so test 1 (labware-argument
 * fact -> '/l') fails with '/m'.
 */
import { describe, expect, it } from 'vitest'
import {
  CLARIFICATION_MENU_BY_REASON,
  heldFactToClarificationRequest,
} from './ProtocolLocalizationThread.clarificationAdapter'

/** Minimal held-fact fixture: label + reason (+ optional wire extras). */
function fact(reason: string, extras: Record<string, unknown> = {}): Record<string, unknown> {
  return { label: 'microcentrifuge tube', reason, ...extras }
}

describe('clarificationAdapter — menu keyed on (reason, actionLocation.argument) (ANSWER-SURFACE-1)', () => {
  it('1. ambiguous-noun WITH actionLocation.argument=labware routes to the labware menu /l', () => {
    const req = heldFactToClarificationRequest(
      fact('ambiguous-noun', {
        actionLocation: { actionIndex: 0, action: 'transfer', argument: 'labware' },
        candidates: [{ label: 'Ontology microcentrifuge tube', confidence: 0.9 }],
      }),
      0,
    )
    expect(req).not.toBeNull()
    expect(req!.menuProvider).toBe('/l')
    // The card's prompt/options handling is untouched — only the menu moved.
    expect(req!.prompt).toBe('microcentrifuge tube')
    expect(req!.options.map((o) => o.label)).toEqual(['Ontology microcentrifuge tube'])
  })

  it('2. same reason WITHOUT actionLocation stays /m exactly as today', () => {
    const req = heldFactToClarificationRequest(fact('ambiguous-noun'), 0)
    expect(req).not.toBeNull()
    expect(req!.menuProvider).toBe('/m')
  })

  it('3. same reason with a NON-labware argument stays /m exactly as today', () => {
    const req = heldFactToClarificationRequest(
      fact('ambiguous-noun', { actionLocation: { actionIndex: 0, action: 'add_material', argument: 'source' } }),
      0,
    )
    expect(req).not.toBeNull()
    expect(req!.menuProvider).toBe('/m')
  })

  it('3b. actionLocation present but WITHOUT an argument falls to the (reason,*) default /m', () => {
    const req = heldFactToClarificationRequest(
      fact('ambiguous-noun', { actionLocation: { actionIndex: 0, action: 'transfer' } }),
      0,
    )
    expect(req).not.toBeNull()
    expect(req!.menuProvider).toBe('/m')
  })

  // One pin per existing table reason at (reason,'*'): every current card is
  // byte-identical (the (reason,'*') row is the single fallback).
  it('4. unknown-noun at (reason,*) renders unchanged: /m', () => {
    const req = heldFactToClarificationRequest(fact('unknown-noun'), 0)
    expect(req).not.toBeNull()
    expect(req!.menuProvider).toBe('/m')
  })

  it('5. ambiguous-noun at (reason,*) renders unchanged: /m', () => {
    const req = heldFactToClarificationRequest(fact('ambiguous-noun'), 0)
    expect(req).not.toBeNull()
    expect(req!.menuProvider).toBe('/m')
  })

  it('6. resolution-lookup-failed at (reason,*) renders unchanged: /m', () => {
    const req = heldFactToClarificationRequest(fact('resolution-lookup-failed'), 0)
    expect(req).not.toBeNull()
    expect(req!.menuProvider).toBe('/m')
  })

  it('7. a reason with no menu row still returns null (no answer surface)', () => {
    expect(heldFactToClarificationRequest(fact('missing-required-argument'), 0)).toBeNull()
    expect(heldFactToClarificationRequest(fact('missing-required-argument', {
      actionLocation: { actionIndex: 0, action: 'add_material', argument: 'labware' },
    }), 0)).toBeNull()
  })

  it('8. the reason table itself is unchanged (presentation data, sanctioned extension)', () => {
    // SAMPLE-CARD-1 DELIBERATE PIN UPDATE (same pattern ANSWER-SURFACE-1 used
    // for the argument table): the three engine rows keep their exact values;
    // the ONLY delta is the new sanctioned 'not-stated' row.
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
  })
})
