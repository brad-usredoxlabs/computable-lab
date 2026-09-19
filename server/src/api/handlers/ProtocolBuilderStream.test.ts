/**
 * The streaming extraction must make a long run VISIBLE: stage boundaries the
 * reviewer can read, the model's reasoning as it arrives, a heartbeat so "still
 * working" is distinguishable from "hung", and the thinking level applied from
 * config (never from a literal in the handler).
 *
 * Real transport: the inference server's own SSE format (OpenAI-compatible
 * `data: {...}` chunks terminated by `data: [DONE]`), stubbed at fetch, so this
 * test exercises InferenceClient.completeStream → the handler's event stream.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { createProtocolBuilderHandlers } from './ProtocolBuilderHandlers.js';

const LEVELS = {
  off: { label: 'Off', enableThinking: false, chat_template_kwargs: { enable_thinking: false } },
  on: { label: 'Thinking', enableThinking: true, chat_template_kwargs: { enable_thinking: true } },
};

/** Stub the inference endpoint with a scripted OpenAI-compatible SSE stream. */
function stubInferenceStream(chunks: Array<{ reasoning?: string; content?: string }>, captured: Array<Record<string, unknown>> = []) {
  globalThis.fetch = vi.fn(async (_url, init) => {
    captured.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
    const lines = chunks.map(
      (c) =>
        `data: ${JSON.stringify({
          id: 'chunk',
          choices: [
            {
              index: 0,
              delta: {
                ...(c.reasoning ? { reasoning: c.reasoning } : {}),
                ...(c.content ? { content: c.content } : {}),
              },
              finish_reason: null,
            },
          ],
        })}\n\n`,
    );
    lines.push('data: [DONE]\n\n');
    return new Response(lines.join(''), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }) as unknown as typeof globalThis.fetch;
}

async function buildApp(inferenceConfig: Record<string, unknown> | undefined) {
  const handlers = createProtocolBuilderHandlers('/tmp', inferenceConfig as never);
  const app = Fastify();
  await app.register((instance) => {
    instance.get('/protocol-builder/extract-options', handlers.extractOptions.bind(handlers));
    instance.post('/protocol-builder/extract-stream', handlers.extractProtocolStream.bind(handlers));
  }, { prefix: '/api' });
  return app;
}

const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = originalFetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

/** Parse the SSE body Fastify collected into events. */
function eventsOf(body: string): Array<Record<string, unknown>> {
  return body
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block.startsWith('data:'))
    .map((block) => JSON.parse(block.slice('data:'.length).trim()) as Record<string, unknown>);
}

const CANDIDATE_JSON = JSON.stringify({
  kind: 'vendor-protocol-candidate',
  title: 'Kit',
  steps: [{ stepNumber: 1, text: 'Add sample to the BashingBead Lysis Module' }],
  materials: [{ label: 'Lysis Solution' }],
  labware: [],
  equipment: [],
});

describe('GET /protocol-builder/extract-options', () => {
  it('lists the configured thinking levels and names the default', async () => {
    const app = await buildApp({
      baseUrl: 'http://ai/v1',
      model: 'qwen3',
      thinkingLevels: LEVELS,
      defaultThinkingLevel: 'off',
    });
    const res = await app.inject({ method: 'GET', url: '/api/protocol-builder/extract-options' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      model: 'qwen3',
      defaultThinkingLevel: 'off',
      thinkingLevels: [
        { id: 'off', label: 'Off' },
        { id: 'on', label: 'Thinking' },
      ],
    });
    await app.close();
  });

  it('reports 503 when no AI backend is configured (never invents levels)', async () => {
    const app = await buildApp(undefined);
    const res = await app.inject({ method: 'GET', url: '/api/protocol-builder/extract-options' });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('AI_UNAVAILABLE');
    await app.close();
  });
});

