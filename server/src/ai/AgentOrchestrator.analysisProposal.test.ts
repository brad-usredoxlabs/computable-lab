/**
 * PB-CH-5 — the `compose_analysis` dispatch branch on agent_intent.
 *
 * THE thin-event design (OQ1 ruling, same shape PB-CH-4 shipped for
 * workstate_proposal): the orchestrator emits the model's analysis INTENT
 * verbatim as ONE `analysis_proposal` AgentEvent and runs NOTHING else — no
 * compile, no store write, no session push, no execute, no promote. The drafts
 * compile endpoint (POST /api/drafts/compile, Ajv + canAccept), NOT this
 * stream, is the trust boundary: a raw model term crossing the wire here is
 * structurally non-actionable (the client renders a compiling slot, never an
 * Accept, until the compile response says canAccept:true).
 *
 * Contract under test (mock inference client per the protocolEdit convention):
 *  1. A compose_analysis turn emits EXACTLY ONE analysis_proposal event
 *     carrying the envelope verbatim, plus tool_result success:true, and the
 *     AgentResult note says the card — not this turn — is where review happens
 *     and NOTHING executed.
 *  2. Spies on the store prove ZERO mutation calls; runChatbotCompile never runs.
 *  3. An invalid envelope STILL emits verbatim (the compile endpoint owns the
 *     diagnostic — the orchestrator never client-side-compiles here).
 *  4. A call with no analysis object is corrected through the existing error
 *     channel (success:false), emitting NO analysis_proposal.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { AGENT_INTENT_TOOL_NAME } from './submitSuggestionTool.js';
import type { AgentEvent, CompletionRequest, InferenceClient } from './types.js';
import * as runChatbotCompileModule from './runChatbotCompile.js';

/** A store whose every write side is a tripwire. */
function mutationTripwire() {
  return {
    get: vi.fn(async () => null),
    list: vi.fn(async () => []),
    exists: vi.fn(async () => false),
    create: vi.fn(async () => {
      throw new Error('compose_analysis must NEVER reach store.create');
    }),
    update: vi.fn(async () => {
      throw new Error('compose_analysis must NEVER reach store.update');
    }),
    delete: vi.fn(async () => {
      throw new Error('compose_analysis must NEVER reach store.delete');
    }),
    validate: vi.fn(),
    lint: vi.fn(),
    getByPath: vi.fn(),
    getWithValidation: vi.fn(),
  };
}

/** A fake model that answers with exactly one agent_intent tool call. */
function intentClient(args: unknown): { client: InferenceClient } {
  const completeStream = vi.fn(async function* (_request: CompletionRequest) {
    yield {
      id: 'resp-analysis',
      choices: [{
        index: 0,
        delta: {
          role: 'assistant',
          tool_calls: [{
            index: 0,
            id: 'call-an',
            type: 'function',
            function: {
              name: AGENT_INTENT_TOOL_NAME,
              arguments: JSON.stringify(args),
            },
          }],
        },
        finish_reason: 'tool_calls',
      }],
    };
  });
  return { client: { complete: vi.fn(), completeStream } };
}

const ANALYSIS = {
  operation: 'compose-analysis',
  target: {
    revision: { term: 'ROS mitochondrial flux analysis' },
    newRun: { title: 'Fresh ROS run', inputs: { trace: { term: 'Seahorse trace file' } } },
  },
  focus: 'run',
};

async function runIntentTurn(args: unknown, store: ReturnType<typeof mutationTripwire>) {
  const { client } = intentClient(args);
  const executeTool = vi.fn(async () => {
    throw new Error('compose_analysis must NEVER execute a tool');
  });
  const events: AgentEvent[] = [];
  const orchestrator = createAgentOrchestrator(
    client,
    { getToolDefinitions: () => [], executeTool },
    { model: 'test-model', temperature: 0.1, maxTokens: 512 },
    { maxTurns: 2, draftFlowMode: 'preflight-llm' },
    { store: store as never },
  );
  const result = await orchestrator.run({
    prompt: 'open the ROS analysis and queue a fresh run',
    forceDraftTool: true,
    onEvent: (event) => events.push(event),
    context: {
      labwares: [],
      eventSummary: 'No events yet.',
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['transfer'],
    },
  });
  return { result, events, executeTool };
}

