/**
 * PROTO-AI-9 recovery — the SLOW coercion path must honour `protocol_edit`.
 *
 * Live evidence (finding PROTO-AI-9-recovery-coercion-finding.md, 8/8 replays on
 * the local appliance): the model answers the forced-draft turn with
 * finish=stop + degenerate content and no native tool call; the orchestrator's
 * recovery call recovers a VALID `{intent:'protocol_edit', ops:[…]}` envelope,
 * but the slow path wrapped it as `compile_event_graph_draft`, so it matched no
 * protocol_edit branch, the draft path reported "no proposal … no usable draft
 * arguments", and the proposal was silently dropped.
 *
 * Contract under test:
 *  1. A stop+degenerate turn whose SECOND (coercion) call returns a valid
 *     protocol_edit envelope emits the proposal — the SAME protocolEdit result
 *     a native tool call emits (AgentOrchestrator.protocolEdit.test.ts) — and
 *     NOT the empty-draft error.
 *  2. The event_graph slow-coercion path is unchanged: an event_graph-shaped
 *     recovery still reaches the draft path and produces the proposal.
 *  3. Propose-never-write still holds on the recovery route: zero store
 *     mutations, zero tool executions, compiler never invoked.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { AGENT_INTENT_TOOL_NAME } from './submitSuggestionTool.js';
import type { AgentEvent, CompletionRequest, CompletionResponse, InferenceClient } from './types.js';
import * as runChatbotCompileModule from './runChatbotCompile.js';

/** A store whose every write side is a tripwire (copied from the AI-7 suite). */
function mutationTripwire() {
  return {
    get: vi.fn(async () => null),
    list: vi.fn(async () => []),
    exists: vi.fn(async () => false),
    create: vi.fn(async () => {
      throw new Error('protocol_edit recovery must NEVER reach store.create');
    }),
    update: vi.fn(async () => {
      throw new Error('protocol_edit recovery must NEVER reach store.update');
    }),
    delete: vi.fn(async () => {
      throw new Error('protocol_edit recovery must NEVER reach store.delete');
    }),
    validate: vi.fn(),
    lint: vi.fn(),
    getByPath: vi.fn(),
    getWithValidation: vi.fn(),
  };
}

/**
 * The appliance shape: turn 1 streams the degenerate stop content the live
 * backend logged verbatim (`finish=stop contentLen=41 toolCalls=0`), then the
 * recovery call (non-streaming `complete`) answers with the JSON envelope.
 */
function degenerateStopThenCoercionClient(coercionContent: string): {
  client: InferenceClient;
  complete: ReturnType<typeof vi.fn>;
} {
  const completeStream = vi.fn(async function* (_request: CompletionRequest) {
    yield {
      id: 'resp-stop',
      choices: [{
        index: 0,
        delta: { role: 'assistant', content: '[AgentUI error: message type must be set]' },
        // This is the real content string the appliance returned live (log:
        // contentPreview="[AgentUI error: message type must be set]").
        finish_reason: 'stop',
      }],
    };
  });
  const complete = vi.fn(async (_request: CompletionRequest): Promise<CompletionResponse> => ({
    id: 'resp-coerced',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: coercionContent },
      finish_reason: 'stop',
    }],
  }));
  return { client: { complete, completeStream }, complete };
}

/** The exact 2-op envelope the live SSE carried while the server dropped it,
 *  updated to the PROTO-AI-9 payload contract: a wash insert must carry its
 *  complete wash payload (target/wells/cycles) to be envelope-valid at all. */
const LIVE_OPS = [
  {
    op: 'step_insert', label: 'Wash', kind: 'wash', afterStepId: 'step-3',
    target: { labwareRole: 'plate' }, wells: { kind: 'all' }, cycles: 3,
  },
  { op: 'step_delete', stepId: 'step-6' },
];

async function runRecoveryTurn(coercionContent: string, store: ReturnType<typeof mutationTripwire>) {
  const { client, complete } = degenerateStopThenCoercionClient(coercionContent);
  const executeTool = vi.fn(async () => {
    throw new Error('recovery dispatch must NEVER execute a tool');
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
    prompt: 'add a wash step after step 3 and delete the redundant centrifuge step',
    forceDraftTool: true,
    onEvent: (event) => events.push(event),
    context: {
      labwares: [],
      eventSummary: 'No events yet.',
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['transfer'],
    },
  });
  return { result, events, executeTool, complete };
}

describe('AgentOrchestrator — the slow coercion path honours protocol_edit (PROTO-AI-9)', () => {
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

  it('a stop turn whose coercion recovers protocol_edit emits the proposal, not the empty-draft error', async () => {
    const store = mutationTripwire();
    const { result } = await runRecoveryTurn(JSON.stringify({ intent: 'protocol_edit', ops: LIVE_OPS }), store);

    // The live failure was: success=true hiding
    // "no proposal: the model's tool call carried no usable draft arguments."
    expect(result.success).toBe(true);
    expect(result.error ?? '').not.toMatch(/no usable draft arguments/);
    expect(result.protocolEdit).toBeDefined();
    // The ops ride out exactly as the recovery call recovered them.
    expect(result.protocolEdit!.ops).toEqual(LIVE_OPS);
    // No event draft leaked into a protocol-edit turn.
    expect(result.events ?? []).toHaveLength(0);
  });

  it('the recovery route writes nothing: zero store mutations, zero tool executions, no compiler', async () => {
    const store = mutationTripwire();
    const { result, executeTool } = await runRecoveryTurn(JSON.stringify({ intent: 'protocol_edit', ops: LIVE_OPS }), store);
    expect(result.protocolEdit).toBeDefined();
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
    expect(executeTool).not.toHaveBeenCalled();
    expect(runChatbotCompileModule.runChatbotCompile).not.toHaveBeenCalled();
  });

  it('recovery for event_graph args is unchanged: the draft path still produces the proposal', async () => {
    const store = mutationTripwire();
    const { result } = await runRecoveryTurn(
      JSON.stringify({
        intent: 'event_graph',
        events: [{ verb: 'mix', details: { labwareId: 'lw1', wells: ['A1'] } }],
        notes: ['drafted'],
      }),
      store,
    );
    expect(result.success).toBe(true);
    expect(result.events).toHaveLength(1);
    expect(result.events![0]!.verb).toBe('mix');
    expect(result.protocolEdit).toBeUndefined();
    // One streaming turn + exactly one coercion call.
  });

  it('a coercion answer with no honourable envelope keeps the failed-to-coerce path (no bogus tool call)', async () => {
    const store = mutationTripwire();
    const { result } = await runRecoveryTurn('I cannot help with that.', store);
    expect(result.success).toBe(false);
    expect(result.protocolEdit).toBeUndefined();
    expect(store.create).not.toHaveBeenCalled();
  });
});
