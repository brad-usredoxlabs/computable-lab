/**
 * L2-DEGEN-RETRY-1 — degenerate forced-tool-call defense (RED-first).
 *
 * The mechanical degenerate signature: a forced-tool draft turn that ends
 * finish=stop with EMPTY content and ZERO tool calls. Upstream degeneration is
 * stochastic (the x6 regate-4 trail: the identical prompt returned a valid
 * tool call seconds later), so the harness re-issues the SAME request exactly
 * once — WITHOUT pushing the dead assistant message into `messages` (an empty
 * assistant turn riding back is the pattern-completion fuel the echo guards
 * fight). If the retry is ALSO degenerate, the run returns the honest class
 * text (names the class, never blames the wording) and skips the slow
 * coercion call entirely (call count pinned at 2).
 *
 * Contract under test (the 4 legs, spec §Mechanical floor):
 *   1. recovered-on-retry: stream 1 degenerate, stream 2 a valid
 *      agent_intent tool call -> the turn completes with a proposal; the
 *      second request re-issues the SAME messages UNMUTATED (deep-compare);
 *      the recovery log line `degenerate-response recovered on retry`
 *      appears.
 *   2. double-degenerate: both streams degenerate -> completeStream called
 *      EXACTLY twice (one retry budget), `complete` called ZERO times (the
 *      skip-coercion ruling), success:false, the error names the degenerate
 *      class and does NOT contain "rephrasing", and an `error` event rides
 *      the channel.
 *   3. genuine-empty-args keeps the OLD text: the 3-branch contract is
 *      EXTENDED, not replaced — the branch-3 `emptyDraftMessage` byte-pin
 *      (mirrors AgentOrchestrator.freeformLegs.test.ts:725) stays green.
 *   4. non-degenerate zero extra calls: a normal native tool-call turn makes
 *      exactly ONE completeStream call and ZERO complete calls (the
 *      signature check is side-effect-free until it matches).
 *
 * OQ1 disposition (verified first-hand at trunk 56829cf5): NO existing
 * compliance pin asserts a nudge on an EMPTY-content turn — the
 * SH-QC-1S/HARNESS-SEQ-2 legs (AgentOrchestrator.repeatEcho.test.ts P1/P2/P3)
 * all stub 86-char NON-EMPTY echo prose (contentLen=86, backend.log:1462), so
 * the empty-content signature's preemption of the nudge arm does not collide
 * with any existing pin.
 *
 * Stub shape: AgentOrchestrator.protocolEditRecovery.test.ts:57-79
 * (async-generator completeStream + complete spy); tool-call stream deltas
 * follow the orchestrator accumulator shape (delta.tool_calls index/id/
 * function fragments). Legs run on a surface the compliance DATA does not
 * list, with the policy path pointed at a nonexistent file (silent-off), so
 * the degenerate arm is the only arm in play.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { AGENT_INTENT_TOOL_NAME } from './submitSuggestionTool.js';
import * as runChatbotCompileModule from './runChatbotCompile.js';
import { emptyDraftMessage } from './draftArgDiagnostics.js';
import { createResolveSpineFromContext } from '../resolve/index.js';
import { createLabwareLookup } from './compiler/labwareLookup.js';
import type { AgentEvent, CompletionRequest, InferenceClient } from './types.js';

// The task's verbatim sentence — pinned here so a rewording is a RED, not a
// silent drift. Must NOT contain "rephrasing".
const DEGENERATE_CLASS_TEXT =
  'the AI provider returned a degenerate response (no tool call, no content) twice — ' +
  'this is not your wording; the request was fine. Retry, or the turn may be re-routed.';

const FIXTURE_DIR = resolve(process.cwd(), 'src', 'ai', 'fixtures');
const ADD_DMEM_YAML = readFileSync(resolve(FIXTURE_DIR, 'shorthand-add-dmem.yaml'), 'utf-8');

/** Test seeds ONLY (repo rip-out rule: no shorthand/DMEM strings in src/).
 *  The labware seed mirrors the repeatEcho harness: the shorthand fixture
 *  names `labware: plate`, so the context must carry a bindable plate or the
 *  deterministic compiler asks WHICH plate (clarification, zero events). */