describe('AgentOrchestrator — compose_analysis intent (emit intent, run nothing)', () => {
  beforeEach(() => {
    vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
      events: [],
      labwareAdditions: [],
      unresolvedRefs: [],
      diagnostics: [{ severity: 'error', code: 'CONFIG_MISSING', message: 'no extractor', pass_id: 'extract_entities' }],
      terminalArtifacts: { events: [], directives: [], gaps: [] },
      outcome: 'error',
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits exactly ONE analysis_proposal event carrying the envelope verbatim + tool_result success:true + a nothing-executed note', async () => {
    const store = mutationTripwire();
    const { result, events } = await runIntentTurn({ intent: 'compose_analysis', analysis: ANALYSIS }, store);

    const proposals = events.filter((e) => e.type === 'analysis_proposal');
    expect(proposals).toHaveLength(1);
    const event = proposals[0] as Extract<AgentEvent, { type: 'analysis_proposal' }>;
    // Verbatim: the model's own envelope, same shape, same order.
    expect(event.analysis).toEqual(ANALYSIS);
    // The event is thin: NO compiled document, NO canAccept — the compile
    // endpoint is the trust boundary, not this stream.
    expect(event.analysis).not.toHaveProperty('sessionDocument');
    expect(event.analysis).not.toHaveProperty('canAccept');

    const toolResults = events.filter((e) => e.type === 'tool_result');
    expect(toolResults).toHaveLength(1);
    expect(toolResults[0]?.success).toBe(true);

    expect(result.success).toBe(true);
    expect(result.notes?.some((n) => /review the card/i.test(n) && /nothing executed/i.test(n))).toBe(true);
    // No workstate/agent_action leaked into a compose_analysis turn.
    expect(events.filter((e) => e.type === 'workstate_proposal')).toHaveLength(0);
    expect(events.filter((e) => e.type === 'agent_action')).toHaveLength(0);
  });

  it('spies on the store prove ZERO mutation calls — the emission runs nothing else (no execute, no promote)', async () => {
    const store = mutationTripwire();
    const { result, executeTool } = await runIntentTurn({ intent: 'compose_analysis', analysis: ANALYSIS }, store);
    expect(result.success).toBe(true);
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
    expect(executeTool).not.toHaveBeenCalled();
    expect(runChatbotCompileModule.runChatbotCompile).not.toHaveBeenCalled();
  });

  it('an invalid analysis envelope STILL emits verbatim — /api/drafts/compile owns the diagnostic (no client-side compile here)', async () => {
    const store = mutationTripwire();
    const garbage = { target: { revision: 7 }, open: 'not-an-object' };
    const { result, events } = await runIntentTurn({ intent: 'compose_analysis', analysis: garbage }, store);

    const proposals = events.filter((e) => e.type === 'analysis_proposal');
    expect(proposals).toHaveLength(1);
    expect((proposals[0] as Extract<AgentEvent, { type: 'analysis_proposal' }>).analysis).toEqual(garbage);
    // The orchestrator did NOT reject it — the compile endpoint will, with
    // canAccept:false, and the card renders diagnostics without Accept.
    expect(result.success).toBe(true);
    expect(store.create).not.toHaveBeenCalled();
  });

  it('a compose_analysis call with no analysis object is corrected through the existing error channel, emitting NO event', async () => {
    const store = mutationTripwire();
    const { result, events } = await runIntentTurn({ intent: 'compose_analysis' }, store);
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
    expect(events.filter((e) => e.type === 'analysis_proposal')).toHaveLength(0);
    expect(store.create).not.toHaveBeenCalled();
  });
});
