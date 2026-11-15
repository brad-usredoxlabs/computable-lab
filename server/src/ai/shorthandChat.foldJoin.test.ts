/**
 * L2-P1-AMBIGUOUS-OPTIONS-1 (u5optbind) — the AMBIGUOUS-card answer's requestId
 * must bind the held fact (the fold-path join-miss; gate r13 defect 1).
 *
 * r13 (prompt-1, "Place a 96-well plate on the deck."): the ask-turn card
 * carries the ORIGINAL bar's `factRequestId` (label "96-well plate").
 * Answering it splices the chosen label into the held document and the
 * recompile RE-DERIVES the same bar with the CHOSEN label — a NEW fact, a
 * NEW id — which the re-hold keeps as the only held fact. The app posts the
 * STALE answer (the original card's id) back with the next turn
 * (`answers=2 heldFacts=1`); its id is no longer a key in `factByKey`, the
 * legacy positional arm never fires on a content id, and the fold returns
 * null on `arm=join-miss` — the r13 death.
 *
 * This pins the seam the unit closes: an answer whose requestId is the
 * EMITTED card id (built the way the real emission path mints it) joins the
 * re-held fact by verified content (the answer's label canonically names the
 * held fact's label, and exactly one held fact does) — never positionally,
 * never a guess.
 */
import { describe, expect, it } from 'vitest';
import {
  clarificationsFromUnresolvedFacts,
  factRequestId,
  foldAnswersIntoShorthand,
  foldNullArm,
  parseShorthandForChat,
} from './shorthandChat.js';
import type { ScientistIntentUnresolvedFact } from '../compiler/scientistIntent/types.js';

const CHOSEN = 'Generic 96-Well Plate';
const RECORD_ID = 'lbw-def-generic-96-well-plate';

/** The ORIGINAL bar the ask turn minted (the noun as the scientist said it). */
function originalFact(): ScientistIntentUnresolvedFact {
  return {
    label: '96-well plate',
    reason: 'ambiguous-noun',
    candidates: [{ label: CHOSEN, ref: RECORD_ID }],
    actionLocation: { actionIndex: 0, action: 'shake', argument: 'labware' },
  };
}

/** The RE-DERIVED bar after the first answer (the noun now reads the
 *  CHOSEN label; the recompile re-minted it — a new fact, a new id). */
function heldFact(): ScientistIntentUnresolvedFact {
  return {
    label: CHOSEN,
    reason: 'ambiguous-noun',
    candidates: [{ label: CHOSEN, ref: RECORD_ID }],
    actionLocation: { actionIndex: 0, action: 'shake', argument: 'labware' },
  };
}

function heldIntent(): Parameters<typeof foldAnswersIntoShorthand>[0] {
  const yaml = `intentId: fold-join-u5\nactions:\n  - action: shake\n    labware: ${CHOSEN}\n`;
  return { yaml, doc: parseShorthandForChat(yaml), clarifications: [heldFact()] };
}

/** The answer the app posts: requestId = the id the REAL card path emitted
 *  (the emission mapper — never a hand-copied factRequestId of the held
 *  fact), optionId = the option's record id, label = the chosen label. */
function staleAnswer(): { requestId: string; optionId: string; label: string } {
  const askCard = clarificationsFromUnresolvedFacts([originalFact()])[0];
  expect(askCard.id).toBe(factRequestId(originalFact()));
  return { requestId: askCard.id, optionId: RECORD_ID, label: CHOSEN };
}

describe('L2-P1-AMBIGUOUS-OPTIONS-1 u5optbind — the emitted card id binds the re-held fact', () => {
  it('premise: the card id flips across the re-derivation (the join hazard)', () => {
    expect(factRequestId(originalFact())).not.toBe(factRequestId(heldFact()));
  });

  it('the STALE answer (emitted id of the original card) joins the re-held fact — splice + answeredSlots', () => {
    const folded = foldAnswersIntoShorthand(heldIntent(), [staleAnswer()]);
    expect(folded, 'the emitted-id answer must fold (r13: arm=join-miss)').not.toBeNull();
    expect(folded!.answeredSlots).toEqual([
      { actionIndex: 0, argument: 'labware', label: CHOSEN },
    ]);
    expect((folded!.doc.actions[0] as Record<string, unknown>).labware).toBe(CHOSEN);
    expect(foldNullArm(heldIntent(), [staleAnswer()])).toBeNull();
  });

  it('a ref-carrying answer on the emitted id records the accepted binding', () => {
    const folded = foldAnswersIntoShorthand(heldIntent(), [
      { ...staleAnswer(), ref: { id: RECORD_ID } },
    ]);
    expect(folded, 'the emitted-id answer must fold').not.toBeNull();
    expect(folded!.bindings).toContainEqual({ label: CHOSEN, ref: `local:${RECORD_ID}` });
  });

  it('the EXACT id still joins (the ask-turn answer — the unchanged primary arm)', () => {
    const freshCard = clarificationsFromUnresolvedFacts([heldFact()])[0];
    const folded = foldAnswersIntoShorthand(heldIntent(), [
      { requestId: freshCard.id, optionId: RECORD_ID, label: CHOSEN },
    ]);
    expect(folded).not.toBeNull();
    expect(folded!.answeredSlots).toHaveLength(1);
  });

  it('never a guess: two held facts carrying the answer label join nothing', () => {
    const held = heldIntent();
    held.clarifications = [heldFact(), { ...heldFact(), reason: 'ambiguous-noun' }];
    expect(foldAnswersIntoShorthand(held, [staleAnswer()])).toBeNull();
    expect(foldNullArm(held, [staleAnswer()])).toEqual({
      arm: 'join-miss',
      requestId: staleAnswer().requestId,
    });
  });

  it('never a guess: an answer naming a label no held fact carries joins nothing', () => {
    expect(foldAnswersIntoShorthand(heldIntent(), [
      { requestId: staleAnswer().requestId, optionId: 'lbw-other', label: 'NEST 96 Well Plate' },
    ])).toBeNull();
  });

  it('the legacy positional arm is unchanged (digits-only id still folds)', () => {
    const folded = foldAnswersIntoShorthand(heldIntent(), [
      { requestId: 'unresolved-1', label: CHOSEN },
    ]);
    expect(folded).not.toBeNull();
    expect(folded!.answeredSlots).toHaveLength(1);
  });
});
