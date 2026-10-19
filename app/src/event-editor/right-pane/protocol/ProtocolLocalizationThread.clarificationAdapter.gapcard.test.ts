/**
 * W211-GAPCARD-1 — the gap-fact card surface (adapter unit pin: "adapter unit
 * pin gap reason -> menu row", task-list VERIFIED-BY clause, RED-first).
 *
 * Origin: the W211-MACH-1 class-(d) finding (fixture obligations[3],
 * PROVENANCE STEP-0 probe B2/E): a model-side gap fact reaches NO answerable
 * card surface. Two distinct defects, both DATA fixes on the ANSWER-SURFACE-1
 * surface (spec 2026-10-18_UCX2D1.../ANSWER-SURFACE-1):
 *
 * 1. The shipped reason table has NO row for the two OTHER prompt-declared
 *    model reasons — `ambiguous` and `contradicts-the-text`
 *    (schema/registry/prompt-templates/intent.compile.system.yaml:22 declares
 *    `not-stated | ambiguous | contradicts-the-text`). A model fact carrying
 *    either maps to null: unanswerable-by-construction, exactly the
 *    SAMPLE-CARD-1 disease that the 'not-stated' row cured. These strings are
 *    DECLARED vocabulary, not invented codes ('ambiguous' is the MODEL-side
 *    reason, distinct from the engine's 'ambiguous-noun' — resolutionEngine.ts:217).
 *
 * 2. A slot-less, table-less fact (the class-(d) wire shape: prose reason, NO
 *    actionLocation, no usable candidates) maps to null on every arm. The fix
 *    is the GAP-SHAPE FALLBACK, still DATA: a fact whose reason has NO table
 *    entry AND which carries NO slot identity (actionLocation absent — the
 *    same generic read heldFactToClarificationRequest already does) gains
 *    menuProvider 'choice' (the EXISTING types/ai.ts:215 union member — the
 *    picker-less surface QuestionsPanel answers with a free-text box).
 *    Facts WITH slot identity but no row (e.g. 'missing-required-argument',
 *    which always carries a filled actionLocation in production — the sweep
 *    fills it, resolveNounsPass.ts:243-258) STAY null: the stable engine code's
 *    "declared no surface" is now an EXPLICIT null table entry, so the existing
 *    null pins stay GREEN BY DATA, not by incidental fallthrough.
 *
 * The fallback lives in the FOLD path (clarificationRequestForFact / foldCards
 * — the ONE shared adapter call-site the thread folds through), NOT inside
 * heldFactToClarificationRequest: the golden fixture's integrity pin 5d feeds
 * the class-(d) wire through heldFactToClarificationRequest and pins
 * expectedCard:false (BLOCKED-ON-FIX record, fixture bytes frozen until the
 * named follow-up flips it — OQ3). The (d)-flip follow-up re-routes that pin
 * through the fold mapper together with the fixture sha bump.
 *
 * Zero prose-reason matching anywhere: the fallback keys ONLY on table-entry
 * presence + actionLocation presence + the candidates read — never a regex or
 * substring against a reason sentence (spec bait 4: a HARD defect).
 *
 * RED at base: the 'ambiguous'/'contradicts-the-text' pins fail with
 * `expected null to be object` (heldFactToClarificationRequest returns null —
 * the exact STEP-0 finding); the fold pins fail at import (the shared fold
 * mapper does not exist yet). GREEN after the table extension + fold fallback ONLY.
 */
import { describe, expect, it } from 'vitest'
import {
  CLARIFICATION_MENU_BY_REASON,
  clarificationRequestForFact,
  foldCards,
  heldFactToClarificationRequest,
} from './ProtocolLocalizationThread.clarificationAdapter'

/** Minimal held-fact fixture: label + reason (+ optional wire extras). */
function fact(reason: string, extras: Record<string, unknown> = {}): Record<string, unknown> {
  return { label: 'microcentrifuge tube', reason, ...extras }
}

/**
 * The class-(d) wire object, VERBATIM from the golden fixture's plantedFacts
 * (app/e2e/fixtures/w211-golden/zymo-intent.frozen.yaml, obligation
 * d-gap-fact-deck-surface) — a literal copy, comment-cited, NOT a fixture
 * import (a fixture import would couple the adapter test to the frozen sha
 * churn). Test data only: no product path matches these strings.
 */
