/**
 * REVISE-GHOST-1 FIX RUN 4 — DEFECT (attempt-10 gate, req-2m): the answer-fold
 * SSE stream never terminates.
 *
 * The gate drove the canonical utterance on the run page; the pane went to a
 * 7-card hold, the harness answered 6/7, the deterministic fold RAN
 * (`[agent 4r4leb] shorthand answer folded deterministically ... no model call`,
 * `done shorthand-fold success=true events=0`) — but the fold re-hold (events=0
 * with SURVIVING clarification cards) never landed on the client: the stream
 * request req-2m has ONLY its `incoming` line in backend.log (no `request
 * completed` anywhere), while the canonical turns req-18/req-3n on the SAME
 * route completed normally. The client therefore never receives the terminal
 * frame and the sidebar strands in `updating` with zero controls (the D4
 * never-stuck rule in a third mode: the fold-result arm itself never lands).
 *
 * This file drives the REAL assistStream handler (AIHandlers.assistStream, the
 * exact function routes.ts registers at POST /ai/assist/stream) through a REAL
 * orchestrator + REAL deterministic compile — zero model calls on the fold
 * turn — and asserts the fold-result-with-surviving-cards (events=0) arm:
 *   T1 the stream TERMINATES: a `done` frame is written AND the reply is ended;
 *   T2 the re-hold payload CARRIES the surviving clarifications (the client's
 *      clarifications-needed arm needs result.clarificationRequests non-empty).
 * Conventions: AIHandlers.shorthandCancel.test.ts (stub model + stubbed store,
 * fixtures colocated in src/ai/fixtures, test seeds only).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createAgentOrchestrator } from '../../ai/AgentOrchestrator.js';
import { takeHeldShorthandIntent } from '../../ai/shorthandChat.js';
import { deriveContextCacheKey } from '../../ai/systemPrompt.js';
import { createResolveSpineFromContext } from '../../resolve/index.js';
import { createLabwareLookup } from '../../ai/compiler/labwareLookup.js';
import { AGENT_INTENT_TOOL_NAME } from '../../ai/submitSuggestionTool.js';
import { createAIHandlers, type AssistBody } from './AIHandlers.js';
import type { CompletionRequest, CompletionResponse } from '../../ai/types.js';

const FIXTURE_DIR = resolve(process.cwd(), 'src', 'ai', 'fixtures');
const AMBIGUOUS_YAML = readFileSync(resolve(FIXTURE_DIR, 'shorthand-ambiguous-material.yaml'), 'utf-8');

/** Test seeds ONLY (repo rip-out rule). 'mystery goop' (the fixture's noun)
 *  is deliberately NOT seeded: it bars on every compile, so the fold re-hold
 *  is guaranteed — the exact attempt-10 shape (fold ran, cards survived). */
