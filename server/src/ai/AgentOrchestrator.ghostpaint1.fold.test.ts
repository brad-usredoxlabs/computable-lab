/**
 * L2-PROMPT2-GHOSTPAINT-1 fold-path test: proves the production answer-fold
 * carries details.labwareId via applySoleDeckPlacement in compileFoldedShorthand.
 *
 * This test exercises the exported compileFoldedShorthand helper shared between
 * production (AgentOrchestrator.ts fold path) and test — mutating
 * applySoleDeckPlacement inside compileFoldedShorthand makes this test RED.
 */
import { describe, expect, it, vi } from 'vitest';
import { compileFoldedShorthand } from './AgentOrchestrator.js';
import {
  foldAnswersIntoShorthand,
  parseShorthandForChat,
  factRequestId,
  shorthandResultFromCompile,
  composeLabwareHintLookupWithDeck,
  type HeldShorthandIntent,
  type ShorthandCompileDeps,
} from './shorthandChat.js';
import type { ScientistIntentUnresolvedFact } from '../compiler/scientistIntent/types.js';

// ---------------------------------------------------------------------------
// FIXTURES — mirror the existing ghostpaint1 test suite
// ---------------------------------------------------------------------------

const LABWARELESS_YAML = `intentId: ghostpaint-foldpath
actions:
  - action: add_material
    material: "1 mM Clofibrate in DMSO"
    volume: { value: 1, unit: uL }
    targetWells: [E2:H5]
`;

const DECK = [{ labwareId: 'LBW-96-1', name: 'Plate Alpha', slot: 'A1' }];

const SEED_RECORDS = [
  {
    recordId: 'MAT-clofibrate-formulation',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'Formulated Clofibrate DMSO', title: 'Formulated Clofibrate DMSO', synonyms: ['Formulated Clofibrate DMSO'] },
  },
];

function mockStore() {
  return {
    get: vi.fn(async () => null),
    getRecord: vi.fn(async (id: string) => SEED_RECORDS.find((r) => r.recordId === id) ?? null),
    list: vi.fn(async () => SEED_RECORDS),
  };
}

function makeHeld(): HeldShorthandIntent {
  const doc = parseShorthandForChat(LABWARELESS_YAML);
  const clarifications: ScientistIntentUnresolvedFact[] = [
    {
      label: '1 mM Clofibrate in DMSO',
      reason: 'unknown-noun',
      actionLocation: { actionIndex: 0, action: 'add_material', argument: 'material' },
    },
  ];
  return { yaml: LABWARELESS_YAML, doc, clarifications };
}

function makeAnswerFor(held: HeldShorthandIntent) {
  const requestId = factRequestId(held.clarifications[0]!);
  return { requestId, label: 'Formulated Clofibrate DMSO', ref: { id: 'MAT-clofibrate-formulation' } };
}

// ---------------------------------------------------------------------------
// TESTS — drive the REAL production fold helper (compileFoldedShorthand)
// ---------------------------------------------------------------------------

describe('L2-PROMPT2-GHOSTPAINT-1 fold-path: production seam proof', () => {
  it('production fold path carries details.labwareId with sole placement', async () => {
    const held = makeHeld();
    const answer = makeAnswerFor(held);
    const store = mockStore();

    const folded = foldAnswersIntoShorthand(held, [answer]);
    expect(folded).not.toBeNull();

    const lookup = composeLabwareHintLookupWithDeck(DECK, undefined);
    const compiledFold = await compileFoldedShorthand(
      folded!.doc,
      ['LBW-96-1'],
      { store: store as never, searchLabwareByHint: lookup } as ShorthandCompileDeps,
      DECK,
    );
    expect(compiledFold).not.toBeNull();

    const result = shorthandResultFromCompile(compiledFold!, held.yaml, 'fold-recompile', DECK);
    expect(result.success).toBe(true);
    const events = result.events as unknown[];

    // gp-fix4: run the same doc through the unfolded compile path and assert
    // the fold count EQUALS the unfolded count (parity — reviewer measured 16)
    const unfolded = await import('./shorthandChat.js');
    const unfoldedCompiled = await unfolded.compileShorthandDeterministically(
      folded!.doc, { store: store as never, searchLabwareByHint: lookup } as import('./shorthandChat.js').ShorthandCompileDeps,
    );
    const unfoldedResult = unfolded.shorthandResultFromCompile(
      unfoldedCompiled!, held.yaml, 'unfolded', DECK,
    );
    const unfoldedEvents = (unfoldedResult.events ?? []) as unknown[];
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.length).toBe(unfoldedEvents.length);

    const details = (events[0] as Record<string, unknown>).details as Record<string, unknown>;
    expect(details.labwareId).toBe('LBW-96-1');
    expect((events[0] as Record<string, unknown>).event_type).toBe('add_material');
  });

  it('production fold path writes nothing with multiple placements', async () => {
    const held = makeHeld();
    const answer = makeAnswerFor(held);
    const store = mockStore();

    const folded = foldAnswersIntoShorthand(held, [answer]);
    expect(folded).not.toBeNull();

    const lookup = composeLabwareHintLookupWithDeck(DECK, undefined);
    const compiledFold = await compileFoldedShorthand(
      folded!.doc,
      ['LBW-96-1', 'LBW-384-2'],
      { store: store as never, searchLabwareByHint: lookup } as ShorthandCompileDeps,
    );
    expect(compiledFold).not.toBeNull();

    const result = shorthandResultFromCompile(compiledFold!, held.yaml, 'fold-recompile', DECK);
    const events = result.events as unknown[];
    if (events.length > 0) {
      const details = (events[0] as Record<string, unknown>).details as Record<string, unknown>;
      expect(details.labwareId).toBeUndefined();
    }
  });

  it('production fold path writes nothing with zero placements', async () => {
    const held = makeHeld();
    const answer = makeAnswerFor(held);
    const store = mockStore();

    const folded = foldAnswersIntoShorthand(held, [answer]);
    expect(folded).not.toBeNull();

    const lookup = composeLabwareHintLookupWithDeck(DECK, undefined);
    const compiledFold = await compileFoldedShorthand(
      folded!.doc,
      [],
      { store: store as never, searchLabwareByHint: lookup } as ShorthandCompileDeps,
    );
    expect(compiledFold).not.toBeNull();

    const result = shorthandResultFromCompile(compiledFold!, held.yaml, 'fold-recompile', DECK);
    const events = result.events as unknown[];
    if (events.length > 0) {
      const details = (events[0] as Record<string, unknown>).details as Record<string, unknown>;
      expect(details.labwareId).toBeUndefined();
    }
  });
});
