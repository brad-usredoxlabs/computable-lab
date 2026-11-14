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
import { describe, expect, it, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { emptyDraftMessage } from './draftArgDiagnostics.js';
import { createResolveSpineFromContext } from '../resolve/index.js';
import { createLabwareLookup } from './compiler/labwareLookup.js';
import type { AgentRequest, CompletionResponse } from './types.js';

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

async function runFinalAnswer(content: string, finishReason = 'stop', prompt?: string) {
  const model = finalAnswerModel(content, finishReason);
  const orchestrator = createAgentOrchestrator(
    model.client,
    { getToolDefinitions: () => [], executeTool: vi.fn() },
    { baseUrl: 'http://test.invalid', model: 'test-model', temperature: 0.1, maxTokens: 512 },
    { maxTurns: 2 },
    orchestratorDeps(),
  );
  const request = finalAnswerRequest();
  if (prompt !== undefined) request.prompt = prompt;
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
