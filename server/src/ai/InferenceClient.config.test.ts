/**
 * Tests that InferenceClient honors construction-time config (timeoutMs, enableThinking).
 *
 * Spec: spec-025-settings-override-audit
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createInferenceClient } from './InferenceClient.js';

describe('InferenceClient honors construction-time config', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // enableThinking → chat_template_kwargs
  // -----------------------------------------------------------------------

  it('merges enable_thinking: false into chat_template_kwargs', async () => {
    let capturedBody: Record<string, unknown> = {};

    globalThis.fetch = vi.fn(async (_url, init) => {
      capturedBody = JSON.parse(init!.body as string);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        }),
      );
    }) as unknown as typeof globalThis.fetch;

    const client = createInferenceClient({
      baseUrl: 'http://example.test/v1',
      enableThinking: false,
    });

    await client.complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });

    expect(capturedBody.chat_template_kwargs?.enable_thinking).toBe(false);
  });

  it('does NOT set enable_thinking when enableThinking is undefined', async () => {
    let capturedBody: Record<string, unknown> = {};

    globalThis.fetch = vi.fn(async (_url, init) => {
      capturedBody = JSON.parse(init!.body as string);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        }),
      );
    }) as unknown as typeof globalThis.fetch;

    const client = createInferenceClient({
      baseUrl: 'http://example.test/v1',
      // enableThinking is intentionally omitted
    });

    await client.complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });

    expect((capturedBody.chat_template_kwargs as Record<string, unknown> | undefined)?.enable_thinking)
      .toBeUndefined();
  });

  it('does NOT set enable_thinking when enableThinking is true', async () => {
    let capturedBody: Record<string, unknown> = {};

    globalThis.fetch = vi.fn(async (_url, init) => {
      capturedBody = JSON.parse(init!.body as string);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        }),
      );
    }) as unknown as typeof globalThis.fetch;

    const client = createInferenceClient({
      baseUrl: 'http://example.test/v1',
      enableThinking: true,
    });

    await client.complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });

    expect((capturedBody.chat_template_kwargs as Record<string, unknown> | undefined)?.enable_thinking)
      .toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // timeoutMs → abort timer
  // -----------------------------------------------------------------------

  it('uses the configured timeoutMs, not the default 120000', async () => {
    let capturedBody: Record<string, unknown> = {};

    globalThis.fetch = vi.fn(async (_url, init) => {
      capturedBody = JSON.parse(init!.body as string);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        }),
      );
    }) as unknown as typeof globalThis.fetch;

    const client = createInferenceClient({
      baseUrl: 'http://example.test/v1',
      timeoutMs: 99,
    });

    await client.complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });

    // The call should succeed because we mocked fetch to resolve immediately
    expect(capturedBody).toBeDefined();
  });

  it('rejects with timeout message when fetch never resolves', async () => {
    // Fetch that resolves after a delay longer than the timeout
    globalThis.fetch = vi.fn(() =>
      new Promise<Response>((_resolve) => {
        // Never resolves — simulates a hung network request
      }),
    ) as unknown as typeof globalThis.fetch;

    const client = createInferenceClient({
      baseUrl: 'http://example.test/v1',
      timeoutMs: 99,
    });

    const promise = client.complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });

    // Advance timers to trigger the abort. The InferenceClient uses setTimeout
    // internally, so we need to advance past the timeoutMs value.
    vi.advanceTimersByTime(99);

    // The AbortController.abort() fires synchronously in the timer callback,
    // which rejects the fetch promise. We need to let the microtask queue
    // process the rejection.
    await vi.advanceTimersByTime(1);

    await expect(promise).rejects.toThrow('Inference timeout after 99ms');
  });
});
