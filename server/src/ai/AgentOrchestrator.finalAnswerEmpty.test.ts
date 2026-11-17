/**
 * L2-P1-EMPTY-TURN-CARD-1 / unit u1finalsite — the FINAL-ANSWER exit must not
 * pass an empty draft off as success.
 *
 * The one silent-success site the "draft produced nothing" guard's own doc
 * comment never covered: when the model returns NO tool call, the run computes
 * `result` from parseAgentFinalResponse and, for a JSON body with an empty
 * `events` array, returns { success: true, events: [] } — the client's only
 * surviving statement is "No events generated." This pins that exit: an empty
 * final answer is an honest failure naming the OBSERVED cause (the model
 * answered without calling the draft tool), and every legitimate deliverable
 * shape is UNCHANGED (still success:true, no error).
 *
 * Scripted-driver idiom: AgentOrchestrator.freeformLegs.test.ts (stubModel /
 * createAgentOrchestrator / scripted completeStream). This file's driver emits
 * a CONTENT-ONLY assistant message (no tool_calls, finish_reason 'stop') — the
 * H5 doc-discussion inline completeStream idiom, generalized — because the
 * final-answer exit is the one site reached with NO tool call. To land there
 * the request uses forceDraftTool:false (the forceDraftTool-gated recovery
 * arms all require it true) and no attachments (so isDocDiscussionTurn is
 * false → the parseAgentFinalResponse arm, not the doc-discussion prose arm).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { emptyDraftMessage } from './draftArgDiagnostics.js';
import { createResolveSpineFromContext } from '../resolve/index.js';
import { createLabwareLookup } from './compiler/labwareLookup.js';
import { AGENT_INTENT_TOOL_NAME } from './submitSuggestionTool.js';
import type { AgentRequest, CompletionResponse } from './types.js';

// L2-P1-EMPTY-TURN-CARD-2 u2mentionfix (FIX-3): the SHORTHAND (arm-2) backstop
// at AgentOrchestrator.ts:3574-3589 had no pin (advc c1 mutation M2). The
// deterministic compile is stubbed to the ONE shape the guard exists for; the
// mapper, guard and absence probe are the shipped code path.
vi.mock('./shorthandChat.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./shorthandChat.js')>();
  return {
    ...actual,
    compileShorthandDeterministically: vi.fn(async () => ({
      outcome: 'complete',
      diagnostics: [],
      clarifications: [],
      terminalArtifacts: { events: [], gaps: [], directives: [], labwareAdditions: [] },
    })),
  };
});

const ADD_DMEM_YAML = readFileSync(
  resolve(process.cwd(), 'src', 'ai', 'fixtures', 'shorthand-add-dmem.yaml'),
  'utf-8',
);

// ---------------------------------------------------------------------------
// Shared harness (the freeformLegs.test.ts idiom, content-only variant)
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

/** One assistant message, content ONLY (no tool_calls), the final-answer shape. */
function finalAnswerModel(content: string, finishReason = 'stop') {
  const completeStream = vi.fn(async function* () {
    yield {
      id: 'resp-1',
      choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: finishReason }],
    } as unknown as CompletionResponse;
  });
  return { client: { complete: vi.fn(), completeStream } as never };
}

function finalAnswerRequest(): AgentRequest {
  return {
    prompt: 'Prepare 96 wells with the screening compound at 10 uM.',
    surface: 'workspace.deck' as const,
    forceDraftTool: false,
    context: {
      labwares: [],
      eventSummary: 'No events yet.',
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['add_material'],
      runId: 'RUN-final-answer-empty',
    },
  } as unknown as AgentRequest;
}

