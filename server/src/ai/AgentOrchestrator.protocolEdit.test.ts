/**
 * PROTO-AI-7 — the `protocol_edit` dispatch branch on agent_intent.
 *
 * Contract under test:
 *  1. A protocol_edit turn VALIDATES the payload against the REGISTERED
 *     protocol-edit-op schema (schema/workflow/protocol-edit-op.schema.yaml)
 *     and EMITS the proposal on the AgentResult — and runs NOTHING else.
 *     "Propose, never write" must be structurally true: the spies on
 *     store.create/update/delete prove ZERO mutation calls, and the compiler
 *     (runChatbotCompile) is proven never invoked for this intent.
 *  2. A schema-invalid payload surfaces a corrective error through the SAME
 *     channel every other validation failure uses today (AgentResult.error,
 *     success=false) — no new channel is invented.
 *  3. The other three intents (event_graph, deck_layout, create_record)
 *     regress unchanged, and the protocol_edit branch returns BEFORE the
 *     draft path.
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
      throw new Error('protocol_edit must NEVER reach store.create');
    }),
    update: vi.fn(async () => {
      throw new Error('protocol_edit must NEVER reach store.update');
    }),
    delete: vi.fn(async () => {
      throw new Error('protocol_edit must NEVER reach store.delete');
    }),
    validate: vi.fn(),
    lint: vi.fn(),
    getByPath: vi.fn(),
    getWithValidation: vi.fn(),
  };
}

/** The compiler stand-in the existing orchestrator suites use: the event_graph
 *  draft path recompiles through it; a protocol_edit turn must never reach it. */
const COMPILE_NOOP = {
  events: [],
  labwareAdditions: [],
  unresolvedRefs: [],
  diagnostics: [{ severity: 'error' as const, code: 'CONFIG_MISSING', message: 'no extractor', pass_id: 'extract_entities' }],
  terminalArtifacts: { events: [], directives: [], gaps: [] },
  outcome: 'error' as const,
};

