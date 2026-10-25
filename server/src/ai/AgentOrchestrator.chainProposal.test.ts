/**
 * MATRES-CHAIN (OQ-3(a) ratified) — the `compose_execute_chain` intent on the
 * ONE forced agent_intent tool + the `chain_proposal` relay arm (thin-event
 * design, the compose_receiving precedent).
 *
 * Contract under test (mock inference client per the receiving convention):
 *  1. The ONE forced tool's menu carries compose_execute_chain with a `chain`
 *     envelope property whose description states the compile/review-card/
 *     never-invent contract.
 *  2. parseAgentIntentArgs parses compose_execute_chain and retains the
 *     envelope VERBATIM (no copy/filter/compile — the drafts compile endpoint
 *     is the trust boundary).
 *  3. The orchestrator arm emits EXACTLY ONE chain_proposal event carrying the
 *     envelope verbatim, plus tool_result success:true, and the AgentResult
 *     note says the card — not this turn — is where review happens and NOTHING
 *     was written.
 *  4. Spies on the store prove ZERO mutation calls; the arm never compiles
 *     (the stream is NOT the trust boundary).
 *  5. An invalid envelope STILL emits verbatim (the compile endpoint owns the
 *     diagnostic — the orchestrator never compiles here).
 *  6. A call with no chain object is corrected through the existing error
 *     channel (success:false), emitting NO chain_proposal.
 *  7. NO second forced tool and NO new scientist-intent vocabulary verb: the
 *     vocabulary file stays untouched (the chain verb is a DRAFT-adapter
 *     operation, not a shorthand verb).
 *  8. Lockstep: the tool-declared `chain` envelope's required keys +
 *     additionalProperties:false match the compile-side authority
 *     schema/workflow/chain-draft.schema.yaml (the ReceiveElicitation.test.ts
 *     precedent — the model-facing contract can never drift looser).
 *
 * DELIBERATE golden diff (OQ-3(a) ruling, the RECV precedent): the intent enum
 * gains compose_execute_chain; the enum-pin test is updated in the same commit
 * and the diff is disclosed in the report.
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
      throw new Error('compose_execute_chain must NEVER reach store.create');
    }),
    update: vi.fn(async () => {
      throw new Error('compose_execute_chain must NEVER reach store.update');
    }),
    delete: vi.fn(async () => {
      throw new Error('compose_execute_chain must NEVER reach store.delete');
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
      id: 'resp-chain',
      choices: [{
        index: 0,
        delta: {
          role: 'assistant',
          tool_calls: [{
            index: 0,
            id: 'call-ch',
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

const CHAIN = {
  operation: 'compose-execute-chain',
  artifactKind: 'attestation-chain',
  plan: { recordId: 'EVTG-CHAIN-PLAN' },
  prepared: { name: 'Fenofibrate stock', volume: { value: 1, unit: 'mL' } },
  aliquotCount: 10,
  aliquots: [
    { disposition: 'consumed', volume: { value: 100, unit: 'uL' }, occurredAtStatus: 'approximate', approximation: 'today' },
    { disposition: 'stored', volume: { value: 100, unit: 'uL' }, storage: { temperature_C: -20, location: 'cryobox-1/box-A' }, occurredAtStatus: 'unknown' },
  ],
  attested: { claimStatus: 'completed', occurredAtStatus: 'approximate', approximation: 'today', attestorLabel: 'Brad' },
};

async function runIntentTurn(args: unknown, store: ReturnType<typeof mutationTripwire>) {
  const { client } = intentClient(args);
  const executeTool = vi.fn(async () => {
    throw new Error('compose_execute_chain must NEVER execute a tool');
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
    prompt: 'I made 1 mL of fenofibrate stock today, split it into 10 100-microliter aliquots, used one today and put 9 at -20',
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

describe('agent_intent — compose_execute_chain intent (MATRES-CHAIN, OQ-3(a))', () => {
  it('the ONE forced tool menu carries compose_execute_chain with a chain envelope property stating the compile/review/never-invent contract', () => {
    const params = AGENT_INTENT_TOOL_DEF.function.parameters as {
      required?: string[];
      properties: Record<string, { type?: string; enum?: string[]; description?: string }>;
    };
    expect(params.required).toEqual(['intent']);
    // OQ-3(a) ratified: the menu widens by ONE value on the SAME tool (the
    // one-tool lock is about the tool, never a frozen enum). No second forced
    // tool exists anywhere in the chat rail.
    expect(params.properties.intent?.enum).toContain('compose_execute_chain');
    expect(params.properties.chain?.type).toBe('object');
    const desc = params.properties.chain?.description ?? '';
    expect(desc).toMatch(/compile/i);
    expect(desc).toMatch(/review card/i);
    expect(desc).toMatch(/NEVER a timestamp you did not hear/i);
    expect(desc).toMatch(/NEVER an id/i);
    expect(desc).toMatch(/OUT OF SCOPE/i);
    // The envelope shape the compile side validates.
    const envelope = params.properties.chain as { properties?: Record<string, { enum?: string[] }> };
    expect(envelope.properties?.operation?.enum).toEqual(['compose-execute-chain']);
    expect(envelope.properties?.prepared).toBeDefined();
    expect(envelope.properties?.aliquots).toBeDefined();
    expect(envelope.properties?.attested).toBeDefined();
  });

  it('parses compose_execute_chain and retains the envelope VERBATIM', () => {
    const parsed = parseAgentIntentArgs({ intent: 'compose_execute_chain', chain: CHAIN });
    expect(parsed.intent).toBe('compose_execute_chain');
    expect(parsed.chain).toBe(CHAIN); // by reference — no copy, no repair
  });

  it('a compose_execute_chain call with no chain object parses with NO envelope (the orchestrator corrects)', () => {
    const parsed = parseAgentIntentArgs({ intent: 'compose_execute_chain' });
    expect(parsed.intent).toBe('compose_execute_chain');
    expect(parsed.chain).toBeUndefined();
  });

  it('a compose_execute_chain call with a non-object chain drops the envelope (never guesses one)', () => {
    const parsed = parseAgentIntentArgs({ intent: 'compose_execute_chain', chain: 'compose-execute-chain' });
    expect(parsed.chain).toBeUndefined();
    const arrayParsed = parseAgentIntentArgs({ intent: 'compose_execute_chain', chain: [1, 2] });
    expect(arrayParsed.chain).toBeUndefined();
  });

  it('NO second forced tool and NO new scientist-intent vocabulary verb (the chain verb is a draft-adapter operation)', () => {
    const vocab = readFileSync(fileURLToPath(new URL('../../../schema/scientist-intent/scientist-intent-vocabulary.yaml', import.meta.url)), 'utf8');
    expect(vocab).not.toMatch(/compose_execute_chain/);
    expect(vocab).not.toMatch(/execute-chain/);
  });

  it('lockstep: the tool-declared chain envelope matches the compile-side chain-draft.schema.yaml (required keys + additionalProperties:false)', () => {
    const params = AGENT_INTENT_TOOL_DEF.function.parameters as {
      properties: Record<string, { required?: string[]; additionalProperties?: boolean }>;
    };
    const toolEnvelope = params.properties.chain;
    expect(toolEnvelope.additionalProperties).toBe(false);
    const draftSchema = readFileSync(fileURLToPath(new URL('../../../schema/workflow/chain-draft.schema.yaml', import.meta.url)), 'utf8');
    const requiredLine = draftSchema.split('\n').find(l => l.startsWith('required: [')) ?? '';
    const schemaRequired = requiredLine.replace('required: [', '').replace(']', '').split(',').map(s => s.trim());
    expect(toolEnvelope.required).toEqual(schemaRequired);
  });
});

describe('AgentOrchestrator — chain_proposal relay arm (MATRES-CHAIN)', () => {
  it('a compose_execute_chain turn emits EXACTLY ONE chain_proposal event carrying the envelope verbatim, and writes nothing', async () => {
    const store = mutationTripwire();
    const { result, events } = await runIntentTurn({ intent: 'compose_execute_chain', chain: CHAIN }, store);
    const proposals = events.filter((e) => e.type === 'chain_proposal');
    expect(proposals).toHaveLength(1);
    const event = proposals[0] as Extract<AgentEvent, { type: 'chain_proposal' }>;
    // Verbatim relay: the model's own envelope, nothing compiled or added.
    expect(event.chain).toEqual(CHAIN);
    expect(event.chain).not.toHaveProperty('envelope');
    expect(event.chain).not.toHaveProperty('canAccept');
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
    const garbage = { operation: 'compose-execute-chain', prepared: { name: 42 } };
    const { events } = await runIntentTurn({ intent: 'compose_execute_chain', chain: garbage }, store);
    const proposals = events.filter((e) => e.type === 'chain_proposal');
    expect(proposals).toHaveLength(1);
    expect((proposals[0] as Extract<AgentEvent, { type: 'chain_proposal' }>).chain).toEqual(garbage);
    expect(store.create).not.toHaveBeenCalled();
  });

  it('a call with no chain object is corrected through the existing error channel — NO chain_proposal event', async () => {
    const store = mutationTripwire();
    const { result, events } = await runIntentTurn({ intent: 'compose_execute_chain' }, store);
    expect(events.filter((e) => e.type === 'chain_proposal')).toHaveLength(0);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/compose_execute_chain requires a `chain` envelope/);
  });
});
