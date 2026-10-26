/**
 * L2-FREEFORM-1 — per-leg committed gates (the vitest form of the :3093 SSE
 * drive; real shipped handler + real AgentOrchestrator, scripted inference,
 * zero model spend). Each leg asserts the honest-outcome trichotomy on a REAL
 * shipped shape: events>0-that-bind OR cards>0 OR honest failure — never none.
 *
 * The shared helper `assertHonestOutcome` (honestOutcome.ts) is the committed
 * suite-hook for L2-SUITE-A (spec acceptance #2) — this file also unit-tests
 * it (acceptance #2's (a)-(e) legs).
 *
 * Probe idiom: AgentOrchestrator.shorthandChat.test.ts / .shorthandDeckBinding.
 * test.ts — stubModel scripted inference client, deck injected via
 * context.labwares (the probe injection point), write-free (mock store only;
 * zero mutation calls asserted where a store seam exists).
 */
import { describe, expect, it, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { AGENT_INTENT_TOOL_NAME } from './submitSuggestionTool.js';
import { createResolveSpineFromContext } from '../resolve/index.js';
import { createLabwareLookup } from './compiler/labwareLookup.js';
import {
  bindShorthandEventsToDeck,
  factRequestId,
  shorthandResultFromCompile,
} from './shorthandChat.js';
import type { DeckLabwareSummary } from './shorthandChat.js';
import {
  clarificationAskCount,
  clarificationLoopEscalation,
  clarificationLoopRequestIds,
  type LoopAskFact,
} from './clarificationLoopAsk.js';
import { assertHonestOutcome, classifyHonestOutcome } from './honestOutcome.js';
import type { AgentRequest, CompletionRequest, CompletionResponse } from './types.js';

// ---------------------------------------------------------------------------
// Shared harness (the shorthandDeckBinding.test.ts idiom)
// ---------------------------------------------------------------------------

const SEED_RECORDS = [
  {
    recordId: 'MAT-dmem-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'DMEM', title: 'DMEM', synonyms: ['dmem'] },
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
      runId: 'RUN-freeform-probe',
    },
  } as unknown as AgentRequest;
}

async function runShorthand(labwares: Parameters<typeof runRequest>[0], yaml: string) {
  const model = stubModel([{ toolCalls: [shorthandCall(yaml)] }]);
  const orchestrator = createAgentOrchestrator(
    model.client,
    { getToolDefinitions: () => [], executeTool: vi.fn() },
    { baseUrl: 'http://test.invalid', model: 'test-model', temperature: 0.1, maxTokens: 512 },
    { maxTurns: 2 },
    orchestratorDeps(),
  );
  return orchestrator.run(runRequest(labwares));
}

// ---------------------------------------------------------------------------
// Acceptance #2 — the assertHonestOutcome suite-hook itself
// ---------------------------------------------------------------------------

