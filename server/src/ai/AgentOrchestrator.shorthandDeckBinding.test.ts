/**
 * SHORTHAND-CHAT deck-binding — the scientist's deck is the context the chat
 * seam must thread into the frozen compile.
 *
 * The bug (direct-coded 2026-10-11): a run-chat draft naming the plate the
 * scientist just added to the deck ("plate1") false-barred as unknown-noun —
 * deck plates are editor state (context.labwares), not store records, so the
 * store-backed spine AND the store-backed labware-hint lookup could not see
 * them. The chat seam now composes an exact-name deck match into the lookup
 * (deck-first, store byte-identical underneath) and binds compiled proposals
 * to the deck's labwareId + expands compact well tokens — the shorthand
 * analogue of normalizeDraftLabwareRefs/expandEventWells on the legacy path.
 *
 * Arms:
 *  1. deck plate1 → compiles complete, events bind the deck labwareId,
 *     A2:H2 expands to 7 wells, bare numeric volume 100 survives as uL.
 *  2. NO deck wired → the SAME document bars unknown-noun (non-vacuity:
 *     the binding comes from the deck context, not the store).
 *  3. duplicate deck handles named plate1 → honest ambiguous-noun bar
 *     (never a guessed winner).
 *  4. store-only labware hint → the store lookup resolves it exactly as
 *     before (deck composition does not shadow store evidence).
 *  5. bindShorthandEventsToDeck unit arms.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { AGENT_INTENT_TOOL_NAME } from './submitSuggestionTool.js';
import { createResolveSpineFromContext } from '../resolve/index.js';
import { createLabwareLookup } from './compiler/labwareLookup.js';
import { bindShorthandEventsToDeck, deckLabwareExactMatches } from './shorthandChat.js';
import type { AgentRequest, CompletionRequest, CompletionResponse } from './types.js';

const FIXTURE_DIR = resolve(process.cwd(), 'src', 'ai', 'fixtures');
const DECK_PLATE_YAML = readFileSync(resolve(FIXTURE_DIR, 'shorthand-deck-plate1.yaml'), 'utf-8');

/** Test seeds ONLY. NOTE: deliberately NO plate/labware record for "plate1" —
 *  the deck plate lives in context.labwares, exactly as in the run page. */
