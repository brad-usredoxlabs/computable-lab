/**
 * L2-PROMPT2-GHOSTPAINT-1 fold-path test: proves the production answer-fold
 * carries details.labwareId via applySoleDeckPlacement at AgentOrchestrator.ts:1464.
 *
 * This test exercises the exported compileFoldedShorthand helper shared between
 * production and test — mutating the applySoleDeckPlacement call inside it
 * makes the test RED.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { compileFoldedShorthand } from './AgentOrchestrator.js';
import {
  foldAnswersIntoShorthand,
  parseShorthandForChat,
  factRequestId,
  shorthandResultFromCompile,
  composeLabwareHintLookupWithDeck,
  type HeldShorthandIntent,
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

const DECK = [{ labwareId: 'LBW-96-1', name: 'LBW-96-1', slot: 'A1' }];

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
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('production fold path carries details.labwareId with sole placement', async () => {
    // Drive the SAME helper production code uses — compileFoldedShorthand
    // contains applySoleDeckPlacement at the fold seam.
    const held = makeHeld();
    const answer = makeAnswerFor(held);
    const store = mockStore();

    // Fold the answer into the held intent (this is what production does at :1446-1447)
    const folded = foldAnswersIntoShorthand(held, [answer]);
    expect(folded).not.toBeNull();

    // Call the exported production helper that wraps applySoleDeckPlacement + compile
    const lookup = composeLabwareHintLookupWithDeck(DECK, undefined);
    const compiledFold = await compileFoldedShorthand(
      folded!.doc,
      ['LBW-96-1'],
      {
        store: store as never,
        ...(lookup ? { searchLabwareByHint: lookup } : {}),
      },
    );
    expect(compiledFold).not.toBeNull();

    // Map to result (as production does at :1583-1592)
    const result = shorthandResultFromCompile(compiledFold!, held.yaml, 'fold-recompile', DECK);

    expect(result.success).toBe(true);
    const events = result.events as unknown[];
    expect(events.length).toBeGreaterThanOrEqual(1);

    // The fold-path event must carry the sole placement's labwareId
    const details = (events[0] as Record<string, unknown>).details as Record<string, unknown>;
    expect(details.labwareId).toBe('LBW-96-1');

    // The event also carries the expected wells
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
      {
        store: store as never,
        ...(lookup ? { searchLabwareByHint: lookup } : {}),
      },
    );
    expect(compiledFold).not.toBeNull();

    const result = shorthandResultFromCompile(compiledFold!, held.yaml, 'fold-recompile', DECK);
    const events = result.events as unknown[];
    if (events.length > 0) {
      const details = (events[0] as Record<string, unknown>).details as Record<string, unknown>;
      // Should NOT have labwareId when placements are ambiguous
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
      {
        store: store as never,
        ...(lookup ? { searchLabwareByHint: lookup } : {}),
      },
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