const SEED_RECORDS = [
  {
    recordId: 'LAB-plate-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
    payload: { kind: 'labware', name: 'Plate', title: 'Plate', synonyms: ['plate'] },
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
    create: vi.fn(async () => { throw new Error('degenerate-retry turn must NEVER reach store.create'); }),
    update: vi.fn(async () => { throw new Error('degenerate-retry turn must NEVER reach store.update'); }),
    delete: vi.fn(async () => { throw new Error('degenerate-retry turn must NEVER reach store.delete'); }),
  };
}

function orchestratorDeps() {
  const store = mockStore();
  return {
    store,
    resolveSpine: createResolveSpineFromContext({ store: store as never }) as never,
    searchLabwareByHint: createLabwareLookup(store as never) as never,
  };
}

/**
 * Scripted stub (the repeatEcho harness shape): one queued assistant turn per
 * completeStream call, clamped to the last spec. A spec WITHOUT a `content`
 * key and WITHOUT `toolCalls` is the DEGENERATE shape (empty content + no
 * tool_calls + finish=stop). `complete` (the coercion slow path) is a plain
 * spy whose body is set per leg (legs 1/2 expect ZERO calls).
 */
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
        function: { name: (tc as { name: string }).name, arguments: JSON.stringify((tc as { args: unknown }).args) },
      }));
    }
    yield {
      id: `resp-${call}`,
      choices: [{
        index: 0,
        delta,
        finish_reason: Array.isArray(spec.toolCalls) ? 'tool_calls' : 'stop',
      }],
    } as unknown as import('./types.js').CompletionResponse;
  });
  const complete = vi.fn(async (_request: CompletionRequest) => {
    throw new Error('degenerate-retry legs must NEVER reach the slow coercion call');
  });
  return {
    client: { complete, completeStream } as InferenceClient,
    captured,
    callCount: () => completeStream.mock.calls.length,
    completeCalls: () => complete.mock.calls.length,
  };
}

const RECOVERY_LOG_LINE = 'degenerate-response recovered on retry';

async function runDegenerateTurn(
  model: ReturnType<typeof stubModel>,
  overrides: { agentConfig?: Record<string, unknown> } = {},
) {
  const compileSpy = vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
    events: [], labwareAdditions: [], unresolvedRefs: [], diagnostics: [],
    terminalArtifacts: { events: [], directives: [], gaps: [] }, outcome: 'error',
    passOutputs: [],
  } as never);
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const events: AgentEvent[] = [];
  const orchestrator = createAgentOrchestrator(
    model.client,
    { getToolDefinitions: () => [], executeTool: vi.fn() },
    { model: 'test-model', temperature: 0.1, maxTokens: 512 },
    {
      // The retry budget is one turn: the degenerate turn + the retry fit.
      maxTurns: 2,
      draftFlowMode: 'forced-tool',
      // Silent-off compliance policy (nonexistent path): the degenerate arm
      // is the ONLY arm in play (the nudge arm is a different class — it
      // targets non-empty prose, never the empty-content signature).
      forcedToolCompliancePolicyPath: resolve(FIXTURE_DIR, 'no-such-compliance-policy.yaml'),
      ...overrides.agentConfig,
    } as never,
    orchestratorDeps() as never,
  );
  const result = await orchestrator.run({
    prompt: 'add 100 ul of DMEM to A1',
    surface: 'protocol-review',
    forceDraftTool: true,
    onEvent: (e) => events.push(e),
    context: {
      labwares: [{ labwareId: 'LAB-plate-1', labwareType: 'plate', name: 'Plate' }],
      eventSummary: 'No events yet.',
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['add_material'],
      runId: 'RUN-degenretry-1',
    },
  });
  // Assert mock call counts BEFORE any restore (restoreAllMocks clears them).
  const logLines = logSpy.mock.calls.map((c) => String(c[0] ?? ''));
  compileSpy.mockRestore();
  logSpy.mockRestore();
  return { result, events, logLines, logSpy };
}

