/**
 * W2-8 A5 (RED) — the compile-from-prompt one-shot must carry the ACTIVE
 * PROFILE'S apiKey.
 *
 * Gate evidence (2026-10-11_0110-a5b): the deck Protocol tab's "Apply &
 * compile" POST /api/intent/compile-from-prompt returned 500
 * `INTENT_COMPILE_PROMPT_FAILED: Inference error 401 {"error":{"message":
 * "No cookie auth credentials found"}}` — reproduced 4x. Root cause:
 * `toInferenceConfig` returned {provider, baseUrl, model, enableThinking,
 * temperature} WITHOUT `apiKey`, and createInferenceClient only sets
 * `Authorization: Bearer …` when apiKey is present (InferenceClient.ts:52,
 * 69-70). The W2-9 chat path works because server.ts injects a keyed
 * inferenceClient — the asymmetry IS the defect.
 *
 * Pins (exactOptionalPropertyTypes — key ABSENT, never undefined):
 *  - a profile WITH an apiKey => the built config carries it verbatim;
 *  - a profile WITHOUT one => the key is ABSENT from the built config;
 *  - an explicit deps.baseUrl override still carries the profile key (the
 *    key belongs to the endpoint, and the profile is the endpoint authority
 *    for the one-shot path).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createIntentCompileFromPromptHandlers } from './IntentCompileFromPromptHandlers.js';

const { inferenceClientCalls } = vi.hoisted(() => ({
  inferenceClientCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../ai/InferenceClient.js', () => ({
  createInferenceClient: vi.fn((config: Record<string, unknown>) => {
    inferenceClientCalls.push(config);
    return {
      complete: vi.fn(async () => ({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              function: { name: 'emit_branch_questions', arguments: JSON.stringify({ axes: [] }) },
            }],
          },
        }],
      })),
    };
  }),
}));

function mockStore() {
  return {
    get: vi.fn(async () => null),
    list: vi.fn(async () => []),
    create: vi.fn(async () => { throw new Error('SPINE-5 route must never write'); }),
    update: vi.fn(async () => { throw new Error('SPINE-5 route must never write'); }),
    delete: vi.fn(async () => { throw new Error('SPINE-5 route must never write'); }),
  };
}

function mockRequest(body: unknown) {
  return { body, log: { error: vi.fn() } };
}

function replyRecorder() {
  const calls: Array<{ status?: number; payload?: unknown }> = [];
  let currentStatus: number | undefined;
  const r = {
    status(code: number) { currentStatus = code; return r; },
    send(payload: unknown) { calls.push({ status: currentStatus, payload }); return r; },
  };
  return { r, calls };
}

async function runAskBranch(ai: Record<string, unknown>, deps: Record<string, unknown> = {}) {
  const handlers = createIntentCompileFromPromptHandlers(
    { store: mockStore(), appConfig: { ai } } as never,
    deps as never,
  );
  const { r } = replyRecorder();
  await handlers.compileFromPrompt(mockRequest({ protocolText: '1. Lyse the sample' }) as never, r as never);
}

describe('compile-from-prompt apiKey wiring (W2-8 A5)', () => {
  beforeEach(() => {
    inferenceClientCalls.length = 0;
  });

  it('an active profile WITH an apiKey: the built inference config carries it verbatim', async () => {
    await runAskBranch({
      activeProfile: 'DS-v4.1-OR',
      profiles: {
        'DS-v4.1-OR': {
          inference: {
            baseUrl: 'https://openrouter.ai/api/v1',
            model: 'deepseek-v4.1-flash',
            apiKey: 'sk-or-TESTKEY-0123456789',
          },
          agent: {},
        },
      },
      inference: { baseUrl: 'http://127.0.0.1:8899/v1', model: 'lfm2.5-2.6b' },
      agent: {},
    });
    expect(inferenceClientCalls).toHaveLength(1);
    const built = inferenceClientCalls[0]!;
    expect(built.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(built.model).toBe('deepseek-v4.1-flash');
    // THE DEFECT: apiKey used to be dropped -> unauthenticated 401.
    expect(built.apiKey).toBe('sk-or-TESTKEY-0123456789');
  });

  it('a profile WITHOUT an apiKey: the key is ABSENT from the built config (never undefined)', async () => {
    await runAskBranch({
      activeProfile: 'local',
      profiles: {
        local: { inference: { baseUrl: 'http://appliance-2:18080/v1', model: 'qwen-local' }, agent: {} },
      },
      inference: { baseUrl: 'http://127.0.0.1:8899/v1', model: 'lfm2.5-2.6b' },
      agent: {},
    });
    expect(inferenceClientCalls).toHaveLength(1);
    const built = inferenceClientCalls[0]!;
    expect('apiKey' in built).toBe(false);
    expect(built.baseUrl).toBe('http://appliance-2:18080/v1');
  });

  it('the legacy inline ai.inference apiKey is carried too (no-profile config shape)', async () => {
    await runAskBranch({
      inference: { baseUrl: 'http://mock:9/v1', model: 'inline-model', apiKey: 'sk-inline-KEY' },
      agent: {},
    });
    expect(inferenceClientCalls).toHaveLength(1);
    expect(inferenceClientCalls[0]!.apiKey).toBe('sk-inline-KEY');
  });

  it('ai.smallModel override carries ITS OWN key when declared, else the active profile key', async () => {
    await runAskBranch({
      activeProfile: 'DS-v4.1-OR',
      profiles: {
        'DS-v4.1-OR': { inference: { baseUrl: 'https://openrouter.ai/api/v1', model: 'deepseek-v4.1-flash', apiKey: 'sk-or-PROFILE-KEY' }, agent: {} },
      },
      inference: { baseUrl: 'http://127.0.0.1:8899/v1', model: 'lfm2.5-2.6b' },
      agent: {},
      smallModel: { baseUrl: 'http://small-host:7/v1', model: 'small-model-name', apiKey: 'sk-small-KEY' },
    });
    expect(inferenceClientCalls).toHaveLength(1);
    const built = inferenceClientCalls[0]!;
    expect(built.baseUrl).toBe('http://small-host:7/v1');
    expect(built.apiKey).toBe('sk-small-KEY');
  });
});