const SEED_RECORDS = [
  {
    recordId: 'MAT-dmem-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'DMEM', title: 'DMEM', synonyms: ['dmem'] },
  },
  {
    recordId: 'LAB-plate-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
    payload: { kind: 'labware', name: 'Plate', title: 'Plate', synonyms: ['plate'] },
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

function orchestratorDeps() {
  const store = mockStore();
  return {
    store: store as never,
    resolveSpine: createResolveSpineFromContext({ store: store as never }) as never,
    searchLabwareByHint: createLabwareLookup(store as never) as never,
  };
}

function stubModel(responses: Array<Record<string, unknown>>) {
  let call = 0;
  const completeStream = vi.fn(async function* (request: CompletionRequest) {
    const spec = responses[Math.min(call, responses.length - 1)]!;
    call += 1;
    const delta: Record<string, unknown> = { role: 'assistant' };
    if (Array.isArray(spec.toolCalls)) {
      delta.tool_calls = spec.toolCalls.map((tc, i) => ({
        index: i,
        id: `call-${call}-${i}`,
        type: 'function',
        function: { name: (tc as { name: string }).name, arguments: JSON.stringify((tc as { args: unknown }).args) },
      }));
    }
    yield {
      id: `resp-${call}`,
      choices: [{ index: 0, delta, finish_reason: Array.isArray(spec.toolCalls) ? 'tool_calls' : 'stop' }],
    } as unknown as CompletionResponse;
  });
  return { client: { complete: vi.fn(), completeStream } as never, callCount: () => completeStream.mock.calls.length };
}

function shorthandCall(yaml: string) {
  return { name: AGENT_INTENT_TOOL_NAME, args: { intent: 'event_shorthand', shorthand: yaml } };
}

const DECK_LABWARES = [
  { labwareId: 'lw-deck-plate-1', labwareType: 'deepwell_96', name: 'plate1', rows: 8, columns: 12 },
];

function runRequest(labwares: Array<{ labwareId: string; labwareType: string; name: string }>): AgentRequest {
  return {
    prompt: 'Add 100ul of DMEM',
    surface: 'workspace.deck' as const,
    forceDraftTool: true,
    context: {
      labwares,
      eventSummary: 'No events yet.',
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['add_material'],
      runId: 'RUN-deck-binding',
    },
  } as unknown as AgentRequest;
}

async function runShorthand(labwares: Parameters<typeof runRequest>[0]) {
  const model = stubModel([{ toolCalls: [shorthandCall(DECK_PLATE_YAML)] }]);
  const orchestrator = createAgentOrchestrator(
    model.client,
    { getToolDefinitions: () => [], executeTool: vi.fn() },
    { baseUrl: 'http://test.invalid', model: 'test-model', temperature: 0.1, maxTokens: 512 },
    { maxTurns: 2 },
    orchestratorDeps(),
  );
  return orchestrator.run(runRequest(labwares));
}

describe('SHORTHAND-CHAT deck binding (plate1 false-bar)', () => {
  it('binds the deck plate by name: compiles complete, labwareId is the DECK id, range expands, volume survives', async () => {
    const result = await runShorthand(DECK_LABWARES);
    expect(result.success).toBe(true);
    expect(result.clarificationRequests ?? []).toHaveLength(0);
    expect(result.events).toHaveLength(1);
    const ev = result.events![0] as unknown as Record<string, unknown>;
    const details = ev.details as Record<string, unknown>;
    // The canvas binds by the editor's labwareId — not the scientist's label.
    expect(ev.labwareId).toBe('lw-deck-plate-1');
    expect(details.well).toBeUndefined();
    expect(details.wells).toEqual(['A2', 'B2', 'C2', 'D2', 'E2', 'F2', 'G2', 'H2']);
    expect(details.volumeUl).toBe(100);
    expect(details.volume).toEqual({ value: 100, unit: 'uL' });
    expect(details.material).toBe('DMEM');
  });

  it('NON-VACUITY: with no deck wired, the SAME document still bars unknown-noun for plate1', async () => {
    const result = await runShorthand([]);
    expect(result.success).toBe(true); // the bar rides the clarification channel
    expect(result.events ?? []).toHaveLength(0);
    const bars = result.clarificationRequests ?? [];
    expect(bars.length).toBeGreaterThan(0);
    const fact = bars[0]!.unresolvedFact;
    expect(fact?.label).toBe('plate1');
    expect(fact?.reason).toBe('unknown-noun');
  });

  it('duplicate deck handles named plate1 clarify honestly — never a guessed winner', async () => {
    const result = await runShorthand([
      { labwareId: 'lw-deck-a', labwareType: 'plate_96', name: 'plate1' },
      { labwareId: 'lw-deck-b', labwareType: 'plate_96', name: 'plate1' },
    ]);
    expect(result.events ?? []).toHaveLength(0);
    const bars = result.clarificationRequests ?? [];
    expect(bars.length).toBeGreaterThan(0);
    expect(bars[0]!.unresolvedFact?.reason).toBe('ambiguous-noun');
  });

  it('a store-resolvable labware hint is unaffected: deck composition never shadows store evidence', async () => {
    const model = stubModel([{ toolCalls: [shorthandCall(`intentId: store-hint-leg\nactions:\n  - action: add_material\n    material: DMEM\n    volume: 50\n    labware: plate\n`)] }]);
    const orchestrator = createAgentOrchestrator(
      model.client,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { baseUrl: 'http://test.invalid', model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2 },
      orchestratorDeps(),
    );
    const result = await orchestrator.run(runRequest(DECK_LABWARES));
    expect(result.success).toBe(true);
    expect(result.events).toHaveLength(1);
    // 'plate' matches NO deck name exactly → the STORE lookup binds it in
    // resolve_nouns/resolve_labware (no bar). The event keeps the scientist's
    // label — the pre-existing shape for store-bound labware on this chain
    // (the deck binder only rewrites names it can prove against the deck).
    expect(result.clarificationRequests ?? []).toHaveLength(0);
    const ev = result.events![0] as unknown as Record<string, unknown>;
    expect(ev.labwareId).toBe('plate');
  });
});

describe('deckLabwareExactMatches + bindShorthandEventsToDeck (unit arms)', () => {
  const deck = [
    { labwareId: 'lw-a', name: 'plate1' },
    { labwareId: 'lw-b', name: 'Plate 2' },
  ];

  it('exact match is case/trim-insensitive; substring NEVER matches', () => {
    expect(deckLabwareExactMatches(deck, 'plate1')).toEqual([{ recordId: 'lw-a', title: 'plate1' }]);
    expect(deckLabwareExactMatches(deck, '  PLATE1 ')).toEqual([{ recordId: 'lw-a', title: 'plate1' }]);
    expect(deckLabwareExactMatches(deck, 'plate')).toEqual([]);
    expect(deckLabwareExactMatches(deck, 'plate10')).toEqual([]);
    expect(deckLabwareExactMatches(undefined, 'plate1')).toEqual([]);
  });

  it('binds label→deck id on top-level and details.labwareId; leaves unknown labels and real deck ids untouched', () => {
    const events = [
      { eventId: 'e1', labwareId: 'plate1', details: { well: 'A1' } },
      { eventId: 'e2', labwareId: 'lw-a', details: { labwareId: 'Plate 2', well: 'B1' } },
      { eventId: 'e3', labwareId: 'somewhere-else', details: { well: 'C1' } },
    ];
    const out = bindShorthandEventsToDeck(events, deck);
    expect(out[0]!.labwareId).toBe('lw-a');
    expect(out[1]!.labwareId).toBe('lw-a'); // already a deck id — untouched
    expect((out[1]!.details as Record<string, unknown>).labwareId).toBe('lw-b');
    expect(out[2]!.labwareId).toBe('somewhere-else'); // never invented
    expect(out[2]).toBe(events[2]); // byte-passthrough when nothing changes
  });

  it('expands a compact range in the scalar details.well into details.wells', () => {
    const out = bindShorthandEventsToDeck(
      [{ eventId: 'e1', details: { well: 'A2:H2' } }],
      deck,
    );
    const d = out[0]!.details as Record<string, unknown>;
    expect(d.well).toBeUndefined();
    expect(d.wells).toEqual(['A2', 'B2', 'C2', 'D2', 'E2', 'F2', 'G2', 'H2']);
  });

  it('ambiguous deck handles are NOT bound', () => {
    const dup = [
      { labwareId: 'lw-x', name: 'plate1' },
      { labwareId: 'lw-y', name: 'plate1' },
    ];
    const out = bindShorthandEventsToDeck([{ eventId: 'e1', labwareId: 'plate1' }], dup);
    expect(out[0]!.labwareId).toBe('plate1');
  });
});