describe('L2-DEGEN-RETRY-1 — the message family gains a degenerate arm (extended, not replaced)', () => {
  // The spec's file map names clarificationLoop.test.ts (the existing
  // emptyDraftMessage describe) as the home for these legs — but that file is
  // MAIN-OWNED and lane-2 write-wall excluded (it is a symlink into main in
  // cl-integration-2; lane-exclude-a6fix-l2t0430:76 "never stage these").
  // Lane 2 cannot stage it, so the degenerate-arm legs live HERE (the tracked
  // L2-DEGEN-RETRY-1 test file) instead. The three existing legs in
  // clarificationLoop.test.ts were left byte-identical (reverted to the
  // main-owned bytes after drafting; the collision is reported to the
  // orchestrator, not decided by the coder).
  it('names the degenerate class when the provider returned an empty turn twice', () => {
    // The degenerate arm takes precedence over the other branches: the
    // failure is the AI PROVIDER (empty content + no tool call, twice),
    // never the biologist's wording — the text says so out loud.
    const message = emptyDraftMessage({
      truncated: false,
      hadArguments: false,
      degenerateEmptyResponse: true,
    });
    expect(message).toContain('degenerate');
    expect(message).toContain('not your wording');
    expect(message).toContain('no tool call, no content');
    expect(message).toContain('twice');
    expect(message).not.toContain('rephrasing');
    expect(message).not.toContain('no proposal');
  });

  it('keeps branches 1-3 byte-identical when the degenerate flag is absent (additive extension)', () => {
    // The three existing legs in clarificationLoop.test.ts (output limit /
    // no arguments / unusable arguments) are the contract; this leg pins
    // the SAME bytes here so the extension is provably additive — the old
    // texts are byte-for-byte the old texts, including the rephrasing
    // sentence freeformLegs.test.ts:725 byte-pins via `toBe`.
    expect(emptyDraftMessage({ truncated: true, hadArguments: false })).toBe(
      'no proposal: the model’s answer was cut off at its output limit before it finished the tool call ' +
      '(finish_reason "length"). Raise the agent max_tokens for this profile, or ask for fewer wells at a time.',
    );
    expect(emptyDraftMessage({ truncated: false, hadArguments: false })).toBe(
      'no proposal: the model called agent_intent without any arguments, so there was nothing to draft. ' +
      'Nothing was applied — try rephrasing, or name the material explicitly.',
    );
    expect(emptyDraftMessage({ truncated: false, hadArguments: true })).toBe(
      'no proposal: the model’s tool call carried no usable draft arguments. ' +
      'Nothing was applied — try rephrasing, or name the material explicitly.',
    );
    for (const message of [
      emptyDraftMessage({ truncated: true, hadArguments: false }),
      emptyDraftMessage({ truncated: false, hadArguments: false }),
      emptyDraftMessage({ truncated: false, hadArguments: true }),
    ]) {
      expect(message).not.toContain('degenerate');
    }
  });
});

