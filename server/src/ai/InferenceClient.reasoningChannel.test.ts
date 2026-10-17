/**
 * W2-89 g2b-3 (RED) — the reasoning/answer CHANNEL BOUNDARY.
 *
 * The gate found raw chain-of-thought rendered verbatim as the assistant
 * bubble. The merge point is InferenceClient.normalizeReasoningDelta: it
 * FOLDED a reasoning-only delta into `content`, and the orchestrator streams
 * `content` as `text_delta` — so hidden reasoning rode the answer channel.
 * (The three other streaming consumers — FoundryCoderPatch,
 * EventEditorFixHandlers, ProtocolBuilderHandlers — each had to defensively
 * SKIP that echo; the lane's assumption file named the merge.)
 *
 * The boundary rule this test pins: on the STREAM path, reasoning stays on
 * the reasoning fields — `content` is NEVER synthesized from reasoning.
 * The BLOCKING path (complete/normalizeReasoningContent) keeps its fold for
 * callers that only read content.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInferenceClient } from './InferenceClient.js';
import type { StreamChunk } from './types.js';

function sseResponse(frames: string[]): {
  ok: boolean;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
  body: ReadableStream<Uint8Array>;
} {
  const encoder = new TextEncoder();
  return {
    ok: true,
    text: async () => '',
    json: async () => ({}),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const frame of frames) controller.enqueue(encoder.encode(frame));
        controller.close();
      },
    }),
  };
}

async function collect(client: ReturnType<typeof createInferenceClient>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of client.completeStream({ model: 'm', messages: [{ role: 'user', content: 'hi' }] })) {
    chunks.push(chunk);
  }
  return chunks;
}

describe('InferenceClient reasoning channel (W2-89 g2b-3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a reasoning-only stream chunk keeps reasoning on the reasoning fields and NEVER synthesizes content', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
      'data: {"id":"c1","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":"The user wants to change the SAID document…","reasoning":"The user wants to change the SAID document…"},"finish_reason":null}]}\n\n',
      'data: [DONE]\n\n',
    ])));
    const client = createInferenceClient({ baseUrl: 'http://mock:8899/v1', model: 'm' });
    const chunks = await collect(client);
    const delta = chunks[0]?.choices[0]?.delta as Record<string, unknown>;
    expect(typeof delta['reasoning_content']).toBe('string');
    // THE boundary: hidden reasoning must not ride the answer channel.
    expect(delta['content']).toBeUndefined();
  });

  it('a real content delta passes through untouched alongside reasoning', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
      'data: {"id":"c1","choices":[{"index":0,"delta":{"role":"assistant","content":"Vendor documents are immutable.","reasoning_content":"internal thought"},"finish_reason":null}]}\n\n',
      'data: [DONE]\n\n',
    ])));
    const client = createInferenceClient({ baseUrl: 'http://mock:8899/v1', model: 'm' });
    const chunks = await collect(client);
    const delta = chunks[0]?.choices[0]?.delta as Record<string, unknown>;
    expect(delta['content']).toBe('Vendor documents are immutable.');
    expect(delta['reasoning_content']).toBe('internal thought');
  });

  it('the BLOCKING complete() path keeps its reasoning->content fallback (blocking callers read content)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      text: async () => '',
      json: async () => ({
        id: 'r1',
        choices: [{ index: 0, message: { role: 'assistant', content: null, reasoning_content: 'the only text the provider returned' }, finish_reason: 'stop' }],
      }),
    })));
    const client = createInferenceClient({ baseUrl: 'http://mock:8899/v1', model: 'm' });
    const res = await client.complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.choices[0]?.message.content).toBe('the only text the provider returned');
  });
});