const OBLIGATIONS3_WIRE: Record<string, unknown> = {
  label: 'Bead Beating Plate vs Lysis Plate',
  reason: 'The protocol transfers to the Lysis Plate and adds Lysis Solution there, but bead-beats in the Bead Beating Plate; it is unclear whether the bead-beating occurs on the same physical plate (Lysis Plate) or a separate Bead Beating Plate.',
  candidates: [],
}

describe('clarificationAdapter — gap reasons get their menu rows (W211-GAPCARD-1)', () => {
  it('1. reason ambiguous maps to /m; with actionLocation.argument=labware to /l; with a non-labware argument to /m', () => {
    const bare = heldFactToClarificationRequest(fact('ambiguous'), 0)
    expect(bare, "prompt-declared model reason 'ambiguous' must get a card").not.toBeNull()
    expect(bare!.menuProvider).toBe('/m')

    const labware = heldFactToClarificationRequest(fact('ambiguous', {
      actionLocation: { actionIndex: 0, action: 'transfer', argument: 'labware' },
    }), 0)
    expect(labware).not.toBeNull()
    expect(labware!.menuProvider).toBe('/l')

    const other = heldFactToClarificationRequest(fact('ambiguous', {
      actionLocation: { actionIndex: 0, action: 'add_material', argument: 'source' },
    }), 0)
    expect(other).not.toBeNull()
    expect(other!.menuProvider).toBe('/m')
  })

  it('2. reason contradicts-the-text maps the same triple (/m, labware /l, other-arg /m)', () => {
    const bare = heldFactToClarificationRequest(fact('contradicts-the-text'), 0)
    expect(bare, "prompt-declared model reason 'contradicts-the-text' must get a card").not.toBeNull()
    expect(bare!.menuProvider).toBe('/m')

    const labware = heldFactToClarificationRequest(fact('contradicts-the-text', {
      actionLocation: { actionIndex: 1, action: 'bead_beat', argument: 'labware' },
    }), 0)
    expect(labware).not.toBeNull()
    expect(labware!.menuProvider).toBe('/l')

    const other = heldFactToClarificationRequest(fact('contradicts-the-text', {
      actionLocation: { actionIndex: 1, action: 'spin', argument: 'source' },
    }), 0)
    expect(other).not.toBeNull()
    expect(other!.menuProvider).toBe('/m')
  })

  it('3. the obligations[3] wire object fed through the fold mapper VERBATIM renders a kind-correct choice card', () => {
    const req = clarificationRequestForFact(OBLIGATIONS3_WIRE, 0)
    expect(req, 'the class-(d) gap fact must reach an answerable card').not.toBeNull()
    // 'choice' is the EXISTING types/ai.ts:215 union member — the picker-less
    // free-text surface (ClarificationPicker.resolverFor returns null for it;
    // requestHasPicker false). Never a new provider string.
    expect(req!.menuProvider).toBe('choice')
    expect(req!.kind).toBe('general')
    expect(req!.prompt).toBe('Bead Beating Plate vs Lysis Plate')
    expect(req!.query).toBe('Bead Beating Plate vs Lysis Plate')
    expect(req!.options).toEqual([])
  })

  it('4. missing-required-argument stays null WITH and WITHOUT actionLocation (explicit-null table entry, both mappers)', () => {
    // The stable engine code's declared no-surface is now DATA, not fallthrough.
    expect(heldFactToClarificationRequest(fact('missing-required-argument'), 0)).toBeNull()
    expect(heldFactToClarificationRequest(fact('missing-required-argument', {
      actionLocation: { actionIndex: 0, action: 'add_material', argument: 'labware' },
    }), 0)).toBeNull()
    // The explicit entry also BLOCKS the gap-shape fallback (no slot identity
    // here in the first call — the table entry wins, the fact stays null).
    expect(clarificationRequestForFact(fact('missing-required-argument'), 0)).toBeNull()
    expect(clarificationRequestForFact(fact('missing-required-argument', {
      actionLocation: { actionIndex: 0, action: 'add_material', argument: 'labware' },
    }), 0)).toBeNull()
  })

  it('5. every EXISTING table reason is byte-identical at (reason,*), (reason,labware), (reason,other-arg) (sampleCard1 loop pin copied — the ANSWER-SURFACE-1 / SAMPLE-CARD-1 bars cannot regress)', () => {
    // W28-SOURCEROW-1 DELIBERATE PIN UPDATE (the sanctioned GAPCARD-1 /
    // SAMPLE-CARD-1 pattern, W28-A5n Q2): the ONLY delta in this loop is the
    // ('not-stated','source') expectation '/m' -> '/l' — 'source' is declared
    // `domain: labware` for every verb that declares it, so the material
    // funnel was a domain misroute. The OTHER three reasons' 'source' pins
    // stay '/m' (their (reason,'*') rows are unchanged), and every
    // (reason,'*') and (reason,labware) pin is unchanged.
    const expectedSourceMenu: Record<string, string> = {
      'unknown-noun': '/m',
      'ambiguous-noun': '/m',
      'resolution-lookup-failed': '/m',
      'not-stated': '/l', // W28-SOURCEROW-1: the one flipped pin
    }
    for (const reason of ['unknown-noun', 'ambiguous-noun', 'resolution-lookup-failed', 'not-stated']) {
      expect(heldFactToClarificationRequest(fact(reason), 0)!.menuProvider).toBe('/m')
      expect(heldFactToClarificationRequest(fact(reason, {
        actionLocation: { actionIndex: 0, action: 'transfer', argument: 'labware' },
      }), 0)!.menuProvider).toBe('/l')
      expect(heldFactToClarificationRequest(fact(reason, {
        actionLocation: { actionIndex: 0, action: 'add_material', argument: 'source' },
      }), 0)!.menuProvider).toBe(expectedSourceMenu[reason])
    }
  })

  it('6. a fact with NO slot identity but a ROWED reason keeps its ROW (rows win over the shape fallback)', () => {
    // 'not-stated' with a prose-shaped label: the row decides '/m' — the
    // fallback never overrides a table row.
    const req = clarificationRequestForFact({
      label: 'the prepared lysis reagent',
      reason: 'not-stated',
      candidates: [],
    }, 0)
    expect(req).not.toBeNull()
    expect(req!.menuProvider).toBe('/m')
  })

  it('7. a table-less reason WITH slot identity stays null (the fallback is slot-identity-gated — a wider fallback is the design error)', () => {
    expect(clarificationRequestForFact({
      label: 'some plate',
      reason: 'a free-text hedge sentence about which plate was meant',
      actionLocation: { actionIndex: 2, action: 'bead_beat', argument: 'labware' },
      candidates: [],
    }, 0)).toBeNull()
  })

  it('8. a table-less slot-less fact WITH candidates keeps its candidates as option buttons beside the free-text surface (OQ5 ratified)', () => {
    const req = clarificationRequestForFact({
      label: 'which wash vessel',
      reason: 'the protocol washes but does not name the vessel it washes in',
      candidates: [{ label: 'Wash Station A', confidence: 0.6 }],
    }, 0)
    expect(req).not.toBeNull()
    expect(req!.menuProvider).toBe('choice')
    expect(req!.options.map((o) => o.label)).toEqual(['Wash Station A'])
  })

  it('9. foldCards maps a mixed bundle through the ONE shared call-site: cardable facts become requests, declared-no-surface facts drop', () => {
    const cards = foldCards([
      { label: 'Bead Beating Plate', reason: 'ambiguous-noun', candidates: [{ label: 'Bead Beating Plate A', confidence: 1 }], actionLocation: { actionIndex: 2, action: 'bead_beat', argument: 'labware' } },
      OBLIGATIONS3_WIRE,
      { label: 'culture volume', reason: 'missing-required-argument', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'volume' } },
    ])
    expect(cards.length).toBe(2)
    expect(cards[0]!.menuProvider).toBe('/l')
    expect(cards[1]!.menuProvider).toBe('choice')
    expect(cards[1]!.prompt).toBe('Bead Beating Plate vs Lysis Plate')
  })

  it('10. the reason table carries the sanctioned GAPCARD-1 rows and keeps every existing row byte-identical (deliberate pin update, SAMPLE-CARD-1 pattern)', () => {
    expect({ ...CLARIFICATION_MENU_BY_REASON }).toEqual({
      'unknown-noun': '/m',
      'ambiguous-noun': '/m',
      'resolution-lookup-failed': '/m',
      'not-stated': '/m',
      // GAPCARD-1 DELIBERATE PIN UPDATE (same sanctioned pattern SAMPLE-CARD-1
      // used for the 'not-stated' row): the ONLY delta is the two new
      // prompt-declared model rows + the explicit declared-no-surface entry.
      'ambiguous': '/m',
      'contradicts-the-text': '/m',
      'missing-required-argument': null,
    })
  })
})