describe('L2-DEGEN-RETRY-1 — degenerate forced-tool-call defense', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leg 1 (recovered on retry): a degenerate stop+empty turn re-issues the SAME request once and the valid tool call completes with a proposal', async () => {
    const model = stubModel([
      {}, // degenerate: finish=stop, empty content, no tool_calls
      { toolCalls: [{ name: AGENT_INTENT_TOOL_NAME, args: { intent: 'event_shorthand', shorthand: ADD_DMEM_YAML } }] },
    ]);
    const { result, events, logLines } = await runDegenerateTurn(model);

    // Exactly ONE retry: the dead turn + the recovered turn, no third call.
    expect(model.callCount()).toBe(2);
    expect(model.completeCalls()).toBe(0);

    // History UNMUTATED: the second request's messages are the same array
    // contents as the first — the dead assistant turn never rode back.
    expect(model.captured).toHaveLength(2);
    expect(JSON.stringify(model.captured[1]!.messages)).toBe(JSON.stringify(model.captured[0]!.messages));

    // The turn completed with a proposal (never the empty-draft error).
    expect(result.success).toBe(true);
    expect(String(result.error ?? '')).not.toMatch(/no usable draft arguments/);
    expect((result.events ?? []).length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'tool_call' && e.toolName === AGENT_INTENT_TOOL_NAME)).toBe(true);

    // The recovery is LOGGED with the existing [agent tid] prefix — and
    // NEVER a provider literal.
    const recoveryLines = logLines.filter((l) => l.includes(RECOVERY_LOG_LINE));
    expect(recoveryLines).toHaveLength(1);
    expect(recoveryLines[0]).toMatch(/^\[agent [a-z0-9]{4,10}\] degenerate-response recovered on retry$/);
    expect(recoveryLines[0]).not.toMatch(/lfm|llama|gpt|openai|anthropic/i);
  });

  it('leg 2 (double-degenerate): exactly ONE retry, the slow coercion is skipped, and the honest class text surfaces', async () => {
    const model = stubModel([{}, {}]); // both streams degenerate
    const { result, events } = await runDegenerateTurn(model);

    // Call count pinned: one stream per attempt, ONE retry budget, and the
    // skip-coercion ruling (a third call would make this 3).
    expect(model.callCount()).toBe(2);
    expect(model.completeCalls()).toBe(0);

    expect(result.success).toBe(false);
    const error = String(result.error);
    // The class is NAMED — and the blame is not the biologist's wording.
    expect(error).toContain('degenerate response');
    expect(error).toContain('not your wording');
    expect(error).not.toContain('rephrasing');
    // The task's verbatim sentence rides as the error (byte pin).
    expect(error).toContain(DEGENERATE_CLASS_TEXT);
    // The failure rides the ERROR channel (empty content is never routed to
    // the notes/prose channel — proseRouted is false on an empty finalProse).
    expect(events.some((e) => e.type === 'error' && String(e.message).includes('degenerate response'))).toBe(true);
    expect(result.notes).toBeUndefined();
    expect((result.events ?? []).length).toBe(0);
    // Usage block still rides (parity with the neighboring failure arms).
    expect(result.usage).toBeDefined();
    expect(result.usage!.turns).toBeGreaterThanOrEqual(2);
  });

  it('leg 3 (genuine-empty-args keeps the OLD text): the 3-branch contract is extended, not replaced', async () => {
    // Mirrors AgentOrchestrator.freeformLegs.test.ts:725 — the deterministic
    // CONFIRM bypass whose blockers + gaps derive ZERO clarification requests
    // ends on the branch-3 empty-draft error. The model is never consulted
    // (completeStream yields nothing; the bypass returns before the loop),
    // so this leg is the byte-equality pin that the extension touched
    // nothing the old branches say.
    const compileSpy = vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
      events: [
        {
          eventId: 'evt-degenretry-confirm',
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
            eventId: 'evt-degenretry-confirm',
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
          blockers: [],
          degraders: [],
        },
      },
      outcome: 'complete' as const,
    }) as never;
    const completeStream = vi.fn(async function* () {});
    const complete = vi.fn();
    const orchestrator = createAgentOrchestrator(
      { complete, completeStream } as InferenceClient,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2, draftFlowMode: 'preflight-llm' } as never,
      { store: { get: vi.fn(async () => null) } as never },
    );
    const result = await orchestrator.run({
      prompt: 'confirm the held draft',
      context: {
        labwares: [],
        eventSummary: 'No events yet.',
        vocabPackId: 'liquid-handling/v1',
        availableVerbs: ['add_material'],
      },
    });
    compileSpy.mockRestore();
    vi.restoreAllMocks();

    // ZERO extra calls (the deterministic bypass never enters the loop).
    expect(completeStream).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    expect(result.events).toBeUndefined();
    expect(result.assurance?.decision).toBe('CONFIRM');
    // THE byte pin (freeformLegs.test.ts:725 parity): branch 3 is unchanged.
    expect(result.error).toBe(emptyDraftMessage({ truncated: false, hadArguments: true }));
    expect(String(result.error)).toContain('try rephrasing');
    // The degenerate class text is a SEPARATE arm — the branch-3 bytes never
    // absorbed it.
    expect(String(result.error)).not.toContain('degenerate response');
  });

  it('leg 4 (non-degenerate zero extra calls): a normal native tool-call turn makes exactly ONE stream call and ZERO complete calls', async () => {
    const model = stubModel([
      { toolCalls: [{ name: AGENT_INTENT_TOOL_NAME, args: { intent: 'event_shorthand', shorthand: ADD_DMEM_YAML } }] },
    ]);
    const { result } = await runDegenerateTurn(model);

    expect(model.callCount()).toBe(1);
    expect(model.completeCalls()).toBe(0);
    expect(result.success).toBe(true);
    expect((result.events ?? []).length).toBeGreaterThan(0);
  });
});
