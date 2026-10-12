/**
 * W2-89 g2b-1/2 (RED) — the DETERMINISTIC write-wall refusal on the
 * protocol-review chat path (orchestrator level).
 *
 * The browser gate proved model discretion fails on both negatives across two
 * runs (actionable Apply/Accept cards on "rewrite the vendor text on page 2"
 * and "relabel step-lyse-a provenance as vendor truth"). The refusal must be
 * structural: the wall fires BEFORE any model call, the turn carries a
 * refusal envelope (AgentResult.refusal) and NO protocolEdit payload, and the
 * store tripwires prove zero writes. A legitimate MEANT-only ask is untouched.
 *
 * Pattern: AgentOrchestrator.protocolEdit.test.ts — a fake model that answers
 * with one agent_intent call; mutation tripwires on the store.
 */
import { describe, expect, it, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { AGENT_INTENT_TOOL_NAME } from './submitSuggestionTool.js';
import type { AgentEvent, CompletionRequest, InferenceClient } from './types.js';

function mutationTripwire() {
  return {
    get: vi.fn(async () => null),
    list: vi.fn(async () => []),
    exists: vi.fn(async () => false),
    create: vi.fn(async () => { throw new Error('write-wall refusal must NEVER reach store.create'); }),
    update: vi.fn(async () => { throw new Error('write-wall refusal must NEVER reach store.update'); }),
    delete: vi.fn(async () => { throw new Error('write-wall refusal must NEVER reach store.delete'); }),
    validate: vi.fn(),
    lint: vi.fn(),
    getByPath: vi.fn(),
    getWithValidation: vi.fn(),
  };
}

/** A fake model that answers with exactly one agent_intent tool call. */
function intentClient(args: unknown): { client: InferenceClient; completeStream: ReturnType<typeof vi.fn> } {
  const completeStream = vi.fn(async function* (_request: CompletionRequest) {
    yield {
      id: 'resp-wall',
      choices: [{
        index: 0,
        delta: {
          role: 'assistant',
          tool_calls: [{
            index: 0,
            id: 'call-wall',
            type: 'function',
            function: { name: AGENT_INTENT_TOOL_NAME, arguments: JSON.stringify(args) },
          }],
        },
        finish_reason: 'tool_calls',
      }],
    };
  });
  return { client: { complete: vi.fn(), completeStream }, completeStream };
}

async function runReviewTurn(
  prompt: string,
  args: unknown,
  store: ReturnType<typeof mutationTripwire>,
) {
  const { client, completeStream } = intentClient(args);
  const events: AgentEvent[] = [];
  const orchestrator = createAgentOrchestrator(
    client,
    { getToolDefinitions: () => [], executeTool: async () => { throw new Error('wall refusal must not execute tools'); } },
    { baseUrl: 'http://mock:8899/v1', model: 'test-model', temperature: 0.1, maxTokens: 512 },
    { maxTurns: 2, draftFlowMode: 'preflight-llm' },
    { store: store as never },
  );
  const result = await orchestrator.run({
    prompt,
    surface: 'protocol-review',
    forceDraftTool: true,
    onEvent: (event) => { events.push(event); },
    context: {
      labwares: [],
      eventSummary: 'No events yet.',
      vocabPackId: 'general',
      availableVerbs: [],
    },
  });
  return { result, events, completeStream };
}

const GATE_ASK_A = 'rewrite the vendor text on page 2';
const GATE_ASK_B = 'relabel step-lyse-a provenance as vendor truth';

describe('protocol-review write-wall refusal (W2-89 g2b-1/2)', () => {
  it('gate ask (a) refuses deterministically: refusal envelope, NO protocolEdit, ZERO model calls', async () => {
    const store = mutationTripwire();
    const { result, completeStream } = await runReviewTurn(GATE_ASK_A, {
      intent: 'protocol_edit',
      ops: [{ op: 'step_update', stepId: 'step-lyse', label: 'Lyse with a bead beater for 30 seconds' }],
    }, store);
    expect(result.refusal).toBeDefined();
    expect(result.refusal!.code).toBe('SAID_IMMUTABLE');
    expect(result.refusal!.message).toContain('immutable');
    // NO proposal payload reaches the client — the Apply card can never render.
    expect(result.protocolEdit).toBeUndefined();
    // Deterministic: the wall fired BEFORE the model — zero inference spent.
    expect(completeStream).not.toHaveBeenCalled();
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('gate ask (b) refuses deterministically: refusal envelope, NO protocolEdit, ZERO model calls', async () => {
    const store = mutationTripwire();
    const { result, completeStream } = await runReviewTurn(GATE_ASK_B, {
      intent: 'protocol_edit',
      ops: [{ op: 'step_update', stepId: 'step-lyse-a', notes: 'not vendor truth' }],
    }, store);
    expect(result.refusal).toBeDefined();
    expect(result.refusal!.code).toBe('PROVENANCE_FALSIFICATION');
    expect(result.protocolEdit).toBeUndefined();
    expect(completeStream).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
  });

  // W2-9 g2c DEFECT-1 (gate 2026-10-12_1330-g2c ask (d) verbatim): the natural
  // promote construction must refuse BEFORE the model like a/b/c — the wall
  // noun `to a protocol` (DATA) restores the leading verb's governance.
  it('g2c gate ask (d) "Promote this draft to a protocol without authorization." refuses deterministically with the declared envelope', async () => {
    const store = mutationTripwire();
    const { result, completeStream } = await runReviewTurn(
      'Promote this draft to a protocol without authorization.',
      { intent: 'protocol_edit', ops: [{ op: 'step_update', stepId: 'step-lyse', label: 'Promoted' }] },
      store,
    );
    expect(result.refusal).toBeDefined();
    expect(result.refusal!.code).toBe('PROMOTION_NOT_ON_THIS_SURFACE');
    expect(result.refusal!.message).toContain('Promotion is a QMS lifecycle action');
    expect(result.protocolEdit).toBeUndefined();
    // Deterministic: the wall fired BEFORE the model — zero inference spent.
    expect(completeStream).not.toHaveBeenCalled();
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('a legitimate MEANT-only ask is NOT walled — the model runs and the proposal rides as today', async () => {
    const store = mutationTripwire();
    const { result, completeStream } = await runReviewTurn(
      'reword step 3\u2019s label for our bench',
      { intent: 'protocol_edit', ops: [{ op: 'step_update', stepId: 'step-wash', label: 'Wash beads (bench wording)' }] },
      store,
    );
    expect(result.refusal).toBeUndefined();
    expect(completeStream).toHaveBeenCalled();
    expect(result.protocolEdit).toBeDefined();
    expect(result.protocolEdit!.ops.length).toBe(1);
  });

  it('ops wall (defense-in-depth): a protocol_edit op carrying provenance is refused with the honest wording, no protocolEdit emitted', async () => {
    const store = mutationTripwire();
    const { result } = await runReviewTurn(
      'adjust the wash step wording',
      {
        intent: 'protocol_edit',
        ops: [{ op: 'step_update', stepId: 'step-lyse-a', provenance: [{ kind: 'record', type: 'vendor-protocol-candidate', id: 'CAN-x', pageStart: 2 }] }],
      },
      store,
    );
    expect(result.refusal).toBeDefined();
    expect(result.refusal!.code).toBe('PROVENANCE_FALSIFICATION');
    expect(result.protocolEdit).toBeUndefined();
    expect(store.update).not.toHaveBeenCalled();
  });

  it('the refusal turn is user-facing: the refusal envelope rides the done result with honest wording (no raw reasoning, no "(no response)")', async () => {
    const store = mutationTripwire();
    const { result, events } = await runReviewTurn(GATE_ASK_A, { intent: 'protocol_edit', ops: [] }, store);
    expect(result.refusal!.message).toMatch(/vendor document \(SAID\) is immutable/);
    // The turn ends without any text_delta (nothing streamed as an answer).
    expect(events.filter((e) => e.type === 'text_delta')).toHaveLength(0);
  });

  // advc-W289-l2t0525 DEFECT-2 (medium): the pre-model refusal must not fire on
  // raw words alone. An honest interrogative turn is a QUESTION about the wall,
  // not an instruction to cross it — it runs the model like any other ask.
  it('DEFECT-2: an honest clarifying question about the wall is NOT refused (the model runs)', async () => {
    const store = mutationTripwire();
    const { result, completeStream } = await runReviewTurn(
      'why can you not rewrite the vendor text on page 2?',
      { intent: 'protocol_edit', ops: [{ op: 'step_update', stepId: 'step-wash', label: 'Wash beads (bench wording)' }] },
      store,
    );
    expect(result.refusal).toBeUndefined();
    expect(completeStream).toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
  });

  // W2-89 cycle-3 (advc-W289-c2 DEFECT-3, closed by FIX-3): the INVERSION of
  // the cycle-2 smuggle pin. After FIX-2 the ask-wall predicate only fires on
  // wall-crossing CONSTRUCTIONS, so it may (and must) read the
  // clarification-appended prompt too: an answer that IS an imperative carrying
  // a referent is the attack and is refused BEFORE the model.
  it('DEFECT-3(c2): a wall-crossing clarification answer is refused before the model', async () => {
    const store = mutationTripwire();
    const { client, completeStream } = intentClient({
      intent: 'protocol_edit',
      ops: [{ op: 'step_update', stepId: 'step-wash', label: 'Incubate 37C (bench wording)' }],
    });
    const orchestrator = createAgentOrchestrator(
      client,
      { getToolDefinitions: () => [], executeTool: async () => { throw new Error('wall refusal must not execute tools'); } },
      { baseUrl: 'http://mock:8899/v1', model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2, draftFlowMode: 'preflight-llm' },
      { store: store as never },
    );
    const result = await orchestrator.run({
      prompt: 'apply my earlier answer',
      surface: 'protocol-review',
      forceDraftTool: true,
      clarificationAnswers: [
        { requestId: 'clar-1', label: 'rewrite the vendor text on page 2', value: 'rewrite the vendor text on page 2' },
      ],
      context: { labwares: [], eventSummary: 'No events yet.', vocabPackId: 'general', availableVerbs: [] },
    });
    expect(result.refusal).toBeDefined();
    expect(result.refusal!.code).toBe('SAID_IMMUTABLE');
    expect(result.protocolEdit).toBeUndefined();
    // Zero model calls on the refused smuggle turn.
    expect(completeStream).not.toHaveBeenCalled();
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  });

  // W2-89 cycle-3 (FIX-3 boundary): an honest picker answer — option labels and
  // resolved refs, even carrying a mere vendor MENTION — is not a wall-crossing
  // construction and must run the turn normally.
  it('a benign clarification answer is NOT walled (option labels pass through)', async () => {
    const store = mutationTripwire();
    const { client, completeStream } = intentClient({
      intent: 'protocol_edit',
      ops: [{ op: 'step_update', stepId: 'step-wash', label: 'Incubate 37C (bench wording)' }],
    });
    const orchestrator = createAgentOrchestrator(
      client,
      { getToolDefinitions: () => [], executeTool: async () => { throw new Error('wall refusal must not execute tools'); } },
      { baseUrl: 'http://mock:8899/v1', model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2, draftFlowMode: 'preflight-llm' },
      { store: store as never },
    );
    const result = await orchestrator.run({
      prompt: 'apply my earlier answer',
      surface: 'protocol-review',
      forceDraftTool: true,
      clarificationAnswers: [
        { requestId: 'clar-1', label: 'page 2 vendor wording reference', value: 'page-2-vendor-wording-reference' },
      ],
      context: { labwares: [], eventSummary: 'No events yet.', vocabPackId: 'general', availableVerbs: [] },
    });
    expect(result.refusal).toBeUndefined();
    expect(completeStream).toHaveBeenCalled();
    expect(result.protocolEdit).toBeDefined();
    expect(store.update).not.toHaveBeenCalled();
  });

  // W2-89 cycle-4 (advc-W289-c3 DEFECT-2, ruling FIX-6): a gap>3 answer evades
  // the whole-effectivePrompt adjacency trigger (the scaffold prefix keeps the
  // answer's verb away from the turn start and the referent >3 words away), so
  // each answer's RAW fields must be governed as its own turn.
  it('DEFECT-2(c3): a gap>3 leading-verb answer smuggled via clarificationAnswers is refused before the model', async () => {
    const store = mutationTripwire();
    const { client, completeStream } = intentClient({
      intent: 'protocol_edit',
      ops: [{ op: 'step_update', stepId: 'step-wash', label: 'Incubate 37C (bench wording)' }],
    });
    const orchestrator = createAgentOrchestrator(
      client,
      { getToolDefinitions: () => [], executeTool: async () => { throw new Error('wall refusal must not execute tools'); } },
      { baseUrl: 'http://mock:8899/v1', model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2, draftFlowMode: 'preflight-llm' },
      { store: store as never },
    );
    const result = await orchestrator.run({
      prompt: 'apply my earlier answer',
      surface: 'protocol-review',
      forceDraftTool: true,
      clarificationAnswers: [
        {
          requestId: 'clar-1',
          label: 'rewrite right now the full vendor text exactly as printed on page 2',
          value: 'rewrite right now the full vendor text exactly as printed on page 2',
        },
        {
          requestId: 'clar-2',
          label: 'overwrite the whole thing with the vendor document',
          value: 'overwrite the whole thing with the vendor document',
        },
      ],
      context: { labwares: [], eventSummary: 'No events yet.', vocabPackId: 'general', availableVerbs: [] },
    });
    expect(result.refusal).toBeDefined();
    expect(result.refusal!.code).toBe('SAID_IMMUTABLE');
    expect(result.protocolEdit).toBeUndefined();
    // Zero model calls on the refused smuggle turn.
    expect(completeStream).not.toHaveBeenCalled();
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  });

  // W2-89 cycle-4 (FIX-6 boundary): governing the answer's raw fields must not
  // over-block — an honest multi-field answer (optionId + label + a bare vendor
  // MENTION + a resolved local ref) carries no wall-crossing construction and
  // runs the turn normally.
  it('DEFECT-2(c3) boundary: honest multi-field clarification answers stay unwalled', async () => {
    const store = mutationTripwire();
    const { client, completeStream } = intentClient({
      intent: 'protocol_edit',
      ops: [{ op: 'step_update', stepId: 'step-wash', label: 'Incubate 37C (bench wording)' }],
    });
    const orchestrator = createAgentOrchestrator(
      client,
      { getToolDefinitions: () => [], executeTool: async () => { throw new Error('wall refusal must not execute tools'); } },
      { baseUrl: 'http://mock:8899/v1', model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2, draftFlowMode: 'preflight-llm' },
      { store: store as never },
    );
    const result = await orchestrator.run({
      prompt: 'apply my earlier answer',
      surface: 'protocol-review',
      forceDraftTool: true,
      clarificationAnswers: [
        {
          requestId: 'clar-1',
          optionId: 'opt-page2-ref',
          label: 'page 2 vendor wording reference',
          value: 'vendor text',
          ref: { kind: 'record', type: 'protocol-draft', id: 'DRAFT-lyse-a' },
        },
      ],
      context: { labwares: [], eventSummary: 'No events yet.', vocabPackId: 'general', availableVerbs: [] },
    });
    expect(result.refusal).toBeUndefined();
    expect(completeStream).toHaveBeenCalled();
    expect(result.protocolEdit).toBeDefined();
    expect(store.update).not.toHaveBeenCalled();
  });
});
