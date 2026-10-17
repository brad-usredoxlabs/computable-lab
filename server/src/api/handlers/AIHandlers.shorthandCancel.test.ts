/**
 * SH-QC-1-OQ1 — held shorthand intent must clear on cancel (RED-first).
 *
 * The leak (spec §"The leak", verified on trunk 4feb3f50): shorthandChat's
 * `heldIntents` is popped ONLY by the answer-path fold
 * (AgentOrchestrator.ts:1267/:1751 take sites). UI Cancel never reaches the
 * server, so a CANCELLED intent can fold into a LATER clarification answer on
 * the same conversation — the scientist loses authority over what the AI keeps.
 *
 * The fix under test: `clearHeldShorthandIntent(key)` exported from
 * shorthandChat.ts + `POST /ai/shorthand/cancel` (AIHandlers.shorthandCancel,
 * registered beside the sibling /ai/* routes) reusing the EXACT conversationKey
 * derivation the orchestrator uses: deriveContextCacheKey(surface, editorContext)
 * with assistStream's editorContext defaults. Idempotent: clearing an
 * already-clear conversation is a success with cleared:false.
 *
 * Conventions (mirroring AgentOrchestrator.shorthandChat.test.ts): stubbed
 * model + stubbed store, ZERO real model calls, fixtures colocated in
 * src/ai/fixtures. Route-level leg runs the REAL registerRoutes path (the
 * LabSettingsHandlers.routes.test.ts precedent) — a handler that exists but
 * is never registered is the QMS-7 failure class this file must not repeat.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { createAgentOrchestrator } from '../../ai/AgentOrchestrator.js';
import { deriveContextCacheKey } from '../../ai/systemPrompt.js';
import { holdShorthandIntent, takeHeldShorthandIntent } from '../../ai/shorthandChat.js';
import { createResolveSpineFromContext } from '../../resolve/index.js';
import { createLabwareLookup } from '../../ai/compiler/labwareLookup.js';
import { parseScientistIntent } from '../../compiler/scientistIntent/parseScientistIntent.js';
import { AGENT_INTENT_TOOL_NAME } from '../../ai/submitSuggestionTool.js';
import { createAIHandlers } from './AIHandlers.js';
import { registerRoutes } from '../routes.js';
import type { AgentOrchestrator, AgentRequest, CompletionRequest, CompletionResponse } from '../../ai/types.js';

const FIXTURE_DIR = resolve(process.cwd(), 'src', 'ai', 'fixtures');
const ADD_DMEM_YAML = readFileSync(resolve(FIXTURE_DIR, 'shorthand-add-dmem.yaml'), 'utf-8');
const AMBIGUOUS_YAML = readFileSync(resolve(FIXTURE_DIR, 'shorthand-ambiguous-material.yaml'), 'utf-8');

/** Test seeds ONLY (repo rip-out rule: no shorthand/DMEM strings in src/). */
const SEED_RECORDS = [
  {
    recordId: 'LAB-plate-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
    payload: { kind: 'labware', name: 'Plate', title: 'Plate', synonyms: ['plate'] },
  },
  {
    recordId: 'MAT-test-material-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'Test Reagent', title: 'Test Reagent', synonyms: ['test reagent'] },
  },
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

/** Scripted stub: yields one queued assistant turn per completeStream call. */
function stubModel(responses: Array<Record<string, unknown>>) {
  let call = 0;
  const captured: CompletionRequest[] = [];
  const completeStream = vi.fn(async function* (request: CompletionRequest) {
    captured.push(request);
    const spec = responses[Math.min(call, responses.length - 1)]!;
    call += 1;
    const delta: Record<string, unknown> = { role: 'assistant' };
    if (typeof spec.content === 'string') delta.content = spec.content;
    if (Array.isArray(spec.toolCalls)) {
      delta.tool_calls = spec.toolCalls.map((tc, i) => ({
        index: i,
        id: `call-${call}-${i}`,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      }));
    }
    const chunk = {
      id: `resp-${call}`,
      choices: [{
        index: 0,
        delta,
        finish_reason: Array.isArray(spec.toolCalls) ? 'tool_calls' : 'stop',
      }],
    } as unknown as CompletionResponse;
    yield chunk;
  });
  return {
    client: { complete: vi.fn(), completeStream },
    captured,
    callCount: () => completeStream.mock.calls.length,
  };
}

function shorthandCall(yaml: string) {
  return { name: AGENT_INTENT_TOOL_NAME, args: { intent: 'event_shorthand', shorthand: yaml } };
}

/** One RUN per test (unique runId ⇒ unique conversationKey ⇒ no cross-test bleed). */
function runRequest(runId: string): AgentRequest {
  return {
    prompt: 'add 100 uL of test reagent to A1:A12',
    surface: 'workspace.deck',
    forceDraftTool: true,
    context: {
      labwares: [{ labwareId: 'LAB-plate-1', labwareType: 'plate', name: 'Plate' }],
      eventSummary: 'No events yet.',
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['add_material'],
      runId,
    },
  };
}

function heldFixture() {
  return {
    yaml: ADD_DMEM_YAML,
    doc: parseScientistIntent(ADD_DMEM_YAML),
    clarifications: [],
  };
}

function mockReply() {
  return {
    status: vi.fn(),
    send: vi.fn(),
    raw: { writeHead: vi.fn(), write: vi.fn(), end: vi.fn() },
  } as unknown as FastifyReply;
}

function noopOrchestrator() {
  return { run: vi.fn() } as unknown as AgentOrchestrator;
}

/** Minimal handler stubs for the unconditional registerRoutes registrations
 *  (the LabSettingsHandlers.routes.test.ts precedent). */
function stubRouteOptions() {
  const noop = async () => ({});
  return {
    recordHandlers: {
      listRecords: noop, listRevisions: noop, draftCopy: noop, acceptGraph: noop,
      getRecord: noop, createRecord: noop, updateRecord: noop, deleteRecord: noop,
      listClaims: noop, checkClaimDuplicates: noop,
    } as never,
    schemaHandlers: { listSchemas: noop, getSchema: noop, getSchemaByPath: noop } as never,
    validationHandlers: { validate: noop, lint: noop, validateFull: noop } as never,
    schemaCount: () => 0,
    ruleCount: () => 0,
  };
}

describe('SH-QC-1-OQ1 — clear held shorthand intent on cancel', () => {
  it('R1: cancel clears the held intent for the conversation — take after cancel is null', async () => {
    const RUN = runRequest('RUN-shqcoq1-r1');
    const key = deriveContextCacheKey(RUN.surface, RUN.context);
    holdShorthandIntent(key, heldFixture());

    const handlers = createAIHandlers(noopOrchestrator());
    const reply = mockReply();
    const res = await handlers.shorthandCancel(
      { body: { surface: RUN.surface, context: RUN.context } } as unknown as FastifyRequest<{ Body: unknown }>,
      reply,
    );
    expect(res).toEqual({ cleared: true });
    // The hold is GONE (not merely un-taken): the destructive take sees nothing.
    expect(takeHeldShorthandIntent(key)).toBeNull();
  });

  it('R1-route: POST /ai/shorthand/cancel is REGISTERED on the shipped route table (RED baseline: 404)', async () => {
    const RUN = runRequest('RUN-shqcoq1-r1-route');
    const key = deriveContextCacheKey(RUN.surface, RUN.context);
    holdShorthandIntent(key, heldFixture());

    const app = Fastify();
    await app.register(async (instance) => {
      registerRoutes(instance, {
        ...stubRouteOptions(),
        aiHandlers: createAIHandlers(noopOrchestrator()),
      });
    }, { prefix: '/api' });
    await app.ready();

    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ai/shorthand/cancel',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ surface: RUN.surface, context: RUN.context }),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ cleared: true });
      expect(takeHeldShorthandIntent(key)).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('R2 leak proof: cancel between a needs-clarification turn and a later answer — the answer does NOT fold the cancelled intent', async () => {
    const RUN = runRequest('RUN-shqcoq1-r2');
    const model = stubModel([
      { toolCalls: [shorthandCall(AMBIGUOUS_YAML)] },
      { toolCalls: [shorthandCall(ADD_DMEM_YAML)] },
    ]);
    const orchestrator = createAgentOrchestrator(
      model.client,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2 },
      orchestratorDeps(),
    );

    // Turn 1: a REAL needs-clarification compile holds the intent.
    const first = await orchestrator.run({ ...RUN, prompt: 'add 50 uL of mystery goop to A1' });
    expect(first.clarificationRequests?.length).toBeGreaterThan(0);
    expect(model.callCount()).toBe(1);

    // The scientist CANCELS: the cancel leg reaches the server.
    const handlers = createAIHandlers(orchestrator);
    const res = await handlers.shorthandCancel(
      { body: { surface: RUN.surface, context: RUN.context } } as unknown as FastifyRequest<{ Body: unknown }>,
      mockReply(),
    );
    expect(res).toEqual({ cleared: true });

    // Turn 2: a clarification answer on the SAME conversation. With the hold
    // cleared it behaves as if nothing was ever held: the model path runs
    // (NO deterministic fold, NO held-document re-extraction block).
    const second = await orchestrator.run({
      ...RUN,
      prompt: 'the test reagent',
      clarificationAnswers: [{ requestId: first.clarificationRequests![0].id, label: 'Test Reagent' }],
    });
    expect(model.callCount()).toBe(2);
    const secondMessages = JSON.stringify(model.captured[1]!.messages);
    expect(secondMessages).not.toContain('CLARIFICATION ANSWERS for your previous shorthand document');
    expect(secondMessages).not.toContain('Held document:');
    expect(second.success).toBe(true);
  });

  it('R3: cancel is idempotent and conversation-scoped — unknown/cleared conversation is cleared:false, siblings untouched', async () => {
    const RUN = runRequest('RUN-shqcoq1-r3');
    const contextA = { ...RUN.context, runId: 'RUN-shqcoq1-r3-a' };
    const contextB = { ...RUN.context, runId: 'RUN-shqcoq1-r3-b' };
    const keyA = deriveContextCacheKey(RUN.surface, contextA);
    const keyB = deriveContextCacheKey(RUN.surface, contextB);
    holdShorthandIntent(keyA, heldFixture());
    holdShorthandIntent(keyB, heldFixture());

    const handlers = createAIHandlers(noopOrchestrator());
    const cancelFor = (context: Record<string, unknown>) =>
      handlers.shorthandCancel(
        { body: { surface: RUN.surface, context } } as unknown as FastifyRequest<{ Body: unknown }>,
        mockReply(),
      );

    expect(await cancelFor(contextA)).toEqual({ cleared: true });
    // Idempotent: a second cancel on the same conversation SUCCEEDS with cleared:false.
    expect(await cancelFor(contextA)).toEqual({ cleared: false });
    // Unknown conversation: cleared:false, no throw.
    expect(await cancelFor({ ...RUN.context, runId: 'RUN-shqcoq1-r3-never-held' })).toEqual({ cleared: false });
    // The sibling conversation is untouched — cancel is never a broadcast clear.
    expect(takeHeldShorthandIntent(keyB)).not.toBeNull();
  });

  it('body validation matches the sibling /ai/* INVALID_REQUEST shape', async () => {
    const handlers = createAIHandlers(noopOrchestrator());
    const reply = mockReply();
    const res = await handlers.shorthandCancel(
      { body: {} } as unknown as FastifyRequest<{ Body: unknown }>,
      reply,
    );
    expect(reply.status).toHaveBeenCalledWith(400);
    expect(res).toEqual({ error: 'INVALID_REQUEST', message: 'context is required' });
  });

  it('R4 regression pin: WITHOUT a cancel the answer-path fold still takes the held intent (zero model calls)', async () => {
    const RUN = runRequest('RUN-shqcoq1-r4');
    const model = stubModel([{ toolCalls: [shorthandCall(AMBIGUOUS_YAML)] }]);
    const orchestrator = createAgentOrchestrator(
      model.client,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2 },
      orchestratorDeps(),
    );
    const first = await orchestrator.run({ ...RUN, prompt: 'add 50 uL of mystery goop to A1' });
    expect(first.clarificationRequests?.length).toBeGreaterThan(0);

    const second = await orchestrator.run({
      ...RUN,
      prompt: 'the test reagent',
      clarificationAnswers: [{
        requestId: first.clarificationRequests![0].id,
        label: 'Test Reagent',
        ref: { id: 'MAT-test-material-1', kind: 'material' },
      }],
    });
    // The mandatory deterministic fold arm is UNTOUCHED by this item: the held
    // intent (never cancelled) folds with ZERO model calls.
    expect(model.callCount()).toBe(1);
    expect(second.success).toBe(true);
    expect(second.events?.length ?? 0).toBeGreaterThan(0);
  });
});