/** A fake model that answers with exactly one agent_intent tool call. */
function intentClient(args: unknown): { client: InferenceClient; completeStream: ReturnType<typeof vi.fn> } {
  const completeStream = vi.fn(async function* (_request: CompletionRequest) {
    yield {
      id: 'resp-protocol-edit',
      choices: [{
        index: 0,
        delta: {
          role: 'assistant',
          tool_calls: [{
            index: 0,
            id: 'call-pe',
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
  return { client: { complete: vi.fn(), completeStream }, completeStream };
}

const EDIT_OPS = [
  { op: 'step_delete', stepId: 'step-003' },
  {
    op: 'step_update',
    stepId: 'step-001',
    label: 'Incubate lysate',
    settings: [{ settingId: 'temperature', label: 'Temperature', type: 'temperature', unit: 'C', defaultValue: 37 }],
  },
  { op: 'labware_add', roleId: 'plate_reader', expectedLabwareKinds: ['LBW-96-well'] },
];

async function runIntentTurn(args: unknown, store: ReturnType<typeof mutationTripwire>) {
  const { client } = intentClient(args);
  const executeTool = vi.fn(async () => {
    throw new Error('protocol_edit must NEVER execute a tool');
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
    prompt: 'delete the wash step from the attached protocol',
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

describe('AgentOrchestrator — protocol_edit intent (PROPOSE, NEVER WRITE)', () => {
  beforeEach(() => {
    // The same compiler stand-in the existing orchestrator suites use: the
    // event_graph draft path recompiles through it; a protocol_edit turn must
    // never reach it (asserted with not.toHaveBeenCalled()).
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

  it('a valid protocol_edit turn emits the proposal with the ops envelope intact', async () => {
    const store = mutationTripwire();
    const { result } = await runIntentTurn({ intent: 'protocol_edit', ops: EDIT_OPS }, store);

    expect(result.success).toBe(true);
    expect(result.protocolEdit).toBeDefined();
    // The ops ride out as the model emitted them — same shape, same order.
    expect(result.protocolEdit!.ops).toEqual(EDIT_OPS);
    expect(result.protocolEdit!.protocolId).toBeUndefined();
    // No event draft leaked into a protocol-edit turn.
    expect(result.events ?? []).toHaveLength(0);
  });

  it('carries the optional protocolId override when the model states one', async () => {
    const store = mutationTripwire();
    const { result } = await runIntentTurn(
      { intent: 'protocol_edit', protocolId: 'PRT-000123', ops: [{ op: 'step_delete', stepId: 'step-002' }] },
      store,
    );
    expect(result.success).toBe(true);
    expect(result.protocolEdit!.protocolId).toBe('PRT-000123');
    expect(result.protocolEdit!.ops).toEqual([{ op: 'step_delete', stepId: 'step-002' }]);
  });

  it('spies on the store prove ZERO mutation calls — propose-never-write is structural', async () => {
    const store = mutationTripwire();
    const { result, executeTool } = await runIntentTurn({ intent: 'protocol_edit', ops: EDIT_OPS }, store);
    expect(result.success).toBe(true);
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
    expect(executeTool).not.toHaveBeenCalled();
    // The on-box compiler that materializes drafts never runs for this intent.
    expect(runChatbotCompileModule.runChatbotCompile).not.toHaveBeenCalled();
  });

  it('a schema-invalid payload is corrected through the existing error channel, still writing nothing', async () => {
    const store = mutationTripwire();
    // stepId 'BAD-Step' violates the envelope's ^[a-z][a-z0-9-]*$; 'explode'
    // is not in the op vocabulary — both are real Ajv rejections.
    const { result } = await runIntentTurn(
      { intent: 'protocol_edit', ops: [{ op: 'explode', stepId: 'BAD-Step' }] },
      store,
    );
    expect(result.success).toBe(false);
    expect(result.protocolEdit).toBeUndefined();
    expect(typeof result.error).toBe('string');
    // The error names the offending instance path so the fix is actionable,
    // mirroring how create_record's missing-`records` error reads today.
    expect(result.error).toMatch(/ops/);
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('a protocol_edit turn with no ops is rejected (the envelope requires ops)', async () => {
    const store = mutationTripwire();
    const { result } = await runIntentTurn({ intent: 'protocol_edit' }, store);
    expect(result.success).toBe(false);
    expect(result.protocolEdit).toBeUndefined();
    expect(result.error).toMatch(/ops/);
    expect(store.create).not.toHaveBeenCalled();
  });

  it('object-form step_update settings are REJECTED (the array-form adjudication is the registered schema, not a hand-rolled shape)', async () => {
    const store = mutationTripwire();
    const { result } = await runIntentTurn(
      {
        intent: 'protocol_edit',
        ops: [{ op: 'step_update', stepId: 'step-001', settings: { temperature: 37 } }],
      },
      store,
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/settings/);
    expect(store.update).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------- regression trio
  it('regression: create_record still emits recordCreations and writes nothing itself', async () => {
    const store = mutationTripwire();
    const { result } = await runIntentTurn(
      { intent: 'create_record', records: [{ kind: 'equipment', name: 'water bath', source: 'user-description' }] },
      store,
    );
    expect(result.success).toBe(true);
    expect(result.recordCreations).toHaveLength(1);
    expect(result.recordCreations![0]!.name).toBe('water bath');
    expect(store.create).not.toHaveBeenCalled();
  });

  it('regression: deck_layout still emits deckLayout with the platform default', async () => {
    const store = mutationTripwire();
    const { result } = await runIntentTurn({ intent: 'deck_layout', variantId: 'manual_freeform' }, store);
    expect(result.success).toBe(true);
    expect(result.deckLayout).toEqual({ platformId: 'manual', variantId: 'manual_freeform' });
    expect(store.update).not.toHaveBeenCalled();
  });

  it('regression: event_graph still parses the draft through parseSubmitSuggestionArgs', async () => {
    const store = mutationTripwire();
    const { result } = await runIntentTurn(
      // `mix` (not add_material): the existing material-clarification net drops
      // an ungrounded add_material by design — that gate is pre-existing and
      // not this intent's business. A non-material verb exercises the plain
      // draft path end to end.
      {
        intent: 'event_graph',
        events: [{ verb: 'mix', details: { labwareId: 'lw1', wells: ['A1'] } }],
        notes: ['drafted'],
      },
      store,
    );
    expect(result.success).toBe(true);
    expect(result.events).toHaveLength(1);
    expect(result.events![0]!.verb).toBe('mix');
    expect(result.protocolEdit).toBeUndefined();
  });
});