const SEED_RECORDS = [
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

/** Scripted stub (AIHandlers.shorthandCancel.test.ts shape): one queued
 *  assistant turn per completeStream call; callCount() counts model calls. */
function stubModel(responses: Array<Record<string, unknown>>) {
  let call = 0;
  const captured: CompletionRequest[] = [];
  const completeStream = vi.fn(async function* (request: CompletionRequest) {
    captured.push(request);
    const spec = responses[Math.min(call, responses.length - 1)]!;
    call += 1;
    const delta: Record<string, unknown> = { role: 'assistant' };
    if (Array.isArray(spec.toolCalls)) {
      delta.tool_calls = spec.toolCalls.map((tc, i) => ({
        index: i,
        id: `call-${call}-${i}`,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      }));
    }
    yield {
      id: `resp-${call}`,
      choices: [{ index: 0, delta, finish_reason: Array.isArray(spec.toolCalls) ? 'tool_calls' : 'stop' }],
    } as unknown as CompletionResponse;
  });
  return {
    client: { complete: vi.fn(), completeStream },
    captured,
    callCount: () => completeStream.mock.calls.length,
  };
}

/** One RUN per test (unique runId ⇒ unique conversationKey ⇒ no cross-test bleed). */
function runContext(runId: string): Record<string, unknown> {
  return {
    labwares: [{ labwareId: 'LAB-plate-1', labwareType: 'plate', name: 'Plate' }],
    eventSummary: 'No events yet.',
    vocabPackId: 'liquid-handling/v1',
    availableVerbs: ['add_material'],
    runId,
  };
}

/** A reply that records EVERY frame written to the raw stream and whether the
 *  stream was ended — the terminal-frame witness the gate's req-2m evidence
 *  demands (incoming + done + close, not incoming alone). */
function recordingReply() {
  const frames: string[] = [];
  const raw = {
    writeHead: vi.fn(),
    write: vi.fn((chunk: string) => {
      frames.push(String(chunk));
      return true;
    }),
    end: vi.fn(),
  };
  const reply = {
    status: vi.fn(),
    send: vi.fn(),
    raw,
  } as unknown as FastifyReply;
  return { reply, frames, raw };
}

function assistRequest(body: Record<string, unknown>): FastifyRequest<{ Body: AssistBody }> {
  return {
    body,
    headers: { origin: 'http://localhost:5193' },
    log: { warn: vi.fn() },
  } as unknown as FastifyRequest<{ Body: AssistBody }>;
}

function parseFrames(frames: string[]): Array<Record<string, unknown>> {
  return frames
    .map((f) => f.replace(/^data:\s*/, '').trim())
    .filter((s) => s.length > 0)
    .map((s) => JSON.parse(s) as Record<string, unknown>);
}

describe('REVISE-GHOST-1 fix4 — the answer-fold stream must terminate on the events=0 re-hold arm', () => {
  it('fold re-hold (events=0, surviving cards): assistStream emits the done frame, ends the reply, and the payload carries the surviving clarifications', async () => {
    const RUN_ID = 'RUN-rg1-fix4-terminal';
    const context = runContext(RUN_ID);
    const surface = 'workspace.deck';

    const model = stubModel([
      { toolCalls: [{ name: AGENT_INTENT_TOOL_NAME, args: { intent: 'event_shorthand', shorthand: AMBIGUOUS_YAML } }] },
    ]);
    const orchestrator = createAgentOrchestrator(
      model.client as never,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { model: 'test-model', baseUrl: 'http://test.invalid', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2 },
      orchestratorDeps(),
    );
    const handlers = createAIHandlers(orchestrator);

    // Turn 1 (REAL assistStream): the draft bars on 'mystery goop' → the intent
    // is HELD and the done frame carries the clarification cards.
    const first = recordingReply();
    await handlers.assistStream(assistRequest({
      prompt: 'add 50 uL of mystery goop to A1',
      surface,
      context,
    }), first.reply);

    const firstFrames = parseFrames(first.frames);
    const firstDone = firstFrames.find((f) => f.type === 'done');
    expect(firstDone, `no done frame on the draft turn (frames: ${first.frames.join('||')})`).toBeDefined();
    const firstResult = firstDone!.result as Record<string, unknown>;
    const requests = (firstResult.clarificationRequests ?? []) as Array<{ id: string }>;
    expect(requests.length).toBeGreaterThan(0);
    expect(first.raw.end).toHaveBeenCalledTimes(1);
    // NOTE: do NOT takeHeldShorthandIntent here — the take is destructive and
    // would empty the hold the fold turn needs. The fold turn's own take is
    // the witness (zero model calls below prove the deterministic fold ran).

    // Turn 2 (REAL assistStream): the answer fold. The chosen label is NOT in
    // the store, so the folded recompile STILL bars the slot → survivingFacts>0
    // → shorthandResultFromCompile's needs-clarification arm → events=0 with
    // clarificationRequests non-empty — the exact req-2m shape.
    const second = recordingReply();
    await handlers.assistStream(assistRequest({
      prompt: 'the mystery goop is the unknown reagent',
      surface,
      context,
      clarificationAnswers: [{ requestId: requests[0]!.id, label: 'Zeta Unknown' }],
    }), second.reply);

    // T1: the fold turn TERMINATES — a done frame was written AND the reply
    // was ended. (Gate evidence: req-2m never completed; the client never got
    // this frame and stranded in `updating`.)
    const secondFrames = parseFrames(second.frames);
    const secondDone = secondFrames.find((f) => f.type === 'done');
    expect(
      secondDone,
      `fold re-hold emitted NO done frame — the stream never terminates (frames: ${second.frames.join('||')})`,
    ).toBeDefined();
    expect(second.raw.end, 'fold re-hold never ended the SSE reply').toHaveBeenCalledTimes(1);

    // T2: the re-hold payload CARRIES the surviving clarifications so the
    // client's clarifications-needed arm can render the cards.
    const secondResult = secondDone!.result as Record<string, unknown>;
    expect(secondResult.success).toBe(true);
    expect((secondResult.events as unknown[]) ?? []).toHaveLength(0);
    const surviving = (secondResult.clarificationRequests ?? []) as Array<Record<string, unknown>>;
    expect(surviving.length, 'fold re-hold payload carries no clarificationRequests').toBeGreaterThan(0);
    // The re-held document rides the payload too (the clarifying arm shows it
    // verbatim above the questions).
    expect(typeof secondResult.shorthand).toBe('string');

    // Zero model calls on the fold turn (the deterministic fold consumed it).
    expect(model.callCount()).toBe(1);
  });
});