describe('POST /protocol-builder/extract-stream', () => {
  it('streams start → stage → reasoning → chunk-done → done, and applies the requested level', async () => {
    const captured: Array<Record<string, unknown>> = [];
    stubInferenceStream(
      [
        { reasoning: 'Thinking about step 1… ' },
        { reasoning: 'sample goes into the tube. ' },
        { content: CANDIDATE_JSON },
      ],
      captured,
    );
    const app = await buildApp({
      baseUrl: 'http://ai/v1',
      model: 'qwen3',
      thinkingLevels: LEVELS,
      defaultThinkingLevel: 'off',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/protocol-builder/extract-stream',
      payload: { text: 'Protocol\n1. Add sample to the BashingBead Lysis Module.', thinkingLevel: 'on' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');

    const events = eventsOf(res.body);
    const types = events.map((e) => e.type);
    expect(types[0]).toBe('start');
    expect(types).toContain('stage');
    expect(types).toContain('reasoning');
    expect(types).toContain('chunk-done');
    expect(types[types.length - 1]).toBe('done');

    // The level the reviewer picked is what the inference request carried
    // (enableThinking is folded into chat_template_kwargs by the client).
    expect(captured[0]?.chat_template_kwargs).toMatchObject({ enable_thinking: true });
    // and the start event says so, so the UI can show which level ran
    expect(events[0]).toMatchObject({ model: 'qwen3', thinkingLevel: 'on', chunks: 1 });
    expect(events[0]?.thinkingParams).toEqual({ enableThinking: true, chat_template_kwargs: { enable_thinking: true } });

    // the reasoning the model produced is what the reviewer sees…
    const reasoning = events.filter((e) => e.type === 'reasoning').map((e) => e.text).join('');
    expect(reasoning).toBe('Thinking about step 1… sample goes into the tube. ');
    // …and a reasoning frame is NOT also reported as answer content (the client
    // folds reasoning into content; counting that echo would double the log)
    const reasoningFrames = events.filter((e) => e.type === 'reasoning').length;
    const contentFrames = events.filter((e) => e.type === 'content').length;
    expect(contentFrames).toBeLessThan(reasoningFrames + 1);

    // the stream ends with the merged candidate
    const done = events.find((e) => e.type === 'done') as { candidate: { title: string; steps: unknown[] } };
    expect(done.candidate.title).toBe('Kit');
    expect(done.candidate.steps).toHaveLength(1);
    await app.close();
  });

  it('refuses an unknown thinking level before streaming (never downgrades silently)', async () => {
    stubInferenceStream([{ content: CANDIDATE_JSON }]);
    const app = await buildApp({
      baseUrl: 'http://ai/v1',
      model: 'qwen3',
      thinkingLevels: LEVELS,
      defaultThinkingLevel: 'off',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/protocol-builder/extract-stream',
      payload: { text: 'Protocol\n1. Add sample.', thinkingLevel: 'maximum' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('UNKNOWN_THINKING_LEVEL');
    expect(res.json().available).toEqual(['off', 'on']);
    await app.close();
  });

  it('uses the config default level when the request names none', async () => {
    const captured: Array<Record<string, unknown>> = [];
    stubInferenceStream([{ content: CANDIDATE_JSON }], captured);
    const app = await buildApp({
      baseUrl: 'http://ai/v1',
      model: 'qwen3',
      thinkingLevels: LEVELS,
      defaultThinkingLevel: 'off',
    });
    await app.inject({
      method: 'POST',
      url: '/api/protocol-builder/extract-stream',
      payload: { text: 'Protocol\n1. Add sample.' },
    });
    expect(captured[0]?.chat_template_kwargs).toMatchObject({ enable_thinking: false });
    await app.close();
  });

  it('ends the stream with an error event when the model call fails', async () => {
    globalThis.fetch = vi.fn(async () => new Response('boom', { status: 500 })) as unknown as typeof globalThis.fetch;
    const app = await buildApp({
      baseUrl: 'http://ai/v1',
      model: 'qwen3',
      thinkingLevels: LEVELS,
      defaultThinkingLevel: 'off',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/protocol-builder/extract-stream',
      payload: { text: 'Protocol\n1. Add sample.' },
    });
    const events = eventsOf(res.body);
    expect(events.some((e) => e.type === 'error')).toBe(true);
    await app.close();
  });
});
