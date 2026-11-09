/**
 * L2-CLARIFY-TARGET-1 (Change 2 + RE-PIN NOTE S4) — the same-noun dedupe must
 * NOT collapse TWO distinct `clarifyControl` slots into one card.
 *
 * `foldSameNounCards` (clarificationDedupe.ts) folds by `(query,
 * actionSignature)`; `actionSignature` is `JSON.stringify([kind, menuProvider,
 * options])` — identical for two volumeUl quantity slots (same label, same
 * 'general' kind, same 'choice' menu, same empty options). If the fold
 * collapses them, the scientist gets ONE card for TWO distinct actions'
 * volumes — the answer would fold into one slot and the other stays barred.
 * The spec permits the ONE narrow guard (dedupe: never fold a
 * clarifyControl-bearing card) if and only if the RED shows a collapse.
 *
 * RED-first (spec RED-first unit test plan, item 5 — re-pin).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  clarificationsFromUnresolvedFacts,
  parseShorthandForChat,
} from './shorthandChat.js';
import { foldSameNounCards } from '../compiler/resolution/clarificationDedupe.js';
import { parseScientistIntent } from '../compiler/scientistIntent/parseScientistIntent.js';
import { compileScientistIntent } from '../compiler/scientistIntent/compileScientistIntent.js';
import { createResolveSpineFromContext } from '../resolve/index.js';
import { createLabwareLookup } from './compiler/labwareLookup.js';

function mockStore() {
  return {
    get: vi.fn(async () => null),
    getRecord: vi.fn(async () => null),
    list: vi.fn(async () => []),
  };
}
async function compileReal(yaml: string) {
  const store = mockStore();
  return compileScientistIntent(parseScientistIntent(yaml), {
    spine: createResolveSpineFromContext({ store: store as never }) as never,
    searchLabwareByHint: createLabwareLookup(store as never) as never,
  });
}

describe('L2-CLARIFY-TARGET-1 S4 — the same-noun fold keeps two distinct clarifyControl slots', () => {
  it('two add_material actions both missing volumeUl yield TWO quantity cards (the dedupe does not collapse the slots)', async () => {
    const yaml = [
      'intentId: same-noun-two-slots',
      'actions:',
      '  - action: add_material',
      '    material: DMEM',
      '    targetWells: [A1]',
      '  - action: add_material',
      '    material: FBS',
      '    targetWells: [A2]',
    ].join('\n');
    const bar = await compileReal(yaml);
    expect(bar.outcome).toBe('needs-clarification');
    const volumeFacts = (bar.clarifications ?? []).filter(
      (c) => c.actionLocation?.argument === 'volumeUl' && c.reason === 'missing-required-argument',
    );
    // Two distinct actions, each missing volumeUl → two facts (the sweep is
    // per-action).
    expect(volumeFacts).toHaveLength(2);
    expect(volumeFacts.map((f) => f.actionLocation!.actionIndex)).toEqual([0, 1]);

    // Both cards carry the DATA quantity control.
    const cards = clarificationsFromUnresolvedFacts(bar.clarifications ?? []);
    const quantityCards = cards.filter((c) => c.clarifyControl?.kind === 'quantity');
    expect(quantityCards).toHaveLength(2);

    // The dedupe must keep BOTH (they name two DISTINCT slots). A collapse to
    // one would lose a slot the scientist must approve.
    const folded = foldSameNounCards(cards);
    const foldedQuantityCards = folded.filter((c) => c.clarifyControl?.kind === 'quantity');
    expect(foldedQuantityCards, 'the dedupe must not collapse two distinct quantity slots').toHaveLength(2);
    // Both action slots survive (the answer fold keys off actionIndex+argument).
    const slots = foldedQuantityCards.map((c) => c.unresolvedFact!.actionLocation!).sort((a, b) => a.actionIndex - b.actionIndex);
    expect(slots.map((s) => s.actionIndex)).toEqual([0, 1]);
  });
});
