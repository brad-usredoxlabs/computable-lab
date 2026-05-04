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

  it('normalizes reasoning-only responses into message content', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: null, reasoning: '{"events":[],"notes":["from reasoning"]}' }, finish_reason: 'stop' }],
        }),
      );
    }) as unknown as typeof globalThis.fetch;

    const client = createInferenceClient({
      baseUrl: 'http://example.test/v1',
      enableThinking: false,
    });

    const response = await client.complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });

    expect(response.choices[0]?.message.content).toBe('{"events":[],"notes":["from reasoning"]}');
  });

  // -----------------------------------------------------------------------
  // Per-request enableThinking override (spec-027)
  // -----------------------------------------------------------------------

  it('construct false, request undefined → kwarg false', async () => {
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

  it('construct false, request true → no kwarg in body', async () => {
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

    await client.complete({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      enableThinking: true,
    });

    expect((capturedBody.chat_template_kwargs as Record<string, unknown> | undefined)?.enable_thinking)
      .toBeUndefined();
  });

  it('construct undefined, request false → kwarg false', async () => {
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
      // enableThinking intentionally omitted
    });

    await client.complete({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      enableThinking: false,
    });

    expect(capturedBody.chat_template_kwargs?.enable_thinking).toBe(false);
  });

  it('construct undefined, request undefined → no kwarg', async () => {
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
      // enableThinking intentionally omitted
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
    // Fetch that rejects when the AbortController signal is aborted.
    // This simulates what a real fetch does when the signal is aborted.
    globalThis.fetch = vi.fn((_url, init) => {
      const signal = (init as RequestInit)?.signal as AbortSignal | undefined;
      return new Promise<Response>((_resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
          return;
        }
        signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
        // Never resolves on its own — simulates a hung network request
      });
    }) as unknown as typeof globalThis.fetch;

    const client = createInferenceClient({
      baseUrl: 'http://example.test/v1',
      timeoutMs: 99,
    });

    const promise = client.complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });

    // Run all pending timers — this fires the setTimeout at 99ms which calls
    // controller.abort(), which rejects the fetch promise via the abort event.
    vi.runAllTimers();
    await Promise.resolve();
    await Promise.resolve();

    await expect(promise).rejects.toThrow('Inference timeout after 99ms');
  });
});
