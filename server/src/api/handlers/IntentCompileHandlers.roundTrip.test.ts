/**
 * SH-QB-1 — the "Save & Re-compile" round-trip through POST /intent/compile.
 *
 * THE BUG (tally F2, pastes #4/#8): with a valid shorthand accepted and events
 * ghosted, "Edit shorthand -> Save & Re-compile" WITHOUT edits returns an EMPTY
 * preview at HTTP 200 — no error surfaced. Two compounding defects:
 *
 *  1. DECK ASYMMETRY: the chat path composes the editor's deck plates into the
 *     labware-hint lookup (AgentOrchestrator.ts:1213-1222 via
 *     composeLabwareHintLookupWithDeck) and binds compiled events to the deck
 *     (bindShorthandEventsToDeck). /intent/compile builds
 *     createLabwareLookup(store) — STORE ONLY — so a recompile of a document
 *     naming the deck plate ("plate1", editor state, NO store record)
 *     false-bars it as unknown-noun every time.
 *  2. DROPPED REASON CHANNEL: the bar arm returns outcome
 *     'needs-clarification' with terminalArtifacts {events:[], gaps:[]} and
 *     the structured clarifications ON THE RESULT (compileScientistIntent.ts
 *     :253-272) — but the handler sends ONLY {outcome, terminalArtifacts}
 *     (IntentCompileHandlers.ts:96-100). The reason is dropped on the floor:
 *     200 + empty events + empty gaps + no clarifications = silent zero-ghost.
 *
 * Harness: the spine4ProductionWiring idiom (recordStoreWith + mockRequest +
 * send() capture over createIntentCompileHandlers) against the REAL handler +
 * REAL store-backed spine. Fixture strings live ONLY in this test file.
 *
 * OQ1 (ADOPTED): the additive optional `deckLabwares?` body field (exact
 * DeckLabwareSummary mirror). Absent ⇒ byte-identical response (T3).
 * Deck matching is the IMPORTED composeLabwareHintLookupWithDeck /
 * bindShorthandEventsToDeck from shorthandChat — never re-implemented here.
 */
import { describe, expect, it, vi } from 'vitest';
import { createIntentCompileHandlers } from './IntentCompileHandlers.js';
import { createResolveSpineFromContext } from '../../resolve/index.js';
import { createLabwareLookup } from '../../ai/compiler/labwareLookup.js';
import {
  bindShorthandEventsToDeck,
  composeLabwareHintLookupWithDeck,
  type DeckLabwareSummary,
} from '../../ai/shorthandChat.js';

// ---------------------------------------------------------------------------
// Fixtures (test seeds ONLY — campaign mixture labels never enter src/)
// ---------------------------------------------------------------------------

/** The no-edit recompile document (paste #8 shape): a declared-composition
 *  shorthand naming the deck plate with a compact well range. The components
 *  are store-bound; the plate is editor state (the store carries NO plate
 *  record — that is the bug, not the fixture). */
const NO_EDIT_MIXTURE_DOC = `intentId: shqb1-roundtrip
actions:
  - action: add_material
    labware: plate1
    volumeUl: 100
    targetWells: ["A1:H1"]
    composition:
      - { material: Trypsin-EDTA, role: solvent, fraction: "50%" }
      - { material: DMEM, role: buffer_component, fraction: "50%" }
`;

/** The same document with ONE edited value (T4 exact-diff leg). */
const EDITED_VOLUME_DOC = NO_EDIT_MIXTURE_DOC.replace('volumeUl: 100', 'volumeUl: 250');

/** A document the STORE lookup resolves with no deck at all (T3 byte-identity
 *  leg — the shape every other caller of this route sends). */
const STORE_RESOLVABLE_DOC = `intentId: shqb1-store-only
actions:
  - action: add_material
    labware: Store Plate
    material: DMEM
    volumeUl: 50
    targetWells: [A1]
`;

