/**
 * W2-8 A5 fix (S leg) — answers must reach the compile as DATA.
 *
 * Root cause (gate A5c, spec 2026-10-12_1510): the handler used `answers`
 * ONLY as the ask-vs-answer gate; the answered call then invoked
 * compileFromSmallLlm({prompt, ...}) WITHOUT the answers, so the model
 * re-derived the same macro and re-barred. Answering structurally could not
 * change the outcome.
 *
 * Fix contract (spec §S): when `answers` is non-empty, the compileFromSmallLlm
 * prompt carries the answers as EXPLICIT scientist-stated choices built from
 * the request DATA (iterate the answers entries; zero phrase/domain literals).
 * The ask gate, the 422 envelope shape, and the OQ4(a) hold stay untouched.
 */
import { describe, expect, it, vi } from 'vitest';
import { createIntentCompileFromPromptHandlers } from './IntentCompileFromPromptHandlers.js';

// ---------------------------------------------------------------------------
// Harness (mirrors IntentCompileFromPromptHandlers.test.ts; the ONLY seams are
// the model client and the store — the pipeline runs REAL).
// ---------------------------------------------------------------------------

function mockStore(labware: Array<{ recordId: string; name: string }> = []) {
  return {
    get: vi.fn(async () => null),
    getRecord: vi.fn(async () => null),
    list: vi.fn(async (filter?: { kind?: string }) => {
      if (filter?.kind === 'labware') {
        return labware.map((l) => ({
          recordId: l.recordId,
          schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
          payload: { kind: 'labware', name: l.name },
        }));
      }
      return [];
    }),
    create: vi.fn(async () => { throw new Error('SPINE-5 route must never write'); }),
    update: vi.fn(async () => { throw new Error('SPINE-5 route must never write'); }),
    delete: vi.fn(async () => { throw new Error('SPINE-5 route must never write'); }),
    history: vi.fn(async () => { throw new Error('SPINE-5 route must never read history'); }),
  };
}

type MockStore = ReturnType<typeof mockStore>;

function zeroWrites(store: MockStore) {
  expect(store.create).not.toHaveBeenCalled();
  expect(store.update).not.toHaveBeenCalled();
  expect(store.delete).not.toHaveBeenCalled();
  expect(store.history).not.toHaveBeenCalled();
}

function ctxWith(store: unknown) {
  return { store, appConfig: { ai: { inference: { baseUrl: 'http://mock:8899/v1', model: 'lfm2.5-2.6b' } } } } as never;
}

function mockRequest(body: unknown) {
  return { body, log: { error: vi.fn() } };
}

function send() {
  const calls: Array<{ status?: number; payload?: unknown }> = [];
  let currentStatus: number | undefined;
  const r = {
    status(code: number) {
      currentStatus = code;
      return r;
    },
    send(payload: unknown) {
      calls.push({ status: currentStatus, payload });
      return r;
    },
  };
  return { r, calls };
}

/** Stub LLM that RECORDS every user-prompt it is asked to answer. */
function recordingStubLlm(actions: unknown[]) {
  const userPrompts: string[] = [];
  const llm = {
    complete: vi.fn(async (req: any) => {
      const messages = Array.isArray(req?.messages) ? req.messages : [];
      const lastUser = [...messages].reverse().find((m: any) => m?.role === 'user');
      if (typeof lastUser?.content === 'string') userPrompts.push(lastUser.content);
      const tools = Array.isArray(req?.tools) ? req.tools : [];
      const toolName = tools[0]?.function?.name;
      if (toolName === 'emit_branch_questions') {
        return {
          choices: [{ message: { content: null, tool_calls: [{ function: {
            name: 'emit_branch_questions',
            arguments: JSON.stringify({ axes: [{ axisId: 'sample_type', question: 'Sample?', choices: [{ value: 'bacterial', label: 'Bacteria' }] }] }),
          } }] } }],
        };
      }
      return {
        choices: [{ message: { content: null, tool_calls: [{ function: {
          name: 'emit_scientist_intent',
          arguments: JSON.stringify({ intentId: 'a5-fix', actions }),
        } }] } }],
      };
    }),
  };
  return { llm, userPrompts };
}

const ZYMO_ACTIONS = [
  { action: 'centrifuge', rpm: '4000', timeMin: '5' },
  { action: 'add_material', source: 'MagBinding Buffer', target: 'block', volumeUl: '600' },
  { action: 'transfer', source: 'block', target: 'magstand', volumeUl: '200' },
];

