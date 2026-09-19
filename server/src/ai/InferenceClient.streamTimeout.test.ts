/**
 * Streaming timeouts: a LONG generation is normal, SILENCE is the failure.
 *
 * The bug this pins: `completeStream` armed ONE timer for the whole request
 * (`timeoutMs`, default 120 000ms). A large vendor PDF's second chunk with
 * thinking on legitimately ran longer than two minutes and was killed mid-stream
 * — the reviewer saw "Inference stream timeout after 120000ms" on a healthy run.
 * These tests use real timers and tiny delays to keep that behaviour honest.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInferenceClient } from './InferenceClient.js';
import type { StreamChunk } from './types.js';

function frame(text: string): string {
  return `data: ${JSON.stringify({
    id: 'c',
    choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
  })}\n\n`;
}

/**
 * An SSE body that emits `frames` every `intervalMs`, then optionally stalls.
 *
 * It is ABORT-AWARE: a real fetch errors the body reader when its signal
 * aborts, so the stub must too, or a test of the stall path would hang in
 * `reader.read()` forever instead of exercising the client's error mapping.
 */
function stubStream(options: {
  frames: string[];
  intervalMs: number;
  stallAfter?: boolean;
}): void {
  const encoder = new TextEncoder();
  globalThis.fetch = vi.fn(async (_url, init) => {
    const signal = (init as RequestInit | undefined)?.signal as AbortSignal | undefined;
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const onAbort = (): void => {
          try {
            controller.error(new DOMException('The operation was aborted.', 'AbortError'));
          } catch {
            // already closed
          }
        };
        signal?.addEventListener('abort', onAbort);
        for (const f of options.frames) {
          if (signal?.aborted) return;
          await new Promise((r) => setTimeout(r, options.intervalMs));
          if (signal?.aborted) return;
          try {
            controller.enqueue(encoder.encode(f));
          } catch {
            return;
          }
        }
        if (options.stallAfter) return; // never closes: a dead stream
        try {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch {
          // aborted mid-flight
        }
      },
    });
    return new Response(body, { status: 200 });
  }) as unknown as typeof globalThis.fetch;
}

async function collect(iterable: AsyncIterable<StreamChunk>): Promise<string> {
  let out = '';
  for await (const chunk of iterable) {
    out += chunk.choices?.[0]?.delta?.content ?? '';
  }
  return out;
}

const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = originalFetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('completeStream timeouts', () => {
  it('lets a stream outlive timeoutMs as long as data keeps arriving', async () => {
    // 6 frames * 30ms = 180ms of generation, while timeoutMs is only 50ms.
    // The old total-duration timer aborted this at 50ms.
    stubStream({ frames: ['a', 'b', 'c', 'd', 'e', 'f'].map(frame), intervalMs: 30 });
    const client = createInferenceClient({
      baseUrl: 'http://example.test/v1',
      timeoutMs: 50,
      streamIdleTimeoutMs: 5_000,
    });

    await expect(
      collect(client.completeStream({ model: 'm', messages: [{ role: 'user', content: 'go' }] })),
    ).resolves.toBe('abcdef');
  });

  it('aborts when the server goes silent, with a stall message that says what to raise', async () => {
    stubStream({ frames: [frame('partial')], intervalMs: 5, stallAfter: true });
    const client = createInferenceClient({
      baseUrl: 'http://example.test/v1',
      timeoutMs: 10_000,
      streamIdleTimeoutMs: 60,
    });

    await expect(
      collect(client.completeStream({ model: 'm', messages: [{ role: 'user', content: 'go' }] })),
    ).rejects.toThrow(/stalled: no data for 60ms/);
  });

  it('honours an explicit hard ceiling when one is configured', async () => {
    stubStream({ frames: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(frame), intervalMs: 25 });
    const client = createInferenceClient({
      baseUrl: 'http://example.test/v1',
      streamIdleTimeoutMs: 5_000,
      streamMaxMs: 60,
    });

    await expect(
      collect(client.completeStream({ model: 'm', messages: [{ role: 'user', content: 'go' }] })),
    ).rejects.toThrow(/exceeded the configured maximum 60ms/);
  });
});