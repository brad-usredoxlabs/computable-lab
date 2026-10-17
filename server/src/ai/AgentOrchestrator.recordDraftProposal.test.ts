/**
 * QMS7-7 — the `compose_record_draft` intent on agent_intent + the
 * `record_draft_proposal` relay arm (thin-event design, PB-CH-5 shape).
 *
 * Contract under test (mock inference client per the analysis convention):
 *  1. The ONE forced tool's menu carries compose_record_draft with a
 *     `recordDraft` envelope property whose description states the
 *     compile/review-card/one-draft-on-accept contract.
 *  2. parseAgentIntentArgs parses compose_record_draft and retains the
 *     envelope VERBATIM (no copy/filter/compile — the drafts compile endpoint
 *     is the trust boundary).
 *  3. The orchestrator arm emits EXACTLY ONE record_draft_proposal event
 *     carrying the envelope verbatim, plus tool_result success:true, and the
 *     AgentResult note says the card — not this turn — is where review
 *     happens and NOTHING was written.
 *  4. Spies on the store prove ZERO mutation calls; the arm never calls
 *     FormDraftService (the stream is NOT the trust boundary).
 *  5. An invalid envelope STILL emits verbatim (the compile endpoint owns the
 *     diagnostic — the orchestrator never compiles here).
 *  6. A call with no recordDraft object is corrected through the existing
 *     error channel (success:false), emitting NO record_draft_proposal.
 *
 * RED at base: the menu has no compose_record_draft, parse drops the intent,
 * and the arm does not exist.
 */
