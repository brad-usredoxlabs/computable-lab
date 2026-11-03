/**
 * L2-CLARIFY-TARGET-1 (Change 2 wells arm + Change 3 wells fold) — the
 * TARGET-WELL slot: an absent `targetWells` bars with the DATA-declared
 * target-slot control, and the fold can ACCEPT a declared wells answer
 * (expanding a range label into the ARRAY form the engine needs).
 *
 * RED-first (spec RED-first unit test plan, item 3). Driven through the REAL
 * `clarificationsFromUnresolvedFacts` (the stamp) and the REAL
 * `foldAnswersIntoShorthand` (the declared-kind splice arm).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  clarificationsFromUnresolvedFacts,
  factRequestId,
  foldAnswersIntoShorthand,
  parseShorthandForChat,
  type HeldShorthandIntent,
} from './shorthandChat.js';
import { parseScientistIntent } from '../compiler/scientistIntent/parseScientistIntent.js';
import { compileScientistIntent } from '../compiler/scientistIntent/compileScientistIntent.js';
import { createResolveSpineFromContext } from '../resolve/index.js';
import { createLabwareLookup } from './compiler/labwareLookup.js';

/** The DATA-declared wells question (config/drafting/shorthand-drafting.yaml
 *  `assumedValues.wells:`). */
const WELLS_QUESTION = 'Which wells? Name a range (A2:B3) or pick wells on the deck.';

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

describe('L2-CLARIFY-TARGET-1 Change 2 — the targetWells bar + DATA control', () => {
  it('a doc with add_material and NO targetWells yields exactly one targetWells missing-required fact; outcome needs-clarification with empty events', async () => {
    const bar = await compileReal('intentId: well-target-bar\nactions:\n  - action: add_material\n    material: DMEM\n    volumeUl: 100\n');
    expect(bar.outcome).toBe('needs-clarification');
    const wellsFacts = (bar.clarifications ?? []).filter(
      (c) => c.actionLocation?.argument === 'targetWells' && c.reason === 'missing-required-argument',
    );
    expect(wellsFacts).toHaveLength(1);
    expect(wellsFacts[0]!.actionLocation).toEqual({ actionIndex: 0, action: 'add_material', argument: 'targetWells' });
    expect(bar.terminalArtifacts.events).toEqual([]);
  });

  it('a doc carrying targetWells: [A1] yields NO targetWells fact (the array form satisfies the contract and is invisible to the doc-door)', async () => {
    const bar = await compileReal('intentId: well-target-present\nactions:\n  - action: add_material\n    material: DMEM\n    volumeUl: 100\n    targetWells: [A1]\n');
    const wellsFacts = (bar.clarifications ?? []).filter((c) => c.actionLocation?.argument === 'targetWells');
    expect(wellsFacts).toHaveLength(0);
  });

  it('an absent targetWells fact stamps the DATA wells control (kind:wells + the declared question)', async () => {
    const bar = await compileReal('intentId: well-target-stamp\nactions:\n  - action: add_material\n    material: DMEM\n    volumeUl: 100\n');
    const wellsFact = (bar.clarifications ?? []).find((c) => c.actionLocation?.argument === 'targetWells')!;
    const cards = clarificationsFromUnresolvedFacts(bar.clarifications ?? []);
    const card = cards.find((c) => c.unresolvedFact?.actionLocation?.argument === 'targetWells');
    expect(card, 'a wells card exists for the targetWells fact').toBeDefined();
    expect(card!.clarifyControl).toEqual({ kind: 'wells', question: WELLS_QUESTION });
    expect(card!.prompt).toBe(WELLS_QUESTION);
    expect(card!.entityType).toBe('targetWells');
  });
});

describe('L2-CLARIFY-TARGET-1 Change 3 — the fold expands a range label into the ARRAY form', () => {
  it('answer {label: A2:B3} splices targetWells: [A2, A3, B2, B3] (array, expanded — never the string)', async () => {
    const yaml = 'intentId: well-target-fold\nactions:\n  - action: add_material\n    material: DMEM\n    volumeUl: 100\n';
    const bar = await compileReal(yaml);
    const wellsFact = (bar.clarifications ?? []).find((c) => c.actionLocation?.argument === 'targetWells')!;
    const held: HeldShorthandIntent = {
      yaml,
      doc: parseScientistIntent(yaml),
      clarifications: bar.clarifications ?? [],
    };
    const folded = foldAnswersIntoShorthand(held, [
      { requestId: factRequestId(wellsFact), label: 'A2:B3', value: 'A2:B3', ref: { kind: 'wells', wells: ['A2', 'A3', 'B2', 'B3'] } },
    ]);
    expect(folded, 'the wells slot folds (not null)').not.toBeNull();
    const action = folded!.doc.actions[0] as Record<string, unknown>;
    // The ARRAY form (expanded) — a range STRING would bar again (SPINE-7).
    expect(action['targetWells']).toEqual(['A2', 'A3', 'B2', 'B3']);
    expect(Array.isArray(action['targetWells'])).toBe(true);
    expect(folded!.answeredSlots).toEqual([{ actionIndex: 0, argument: 'targetWells', label: 'A2:B3' }]);
  });
});