const zymoStore = () => mockStore([
  { recordId: 'LAB-magbinding-buffer', name: 'MagBinding Buffer' },
  { recordId: 'LAB-block', name: 'block' },
  { recordId: 'LAB-magstand', name: 'magstand' },
]);

// ---------------------------------------------------------------------------

describe('intent-compile-from-prompt.answered-prompt-carries-answers (W2-8 A5 S leg)', () => {
  it('answered call: the prompt captured by compileFromSmallLlm contains EVERY answers entry', async () => {
    const store = zymoStore();
    const { llm, userPrompts } = recordingStubLlm(ZYMO_ACTIONS);
    const handlers = createIntentCompileFromPromptHandlers(ctxWith(store), { llmClient: llm as never });
    const reply = send();
    await handlers.compileFromPrompt(
      mockRequest({
        protocolText: '1. Lyse the sample\n\n2. Lyse (variant a)\n\n3. Lyse (variant b)',
        sourceProtocolId: 'CAN-protocol-1791692042751',
        answers: { 'lysis-method': 'bead-beater', 'lysis_variant': 'variant_a' },
      }) as never,
      reply.r as never,
    );
    // The intent call really happened (answers skip the ask gate).
    const intentPrompt = userPrompts.find((p) => p.includes('Lyse (variant a)'));
    expect(intentPrompt).toBeDefined();
    // EVERY answers entry rides the prompt as data: axisId AND value verbatim.
    expect(intentPrompt!).toContain('lysis-method');
    expect(intentPrompt!).toContain('bead-beater');
    expect(intentPrompt!).toContain('lysis_variant');
    expect(intentPrompt!).toContain('variant_a');
    zeroWrites(store);
  });

  it('answered call with a single entry still composes the block (no multi-entry dependency)', async () => {
    const store = zymoStore();
    const { llm, userPrompts } = recordingStubLlm(ZYMO_ACTIONS);
    const handlers = createIntentCompileFromPromptHandlers(ctxWith(store), { llmClient: llm as never });
    const reply = send();
    await handlers.compileFromPrompt(
      mockRequest({
        protocolText: 'spin the magstand then add MagBinding Buffer to block',
        answers: { sample_type: 'bacterial' },
      }) as never,
      reply.r as never,
    );
    expect(reply.calls[0].status).toBeUndefined(); // 200 — success shape unchanged
    const intentPrompt = userPrompts.find((p) => p.includes('spin the magstand'));
    expect(intentPrompt).toBeDefined();
    expect(intentPrompt!).toContain('sample_type');
    expect(intentPrompt!).toContain('bacterial');
    zeroWrites(store);
  });

  it('unanswered (ask) call: the captured prompt has NO scientist-resolved block', async () => {
    const store = mockStore();
    const { llm, userPrompts } = recordingStubLlm([]);
    const handlers = createIntentCompileFromPromptHandlers(ctxWith(store), { llmClient: llm as never });
    const reply = send();
    await handlers.compileFromPrompt(
      mockRequest({ protocolText: 'ask me questions only' }) as never,
      reply.r as never,
    );
    expect(reply.calls[0].payload).toMatchObject({ needsAnswers: true });
    expect(userPrompts.length).toBeGreaterThan(0);
    for (const p of userPrompts) {
      expect(p).not.toMatch(/scientist[-\s]resolved/i);
      expect(p).not.toContain('ask me questions only answers');
    }
    zeroWrites(store);
  });

  it('answers-only-as-data: an arbitrary axisId/value pair (no domain vocabulary) still reaches the prompt verbatim', async () => {
    // Anti-hardcoding proof: the composition iterates the request DATA. A pair
    // with zero biological meaning must appear exactly as given.
    const store = zymoStore();
    const { llm, userPrompts } = recordingStubLlm(ZYMO_ACTIONS);
    const handlers = createIntentCompileFromPromptHandlers(ctxWith(store), { llmClient: llm as never });
    const reply = send();
    await handlers.compileFromPrompt(
      mockRequest({
        protocolText: 'spin the magstand then add MagBinding Buffer to block',
        answers: { 'zzz-axis': 'q9-value' },
      }) as never,
      reply.r as never,
    );
    const intentPrompt = userPrompts.find((p) => p.includes('spin the magstand'));
    expect(intentPrompt).toBeDefined();
    expect(intentPrompt!).toContain('zzz-axis');
    expect(intentPrompt!).toContain('q9-value');
    zeroWrites(store);
  });
});
