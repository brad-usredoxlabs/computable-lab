/**
 * WIRE-TEMP-1 — InferenceClient must forward the declared config.temperature into
 * the serialized request body on BOTH arms (local OpenAI-compatible + OpenRouter).
 *
 * Doctrine mirrored from the enableThinking resolution in InferenceClient.ts
 * (:88-91): request-level values win on key collision so callers can override
 * per-call, and a value absent on BOTH sides stays ABSENT in the body
 * (exactOptionalPropertyTypes is on for the backend: optional means absent OR
 * value, never an explicit undefined).
 *
 * Spec: .hermes/plans/2026-10-17_2250-WIRE-TEMP-1-inference-temperature-forwarding.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createInferenceClient } from './InferenceClient.js';
import type { CompletionRequest } from './types.js';

const LOCAL_BASE_URL = 'http://example.test/v1';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const baseRequest: CompletionRequest = {
  model: 'm',
  messages: [{ role: 'user', content: 'hi' }],
};

const okResponse = () =>
  new Response(
    JSON.stringify({
      choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
    }),
  );

const sseResponse = () =>
  new Response('data: {"id":"ok","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');

describe('InferenceClient forwards declared config.temperature (WIRE-TEMP-1)', () => {
  const originalFetch = globalThis.fetch;
  let bodies: Record<string, unknown>[];

  const captureFetch = (stream = false) => {
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return stream ? sseResponse() : okResponse();
    }) as unknown as typeof globalThis.fetch;
  };

  beforeEach(() => {
    bodies = [];
    captureFetch();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Acceptance 1a: declared config.temperature = 0 reaches the body (local arm).
  // 0 is falsy: a `temperature: config.temperature || fallback` or an
  // `if (config.temperature)` guard dies on this pin.
  // -----------------------------------------------------------------------

  it('local arm: declared config temperature 0 reaches the serialized body', async () => {
    const client = createInferenceClient({ baseUrl: LOCAL_BASE_URL, model: 'm', temperature: 0 });

    await client.complete(baseRequest);

    expect(bodies).toHaveLength(1);
    expect('temperature' in bodies[0]!).toBe(true);
    expect(bodies[0]!.temperature).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Acceptance 1b: same for the OpenRouter arm.
  // -----------------------------------------------------------------------

  it('OpenRouter arm: declared config temperature 0 reaches the serialized body', async () => {
    const client = createInferenceClient({ baseUrl: OPENROUTER_BASE_URL, model: 'm', temperature: 0 });

    await client.complete(baseRequest);

    expect(bodies).toHaveLength(1);
    expect('temperature' in bodies[0]!).toBe(true);
    expect(bodies[0]!.temperature).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Acceptance 1c: absent on both sides stays ABSENT (never temperature: undefined).
  // JSON.stringify drops undefined-valued keys, so the key-presence check is the
  // pin that kills a `temperature: config.temperature ?? undefined` write.
  // -----------------------------------------------------------------------

  it('local arm: no temperature declared anywhere → body has NO temperature key', async () => {
    const client = createInferenceClient({ baseUrl: LOCAL_BASE_URL, model: 'm' });

    await client.complete(baseRequest);

    expect(bodies).toHaveLength(1);
    expect('temperature' in bodies[0]!).toBe(false);
  });

  it('OpenRouter arm: no temperature declared anywhere → body has NO temperature key', async () => {
    const client = createInferenceClient({ baseUrl: OPENROUTER_BASE_URL, model: 'm' });

    await client.complete(baseRequest);

    expect(bodies).toHaveLength(1);
    expect('temperature' in bodies[0]!).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Acceptance 1d: request-level values win on collision (existing :83-85 merge
  // doctrine, mirrored from `requestEnableThinking ?? enableThinking`).
  // -----------------------------------------------------------------------

  it('local arm: request-level temperature 0.7 beats config temperature 0', async () => {
    const client = createInferenceClient({ baseUrl: LOCAL_BASE_URL, model: 'm', temperature: 0 });

    await client.complete({ ...baseRequest, temperature: 0.7 });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.temperature).toBe(0.7);
  });

  it('OpenRouter arm: request-level temperature 0.7 beats config temperature 0', async () => {
    const client = createInferenceClient({ baseUrl: OPENROUTER_BASE_URL, model: 'm', temperature: 0 });

    await client.complete({ ...baseRequest, temperature: 0.7 });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.temperature).toBe(0.7);
  });

  it('local arm: request-level temperature 0 beats config temperature 0.7 (falsy request value still wins)', async () => {
    const client = createInferenceClient({ baseUrl: LOCAL_BASE_URL, model: 'm', temperature: 0.7 });

    await client.complete({ ...baseRequest, temperature: 0 });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.temperature).toBe(0);
  });

  it('request-level temperature alone still forwards unchanged (no config temperature)', async () => {
    const client = createInferenceClient({ baseUrl: LOCAL_BASE_URL, model: 'm' });

    await client.complete({ ...baseRequest, temperature: 0.42 });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.temperature).toBe(0.42);
  });

  // -----------------------------------------------------------------------
  // Acceptance 1e: no one-shot state — a second complete() on the same client
  // still forwards the config temperature.
  // -----------------------------------------------------------------------

  it('config temperature survives a second complete() call (no one-shot state)', async () => {
    const client = createInferenceClient({ baseUrl: LOCAL_BASE_URL, model: 'm', temperature: 0 });

    await client.complete(baseRequest);
    await client.complete(baseRequest);

    expect(bodies).toHaveLength(2);
    expect(bodies[0]!.temperature).toBe(0);
    expect(bodies[1]!.temperature).toBe(0);
  });

  // -----------------------------------------------------------------------
  // normalizeRequest is shared by the streaming path too (fetchCompletion).
  // -----------------------------------------------------------------------

  it('streaming path forwards the declared config temperature as well', async () => {
    captureFetch(true);
    const client = createInferenceClient({ baseUrl: LOCAL_BASE_URL, model: 'm', temperature: 0 });

    for await (const _chunk of client.completeStream(baseRequest)) {
      // drain
    }

    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.temperature).toBe(0);
  });
});
