/**
 * SH-QB-1 — the shape-fork pin (tally F5): the two observed shorthand shapes
 * must normalize to the SAME events through the deck-threaded /intent/compile.
 *
 * paste #3 shape: composition nested under `params:` (the params-passthrough
 * arm — normalizeScientistIntent.ts:651-656, params WINS).
 * paste #8 shape: composition declared at action level + targetWells (the
 * COMP-4 declared many-cardinality ride, :658-666 — rides only when the
 * candidate event has no params-carried value).
 *
 * Both forms were BUILT to converge at the candidate event. Whether they
 * provably converge for THESE documents is exactly what this pin proves or
 * disproves (OQ3 — pin-only, no assumption either way). If the pin is GREEN:
 * F5 closes with the pin + the loud-failure rule. If RED: STOP at the
 * divergence point and hand back the normalizer evidence — never edit the
 * normalizer from this item (OQ3 ruling).
 *
 * Non-vacuity: the deep-equal is asserted on NON-EMPTY event sets compiled
 * with the deck threaded (the store carries NO plate record — the deck plate
 * is editor state, the F2 geometry). Two empty arrays deep-equal trivially;
 * that is not a pin.
 *
 * Fixture strings live ONLY in this test file (rip-out rule). Deck matching is
 * the handler's IMPORTED shorthandChat composition — never re-implemented.
 */
import { describe, expect, it, vi } from 'vitest';
import { createIntentCompileHandlers } from './IntentCompileHandlers.js';
import type { DeckLabwareSummary } from '../../ai/shorthandChat.js';

// ---------------------------------------------------------------------------
// Fixtures: the two observed shapes, same semantics
// ---------------------------------------------------------------------------

/** paste #8 shape: action-level declared composition + explicit targetWells. */
const TOP_LEVEL_SHAPE_DOC = `intentId: shqb1-shape-top
actions:
  - action: add_material
    labware: plate1
    volumeUl: 100
    targetWells: ["A1", "B1", "C1"]
    composition:
      - { material: Trypsin-EDTA, role: solvent, fraction: "50%" }
      - { material: DMEM, role: buffer_component, fraction: "50%" }
`;

/** paste #3 shape: the same action with composition nested under params. */
const PARAMS_NESTED_SHAPE_DOC = `intentId: shqb1-shape-params
actions:
  - action: add_material
    labware: plate1
    volumeUl: 100
    targetWells: ["A1", "B1", "C1"]
    params:
      composition:
        - { material: Trypsin-EDTA, role: solvent, fraction: "50%" }
        - { material: DMEM, role: buffer_component, fraction: "50%" }
`;

const DECK: DeckLabwareSummary[] = [
  { labwareId: 'lw-deck-plate-1', labwareType: 'plate_96', name: 'plate1' },
];

const SEED_RECORDS = [
  { recordId: 'MAT-trypsin-edta', name: 'Trypsin-EDTA', kind: 'material' },
  { recordId: 'MAT-dmem', name: 'DMEM', kind: 'material' },
];

function recordStoreWith(records: Array<{ recordId: string; name: string; kind: string }>) {
  return {
    get: vi.fn(async () => null),
    getRecord: vi.fn(async () => null),
    list: vi.fn(async (filter?: { kind?: string; schemaId?: string }) => {
      if (filter?.schemaId) return [];
      return records
        .filter((r) => !filter?.kind || r.kind === filter.kind)
        .map((r) => ({
          recordId: r.recordId,
          schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
          payload: { kind: r.kind, name: r.name },
          meta: { kind: r.kind },
        }));
    }),
  };
}

function mockRequest(body: unknown) {
  return { body, log: { error: vi.fn() } };
}

function send() {
  const calls: Array<{ status?: number; payload?: unknown }> = [];
  let currentStatus: number | undefined;
  const r = {
    status(code: number) {
      currentStatus = code;
      return r;
    },
    send(payload: unknown) {
      calls.push({ status: currentStatus, payload });
      return r;
    },
  };
  return { r, calls };
}

