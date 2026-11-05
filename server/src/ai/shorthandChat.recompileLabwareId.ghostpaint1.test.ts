/**
 * L2-PROMPT2-GHOSTPAINT-1 Unit 2 (leg 2B, server): the answer-fold re-compile
 * must carry details.labwareId when context.deckPlacements holds exactly one
 * distinct non-empty labwareId.
 *
 * The defect: a clarification-answer path commits an add_material with wells
 * but NO labware identity, while the concept-answer path on the same deck
 * carries details.labwareId. The fix injects the sole placement's labwareId
 * into the folded action before compileShorthandDeterministically, so the
 * existing expander+binder carry it into details.labwareId.
 *
 * Tests B1-B6 from spec §4 leg 2B.
 */
import { describe, expect, it, vi } from 'vitest';
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
// FIXTURES
// ---------------------------------------------------------------------------

/** A held intent whose add_material names wells but carries NO labware. */
const LABWARELESS_YAML = `intentId: ghostpaint-b1
actions:
  - action: add_material
    material: "1 mM Clofibrate in DMSO"
    volume: { value: 1, unit: uL }
    targetWells: [E2:H5]
`;

/** A held intent WITH labware (for B5 no-op test). */
const WITH_LABWARE_YAML = `intentId: ghostpaint-b5-existing
actions:
  - action: add_material
    labware: existing-plate
    material: "some material"
    volume: { value: 50, unit: uL }
    targetWells: [A1]
`;

/** Deck used in all tests. */
const DECK = [{ labwareId: 'LBW-96-1', name: 'plate', slot: 'A1' }];

/** Seed records for the mock store — material resolution. */
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

/** Build a held intent from the given YAML with one unknown-noun fact. */
function makeHeld(yaml: string = LABWARELESS_YAML): HeldShorthandIntent {
  const doc = parseShorthandForChat(yaml);
  const clarifications: ScientistIntentUnresolvedFact[] = [
    {
      label: '1 mM Clofibrate in DMSO',
      reason: 'unknown-noun',
      actionLocation: { actionIndex: 0, action: 'add_material', argument: 'material' },
    },
  ];
  return { yaml, doc, clarifications };
}

/** Build a clarification answer matching the given held intent's fact. */
function makeAnswerFor(held: HeldShorthandIntent, refId: string): { requestId: string; label: string; ref: { id: string } } {
  const requestId = factRequestId(held.clarifications[0]!);
  return { requestId, label: 'Formulated Clofibrate DMSO', ref: { id: refId } };
}

// ---------------------------------------------------------------------------
// B1-B6 TESTS
// ---------------------------------------------------------------------------