describe('L2-FREEFORM-1 acceptance #2 — assertHonestOutcome trichotomy hook', () => {
  it('(a) an events-bearing result with bound ids classifies "events-bound"', () => {
    const verdict = assertHonestOutcome(
      { success: true, events: [{ eventId: 'e1', labwareId: 'lw-a' }] },
      { deckIds: ['lw-a'] },
    );
    expect(verdict).toBe('events-bound');
  });

  it('(b) a cards result classifies "cards"', () => {
    const verdict = assertHonestOutcome({ success: true, events: [], clarificationRequests: [{ id: 'c1' }] });
    expect(verdict).toBe('cards');
  });

  it('(c) an error result classifies "honest-failure"', () => {
    const verdict = assertHonestOutcome({ success: false, error: 'no proposal: ...' });
    expect(verdict).toBe('honest-failure');
  });

  it('(d) success:true + empty everything THROWS (the silent shape)', () => {
    expect(() => assertHonestOutcome({ success: true, events: [] })).toThrow(/NOT an honest outcome/);
  });

  it('(e) H1\'s shipped defect shape (events>0 with an UNBOUND raw-label labwareId, no cards/error) THROWS', () => {
    expect(() =>
      assertHonestOutcome(
        { success: true, events: [{ eventId: 'e1', labwareId: 'Plate One' }] },
        { deckIds: ['lw-a', 'lw-b'] },
      ),
    ).toThrow(/UNBOUND raw-label labwareId/);
  });

  it('classifyHonestOutcome returns null (not throws) on the silent shape — the probe classifier arm', () => {
    expect(classifyHonestOutcome({ success: true, events: [] })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// H1 — unbound raw scientist-label events (PRIMARY)
// ---------------------------------------------------------------------------

describe('L2-FREEFORM-1 H1 — the binder refuses ambiguous/unmatched refs LOUDLY', () => {
  const dupDeck: DeckLabwareSummary[] = [
    { labwareId: 'lw-a', labwareType: 'plate_96', name: 'Plate One' },
    { labwareId: 'lw-b', labwareType: 'plate_96', name: 'Plate One' },
  ];

  it('ambiguous deck name (duplicate): the unbound event does NOT survive with its raw label; the refusal report names the candidates', () => {
    const out = bindShorthandEventsToDeck(
      [{ eventId: 'e1', labwareId: 'Plate One', details: { well: 'A1' } }],
      dupDeck,
    );
    // B4 pin flip (was: out[0].labwareId === 'Plate One' — fail-open): the
    // ambiguous ref is REFUSED — removed from the bound set and reported.
    expect(out.events).toHaveLength(0);
    expect(out.unboundRefs.length).toBeGreaterThan(0);
    const report = out.unboundRefs[0]!;
    expect(report.label).toBe('Plate One');
    expect(report.candidates).toEqual(['lw-a', 'lw-b']); // never-guess: ALL listed
    expect(report.reason).toBe('ambiguous');
  });

  it('unmatched label ("the plate" shape — exact-match-only): same refusal shape', () => {
    const out = bindShorthandEventsToDeck(
      [{ eventId: 'e1', labwareId: 'the plate', details: { well: 'A1' } }],
      [{ labwareId: 'lw-a', labwareType: 'plate_96', name: 'Plate One' }],
    );
    expect(out.events).toHaveLength(0);
    expect(out.unboundRefs[0]!.label).toBe('the plate');
    expect(out.unboundRefs[0]!.reason).toBe('unmatched');
    expect(out.unboundRefs[0]!.candidates).toEqual([]);
  });

  it('deck ids present as refs -> untouched (existing pin stays green)', () => {
    const out = bindShorthandEventsToDeck(
      [{ eventId: 'e1', labwareId: 'lw-a', details: { well: 'A1' } }],
      dupDeck,
    );
    expect(out.events).toHaveLength(1);
    expect(out.events[0]!.labwareId).toBe('lw-a');
    expect(out.unboundRefs).toHaveLength(0);
  });

  it('resolved-offer hit -> binds (fix3 pins stay green)', () => {
    const out = bindShorthandEventsToDeck(
      [{ eventId: 'e1', labwareId: 'hint plate', details: { well: 'A1' } }],
      undefined,
      [{ hint: 'hint plate', recordId: 'LAB-rec-1', title: 'hint plate' }],
    );
    expect(out.events).toHaveLength(1);
    expect(out.events[0]!.labwareId).toBe('LAB-rec-1');
    expect(out.unboundRefs).toHaveLength(0);
  });

  it('mixed granularity (OQ1): one binds, one ambiguous -> the bound event survives, the unbound one is reported', () => {
    const out = bindShorthandEventsToDeck(
      [
        { eventId: 'e1', labwareId: 'Plate Two', details: { well: 'A1' } },
        { eventId: 'e2', labwareId: 'Plate One', details: { well: 'B1' } },
      ],
      [
        { labwareId: 'lw-two', labwareType: 'plate_96', name: 'Plate Two' },
        { labwareId: 'lw-a', labwareType: 'plate_96', name: 'Plate One' },
        { labwareId: 'lw-b', labwareType: 'plate_96', name: 'Plate One' },
      ],
    );
    expect(out.events).toHaveLength(1);
    expect(out.events[0]!.eventId).toBe('e1');
    expect(out.events[0]!.labwareId).toBe('lw-two');
    expect(out.unboundRefs).toHaveLength(1);
    expect(out.unboundRefs[0]!.label).toBe('Plate One');
    expect(out.unboundRefs[0]!.reason).toBe('ambiguous');
  });

  it('HONEST-OUTCOME ASSERTION: the shipped defect shape cannot exit the mapper (whole-turn nothing-binds -> honest failure naming the labels)', () => {
    // THE SHIPPED DEFECT (verified by probe at base): a COMPLETE compile whose
    // event carries an unbound raw labware label (the duplicate-name shape)
    // used to exit as { success:true, events:["Plate One"], cards:0, error:null
    // } — the silent success-with-zero-mountable. The binder now REFUSES the
    // unbound ref (dropped from events) and the mapper returns an honest
    // failure naming the label — never the silent shape. (The
    // needs-clarification branch was already honest — it maps the fact to a
    // card; this leg pins the COMPLETE branch, the true defect.)
    const compiled = {
      outcome: 'complete',
      clarifications: [],
      terminalArtifacts: {
        events: [{ eventId: 'e1', labwareId: 'Plate One', details: { well: 'A1' } }],
        gaps: [],
      },
    } as never;
    const result = shorthandResultFromCompile(compiled, 'intentId: h1\nactions: []\n', 'note', dupDeck);
    // NEW: an honest failure naming the label (the defect shape is gone).
    expect(result.error).toBeTruthy();
    expect(result.error).toContain('Plate One');
    // The raw label never rides the events channel (assertHonestOutcome would
    // throw on { success:true, events>0, unbound raw label }).
    expect(result.success).toBe(false);
    expect(result.events ?? []).toHaveLength(0);
    // The refusal report names the label + BOTH candidates (never-guess).
    expect(result.unboundRefs?.[0]?.label).toBe('Plate One');
    expect(result.unboundRefs?.[0]?.candidates).toEqual(['lw-a', 'lw-b']);
  });
});

describe('L2-FREEFORM-1 H1 — orchestrator leg (real shipped shape, write-free)', () => {
  it('duplicate deck names: the turn lands cards>0 or honest failure — never success with an unbound raw-label event', async () => {
    const yaml = [
      'intentId: ff1-h1-dup',
      'actions:',
      '  - action: add_material',
      '    labware: Plate One',
      '    material: DMEM',
      '    volumeUl: 100',
      '    targetWells: [A1]',
      '',
    ].join('\n');
    const result = await runShorthand(
      [
        { labwareId: 'lw-a', labwareType: 'plate_96', name: 'Plate One' },
        { labwareId: 'lw-b', labwareType: 'plate_96', name: 'Plate One' },
      ],
      yaml,
    );
    // The trichotomy on the REAL delivered shape (probe context = the deck):
    const verdict = assertHonestOutcome(result, {
      deckIds: ['lw-a', 'lw-b'],
      resolvedIds: [],
    });
    expect(['events-bound', 'cards', 'honest-failure']).toContain(verdict);
    // And the specific defect: NO event may carry the raw label.
    for (const ev of result.events ?? []) {
      expect((ev as { labwareId?: unknown }).labwareId).not.toBe('Plate One');
    }
  });

  it('unmatched label with a single deck plate (OQ2: REFUSE + card, never auto-bind)', async () => {
    const yaml = [
      'intentId: ff1-h1-unmatched',
      'actions:',
      '  - action: add_material',
      '    labware: the plate',
      '    material: DMEM',
      '    volumeUl: 100',
      '    targetWells: [A1]',
      '',
    ].join('\n');
    const result = await runShorthand(
      [{ labwareId: 'lw-a', labwareType: 'plate_96', name: 'Plate One' }],
      yaml,
    );
    const verdict = assertHonestOutcome(result, { deckIds: ['lw-a'], resolvedIds: [] });
    expect(['events-bound', 'cards', 'honest-failure']).toContain(verdict);
    for (const ev of result.events ?? []) {
      expect((ev as { labwareId?: unknown }).labwareId).not.toBe('the plate');
    }
  });
});

// ---------------------------------------------------------------------------
// H4 — unresolvable-noun clarification LOOP escalation (OQ4: requestId
// identity, N=1). The text-identity detector (clarificationLoop.ts) never
// sees a PARAPHRASED re-ask of the same slot; the content-keyed
// factRequestId (stable across compiles) is the identity that survives the
// paraphrase. The occurrence ledger is per-conversation (the held-intent
// store seam); the escalation = an honest failure naming the unresolvable
// noun + why the mint affordance is closed when the noun-shape DATA
// refused it — composed from requestId-scoped data, no vocab literals (B3),
// and the QUESTION is never removed (B7: the card channel stays).
// ---------------------------------------------------------------------------

function h4Yaml(intentId: string): string {
  return [
    `intentId: ${intentId}`,
    'actions:',
    '  - action: add_material',
    '    labware: Plate One',
    '    material: 1:2 BufferMix X', // mint-refused by the noun-shape DATA
    '    volumeUl: 100',
    '    targetWells: [A1]',
    '',
  ].join('\n');
}

function multiTurnShorthand(labwares: Parameters<typeof runRequest>[0], yaml: string) {
  const model = stubModel([{ toolCalls: [shorthandCall(yaml)] }]);
  const orchestrator = createAgentOrchestrator(
    model.client,
    { getToolDefinitions: () => [], executeTool: vi.fn() },
    { baseUrl: 'http://test.invalid', model: 'test-model', temperature: 0.1, maxTokens: 512 },
    { maxTurns: 2 },
    orchestratorDeps(),
  );
  const deckIds = labwares.map((l) => l.labwareId);
  const turn = (prompt: string, clarificationAnswers?: AgentRequest['clarificationAnswers']) =>
    orchestrator.run({
      ...runRequest(labwares),
      prompt,
      ...(clarificationAnswers && clarificationAnswers.length > 0 ? { clarificationAnswers } : {}),
    } as AgentRequest).then((result) => ({
      result,
      // B5 arm-log discipline: the held-intent hit is the FOLD's zero model
      // calls — assert the arm-log, not just the response shape.
      modelCalls: model.callCount(),
    }));
  return { deckIds, turn };
}

describe('L2-FREEFORM-1 H4 — the tracker unit (OQ4: N=1 on requestId identity)', () => {
  it('N=1: the looped flag flips on the SECOND occurrence of the same requestId, paraphrase or not', () => {
    const after1 = clarificationAskCount(undefined, ['unresolved-c-aaaa']);
    expect(clarificationLoopRequestIds(after1)).toEqual([]);
    const after2 = clarificationAskCount(after1, ['unresolved-c-aaaa']);
    expect(clarificationLoopRequestIds(after2)).toEqual(['unresolved-c-aaaa']);
    // A DIFFERENT requestId in the same ask does NOT loop (N=1 per id).
    const mixed = clarificationAskCount(after2, ['unresolved-c-bbbb']);
    expect(clarificationLoopRequestIds(mixed)).toEqual(['unresolved-c-aaaa']);
    expect(clarificationAskCount(undefined, [])).toEqual({});
  });

  it('the escalation text names the unresolvable noun + the closed mint affordance (composed from requestId-scoped data)', () => {
    const text = clarificationLoopEscalation([
      { label: '1:2 BufferMix X', reason: 'unknown-noun', mintRefused: true },
    ]);
    expect(text).toContain('1:2 BufferMix X');
    expect(text).toContain('unknown-noun');
    expect(text).toContain('mint affordance');
    expect(text).toContain('never removed the QUESTION');
    expect(text).toMatch(/^clarification_loop:/);
  });

  it('an unrefused noun escalates WITHOUT the mint clause', () => {
    const text = clarificationLoopEscalation([{ label: 'ghostgoop', reason: 'unknown-noun' }]);
    expect(text).toContain('ghostgoop');
    expect(text).not.toContain('mint affordance');
  });
});

describe('L2-FREEFORM-1 H4 — orchestrator leg (scripted multi-turn, write-free)', () => {
  it('paraphrase re-ask of the same unresolvable-noun slot: turn-1 cards, turn-2 (same requestId) ESCALATES — honest failure naming the noun; a third turn stays escalated', async () => {
    const { deckIds, turn } = multiTurnShorthand(
      [{ labwareId: 'lw-a', labwareType: 'plate_96', name: 'Plate One' }],
      h4Yaml('ff1-h4-p1'),
    );
    // TURN 1: the draft bars (unknown-noun) -> cards (the question stands).
    const t1 = await turn('Add 100ul of 1:2 BufferMix X to A1');
    expect(t1.modelCalls).toBe(1); // the scripted extraction
    expect(t1.result.success).toBe(true);
    expect(t1.result.clarificationRequests?.length).toBeGreaterThan(0);
    // The mint-refused card: no create-a-local-term affordance (noun-shape DATA).
    const mintRefusedCard = (t1.result.clarificationRequests ?? []).find(
      (r) => r.query === '1:2 BufferMix X',
    )!;
    expect(mintRefusedCard.allowCreateLocal).toBe(false);
    const rid = mintRefusedCard.id; // the content-keyed factRequestId
    expect(rid).toMatch(/^unresolved-c-[0-9a-f]{10}$/);
    // Trichotomy on the REAL delivered shape: cards on turn 1.
    expect(classifyHonestOutcome(t1.result)).toBe('cards');

    // TURN 2: a NON-identical paraphrase of the same ask (B5: byte-identical
    // surface+context — runRequest is shared; only the prompt moves) re-asks
    // the SAME slot. Today (the text-identity detector only) this re-asks a
    // THIRD time: cards again, no escalation. OQ4: the 2nd occurrence of the
    // same requestId escalates.
    const t2 = await turn('Please add 100 microliters of the 1:2 BufferMix X mixture into well A1');
    expect(t2.result.clarificationRequests?.some((r) => r.id === rid)).toBe(true); // same slot
    expect(t2.result.error).toBeTruthy(); // RED today
    expect(t2.result.error).toContain('1:2 BufferMix X');
    expect(t2.result.error).toContain('mint affordance');
    expect(classifyHonestOutcome(t2.result)).toBe('honest-failure');

    // TURN 3: stays escalated (count 3 >= 2) — never a silent 3rd card.
    const t3 = await turn('Try again: 100ul 1:2 BufferMix X into A1, please');
    expect(t3.result.error).toBeTruthy();
    expect(t3.result.error).toContain('1:2 BufferMix X');
    void deckIds;
  });

  it('never-guess negative: a VALID pick on turn 2 ends the loop (the pick still works — the card+pick path stays green)', async () => {
    const { deckIds, turn } = multiTurnShorthand(
      [{ labwareId: 'lw-a', labwareType: 'plate_96', name: 'Plate One' }],
      h4Yaml('ff1-h4-neg'),
    );
    const t1 = await turn('Add 100ul of 1:2 BufferMix X to A1');
    const rid = (t1.result.clarificationRequests ?? []).find((r) => r.query === '1:2 BufferMix X')!.id;
    // The scientist PICKS an existing lab term (the store-seeded DMEM): the
    // fold binds the slot and the re-derived bar is gone — no escalation,
    // events bound to the deck.
    const t2 = await turn('use DMEM instead', [
      { requestId: rid, label: 'DMEM', ref: { id: 'MAT-dmem-1' } },
    ]);
    // The held-intent arm fired: the fold recompile made ZERO model calls
    // (the scripted model's count is still the turn-1 extraction).
    expect(t2.modelCalls).toBe(1);
    expect(t2.result.error).toBeUndefined();
    expect(classifyHonestOutcome(t2.result, { deckIds, resolvedIds: ['MAT-dmem-1'] })).toBe('events-bound');
  });
});

describe('L2-FREEFORM-1 H4 — mapper leg (the escalation shape, no model)', () => {
  const factFixture = {
    label: '1:2 BufferMix X',
    reason: 'unknown-noun',
    actionLocation: { actionIndex: 0, action: 'add_material', argument: 'material' },
  } as unknown as import('../compiler/scientistIntent/types.js').ScientistIntentUnresolvedFact;
  const compiledFixture = (label: string) => ({
    outcome: 'needs-clarification',
    clarifications: [{ ...factFixture, label }],
    terminalArtifacts: { events: [], gaps: [] },
  }) as never;

  it('a needs-clarification compile whose prior turn already asked the same requestId returns the escalation result (ledger advanced, question channel intact)', () => {
    const out = shorthandResultFromCompile(compiledFixture('1:2 BufferMix X'), 'intentId: h4\nactions: []\n', 'note', undefined, {
      priorLoopAskCounts: { [factRequestId(factFixture)]: 1 },
    });
    expect(out.success).toBe(true);
    expect(out.error).toBeTruthy();
    expect(out.error).toContain('1:2 BufferMix X');
    expect(out.loopAskCounts?.[factRequestId(factFixture)]).toBe(2);
    // B7: the QUESTION stands — the card channel stays beside the error.
    expect(out.clarificationRequests?.length).toBe(1);
    expect(out.clarificationRequests?.[0]?.id).toBe(factRequestId(factFixture));
  });

  it('a FIRST ask (no prior counts) ships the cards, no error (the answerable path is untouched)', () => {
    const out = shorthandResultFromCompile(compiledFixture('1:2 BufferMix X'), 'intentId: h4b\nactions: []\n', 'note');
    expect(out.error).toBeUndefined();
    expect(out.clarificationRequests?.length).toBe(1);
    expect(out.loopAskCounts?.[factRequestId(factFixture)]).toBe(1);
  });
});