async function runFinalAnswer(
  content: string,
  finishReason = 'stop',
  prompt?: string,
  opts: { draftFlowMode?: 'forced-tool' | 'preflight-llm' | 'preflight-deterministic'; forceDraftTool?: boolean } = {},
) {
  const model = finalAnswerModel(content, finishReason);
  const orchestrator = createAgentOrchestrator(
    model.client,
    { getToolDefinitions: () => [], executeTool: vi.fn() },
    { baseUrl: 'http://test.invalid', model: 'test-model', temperature: 0.1, maxTokens: 512 },
    { maxTurns: 2, ...(opts.draftFlowMode ? { draftFlowMode: opts.draftFlowMode } : {}) },
    orchestratorDeps(),
  );
  const request = finalAnswerRequest();
  if (prompt !== undefined) request.prompt = prompt;
  if (opts.forceDraftTool !== undefined) request.forceDraftTool = opts.forceDraftTool;
  return orchestrator.run(request);
}

// ---------------------------------------------------------------------------
// AC1 — the silent final-answer empty exit becomes an honest failure
// ---------------------------------------------------------------------------

describe('L2-P1-EMPTY-TURN-CARD-1 u1finalsite — final-answer empty exit', () => {
  it('AC1: events:[] + no other deliverable + no notes is an honest failure naming the observed cause', async () => {
    const result = await runFinalAnswer('{"events":[],"notes":[]}');
    // RED today: this exit returns success:true with zero events (silent).
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
    expect((result.error ?? '').length).toBeGreaterThan(0);
    // names the OBSERVED cause — the model answered without calling the draft
    // tool and finished finish_reason "stop" — not an invented/guessed cause.
    expect(result.error).toContain('without calling the draft tool');
    expect(result.error).toContain('finish_reason "stop"');
    // the error channel (not a new result field), and no new message vocabulary
    // — reuses the shipped emptyDraftMessage family.
    expect(result.error).toBe(
      emptyDraftMessage({ truncated: false, hadArguments: false, noToolCall: true }),
    );
    // absent-or-empty events (the turn produced no draft).
    expect(result.events ?? []).toHaveLength(0);
  });

  it('AC1b: a truncated (finish_reason "length") no-tool-call answer names the output limit, not a stop', async () => {
    const result = await runFinalAnswer('{"events":[]}', 'length');
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
    // the observed cause is the output-limit cutoff — the noToolCall "stop"
    // sentence must NOT fire on a length finish (never invent the cause).
    expect(result.error).toBe(emptyDraftMessage({ truncated: true, hadArguments: false, noToolCall: true }));
    expect(result.events ?? []).toHaveLength(0);
  });

  // ---------------------------------------------------------------------
  // AC2 — every legitimate deliverable shape is UNCHANGED (success, no error)
  // ---------------------------------------------------------------------

  it('AC2: a real draft (events>0) is unchanged — success, no error', async () => {
    const result = await runFinalAnswer('{"events":[{"eventId":"e1","labwareId":"lw-a"}],"notes":[]}');
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect((result.events ?? []).length).toBe(1);
  });

  it('AC2: a clarification (clarificationRequests>0) is unchanged — success, no error', async () => {
    const result = await runFinalAnswer(
      '{"events":[],"clarification":{"prompt":"Which compound to dispense?","entityType":"material","options":[{"id":"comp-1","label":"Compound A"},{"id":"comp-2","label":"Compound B"}]},"notes":[]}',
    );
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect((result.clarificationRequests ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('AC2: labware additions (labwareAdditions>0) are unchanged — success, no error', async () => {
    const result = await runFinalAnswer(
      '{"events":[],"labwareAdditions":[{"recordId":"MAT-dmem-1","reason":"medium required"}],"notes":[]}',
    );
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect((result.labwareAdditions ?? []).length).toBe(1);
  });

  it('AC2: a notes-only answer-intent turn is a legitimate deliverable — UNCHANGED, not errored', async () => {
    const result = await runFinalAnswer(
      '{"events":[],"notes":["I need the well count and the plate type before I can draft this."]}',
    );
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect((result.notes ?? []).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// L2-P1-EMPTY-TURN-CARD-1 (u2fix, advc defect 1 — AC2): a turn that delivered
// STREAMED assistant text must show no honest-wall error and stay byte-identical
// to pre-guard behavior.
//
// Mechanism: on a draftFlowMode where the stream loop streams text to the
// person (the text_delta fork at :2526 is declared by `draftFlowMode !==
// 'forced-tool'`), the model's full assistant body — including a JSON
// deliverable body like {"events":[]} — is DELIVERED to the person as streamed
// text. Pre-guard behavior for that no-tool-call turn was success:true,
// events:[] (the client's "No events generated"); the u1finalsite guard
// added an honest-wall error on top of the delivered text — the AC2
// violation. The guard now gates on "no non-empty assistant text this run"
// (the content carrier of the streamed body; the fork is the SAME declared
// draftFlowMode condition as the stream loop's — not re-derived), so a
// turn whose text reached the person is byte-identical to pre-guard. On the
// shipped config (forced-tool, the :2526 fork holds) nothing is streamed, so
// the identical JSON-body turn still reaches the wall (the AC1 leg pins it) —
// one authority, no second predicate.
// ---------------------------------------------------------------------------

describe('L2-P1-EMPTY-TURN-CARD-1 u2fix — AC2: streamed-text turns are never honest-walled', () => {
  it('AC2: a streamed JSON-body answer on a streaming mode is UNCHANGED (pre-guard bytes) — success, no error, no card', async () => {
    const body = '{"events":[],"notes":[]}';
    const result = await runFinalAnswer(
      body,
      'stop',
      undefined,
      { draftFlowMode: 'preflight-llm' },
    );
    // NOT the honest wall: the body above was streamed to the person.
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    // byte-identical to pre-guard behavior (the pre-u1finalsite no-tool-call
    // final-answer shape: parsed deliverables only):
    expect(result.events ?? []).toHaveLength(0);
    expect(result.notes ?? []).toHaveLength(0);
    // the guard body never ran on this turn (one authority — the card is
    // attached ONLY by the guard; skipped here, key absent):
    expect(result.clarificationRequests ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// L2-P1-EMPTY-TURN-CARD-2 (u1emptycard) — the FINAL-ANSWER arm attaches the
// NAMED-ABSENCE card beside the named-cause error. New describe only: the
// CARD-1 legs above are untouched (their prompt names no labware noun, so the
// helper returns [] and their results stay byte-identical).
// ---------------------------------------------------------------------------

describe('L2-P1-EMPTY-TURN-CARD-2 u1emptycard — the final-answer arm attaches the named-absence card', () => {
  const MANIFEST =
    'Place a Thermo Optical-Quality Imaging Plate, 384-well, black-walled, ' +
    'clear bottom (catalog number A58941) on the deck.';

  it('arm: a manifest noun miss rides clarificationRequests EXACTLY ONCE (one absence request)', async () => {
    const result = await runFinalAnswer('{\"events\":[]}', 'stop', MANIFEST);
    // The guard's error stays EXACTLY as CARD-1 pinned it (arm unchanged; the
    // card only rides the typed channel beside it).
    expect(result.success).toBe(false);
    expect(result.error).toBe(
      emptyDraftMessage({ truncated: false, hadArguments: false, noToolCall: true }),
    );
    // EXACTLY ONE request (at most one — never one per comma fragment).
    expect(result.clarificationRequests).toHaveLength(1);
    const [request] = result.clarificationRequests!;
    expect(request!.kind).toBe('labware');
    // Mention names the plate phrase (original casing); reason is the SAME
    // server-side absence vocabulary as clarificationRequestsFromAssurance.
    expect(request!.absence?.mention).toContain('Thermo Optical-Quality Imaging Plate');
    expect(request!.absence?.mention).toBe('Thermo Optical-Quality Imaging Plate');
    expect(request!.absence?.reason).toBe(
      `Not in this lab's records: ${request!.absence?.mention}`,
    );
    expect(request!.options).toEqual([]);
    expect(request!.query).toBe(request!.absence?.mention);
    expect(request!.snippet).toBe(request!.absence?.mention);
  });

  it('arm: a noun-less empty turn gets NO card (the key is ABSENT, never undefined)', async () => {
    const result = await runFinalAnswer('{\"events\":[]}');
    expect(result.success).toBe(false);
    expect(result.error).toBe(
      emptyDraftMessage({ truncated: false, hadArguments: false, noToolCall: true }),
    );
    // No labware noun in the turn → the helper returns [] → the conditional
    // spread keeps the key ABSENT (exactOptionalPropertyTypes: never
    // clarificationRequests: undefined / []).
    expect('clarificationRequests' in result).toBe(false);
    expect(result.clarificationRequests).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// L2-P1-EMPTY-TURN-CARD-2 u2mentionfix (FIX-3) — the SHORTHAND arm-2 pin.
// Mutation M2 (advc c1): deleting AgentOrchestrator.ts:3574-3589 left every
// committed suite green. This leg goes RED when that block is deleted.
// ---------------------------------------------------------------------------

const ARM2_MANIFEST =
  'Place a Thermo Optical-Quality Imaging Plate, 384-well, black-walled, ' +
  'clear bottom (catalog number A58941) on the deck.';

/** One assistant turn submitting a shorthand document through the intent tool. */
function shorthandModel(shorthand: string) {
  const completeStream = vi.fn(async function* () {
    yield {
      id: 'resp-sh',
      choices: [{
        index: 0,
        delta: {
          role: 'assistant',
          tool_calls: [{
            index: 0,
            id: 'call-sh-1',
            type: 'function',
            function: {
              name: AGENT_INTENT_TOOL_NAME,
              arguments: JSON.stringify({ intent: 'event_shorthand', shorthand }),
            },
          }],
        },
        finish_reason: 'tool_calls',
      }],
    } as unknown as CompletionResponse;
  });
  return { complete: vi.fn(), completeStream } as never;
}

async function runShorthandTurn(prompt: string) {
  const orchestrator = createAgentOrchestrator(
    shorthandModel(ADD_DMEM_YAML),
    { getToolDefinitions: () => [], executeTool: vi.fn() },
    { baseUrl: 'http://test.invalid', model: 'test-model', temperature: 0.1, maxTokens: 512 },
    { maxTurns: 2 },
    orchestratorDeps(),
  );
  return orchestrator.run({
    prompt,
    surface: 'workspace.deck',
    forceDraftTool: true,
    context: {
      labwares: [],
      eventSummary: 'No events yet.',
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['add_material'],
      runId: 'RUN-arm2-empty',
    },
  } as unknown as AgentRequest);
}

describe('L2-P1-EMPTY-TURN-CARD-2 u2mentionfix — the SHORTHAND arm-2 backstop carries the card', () => {
  it('arm-2: an empty shorthand turn names the absent labware ONCE (the block is load-bearing)', async () => {
    const result = await runShorthandTurn(ARM2_MANIFEST);
    // the shorthand arm hands the turn back with the card as its deliverable
    // (success:true + events:[] + the arm's own honest error sentence).
    expect(result.success).toBe(true);
    expect(result.error).toBe(emptyDraftMessage({ truncated: false, hadArguments: true }));
    expect(result.events ?? []).toEqual([]);
    // …AND the named-absence card beside it — exactly one request.
    // (RED with the arm-2 block deleted: success:true / no error / no card.)
    expect(result.clarificationRequests).toHaveLength(1);
    const [request] = result.clarificationRequests!;
    expect(request!.kind).toBe('labware');
    expect(request!.menuProvider).toBe('/l');
    expect(request!.absence?.mention).toBe('Thermo Optical-Quality Imaging Plate');
    expect(request!.absence?.reason).toBe(
      "Not in this lab's records: Thermo Optical-Quality Imaging Plate",
    );
    expect(request!.options).toEqual([]);
    expect(request!.query).toBe('Thermo Optical-Quality Imaging Plate');
  });
});