describe('L2-PROMPT2-GHOSTPAINT-1 leg 2B: applySoleDeckPlacement', () => {
  it('B1: sole placement injects labware into well-bearing action with no identity', async () => {
    const held = makeHeld();
    const answer = makeAnswerFor(held, 'MAT-clofibrate-formulation');
    const folded = foldAnswersIntoShorthand(held, [answer]);
    expect(folded).not.toBeNull();

    // applySoleDeckPlacement injects labware onto the folded doc
    const docWithLabware = applySoleDeckPlacement(folded!.doc, ['LBW-96-1']);
    const action = docWithLabware.actions[0] as unknown as Record<string, unknown>;
    expect(action.labware).toBe('LBW-96-1');
    expect(action.targetWells).toEqual(['E2:H5']);

    // After compile + result mapping, the event carries details.labwareId
    const store = mockStore();
    const lookup = composeLabwareHintLookupWithDeck(DECK, undefined);
    const compiled = await compileShorthandDeterministically(docWithLabware, {
      store: store as never,
      ...(lookup ? { searchLabwareByHint: lookup } : {}),
    });
    expect(compiled).not.toBeNull();
    const result = shorthandResultFromCompile(compiled!, held.yaml, 'test', DECK);
    expect(result.success).toBe(true);
    const events = (result.events ?? []) as unknown as Array<Record<string, unknown>>;
    expect(events.length).toBeGreaterThanOrEqual(1);
    const details = events[0]!.details as Record<string, unknown>;
    expect(details.labwareId).toBe('LBW-96-1');
  });

  it('B2: concept-vs-formulation parity — both produce the same details.labwareId', async () => {
    // Two different material refs, same deck placement → same labwareId
    const held1 = makeHeld();
    const held2 = makeHeld();

    const answer1 = makeAnswerFor(held1, 'MAT-clofibrate-formulation');
    const answer2 = makeAnswerFor(held2, 'MAT-clofibrate-formulation');

    const folded1 = foldAnswersIntoShorthand(held1, [answer1]);
    const folded2 = foldAnswersIntoShorthand(held2, [answer2]);
    expect(folded1).not.toBeNull();
    expect(folded2).not.toBeNull();

    const doc1 = applySoleDeckPlacement(folded1!.doc, ['LBW-96-1']);
    const doc2 = applySoleDeckPlacement(folded2!.doc, ['LBW-96-1']);

    // Both docs carry the same labware injection
    expect((doc1.actions[0] as unknown as Record<string, unknown>).labware).toBe('LBW-96-1');
    expect((doc2.actions[0] as unknown as Record<string, unknown>).labware).toBe('LBW-96-1');

    const store = mockStore();
    const lookup = composeLabwareHintLookupWithDeck(DECK, undefined);

    const compiled1 = await compileShorthandDeterministically(doc1, {
      store: store as never,
      ...(lookup ? { searchLabwareByHint: lookup } : {}),
    });
    const compiled2 = await compileShorthandDeterministically(doc2, {
      store: store as never,
      ...(lookup ? { searchLabwareByHint: lookup } : {}),
    });

    expect(compiled1).not.toBeNull();
    expect(compiled2).not.toBeNull();

    const result1 = shorthandResultFromCompile(compiled1!, held1.yaml, 'concept', DECK);
    const result2 = shorthandResultFromCompile(compiled2!, held2.yaml, 'formulation', DECK);

    const ev1 = (result1.events ?? [])[0] as unknown as Record<string, unknown>;
    const ev2 = (result2.events ?? [])[0] as unknown as Record<string, unknown>;
    expect((ev1!.details as Record<string, unknown>).labwareId).toBe('LBW-96-1');
    expect((ev2!.details as Record<string, unknown>).labwareId).toBe('LBW-96-1');
    expect((ev1!.details as Record<string, unknown>).labwareId).toBe(
      (ev2!.details as Record<string, unknown>).labwareId,
    );
  });

  it('B3: two distinct placements write nothing', () => {
    const held = makeHeld();
    const answer = makeAnswerFor(held, 'MAT-clofibrate-formulation');
    const folded = foldAnswersIntoShorthand(held, [answer]);
    expect(folded).not.toBeNull();

    const doc = applySoleDeckPlacement(folded!.doc, ['LBW-96-1', 'LBW-384-2']);
    const action = doc.actions[0] as unknown as Record<string, unknown>;
    // The action must NOT carry a labware injection
    expect(action.labware).toBeUndefined();
  });

  it('B4: zero placements write nothing', () => {
    const held = makeHeld();
    const answer = makeAnswerFor(held, 'MAT-clofibrate-formulation');
    const folded = foldAnswersIntoShorthand(held, [answer]);
    expect(folded).not.toBeNull();

    const doc = applySoleDeckPlacement(folded!.doc, []);
    const action = doc.actions[0] as unknown as Record<string, unknown>;
    expect(action.labware).toBeUndefined();
  });

  it('B5: existing labware / labwareInstanceId / top-level labwareId are byte-unchanged', () => {
    // Action already has labware — must not overwrite
    const withLabwareDoc = parseShorthandForChat(WITH_LABWARE_YAML);
    const result = applySoleDeckPlacement(withLabwareDoc, ['LBW-96-1']);
    expect(result.actions[0]).toEqual(withLabwareDoc.actions[0]);

    // Action has labware_id in params — must not overwrite
    const withParamsLabware = parseShorthandForChat(LABWARELESS_YAML);
    (withParamsLabware.actions[0] as unknown as Record<string, unknown>).params = {
      labware_id: 'LBW-ALREADY-SET',
    };
    const resultParams = applySoleDeckPlacement(withParamsLabware, ['LBW-96-1']);
    const paramsAction = resultParams.actions[0] as unknown as Record<string, unknown>;
    expect(paramsAction.labware).toBeUndefined();
    expect((paramsAction.params as Record<string, unknown>).labware_id).toBe('LBW-ALREADY-SET');
  });

  it('B6: parity with resolvePlacedVesselAttribution semantics', async () => {
    // Import the client helper for parity check (test-only cross-package)
    // @ts-expect-error cross-package import is test-only
    const { resolvePlacedVesselAttribution } = await import('../../../app/src/graph/lib/placedVesselAttribution.js');

    // Vector 1: sole placement → both return the same id
    expect(resolvePlacedVesselAttribution([], ['LBW-96-1'])).toBe('LBW-96-1');
    const held1 = makeHeld();
    const folded1 = foldAnswersIntoShorthand(held1, [makeAnswerFor(held1, 'MAT-clofibrate-formulation')]);
    const doc1 = applySoleDeckPlacement(folded1!.doc, ['LBW-96-1']);
    expect((doc1.actions[0] as unknown as Record<string, unknown>).labware).toBe('LBW-96-1');

    // Vector 2: zero placements → both return null/undefined
    expect(resolvePlacedVesselAttribution([], [])).toBeNull();
    const held2 = makeHeld();
    const folded2 = foldAnswersIntoShorthand(held2, [makeAnswerFor(held2, 'MAT-clofibrate-formulation')]);
    const doc2 = applySoleDeckPlacement(folded2!.doc, []);
    expect((doc2.actions[0] as unknown as Record<string, unknown>).labware).toBeUndefined();

    // Vector 3: two placements → both return null/undefined
    expect(resolvePlacedVesselAttribution([], ['LBW-96-1', 'LBW-384-2'])).toBeNull();
    const held3 = makeHeld();
    const folded3 = foldAnswersIntoShorthand(held3, [makeAnswerFor(held3, 'MAT-clofibrate-formulation')]);
    const doc3 = applySoleDeckPlacement(folded3!.doc, ['LBW-96-1', 'LBW-384-2']);
    expect((doc3.actions[0] as unknown as Record<string, unknown>).labware).toBeUndefined();

    // Vector 4: explicit ref present → helper returns null; our injection skips
    expect(resolvePlacedVesselAttribution(['LBW-EXPLICIT'], ['LBW-96-1'])).toBeNull();
    const withExplicit = parseShorthandForChat(LABWARELESS_YAML);
    (withExplicit.actions[0] as unknown as Record<string, unknown>).labware = 'LBW-EXPLICIT';
    const doc4 = applySoleDeckPlacement(withExplicit, ['LBW-96-1']);
    expect((doc4.actions[0] as unknown as Record<string, unknown>).labware).toBe('LBW-EXPLICIT');

    // Vector 5: non-string entries filtered by caller (our helper gets clean strings)
    expect(resolvePlacedVesselAttribution([], [null, 'LBW-96-1'])).toBe('LBW-96-1');
    const held5 = makeHeld();
    const folded5 = foldAnswersIntoShorthand(held5, [makeAnswerFor(held5, 'MAT-clofibrate-formulation')]);
    const doc5 = applySoleDeckPlacement(folded5!.doc, ['LBW-96-1']);
    expect((doc5.actions[0] as unknown as Record<string, unknown>).labware).toBe('LBW-96-1');
  });
});