/** A document naming a noun NOTHING can resolve (T5 loud-channel leg). */
const UNRESOLVED_NOUN_DOC = `intentId: shqb1-unresolved
actions:
  - action: add_material
    labware: plate1
    material: Zymotrypsin Inhibitor Cocktail
    volumeUl: 10
    targetWells: [A1]
`;

const DECK: DeckLabwareSummary[] = [
  { labwareId: 'lw-deck-plate-1', labwareType: 'plate_96', name: 'plate1' },
];

/** Test seeds ONLY: the mixture's components live in the store; the deck
 *  plate deliberately does NOT (editor state, not a record). */
const SEED_RECORDS = [
  { recordId: 'MAT-trypsin-edta', name: 'Trypsin-EDTA', kind: 'material' },
  { recordId: 'MAT-dmem', name: 'DMEM', kind: 'material' },
  // A STORE labware for the T3 no-deck leg only — deliberately NOT the deck
  // plate (the deck plate stays editor state so T1/T2 non-vacuity holds).
  { recordId: 'LAB-store-plate', name: 'Store Plate', kind: 'labware' },
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
          schemaId: r.kind === 'labware'
            ? 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml'
            : 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
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

interface CompileResponseBody {
  outcome?: string;
  terminalArtifacts?: {
    events?: Array<Record<string, unknown>>;
    gaps?: Array<{ message?: string }>;
  };
  clarifications?: Array<Record<string, unknown>>;
}

/**
 * Deep-equal normalization: BiologyVerbExpander.ts:74 mints eventId as
 * `evt-<verb>-<8 base36>` via Math.random(), so the id is an INCIDENTAL id in
 * exactly the sense the goldens replayKernel normalizes (spec §4.4 — "only
 * incidental ids/timestamps normalized"). Every load-bearing sibling
 * (labwareId, wells, volumes, material, event_type) stays asserted verbatim.
 * The shape regex is the shipped mint shape; a non-matching id is left
 * untouched (never a blanket id-drop).
 */
function normalizeIncidentalIds(events: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return events.map((ev) => {
    if (typeof ev.eventId === 'string' && /^evt-[a-z_]+-[0-9a-z]{8}$/.test(ev.eventId)) {
      return { ...ev, eventId: ev.eventId.replace(/-[0-9a-z]{8}$/, '-normalized') };
    }
    return ev;
  });
}

async function postCompile(body: Record<string, unknown>) {
  const handlers = createIntentCompileHandlers({ store: recordStoreWith(SEED_RECORDS) as never });
  const reply = send();
  await handlers.compile(mockRequest(body) as never, reply.r as never);
  expect(reply.calls).toHaveLength(1);
  return {
    status: reply.calls[0]!.status,
    payload: reply.calls[0]!.payload as CompileResponseBody,
  };
}

/** The CHAT path's compile of the same document (the round-trip reference):
 *  the same store-backed spine + deck-composed lookup the AgentOrchestrator
 *  shorthand seam builds (AgentOrchestrator.ts:1213-1222), then the same
 *  post-pass shorthandResultFromCompile applies (shorthandChat.ts:570). */
async function chatPathEvents(doc: string) {
  const store = recordStoreWith(SEED_RECORDS);
  const spine = createResolveSpineFromContext({ store: store as never });
  const searchLabwareByHint = composeLabwareHintLookupWithDeck(
    DECK,
    createLabwareLookup(store as never),
  );
  const { parseScientistIntent } = await import('../../compiler/scientistIntent/parseScientistIntent.js');
  const { compileScientistIntent } = await import('../../compiler/scientistIntent/compileScientistIntent.js');
  const compiled = await compileScientistIntent(parseScientistIntent(doc), {
    spine,
    ...(searchLabwareByHint ? { searchLabwareByHint } : {}),
  });
  return bindShorthandEventsToDeck(compiled.terminalArtifacts.events, DECK);
}

// ---------------------------------------------------------------------------
// T1 — the F2 paste reproduced headless against the REAL handler + REAL spine
// ---------------------------------------------------------------------------

describe('SH-QB-1 T1 — no-edit recompile with deck context compiles, binds, and never bars silently', () => {
  it('deck-threaded recompile of the no-edit document: outcome complete, non-empty events, deck-bound details.labwareId', async () => {
    const { status, payload } = await postCompile({ intent: NO_EDIT_MIXTURE_DOC, deckLabwares: DECK });

    // RED (today): status undefined (200), outcome 'needs-clarification' —
    // plate1 false-bars as unknown-noun because the handler's lookup is
    // store-only. GREEN: the deck-composed lookup (the chat path's exact
    // grammar, imported) resolves plate1 and the compile completes.
    expect(status ?? 200).toBe(200);
    expect(payload.outcome).toBe('complete');
    const events = payload.terminalArtifacts?.events ?? [];
    expect(events.length).toBeGreaterThan(0);
    // B5: the deck binding is part of the contract — every event carries the
    // deck's labwareId in details (the client buckets ghost wells there).
    for (const ev of events) {
      const details = (ev.details ?? {}) as Record<string, unknown>;
      expect(details.labwareId).toBe('lw-deck-plate-1');
    }
  });

  it('THE DROP (server half of the silent-empty): a barred compile with deck threaded forwards the structured clarifications verbatim on the 200 body', async () => {
    const { status, payload } = await postCompile({ intent: UNRESOLVED_NOUN_DOC, deckLabwares: DECK });

    // The bar arm stays a 200 with outcome 'needs-clarification' and zero
    // events (wire additivity — no new outcome, no 422 on THIS route, B4)...
    expect(status ?? 200).toBe(200);
    expect(payload.outcome).toBe('needs-clarification');
    expect(payload.terminalArtifacts?.events ?? []).toEqual([]);
    // ...but the reason must LEAVE the server: RED today — the payload has NO
    // `clarifications` key at all (IntentCompileHandlers.ts:96-100 drops
    // result.clarifications on the floor). GREEN: the facts ride verbatim
    // (label + reason + actionLocation intact).
    expect(payload.clarifications).toBeDefined();
    const bars = payload.clarifications ?? [];
    expect(bars.length).toBeGreaterThan(0);
    expect(bars[0]).toMatchObject({
      label: 'Zymotrypsin Inhibitor Cocktail',
      reason: 'unknown-noun',
      actionLocation: { actionIndex: 0, action: 'add_material', argument: 'material' },
    });
  });
});

// ---------------------------------------------------------------------------
// T2 — round-trip deep-equal: threaded /intent/compile == the chat path
// ---------------------------------------------------------------------------

describe('SH-QB-1 T2 — the no-edit round-trip reproduces the chat path event-for-event', () => {
  it("threaded recompile events deep-equal the chat path's bound proposals (details.labwareId included)", async () => {
    const chatEvents = await chatPathEvents(NO_EDIT_MIXTURE_DOC);
    expect(chatEvents.length).toBeGreaterThan(0);

    const { payload } = await postCompile({ intent: NO_EDIT_MIXTURE_DOC, deckLabwares: DECK });
    const routeEvents = payload.terminalArtifacts?.events ?? [];

    // B5: deep-equal is the contract — not an event-type-only or length check.
    // Only the incidental Math.random() eventIds are normalized (the goldens
    // §4.4 idiom); every load-bearing field is asserted verbatim.
    expect(normalizeIncidentalIds(routeEvents)).toEqual(
      normalizeIncidentalIds(JSON.parse(JSON.stringify(chatEvents))),
    );
  });
});

// ---------------------------------------------------------------------------
// T3 — absent-deck byte-identity (the additive contract pin; goldens' guard)
// ---------------------------------------------------------------------------

describe('SH-QB-1 T3 — body WITHOUT deckLabwares keeps the pre-change response byte-identical', () => {
  it("no-deck COMPLETING compile: response keys are exactly {outcome, terminalArtifacts} (the goldens' guard)", async () => {
    // A document the STORE lookup resolves (no deck needed): the response is
    // byte-identical to the pre-change shape — no clarifications key (nothing
    // barred), no deck keys. This is what every other caller of the route
    // (including the goldens replay, which sends no deck) sees.
    const { status, payload } = await postCompile({ intent: STORE_RESOLVABLE_DOC });
    expect(status ?? 200).toBe(200);
    expect(payload.outcome).toBe('complete');
    expect((payload.terminalArtifacts?.events ?? []).length).toBeGreaterThan(0);
    expect(Object.keys(payload).sort()).toEqual(['outcome', 'terminalArtifacts']);
  });

  it('no-deck BAR: the store-only bar behavior is unchanged and clarifications is the ONLY additive key (no deck-bound labwareId appears)', async () => {
    const { status, payload } = await postCompile({ intent: NO_EDIT_MIXTURE_DOC });

    expect(status ?? 200).toBe(200);
    // Today's behavior for a store-only call on this document: plate1 bars
    // unknown-noun (the deck plate is editor state). That stays identical —
    // the deck passes are SKIPPED, so no deck id can appear anywhere.
    expect(payload.outcome).toBe('needs-clarification');
    expect(payload.terminalArtifacts?.events ?? []).toEqual([]);
    expect(payload.terminalArtifacts?.gaps ?? []).toEqual([]);
    // The additive contract: the ONLY new key is the fix-2 reason channel
    // (non-empty-only). No deck-derived keys on a no-deck call.
    expect(Object.keys(payload).sort()).toEqual(['clarifications', 'outcome', 'terminalArtifacts']);
    expect(JSON.stringify(payload.terminalArtifacts)).not.toContain('lw-deck-plate-1');
  });
});

// ---------------------------------------------------------------------------
// T4 — edited-document exact diff
// ---------------------------------------------------------------------------

describe('SH-QB-1 T4 — a one-value edit changes exactly that value', () => {
  it("no-edit vs volume-edited events differ ONLY in the edited event's volume fields", async () => {
    const noEdit = (await postCompile({ intent: NO_EDIT_MIXTURE_DOC, deckLabwares: DECK })).payload;
    const edited = (await postCompile({ intent: EDITED_VOLUME_DOC, deckLabwares: DECK })).payload;

    const before = normalizeIncidentalIds(noEdit.terminalArtifacts?.events ?? []);
    const after = normalizeIncidentalIds(edited.terminalArtifacts?.events ?? []);
    expect(before.length).toBeGreaterThan(0);
    expect(after.length).toBe(before.length);

    const changed = before.filter((ev, i) => JSON.stringify(ev) !== JSON.stringify(after[i])).length;
    expect(changed).toBe(1);

    const changedEvent = before.findIndex((ev, i) => JSON.stringify(ev) !== JSON.stringify(after[i]));
    const dBefore = (before[changedEvent]!.details ?? {}) as Record<string, unknown>;
    const dAfter = (after[changedEvent]!.details ?? {}) as Record<string, unknown>;
    expect(dBefore.volumeUl).toBe(100);
    expect(dAfter.volumeUl).toBe(250);
    // The volume carrier is BOTH the bare number and the declared quantity
    // object (the expander's two arms) — both move, nothing else does.
    expect(dBefore.volume).toEqual({ value: 100, unit: 'uL' });
    expect(dAfter.volume).toEqual({ value: 250, unit: 'uL' });
    // Every other field of the edited event is untouched.
    expect({ ...dAfter, volumeUl: dBefore.volumeUl, volume: dBefore.volume }).toEqual(dBefore);
  });
});

// ---------------------------------------------------------------------------
// T5 — the loud server channel (client visibility is the app pin's job)
// ---------------------------------------------------------------------------

describe('SH-QB-1 T5 — clarifications ride verbatim when present and stay ABSENT when empty', () => {
  it('a clean deck-threaded compile carries NO clarifications key (non-empty-only conditional spread)', async () => {
    const { payload } = await postCompile({ intent: NO_EDIT_MIXTURE_DOC, deckLabwares: DECK });
    expect(payload.outcome).toBe('complete');
    expect('clarifications' in payload).toBe(false);
  });
});
