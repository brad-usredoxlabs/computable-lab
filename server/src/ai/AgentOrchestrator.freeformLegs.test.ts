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
import * as runChatbotCompileModule from './runChatbotCompile.js';
import { emptyDraftMessage } from './draftArgDiagnostics.js';
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

  // (f) THE D-1 RECEIPT SHAPE (L2-FREEFORM-1F): P1 prompt-1's done,
  // receipts/L2-SUITE-A/20261027T045347Z/prompt-1.json :6-12, field-for-field
  // — the deckLayout action channel the server stamps when the model's
  // deck_layout intent resolves ({success:true, deckLayout:{platformId,
  // variantId}}). PRE-arm (captured RED, freeform1f-RED-l2t0155.txt) the
  // helper read only the 4 channels and threw the silent shape here — defect
  // D-1 verbatim. POST-arm the action-delivered arm admits the delivery ->
  // 'action-delivered'.
  it('(f) a delivered deckLayout action (P1 receipt: manual/manual_freeform) classifies "action-delivered"', () => {
    const receipt = {
      success: true,
      deckLayout: { platformId: 'manual', variantId: 'manual_freeform' },
    };
    const verdict = assertHonestOutcome(receipt);
    expect(verdict).toBe('action-delivered');
    expect(classifyHonestOutcome(receipt)).toBe('action-delivered');
  });

  // (g) THE ANTI-GHOST SET (L2-FREEFORM-1F): an empty-but-present deckLayout
  // never earns the arm — pre- AND post-arm it stays the silent shape and
  // THROWS (pre-arm behavior proven in the same captured RED file,
  // freeform1f-RED-l2t0155.txt, entries (g1)/(g2)).
  it('(g) deckLayout:{} (empty-but-present) THROWS (the anti-ghost pin)', () => {
    expect(() => assertHonestOutcome({ success: true, deckLayout: {} })).toThrow(
      /NOT an honest outcome/,
    );
  });

  it('(g) deckLayout with empty ids {platformId:"", variantId:""} THROWS (the anti-ghost pin)', () => {
    expect(() =>
      assertHonestOutcome({ success: true, deckLayout: { platformId: '', variantId: '' } }),
    ).toThrow(/NOT an honest outcome/);
  });

  // (h) (L2-FREEFORM-1F, the D-1 ruling's RED-SHAPE): a well-formed platformId
  // with variantId ABSENT never earns the arm — both ids are required.
  it('(h) deckLayout with variantId absent {platformId:"manual"} THROWS (the arm requires BOTH ids)', () => {
    expect(() => assertHonestOutcome({ success: true, deckLayout: { platformId: 'manual' } })).toThrow(
      /NOT an honest outcome/,
    );
  });

  // (j) THE THIRD ANTI-GHOST SHAPE (fix run 1, advc D5): the D-1 decision
  // names `deckLayout: null` among the shapes that "must remain the silent
  // shape and throw" — an explicit null is rejected identically by the arm's
  // `deckLayout !== null` guard and stays the silent shape (THROWS).
  it('(j) deckLayout:null (explicit null) THROWS (the third anti-ghost shape, advc D5)', () => {
    expect(() => assertHonestOutcome({ success: true, deckLayout: null })).toThrow(
      /NOT an honest outcome/,
    );
  });

  // (i) (L2-FREEFORM-1F, the D-1 ruling's RED-SHAPE): the DEFENSIVE ORDER pin —
  // H4: error outranks the action arm. A failed turn with a well-formed
  // deckLayout alongside is the honest failure, never action-delivered (the
  // server's emit site makes the two mutually exclusive; the order is
  // defensive, and this pins it). uifix2-fix2 D1: the fixture quotes the NEW
  // plain-language wall (the raw validator string is retired).
  it('(i) error + delivered deckLayout classifies "honest-failure" (H4: error outranks the action arm)', () => {
    const verdict = assertHonestOutcome({
      success: false,
      error: 'I could not tell which Manual layout you want. The Manual deck offers: Single SBS Plate, Manual Technician Mode or Manual Bench (freeform). Name one and I will switch to it.',
      deckLayout: { platformId: 'manual', variantId: 'manual_freeform' },
    });
    expect(verdict).toBe('honest-failure');
    expect(
      classifyHonestOutcome({
        success: false,
        error: 'I could not tell which Manual layout you want. The Manual deck offers: Single SBS Plate, Manual Technician Mode or Manual Bench (freeform). Name one and I will switch to it.',
        deckLayout: { platformId: 'manual', variantId: 'manual_freeform' },
      }),
    ).toBe('honest-failure');
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

  // ADVX FIX1 probe (advc1 Defect 1): the FOLD seam's N=1 — an answer that
  // does NOT resolve the slot (a ref the store cannot bind) re-asks the
  // SAME requestId on the fold recompile. The fold arm's re-hold advances
  // the held ledger to 2; the fold mapper MUST see that advanced ledger
  // (the 2nd occurrence) so the escalation lands IN THE SAME TURN —
  // today the fold mapper call drops the seed and the mapper recomputes
  // from prior=undefined (cards-only, count=1; the result's ledger
  // contradicts the held one), delaying the escalation by one turn.
  // The answer's label is the BAR FACT'S OWN label (the splice is a
  // no-op on the document) so the re-ask is the SAME content-keyed
  // requestId — the defect's exact shape (a changed label would re-derive
  // a NEW fact id and the 2nd-occurrence ruling would not apply).
  it('fold re-ask of the SAME requestId (an answer that does NOT resolve the slot): the escalation lands in the SAME turn — ledger consistency (result == re-hold)', async () => {
    const { turn } = multiTurnShorthand(
      [{ labwareId: 'lw-a', labwareType: 'plate_96', name: 'Plate One' }],
      h4Yaml('ff1-h4-fold'),
    );
    const t1 = await turn('Add 100ul of 1:2 BufferMix X to A1');
    const rid = (t1.result.clarificationRequests ?? []).find((r) => r.query === '1:2 BufferMix X')!.id;
    expect(t1.result.error).toBeUndefined();
    // The answer names the bar's own label but carries a ref the store
    // cannot bind (the mock store seeds DMEM only) — the slot STILL bars
    // on the fold recompile (the 1:1 fold path; not the fold-free
    // re-extraction fallback), so the re-ask is the 2nd occurrence of
    // `rid` and MUST escalate in this turn.
    const t2 = await turn('Add 100ul of 1:2 BufferMix X to A1', [
      { requestId: rid, label: '1:2 BufferMix X', ref: { id: 'MAT-nope' } },
    ]);
    // The held-intent arm fired: the fold recompile made ZERO model calls.
    expect(t2.modelCalls).toBe(1);
    // OQ4: the 2nd occurrence flips the looped flag IN THE SAME TURN (the
    // paraphrase leg above pins the fold-free seam; this leg pins the fold
    // seam — same ruling, different ledger path).
    expect(t2.result.error).toBeTruthy();
    expect(t2.result.error).toContain('1:2 BufferMix X');
    expect(t2.result.error).toContain('mint affordance');
    // B7: the QUESTION stands — the card channel stays beside the error.
    expect(t2.result.clarificationRequests?.some((r) => r.id === rid)).toBe(true);
    // Ledger consistency: the fold re-hold advanced the held ledger to 2
    // (prior=1 + this turn's ask) and the fold mapper's seed was that
    // advanced value — the result's ledger matches (today the seed is
    // dropped: the mapper recomputes from prior=undefined and ships
    // count=1, contradicting the held ledger's 2).
    expect(t2.result.loopAskCounts?.[rid]).toBe(2);
    expect(classifyHonestOutcome(t2.result)).toBe('honest-failure');
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

// ---------------------------------------------------------------------------
// H5 — doc-discussion prose leg + assurance-CONFIRM empty-bypass.
// (a) ROOT: ANY attached-file turn is docDiscussion (tools disabled) and
//     returns prose-only { success:true, clarificationNeeded, events:[] } —
//     the client wall predicate does NOT count clarificationNeeded, so the
//     honest wall FALSE-FIRES on a legitimate prose answer (both panes).
//     OQ3 RULED: the server marks the prose deliverable with a STRUCTURAL
//     marker channel; the client predicate gains ONE term (the CHAT-1
//     extracted module = draftEmptiness) + the drift pin updates the SAME
//     commit. The committed server-side guarantee: a doc-discussion success
//     result is NEVER indistinguishable from an empty draft at the wire
//     (marker present; today absent -> RED).
// (b) ROOT: assurance CONFIRM with EMPTY blockers + EMPTY gaps returns
//     success:true, zero events, zero requests through the chatbot-compile
//     bypass — the arm never reaches the draft-tool arm's empty guard
//     (server-silent). The 7-channel empty check is extracted into ONE
//     server helper (draftArgDiagnostics.draftProducedNothingOnServer —
//     byte-identical channel list, CLIENT ⊇ SERVER) and applied to the
//     CONFIRM arm (the shorthand return is already honest since H1/H4:
//     needs-clarification with zero requests is the only empty shape there,
//     and it now escalates rather than exits silently).
// ---------------------------------------------------------------------------

describe('L2-FREEFORM-1 H5 — the extracted 7-channel server guard (unit)', () => {
  it('counts EXACTLY the 7 canonical channels (the drift pin server arm, functional)', async () => {
    const { draftProducedNothingOnServer } = await import('./draftArgDiagnostics.js');
    expect(draftProducedNothingOnServer({ success: true, events: [] })).toBe(true);
    expect(draftProducedNothingOnServer({ success: true, events: [] , clarificationRequests: [{ id: 'c1' }] })).toBe(false);
    expect(draftProducedNothingOnServer({ success: true, events: [], error: 'boom' })).toBe(false);
    expect(draftProducedNothingOnServer({ success: true, events: [], labwareAdditions: [{ recordId: 'LBW-x' }] })).toBe(false);
    expect(draftProducedNothingOnServer({ success: true, events: [], labwareRequirements: [{ classCurie: 'CL:24_well_plate' }] })).toBe(false);
    expect(draftProducedNothingOnServer({ success: true, events: [], recordCreations: [{ kind: 'material', name: 'X' }] })).toBe(false);
    expect(draftProducedNothingOnServer({ success: true, events: [], deckLayout: { platformId: 'p', variantId: 'v' } })).toBe(false);
    expect(draftProducedNothingOnServer({ success: true, events: [{ eventId: 'e1' }] })).toBe(false);
    // The client-superset members are NOT server channels (CLIENT ⊇ SERVER
    // — the helper's source counts EXACTLY the 7 canonical channels; the
    // per-predicate-term source assertion lives on the DRIFT PIN side,
    // AiTabPanel.honestWall.test.tsx — SAME-commit discipline).
    expect(draftProducedNothingOnServer({ success: true, events: [], equipmentRequirements: [{ classCurie: 'equipment:water_bath' }] } as never)).toBe(true);
    expect(draftProducedNothingOnServer({ success: true, events: [], proseDeliverable: true } as never)).toBe(true);
  });
});

describe('L2-FREEFORM-1 H5 — assurance CONFIRM empty-bypass (scripted, server-guarded)', () => {
  function confirmOrchestrator(blockers: Array<Record<string, unknown>>) {
    const compileSpy = vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
      events: [
        {
          eventId: 'evt-confirm-1',
          event_type: 'add_material',
          details: { note: 'held by the CONFIRM decision' },
        } as never,
      ],
      labwareAdditions: [],
      unresolvedRefs: [],
      diagnostics: [],
      terminalArtifacts: {
        events: [
          {
            eventId: 'evt-confirm-1',
            event_type: 'add_material',
            details: { note: 'held by the CONFIRM decision' },
          },
        ],
        directives: [],
        gaps: [],
        assurance: {
          score: 0.9125,
          threshold: 0.9,
          decision: 'CONFIRM',
          blockers,
          degraders: [],
        },
      },
      outcome: 'complete' as const,
    }) as never;
    const completeStream = vi.fn(async function* () {});
    const orchestrator = createAgentOrchestrator(
      { complete: vi.fn(), completeStream } as never,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2, draftFlowMode: 'preflight-llm' },
      { store: { get: vi.fn(async () => null) } as never },
    );
    const run = () => orchestrator.run({
      prompt: 'confirm the held draft',
      context: {
        labwares: [],
        eventSummary: 'No events yet.',
        vocabPackId: 'liquid-handling/v1',
        availableVerbs: ['add_material'],
      },
    });
    return { compileSpy, run };
  }

  it('CONFIRM with EMPTY blockers + EMPTY gaps MUST carry an honest error (the empty-bypass is closed)', async () => {
    const { run } = confirmOrchestrator([]);
    const result = await run();
    // The draft is STILL held (the CONFIRM decision stands — the guard never
    // un-holds a proposal) but the empty shape no longer exits silently.
    expect(result.events).toBeUndefined();
    expect(result.assurance?.decision).toBe('CONFIRM');
    expect(result.clarificationRequests).toBeUndefined();
    // RED today: success:true + zero deliverable channels + zero questions.
    expect(result.error).toBeTruthy();
    expect(result.error).toBe(emptyDraftMessage({ truncated: false, hadArguments: true }));
    expect(classifyHonestOutcome(result)).toBe('honest-failure');
  });

  it('CONFIRM with a NON-EMPTY blocker is UNTOUCHED (the hold + card path stays byte-identical)', async () => {
    const { run } = confirmOrchestrator([
      { code: 'NEW_LOCAL_ENTITY', disposition: 'BLOCK', mention: 'clofibrate', message: '"clofibrate" would create a new local vocabulary term — requires confirmation.' },
    ]);
    const result = await run();
    expect(result.events).toBeUndefined();
    expect(result.assurance?.decision).toBe('CONFIRM');
    expect(result.error).toBeUndefined();
    expect((result.clarificationRequests ?? []).some((r) => (r.query ?? '').includes('clofibrate'))).toBe(true);
    expect(classifyHonestOutcome(result)).toBe('cards');
  });
});

describe('L2-FREEFORM-1 H5 — the doc-discussion prose deliverable marker (OQ3)', () => {
  it('a doc-discussion prose answer rides the STRUCTURAL marker — never indistinguishable from an empty draft at the wire', async () => {
    const prose = 'The protocol fixes the substrate at 37 degrees for 20 minutes before seeding.';
    const completeStream = vi.fn(async function* () {
      yield {
        id: 'resp-1',
        choices: [{ index: 0, delta: { role: 'assistant', content: prose }, finish_reason: 'stop' }],
      } as unknown as CompletionResponse;
    });
    const orchestrator = createAgentOrchestrator(
      { complete: vi.fn(), completeStream } as never,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { baseUrl: 'http://test.invalid', model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2 },
      orchestratorDeps(),
    );
    const result = await orchestrator.run({
      prompt: 'What does the document say about substrate handling?',
      surface: 'workspace.deck' as const,
      context: {
        labwares: [],
        eventSummary: 'No events yet.',
        vocabPackId: 'liquid-handling/v1',
        availableVerbs: ['add_material'],
        runId: 'RUN-freeform-h5',
      },
      attachments: [{ name: 'protocol.md', mime_type: 'text/markdown', content: 'Fix the substrate at 37 degrees for 20 minutes before seeding.' }],
    } as unknown as AgentRequest);
    // The prose answer stands (the arm is unchanged: clarificationNeeded
    // carries it; zero events by design).
    expect(result.success).toBe(true);
    expect(result.clarificationNeeded).toBe(prose);
    expect(result.events ?? []).toHaveLength(0);
    // The WIRE guarantee (OQ3): the structural marker rides, so the client
    // predicate can count the prose as a deliverable instead of walling a
    // paragraph of answer as "produced nothing". RED today: absent.
    expect(result.proseDeliverable).toBeTruthy();
  });

  it('a doc-discussion EMPTY answer stays the honest error (the marker never rides a failure)', async () => {
    const completeStream = vi.fn(async function* () {
      yield {
        id: 'resp-1',
        choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: 'stop' }],
      } as unknown as CompletionResponse;
    });
    const orchestrator = createAgentOrchestrator(
      { complete: vi.fn(), completeStream } as never,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { baseUrl: 'http://test.invalid', model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2 },
      orchestratorDeps(),
    );
    const result = await orchestrator.run({
      prompt: 'What does the document say about substrate handling?',
      surface: 'workspace.deck' as const,
      context: {
        labwares: [],
        eventSummary: 'No events yet.',
        vocabPackId: 'liquid-handling/v1',
        availableVerbs: ['add_material'],
        runId: 'RUN-freeform-h5-empty',
      },
      attachments: [{ name: 'protocol.md', mime_type: 'text/markdown', content: 'Fix the substrate at 37 degrees for 20 minutes before seeding.' }],
    } as unknown as AgentRequest);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.proseDeliverable).toBeUndefined();
  });
});
