/**
 * W2-9 g2c DEFECT-2 (RED) — a no-tool-call turn whose model prose IS an honest
 * refusal must surface as an assistant TEXT turn, never as a harness-error turn.
 *
 * Gate evidence (2026-10-12_1330-g2c asks (d)/(e)): the model declined in text,
 * emitted no tool call, and the client received ONLY
 * "AI stopped without calling compile_event_graph_draft, and compiler-argument
 * fallback did not produce valid JSON. Last text: <refusal>" — an internal
 * failure trace that (i) is not an assistant bubble and (ii) names server
 * internals. The fix routes the prose honestly: the client-visible emission
 * carries the prose as a plain answer (notes channel — the same surface today's
 * notes-only turns use), NO error event, NO proposal payload; the internal
 * trace stays in the server log (the agent-summary line keeps it verbatim).
 *
 * Pattern: AgentOrchestrator.reviewWriteWall.test.ts — fake model + store
 * tripwires. The prompt is gate ask (e) verbatim: it does NOT trip the ask
 * wall (no wall verb), so the model runs and declines in text.
 */
import { describe, expect, it, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME } from './submitSuggestionTool.js';
import type { AgentEvent, CompletionRequest, InferenceClient, StreamChunk } from './types.js';

function mutationTripwire() {
  return {
    get: vi.fn(async () => null),
    list: vi.fn(async () => []),
    exists: vi.fn(async () => false),
    create: vi.fn(async () => { throw new Error('honest-refusal turn must NEVER reach store.create'); }),
    update: vi.fn(async () => { throw new Error('honest-refusal turn must NEVER reach store.update'); }),
    delete: vi.fn(async () => { throw new Error('honest-refusal turn must NEVER reach store.delete'); }),
    validate: vi.fn(),
    lint: vi.fn(),
    getByPath: vi.fn(),
    getWithValidation: vi.fn(),
  };
}

const REFUSAL_PROSE = 'Authorization cannot be bypassed, and a draft cannot be promoted without the signing/approval chain. I can\u2019t skip the gate, and I can\u2019t sign on your behalf.';

/** A fake model that answers with refusal PROSE only — no tool call, stop. */
function proseOnlyClient(prose: string) {
  const completeStream = vi.fn(async function* (_request: CompletionRequest): AsyncGenerator<StreamChunk> {
    yield {
      id: 'resp-prose',
      choices: [{
        index: 0,
        delta: { role: 'assistant', content: prose },
        finish_reason: 'stop',
      }],
    };
  });
  // The compiler-argument fallback answers too — prose, never valid JSON.
  const complete = vi.fn(async () => ({
    id: 'resp-coerce',
    choices: [{
      index: 0,
      message: { role: 'assistant' as const, content: prose },
      finish_reason: 'stop' as const,
    }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }));
  const client: InferenceClient = { complete, completeStream };
  return { client, completeStream, complete };
}

async function runProseTurn(prompt: string, prose: string, store: ReturnType<typeof mutationTripwire>) {
  const { client, completeStream, complete } = proseOnlyClient(prose);
  const events: AgentEvent[] = [];
  const orchestrator = createAgentOrchestrator(
    client,
    { getToolDefinitions: () => [], executeTool: async () => { throw new Error('prose turn must not execute tools'); } },
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
  return { result, events, completeStream, complete };
}

const GATE_ASK_E = 'Apply the change to protocol PRT-4iaey2 instead of this draft.';

describe('protocol-review honest refusal turn (W2-9 g2c DEFECT-2)', () => {
  it('a no-tool-call refusal turn surfaces the model prose as an assistant text answer — no error event, no harness internals, no proposal payload', async () => {
    const store = mutationTripwire();
    const { result, events, completeStream } = await runProseTurn(GATE_ASK_E, REFUSAL_PROSE, store);

    // The model ran (the ask wall did not fire on this construction) and
    // declined in text.
    expect(completeStream).toHaveBeenCalled();

    // THE client-visible answer: the prose rides the notes channel — a plain
    // assistant text turn, the same surface today's notes-only turns use.
    expect(result.notes).toBeDefined();
    expect(result.notes!.join('\n')).toContain(REFUSAL_PROSE);

    // NO harness-error turn: no `error` event on the stream, and the result
    // carries no error string the client could render.
    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(result.error).toBeUndefined();

    // Never name server internals in the surfaced text.
    const surfaced = result.notes!.join('\n');
    expect(surfaced).not.toContain(COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME);
    expect(surfaced).not.toMatch(/AI stopped without calling/);
    expect(surfaced).not.toMatch(/compiler-argument fallback/);

    // Guardrail: the prose NEVER carries a proposal payload — the panel can
    // not open an Apply/Accept card on this path.
    expect(result.protocolEdit).toBeUndefined();
    expect(result.refusal).toBeUndefined();
    expect(result.events ?? []).toHaveLength(0);

    // Success accounting is UNCHANGED: a zero-tool turn still ends success:false.
    expect(result.success).toBe(false);

    // Zero writes.
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('boundary: a no-tool-call turn with NO prose keeps the honest error shape (still no card, still zero writes)', async () => {
    const store = mutationTripwire();
    const { result, events } = await runProseTurn(GATE_ASK_E, '   ', store);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.notes).toBeUndefined();
    expect(result.protocolEdit).toBeUndefined();
    expect(events.some((e) => e.type === 'error')).toBe(true);
    expect(store.update).not.toHaveBeenCalled();
  });
});
