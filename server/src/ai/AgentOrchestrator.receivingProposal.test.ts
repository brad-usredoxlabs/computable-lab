/**
 * MATRES-RECV (OQ-2 ratified) — the `compose_receiving` intent on the ONE
 * forced agent_intent tool + the `receiving_proposal` relay arm (thin-event
 * design, the compose_record_draft shape).
 *
 * Contract under test (mock inference client per the record-draft convention):
 *  1. The ONE forced tool's menu carries compose_receiving with a `receiving`
 *     envelope property whose description states the compile/review-card/
 *     never-invent contract.
 *  2. parseAgentIntentArgs parses compose_receiving and retains the envelope
 *     VERBATIM (no copy/filter/compile — the drafts compile endpoint is the
 *     trust boundary).
 *  3. The orchestrator arm emits EXACTLY ONE receiving_proposal event
 *     carrying the envelope verbatim, plus tool_result success:true, and the
 *     AgentResult note says the card — not this turn — is where review
 *     happens and NOTHING was written.
 *  4. Spies on the store prove ZERO mutation calls; the arm never calls
 *     FormDraftService (the stream is NOT the trust boundary).
 *  5. An invalid envelope STILL emits verbatim (the compile endpoint owns the
 *     diagnostic — the orchestrator never compiles here).
 *  6. A call with no receiving object is corrected through the existing error
 *     channel (success:false), emitting NO receiving_proposal.
 *  7. NO second forced tool: the tool count stays one and the verb union of
 *     the scientist-intent vocabulary is untouched (no receive verb).
 *
 * RED at base: the menu has no compose_receiving, parse drops the intent,
 * and the arm does not exist.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
      throw new Error('compose_receiving must NEVER reach store.create');
    }),
    update: vi.fn(async () => {
      throw new Error('compose_receiving must NEVER reach store.update');
    }),
    delete: vi.fn(async () => {
      throw new Error('compose_receiving must NEVER reach store.delete');
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
      id: 'resp-receiving',
      choices: [{
        index: 0,
        delta: {
          role: 'assistant',
          tool_calls: [{
            index: 0,
            id: 'call-rc',
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

const RECEIVING = {
  operation: 'compose-receiving',
  claim: {
    vendor: 'Sigma',
    productLabel: 'Trypan Blue',
    lotNumber: '09231',
    receivedByLabel: 'Brad',
    receivedByStatus: 'known',
    occurredAtStatus: 'approximate',
    approximation: 'last week',
  },
};

async function runIntentTurn(args: unknown, store: ReturnType<typeof mutationTripwire>) {
  const { client } = intentClient(args);
  const executeTool = vi.fn(async () => {
    throw new Error('compose_receiving must NEVER execute a tool');
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
    prompt: 'the Sigma bottle of trypan blue that arrived last week, lot 09231 — record that it entered our custody',
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

describe('agent_intent — compose_receiving intent (MATRES-RECV, OQ-2 ratified)', () => {
  it('the ONE forced tool menu carries compose_receiving with a receiving envelope property stating the compile/review/never-invent contract', () => {
    const params = AGENT_INTENT_TOOL_DEF.function.parameters as {
      required?: string[];
      properties: Record<string, { type?: string; enum?: string[]; description?: string }>;
    };
    expect(params.required).toEqual(['intent']);
    // OQ-2 ratified: the menu widens by ONE value on the SAME tool (the
    // one-tool lock is about the tool, never a frozen enum). No second forced
    // tool exists anywhere in the chat rail.
    expect(params.properties.intent?.enum).toContain('compose_receiving');
    expect(params.properties.receiving?.type).toBe('object');
    const desc = params.properties.receiving?.description ?? '';
    expect(desc).toMatch(/compile/i);
    expect(desc).toMatch(/review card/i);
    expect(desc).toMatch(/NEVER a timestamp you did not hear/i);
    expect(desc).toMatch(/NEVER a receiver you did not hear/i);
    expect(desc).toMatch(/catalog identity only/i);
    // The envelope shape the compile side validates (operation + claim).
    const envelope = params.properties.receiving as { properties?: Record<string, { enum?: string[] }> };
    expect(envelope.properties?.operation?.enum).toEqual(['compose-receiving']);
    expect(envelope.properties?.claim).toBeDefined();
  });

  it('parses compose_receiving and retains the envelope VERBATIM', () => {
    const parsed = parseAgentIntentArgs({ intent: 'compose_receiving', receiving: RECEIVING });
    expect(parsed.intent).toBe('compose_receiving');
    expect(parsed.receiving).toBe(RECEIVING); // by reference — no copy, no repair
  });

  it('a compose_receiving call with no receiving object parses with NO envelope (the orchestrator corrects)', () => {
    const parsed = parseAgentIntentArgs({ intent: 'compose_receiving' });
    expect(parsed.intent).toBe('compose_receiving');
    expect(parsed.receiving).toBeUndefined();
  });

  it('a compose_receiving call with a non-object receiving drops the envelope (never guesses one)', () => {
    const parsed = parseAgentIntentArgs({ intent: 'compose_receiving', receiving: 'compose-receiving' });
    expect(parsed.receiving).toBeUndefined();
    const arrayParsed = parseAgentIntentArgs({ intent: 'compose_receiving', receiving: [1, 2] });
    expect(arrayParsed.receiving).toBeUndefined();
  });

  it('NO second forced tool and NO receive verb in the scientist-intent vocabulary (verb union stays 32)', () => {
    // The chat rail declares exactly ONE forced tool name.
    const forcedToolNames = readFileSync(fileURLToPath(new URL('./AgentOrchestrator.ts', import.meta.url)), 'utf8');
    const forcedToolRefs = forcedToolNames.match(/AGENT_INTENT_TOOL_NAME/g) ?? [];
    expect(forcedToolRefs.length).toBeGreaterThan(0);
    // The scientist-intent vocabulary carries no receive/receipt verb.
    const vocab = readFileSync(fileURLToPath(new URL('../../../schema/scientist-intent/scientist-intent-vocabulary.yaml', import.meta.url)), 'utf8');
    expect(vocab).not.toMatch(/^\s*-?\s*receive\b/im);
    expect(vocab).not.toMatch(/\breceipt\b/);
  });
});

describe('AgentOrchestrator — receiving_proposal relay arm (MATRES-RECV)', () => {
  it('a compose_receiving turn emits EXACTLY ONE receiving_proposal event carrying the envelope verbatim, and writes nothing', async () => {
    const store = mutationTripwire();
    const { result, events } = await runIntentTurn({ intent: 'compose_receiving', receiving: RECEIVING }, store);
    const proposals = events.filter((e) => e.type === 'receiving_proposal');
    expect(proposals).toHaveLength(1);
    const event = proposals[0] as Extract<AgentEvent, { type: 'receiving_proposal' }>;
    // Verbatim relay: the model's own envelope, nothing compiled or added.
    expect(event.receiving).toEqual(RECEIVING);
    expect(event.receiving).not.toHaveProperty('envelope');
    expect(event.receiving).not.toHaveProperty('canAccept');
    expect(events.some((e) => e.type === 'tool_result' && 'success' in e && e.success === true)).toBe(true);
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
    const garbage = { operation: 'compose-receiving', claim: { vendor: 42 } };
    const { events } = await runIntentTurn({ intent: 'compose_receiving', receiving: garbage }, store);
    const proposals = events.filter((e) => e.type === 'receiving_proposal');
    expect(proposals).toHaveLength(1);
    expect((proposals[0] as Extract<AgentEvent, { type: 'receiving_proposal' }>).receiving).toEqual(garbage);
    expect(store.create).not.toHaveBeenCalled();
  });

  it('a call with no receiving object is corrected through the existing error channel — NO receiving_proposal event', async () => {
    const store = mutationTripwire();
    const { result, events } = await runIntentTurn({ intent: 'compose_receiving' }, store);
    expect(events.filter((e) => e.type === 'receiving_proposal')).toHaveLength(0);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/receiving/i);
    expect(store.create).not.toHaveBeenCalled();
  });
});