import { describe, expect, it, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { AGENT_INTENT_TOOL_NAME, AGENT_INTENT_TOOL_DEF, parseAgentIntentArgs } from './submitSuggestionTool.js';
import type { AgentEvent, CompletionRequest, InferenceClient } from './types.js';

/** A store whose every write side is a tripwire. */
function mutationTripwire() {
  return {
    get: vi.fn(async () => null),
    list: vi.fn(async () => []),
    exists: vi.fn(async () => false),
    create: vi.fn(async () => {
      throw new Error('compose_record_draft must NEVER reach store.create');
    }),
    update: vi.fn(async () => {
      throw new Error('compose_record_draft must NEVER reach store.update');
    }),
    delete: vi.fn(async () => {
      throw new Error('compose_record_draft must NEVER reach store.delete');
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
      id: 'resp-record-draft',
      choices: [{
        index: 0,
        delta: {
          role: 'assistant',
          tool_calls: [{
            index: 0,
            id: 'call-rd',
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

const RECORD_DRAFT = {
  operation: 'compose-record',
  kind: 'training-material',
  fields: {
    title: 'Pipetting safety basics',
    materialType: 'slide_deck',
    notes: 'Dispose tips in the sharps bin; never pipette by mouth.',
  },
};

async function runIntentTurn(args: unknown, store: ReturnType<typeof mutationTripwire>) {
  const { client } = intentClient(args);
  const executeTool = vi.fn(async () => {
    throw new Error('compose_record_draft must NEVER execute a tool');
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
    prompt: 'create a proposed training document for human review: a slide deck teaching basic pipetting safety',
    forceDraftTool: true,
    onEvent: (event) => events.push(event),
    context: {
      labwares: [],
      eventSummary: 'No events yet.',
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['transfer'],
    },
  });
  return { result, events };
}

describe('agent_intent — compose_record_draft intent (QMS7-7)', () => {
  it('the ONE forced tool menu carries compose_record_draft with a recordDraft envelope property', () => {
    const params = AGENT_INTENT_TOOL_DEF.function.parameters as {
      required?: string[];
      properties: Record<string, { type?: string; enum?: string[]; description?: string }>;
    };
    expect(params.required).toEqual(['intent']);
    // QMS7-7 deliberately widens the menu to TEN: compose_record_draft carries
    // the model's record PROPOSAL (fields only); the drafts compile endpoint —
    // not this tool — resolves the kind, derives the id, and gates it.
    expect(params.properties.intent?.enum).toContain('compose_record_draft');
    expect(params.properties.recordDraft?.type).toBe('object');
    const desc = params.properties.recordDraft?.description ?? '';
    expect(desc).toMatch(/compile/i);
    expect(desc).toMatch(/review card/i);
    expect(desc).toMatch(/nothing is written/i);
    // The envelope shape the compile side validates (operation + kind + fields).
    const envelope = params.properties.recordDraft as { properties?: Record<string, { enum?: string[] }> };
    expect(envelope.properties?.operation?.enum).toEqual(['compose-record']);
    expect(envelope.properties?.kind).toBeDefined();
    expect(envelope.properties?.fields).toBeDefined();
  });

  it('parses compose_record_draft and retains the envelope VERBATIM', () => {
    const parsed = parseAgentIntentArgs({ intent: 'compose_record_draft', recordDraft: RECORD_DRAFT });
    expect(parsed.intent).toBe('compose_record_draft');
    expect(parsed.recordDraft).toBe(RECORD_DRAFT); // by reference — no copy, no repair
  });

  it('a compose_record_draft call with no recordDraft object parses with NO envelope (the orchestrator corrects)', () => {
    const parsed = parseAgentIntentArgs({ intent: 'compose_record_draft' });
    expect(parsed.intent).toBe('compose_record_draft');
    expect(parsed.recordDraft).toBeUndefined();
  });

  it('a compose_record_draft call with a non-object recordDraft drops the envelope (never guesses one)', () => {
    const parsed = parseAgentIntentArgs({ intent: 'compose_record_draft', recordDraft: 'compose-record' });
    expect(parsed.recordDraft).toBeUndefined();
    const arrayParsed = parseAgentIntentArgs({ intent: 'compose_record_draft', recordDraft: [1, 2] });
    expect(arrayParsed.recordDraft).toBeUndefined();
  });
});

describe('AgentOrchestrator — record_draft_proposal relay arm (QMS7-7)', () => {
  it('a compose_record_draft turn emits EXACTLY ONE record_draft_proposal event carrying the envelope verbatim, and writes nothing', async () => {
    const store = mutationTripwire();
    const { result, events } = await runIntentTurn({ intent: 'compose_record_draft', recordDraft: RECORD_DRAFT }, store);
    const proposals = events.filter((e) => e.type === 'record_draft_proposal');
    expect(proposals).toHaveLength(1);
    const event = proposals[0] as Extract<AgentEvent, { type: 'record_draft_proposal' }>;
    // Verbatim relay: the model's own envelope, nothing compiled or added.
    expect(event.recordDraft).toEqual(RECORD_DRAFT);
    expect(event.recordDraft).not.toHaveProperty('sessionDocument');
    expect(event.recordDraft).not.toHaveProperty('canAccept');
    expect(events.some((e) => e.type === 'tool_result' && e.type === 'tool_result' && 'success' in e && e.success === true)).toBe(true);
    expect(result.success).toBe(true);
    expect((result.notes ?? []).join(' ')).toMatch(/review/i);
    expect((result.notes ?? []).join(' ')).toMatch(/nothing was written|nothing is written/i);
    // The arm is a RELAY: zero store mutations, zero compiles.
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('an invalid envelope STILL emits verbatim (the compile endpoint owns the diagnostic)', async () => {
    const store = mutationTripwire();
    const garbage = { operation: 'compose-record', kind: 'training-unicorn', fields: { title: 42 } };
    const { events } = await runIntentTurn({ intent: 'compose_record_draft', recordDraft: garbage }, store);
    const proposals = events.filter((e) => e.type === 'record_draft_proposal');
    expect(proposals).toHaveLength(1);
    expect((proposals[0] as Extract<AgentEvent, { type: 'record_draft_proposal' }>).recordDraft).toEqual(garbage);
    expect(store.create).not.toHaveBeenCalled();
  });

  it('a call with no recordDraft object is corrected through the existing error channel — NO record_draft_proposal event', async () => {
    const store = mutationTripwire();
    const { result, events } = await runIntentTurn({ intent: 'compose_record_draft' }, store);
    expect(events.filter((e) => e.type === 'record_draft_proposal')).toHaveLength(0);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/recordDraft/i);
    expect(store.create).not.toHaveBeenCalled();
  });
});