/** Incidental-id normalization per the goldens §4.4 idiom (Math.random()
 *  eventIds are the only normalized field; see the roundTrip test header). */
function normalizeIncidentalIds(events: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return events.map((ev) => {
    if (typeof ev.eventId === 'string' && /^evt-[a-z_]+-[0-9a-z]{8}$/.test(ev.eventId)) {
      return { ...ev, eventId: ev.eventId.replace(/-[0-9a-z]{8}$/, '-normalized') };
    }
    return ev;
  });
}

async function compileThroughRoute(doc: string) {
  const handlers = createIntentCompileHandlers({ store: recordStoreWith(SEED_RECORDS) as never });
  const reply = send();
  await handlers.compile(
    mockRequest({ intent: doc, deckLabwares: DECK }) as never,
    reply.r as never,
  );
  expect(reply.calls).toHaveLength(1);
  const payload = reply.calls[0]!.payload as {
    outcome?: string;
    terminalArtifacts?: { events?: Array<Record<string, unknown>> };
  };
  return {
    outcome: payload.outcome ?? '',
    events: normalizeIncidentalIds(payload.terminalArtifacts?.events ?? []),
  };
}

// ---------------------------------------------------------------------------
// T6 — the shape-fork pin (GREEN-or-hand-back; OQ3 pin-only)
// ---------------------------------------------------------------------------

describe('SH-QB-1 T6 — both observed shorthand shapes normalize to the same events', () => {
  it('paste-#3 (params-nested) and paste-#8 (top-level + targetWells) compile NON-EMPTY and deep-equal through the threaded route', async () => {
    const paramsShape = await compileThroughRoute(PARAMS_NESTED_SHAPE_DOC);
    const topLevelShape = await compileThroughRoute(TOP_LEVEL_SHAPE_DOC);

    // Non-vacuity first: with the deck threaded BOTH shapes must compile
    // (RED today: the store-only lookup bars plate1 unknown-noun on both, so
    // both event sets are empty and a bare deep-equal would pass vacuously).
    expect(paramsShape.outcome).toBe('complete');
    expect(topLevelShape.outcome).toBe('complete');
    expect(paramsShape.events.length).toBeGreaterThan(0);
    expect(topLevelShape.events.length).toBeGreaterThan(0);

    // The pin: one intent, one event set — the two grammars converge at the
    // candidate event (normalizeScientistIntent params-wins + COMP-4 ride).
    expect(paramsShape.events).toEqual(topLevelShape.events);
  });
});

// ---------------------------------------------------------------------------
// T7 — well pre-selection: explicit targetWells ghost exactly those wells
// ---------------------------------------------------------------------------

describe('SH-QB-1 T7 — explicit targetWells ghost exactly the pre-selected wells', () => {
  it('the paste-#8 document with explicit targetWells ghosts EXACTLY those wells (no more, no fewer)', async () => {
    const { outcome, events } = await compileThroughRoute(TOP_LEVEL_SHAPE_DOC);
    expect(outcome).toBe('complete');
    expect(events.length).toBeGreaterThan(0);

    // The frozen expander lowers one event per addressed well (the scalar
    // details.well carrier + the deck-readable details.wells carrier — the
    // COMP-1 Task 22 geometry). The pin is the SET the deck ghosts: exactly
    // the pre-selected wells, never a default plate-wide sweep.
    const ghostedWells = new Set<string>();
    for (const ev of events) {
      const details = (ev.details ?? {}) as Record<string, unknown>;
      if (Array.isArray(details.wells)) {
        for (const w of details.wells) if (typeof w === 'string') ghostedWells.add(w);
      }
      if (typeof details.well === 'string') ghostedWells.add(details.well);
    }
    expect([...ghostedWells].sort()).toEqual(['A1', 'B1', 'C1']);
  });
});
