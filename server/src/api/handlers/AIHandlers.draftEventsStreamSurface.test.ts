/**
 * L2-INTENTID-REDRAFT-1 (leg B) — the LIVE event-editor chat path must carry a
 * `surface` all the way to the orchestrator.
 *
 * ROOT CAUSE (verified first-hand, see report legB-l2t1415 §1): the live
 * event-editor chat posts to POST /api/ai/draft-events/stream and that handler
 * (createAIHandlers().draftEventsStream — the route's bound implementation)
 * NEVER read a `surface` field from the body and NEVER passed one to
 * orchestrator.run. The orchestrator's fallback
 * `const surfaceName = surface ?? 'default'` (AgentOrchestrator.ts:1288) then
 * made `surfaceDraftsShorthand('default')` FALSE (the DATA list
 * config/drafting/shorthand-drafting.yaml:27 is `[run-workspace, event-editor]`),
 * so on the live event-editor path the ENTIRE shorthand answer arm — the
 * deterministic clarification-answer fold, the identity carry/fallback capture,
 * the repeat-ask ledger, the event_graph->shorthand refusal and the no-model
 * wall — was silently dead. The ANSWER-CHANNEL-1 yaml fix repaired the DATA
 * list but this endpoint never passed a surface for the DATA to match against.
 *
 * This test drives the REAL handler (same idiom as
 * AIHandlers.deckStreamError.test.ts) with an orchestrator STUB whose run()
 * is a spy, and asserts:
 *   1. a body carrying surface 'event-editor' + clarificationAnswers makes
 *      run() RECEIVE surface='event-editor' AND the clarificationAnswers —
 *      i.e. the surface is wired through to the orchestrator. RED on base
 *      (the handler dropped surface), GREEN after the wiring.
 *   2. a body WITHOUT surface leaves run()'s args byte-identical to today:
 *      no `surface` key present at all (conditional spread — absent, never
 *      undefined), same key set as the pre-fix handler produced. This is the
 *      legacy-behaviour guardrail and is GREEN on base by design.
 */
import { describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createAIHandlers } from './AIHandlers.js';
import type { AgentOrchestrator } from '../../ai/types.js';

function baseContext() {
  return {
    eventGraphId: 'EVG-legB-fixture',
    runId: 'RUN-2026-11-01-legB',
    platformId: 'biomix-2',
    variantId: 'biomix-2/1',
    vocabPackId: 'liquid-handling/v1',
    editorMode: 'deck',
  };
}

function mockReply() {
  const write = vi.fn();
  return {
    status: vi.fn(),
    send: vi.fn(),
    raw: { writeHead: vi.fn(), write, end: vi.fn() },
    _write: write,
  } as unknown as FastifyReply & { _write: ReturnType<typeof vi.fn> };
}

/** A JSON-branch request (content-type application/json) carrying the given body. */
function jsonRequest(body: unknown) {
  const error = vi.fn();
  return {
    body,
    headers: { 'content-type': 'application/json' },
    log: { error, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
    _error: error,
  } as unknown as FastifyRequest & { _error: ReturnType<typeof vi.fn> };
}

function stubOrchestrator() {
  const run = vi.fn().mockResolvedValue({ events: [], notes: [] });
  return { orchestrator: { run } as unknown as AgentOrchestrator, run };
}

/** Strip the onEvent callback so we compare the DATA args the handler built. */
function dataArgs(args: Record<string, unknown>) {
  const { onEvent, ...rest } = args;
  void onEvent;
  return rest;
}

describe('draftEventsStream — the event-editor surface is wired to the orchestrator (leg B)', () => {
  it('passes surface + clarificationAnswers to run() when the body carries them', async () => {
    const { orchestrator, run } = stubOrchestrator();
    const handlers = createAIHandlers(orchestrator);

    const clarificationAnswers = [
      { requestId: 'unresolved-c-1', label: 'Which reagent?', value: 'Trypsin', ref: {} },
    ];
    const body = {
      prompt: 'add trypsin to dmem with fbs',
      context: baseContext(),
      history: [],
      surface: 'event-editor',
      clarificationAnswers,
    };

    await handlers.draftEventsStream(jsonRequest(body), mockReply());

    expect(run).toHaveBeenCalledTimes(1);
    const args = run.mock.calls[0][0] as Record<string, unknown>;

    // THE DEFECT: on base the handler dropped `surface` entirely, so this is
    // the RED assertion (run() received no surface at all).
    expect('surface' in args).toBe(true);
    expect(args.surface).toBe('event-editor');
    // The ANSWER-CHANNEL answers ride alongside the surface (the live answer
    // turn is exactly what the dead arm was supposed to serve).
    expect(args.clarificationAnswers).toEqual(clarificationAnswers);
    // The prompt/context are unchanged (no other behaviour shift).
    expect(args.prompt).toBe('add trypsin to dmem with fbs');
    expect(args.context).toEqual(baseContext());
  });

  it('leaves run() args byte-identical to today when the body has NO surface', async () => {
    const { orchestrator, run } = stubOrchestrator();
    const handlers = createAIHandlers(orchestrator);

    // A legacy event-editor body exactly as it is sent today: no surface field.
    const body = {
      prompt: 'add trypsin to dmem',
      context: baseContext(),
      history: [],
    };

    await handlers.draftEventsStream(jsonRequest(body), mockReply());

    expect(run).toHaveBeenCalledTimes(1);
    const args = run.mock.calls[0][0] as Record<string, unknown>;

    // Byte-identical legacy behaviour: the surface key is ABSENT (not
    // `surface: undefined`) — conditional-spread discipline under
    // exactOptionalPropertyTypes. And the key set matches exactly what the
    // pre-fix handler produced for this body (history:[] is truthy so it
    // rides; forceDraftTool defaults to true because deterministicOnly is
    // absent).
    expect('surface' in args).toBe(false);
    expect(dataArgs(args)).toEqual({
      prompt: 'add trypsin to dmem',
      context: baseContext(),
      history: [],
      forceDraftTool: true,
    });
    // And no stray undefined-valued surface leaked into the serialized args.
    expect(JSON.stringify(args)).not.toContain('surface');
  });
});
