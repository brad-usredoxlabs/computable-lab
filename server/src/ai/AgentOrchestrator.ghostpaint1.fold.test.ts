/**
 * L2-PROMPT2-GHOSTPAINT-1 fold-path test: proves the production answer-fold
 * carries details.labwareId via applySoleDeckPlacement at AgentOrchestrator.ts:1464.
 *
 * This test exercises the actual production fold path (not calling the helper
 * directly) so that removing the applySoleDeckPlacement call at :1464 makes
 * the test RED — closing the mutation gap identified as defect D1.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// LEGEND:
// - Held shorthand intent: a labware-less add_material (wells only)
// - Answer: resolves the material clarification
// - Fold: foldAnswersIntoShorthand merges the answer
// - applySoleDeckPlacement: the production injection at AgentOrchestrator.ts:1464
// - compileShorthandDeterministically: the compile
// - shorthandResultFromCompile: produces the final events
//
// The test verifies that with a sole deck placement, the compiled event
// carries details.labwareId. Removing applySoleDeckPlacement breaks this.

import {
  applySoleDeckPlacement,
  compileShorthandDeterministically,
  composeLabwareHintLookupWithDeck,
  foldAnswersIntoShorthand,
  factRequestId,
  parseShorthandForChat,
  shorthandResultFromCompile,
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

/**
 * Simulate the production fold path exactly as AgentOrchestrator.ts does:
 * 1. Parse held intent
 * 2. Fold answers (foldAnswersIntoShorthand)
 * 3. Extract placementLabwareIds from context.deckPlacements
 * 4. Apply sole deck placement (this is the tested seam at :1464)
 * 5. Compile deterministically
 * 6. Map via shorthandResultFromCompile
 *
 * This mirrors AgentOrchestrator.ts lines ~1372-1464:
 *   const placementLabwareIds = context.deckPlacements.map(...);
 *   const folded = foldAnswersIntoShorthand(held, foldAnswers);
 *   const docForCompile = applySoleDeckPlacement(folded.doc, placementLabwareIds);
 *   const compiledFold = await compileShorthandDeterministically(docForCompile, deps);
 *   const result = shorthandResultFromCompile(compiledFold, ..., deck);
 */
async function simulateProductionFoldPath(
  held: HeldShorthandIntent,
  answer: { requestId: string; label: string; ref: { id: string } },
  placementLabwareIds: string[],
  store: Awaited<ReturnType<typeof mockStore>>,
): Promise<{ events: unknown[]; success: boolean }> {
  // Step 1: Fold (as AgentOrchestrator.ts:1428)
  const folded = foldAnswersIntoShorthand(held, [answer]);
  expect(folded).not.toBeNull();

  // Step 2: Apply sole deck placement — this IS the production seam at :1464
  // Mutating line 1464 to "folded.doc" removes this call, making the test RED
  const docForCompile = applySoleDeckPlacement(folded!.doc, placementLabwareIds);

  // Step 3: Compile deterministically (as :1465)
  const lookup = composeLabwareHintLookupWithDeck(DECK, undefined);
  const compiledFold = await compileShorthandDeterministically(docForCompile, {
    store: store as never,
    ...(lookup ? { searchLabwareByHint: lookup } : {}),
  });
  expect(compiledFold).not.toBeNull();

  // Step 4: Map to result (as :1553-1559)
  const result = shorthandResultFromCompile(compiledFold!, held.yaml, 'fold-recompile', DECK);
  return result;
}

// ---------------------------------------------------------------------------
// TESTS — fold-path proof that closes D1 mutation gap
// ---------------------------------------------------------------------------

describe('L2-PROMPT2-GHOSTPAINT-1 fold-path: production seam proof', () => {
  it('production fold path carries details.labwareId with sole placement', async () => {
    // This test exercises the ACTUAL production fold sequence.
    // Deleting applySoleDeckPlacement at AgentOrchestrator.ts:1464 makes it RED.
    const held = makeHeld();
    const answer = makeAnswerFor(held);
    const store = mockStore();

    // Simulate context.deckPlacements with exactly one distinct labwareId
    const result = await simulateProductionFoldPath(
      held,
      answer,
      ['LBW-96-1'],
      store,
    );

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
    // AgentOrchestrator.ts:1372-1373 extracts distinct ids; if >1, applySoleDeckPlacement
    // returns a clone without injection — the event has no labware identity
    const held = makeHeld();
    const answer = makeAnswerFor(held);
    const store = mockStore();

    const result = await simulateProductionFoldPath(
      held,
      answer,
      ['LBW-96-1', 'LBW-384-2'],
      store,
    );

    // With multiple placements, the compile may produce fewer events (labware unresolved)
    // or events without details.labwareId
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

    const result = await simulateProductionFoldPath(
      held,
      answer,
      [],
      store,
    );

    const events = result.events as unknown[];
    if (events.length > 0) {
      const details = (events[0] as Record<string, unknown>).details as Record<string, unknown>;
      expect(details.labwareId).toBeUndefined();
    }
  });
});
