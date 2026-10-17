/**
 * COMP-1 Task 21 (Part IV): the compiled shorthand event must name the labware
 * it targets in `details.labwareId` — the key the client buckets ghost wells
 * under (collectEventLabwareIds, previewProjection.ts).
 *
 * SEAM DECISION (spec Part IV criterion 5):
 * - Option A (resolve_labware writes recordId back onto events) was REJECTED
 *   by execution: a probe write-back diverged the three MANIFEST-pinned graph
 *   goldens (goldenIntentToGraph.transfer-read, .labware-hint-regression,
 *   goldenRolesSeam — their events carry the SYMBOLIC label as labwareId and
 *   goldens/** is MANIFEST-frozen + out of scope). The goldens' events and the
 *   shorthand events are the SAME shape, so any guard sparing the goldens also
 *   no-ops the shorthand fix.
 * - CHOSEN seam: bindShorthandEventsToDeck (shorthandChat.ts) — the chat
 *   seam's declared boundary repair. When the event's labware label is
 *   deck-provable (exact deck-name match or already a deck id), the bound deck
 *   id is written into details.labwareId ONLY when that key is absent
 *   (no-op-safe). Never invents an id: an unprovable label stays untouched
 *   (byte-passthrough pin preserved).
 */
import { describe, expect, it, vi } from 'vitest';
import { parseScientistIntent } from '../compiler/scientistIntent/parseScientistIntent.js';
import {
  bindShorthandEventsToDeck,
  compileShorthandDeterministically,
  composeLabwareHintLookupWithDeck,
  shorthandResultFromCompile,
} from './shorthandChat.js';

const DECK = [{ labwareId: 'LBW-96-1', name: 'plate', slot: 'A1' }];

const SEED_RECORDS = [
  {
    recordId: 'MAT-test-reagent-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'Test Reagent', title: 'Test Reagent', synonyms: ['test reagent'] },
  },
];

function mockStore() {
  return {
    get: vi.fn(async () => null),
    getRecord: vi.fn(async (id: string) => SEED_RECORDS.find((r) => r.recordId === id) ?? null),
    list: vi.fn(async (filter?: { kind?: string }) =>
      SEED_RECORDS.filter((r) => !filter?.kind || r.payload.kind === filter.kind),
    ),
  };
}

const DOC = `intentId: labware-id-writeback
actions:
  - action: add_material
    labware: plate
    targetWells: [A1]
    material: Test Reagent
    volume: { value: 50, unit: uL }
`;

describe('Task 21: the compiled shorthand event carries details.labwareId (chosen seam: bindShorthandEventsToDeck)', () => {
  it('deck-bound add_material: details.labwareId is the deck id (today: ABSENT — the ghost has no bucket)', async () => {
    const store = mockStore();
    const lookup = composeLabwareHintLookupWithDeck(DECK, undefined);
    const compiled = await compileShorthandDeterministically(parseScientistIntent(DOC), {
      store: store as never,
      ...(lookup ? { searchLabwareByHint: lookup } : {}),
    });
    expect(compiled).not.toBeNull();
    expect(compiled!.outcome).toBe('complete');
    const result = shorthandResultFromCompile(compiled!, DOC, 'test note', DECK);
    expect(result.success).toBe(true);
    const events = (result.events ?? []) as unknown as Array<Record<string, unknown>>;
    expect(events.length).toBe(1);
    const ev = events[0]!;
    // Top-level binding already works (the deck-name exact match).
    expect(ev.labwareId).toBe('LBW-96-1');
    // THE GAP: the client buckets by details.labwareId — it must carry the id.
    const details = ev.details as Record<string, unknown>;
    expect(details.labwareId).toBe('LBW-96-1');
    expect(details.well).toBe('A1');
    // Task 22 (Part IV criterion 1): the deck channel (buildPreviewFromDraft ->
    // buildPreviewWellIndex -> getAffectedWells) ghosts wells ONLY from
    // details.wells — it never reads the singular details.well (the
    // normalizePreviewEvents bridge runs only on the labware-editor channel).
    // The deck-bound event must carry the address in the wells carrier.
    expect(details.wells).toEqual(['A1']);
    expect(details.volume).toEqual({ value: 50, unit: 'uL' });
  });

  it('bindShorthandEventsToDeck writes details.labwareId from the bound top-level id when absent', () => {
    const out = bindShorthandEventsToDeck(
      [{ eventId: 'e1', labwareId: 'plate', details: { well: 'A1' } }],
      DECK,
    );
    expect((out[0]!.details as Record<string, unknown>).labwareId).toBe('LBW-96-1');
  });

  it('deck-bound singular well rides the wells carrier the deck ghosts (details.wells)', () => {
    const out = bindShorthandEventsToDeck(
      [{ eventId: 'e1', labwareId: 'plate', details: { well: 'A1' } }],
      DECK,
    );
    expect((out[0]!.details as Record<string, unknown>).wells).toEqual(['A1']);
  });

  it('NO-OP arms (raw-path byte-identity): an existing details.labwareId is never overwritten; an unprovable label is never copied', () => {
    const input = [
      { eventId: 'e1', labwareId: 'plate', details: { labwareId: 'already-here', well: 'A1' } },
      { eventId: 'e2', labwareId: 'somewhere-else', details: { well: 'C1' } },
    ];
    const out = bindShorthandEventsToDeck(input, DECK);
    expect((out[0]!.details as Record<string, unknown>).labwareId).toBe('already-here');
    expect((out[1]!.details as Record<string, unknown>).labwareId).toBeUndefined();
    expect(out[1]).toBe(input[1]); // byte-passthrough: unprovable label, nothing changed
  });

  it('NO-OP (fix1/D5): an event already instanced via details.labwareInstanceId gets no details-side write — no labwareId, no wells rewrite', () => {
    // details.labwareInstanceId is the instance-side identity carrier used by
    // ProtocolExtractionService.ts:300 / GraphProjector.ts:153 /
    // PlateMapExporter.ts:69. Its presence means the event is ALREADY
    // instanced: the Task-21 no-op guarantee covers it too, so neither new
    // details-side arm (labwareId write, singular-well->wells) may fire.
    // (The pre-existing TOP-level deck-name binding is untouched behavior and
    // still rewrites ev.labwareId — the no-op guarantee is about the details
    // side this item added.)
    const input = [
      { eventId: 'e1', labwareId: 'plate', details: { labwareInstanceId: 'LWI-96-1', well: 'A1' } },
    ];
    const out = bindShorthandEventsToDeck(input, DECK);
    const details = out[0]!.details as Record<string, unknown>;
    expect(details.labwareId).toBeUndefined();
    expect(details.wells).toBeUndefined();
    expect(out[0]!.details).toBe(input[0]!.details); // details-side byte-passthrough
  });
});
