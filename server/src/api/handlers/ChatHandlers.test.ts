import { describe, expect, it, vi } from 'vitest';
import { ChatHandlers } from './ChatHandlers.js';
import type { AppConfig } from '../../config/types.js';

const APP_CONFIG: AppConfig = {
  server: { port: 3001, host: '0.0.0.0', logLevel: 'info', dataDir: '~/.computable-lab', workspaceDir: '~/x', cors: { enabled: true, origins: ['*'] } },
  schemas: { source: 'bundled', bundledDir: './schema' },
  repositories: [],
  ai: {
    activeProfile: 'ornith',
    profiles: {
      ornith: {
        inference: {
          provider: 'openai-compatible',
          baseUrl: 'http://thunderbeast:8080/v1',
          model: 'singlespark-qwen3.8-flash-next',
        },
        agent: {},
      },
    },
    inference: {
      baseUrl: 'http://thunderbeast:8080/v1',
      model: 'singlespark-qwen3.8-flash-next',
    },
    agent: {},
  },
};

/**
 * Build a web ReadableStream that emits OpenAI-format SSE lines:
 *   data: {...}\n\n ... data: [DONE]\n\n
 */
function openaiSSEStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        // Each SSE event is a data: line followed by a blank line.
        controller.enqueue(encoder.encode(`data: ${line}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

interface FakeRaw {
  writeHead: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
}

function makeReply() {
  const raw: FakeRaw = {
    writeHead: vi.fn(),
    write: vi.fn((s: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (raw as any).written.push(String(s));
    }),
    end: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
  };
  (raw as unknown as { written: string[] }).written = [] as string[];
  const reply = {
    raw,
    status: vi.fn(function status(this: unknown) {
      return this;
    }),
    send: vi.fn(),
  };
  return reply;
}

const written = (raw: FakeRaw) => (raw as unknown as { written: string[] }).written.join('');

describe('ChatHandlers.streamChat', () => {
  it('proxies an OpenAI-compatible /chat/completions stream to the client SSE shape', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        openaiSSEStream([
          JSON.stringify({ id: 'c1', choices: [{ index: 0, delta: { content: 'Hel' } }] }),
          JSON.stringify({ id: 'c1', choices: [{ index: 0, delta: { content: 'lo' } }] }),
        ]),
        { status: 200 },
      );
    });

    const handlers = new ChatHandlers({ getAppConfig: () => APP_CONFIG, fetchImpl });
    const reply = makeReply();

    await handlers.streamChat(
      {
        headers: {},
        body: { profileName: 'ornith', messages: [{ role: 'user', content: 'hi' }] },
        log: { warn: vi.fn() },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply as any,
    );

    // Upstream requested from the OpenAI-compatible endpoint (baseUrl kept
    // intact, stream: true), NOT the Ollama-native /api/chat.
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://thunderbeast:8080/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"model":"singlespark-qwen3.8-flash-next"'),
      }),
    );

    const out = written(reply.raw);

    // Each OpenAI delta translated into the client `{message:{content}}` shape.
    expect(out).toContain('data: {"message":{"content":"Hel"}}');
    expect(out).toContain('data: {"message":{"content":"lo"}}');
    // The [DONE] sentinel becomes the client `{done:true}` event.
    expect(out).toContain('data: {"done":true}');
    expect(reply.raw.end).toHaveBeenCalled();
  });

  it('forwards reasoning deltas (chain-of-thought) as reasoning events', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        openaiSSEStream([
          JSON.stringify({ id: 'c1', choices: [{ index: 0, delta: { reasoning: 'We ' } }] }),
          JSON.stringify({ id: 'c1', choices: [{ index: 0, delta: { reasoning: 'answer' } }] }),
          JSON.stringify({ id: 'c1', choices: [{ index: 0, delta: { content: '102' } }] }),
        ]),
        { status: 200 },
      );
    });

    const handlers = new ChatHandlers({ getAppConfig: () => APP_CONFIG, fetchImpl });
    const reply = makeReply();
    await handlers.streamChat(
      {
        headers: {},
        body: { profileName: 'ornith', messages: [{ role: 'user', content: '17 x 6?' }] },
        log: { warn: vi.fn() },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply as any,
    );

    const out = written(reply.raw);
    expect(out).toContain('data: {"type":"reasoning","content":"We "}');
    expect(out).toContain('data: {"type":"reasoning","content":"answer"}');
    // Final answer still surfaces as the content shape.
    expect(out).toContain('data: {"message":{"content":"102"}}');
    expect(out).toContain('data: {"done":true}');
  });

  it('rejects an empty messages array with 400', async () => {
    const handlers = new ChatHandlers({ getAppConfig: () => APP_CONFIG });
    const reply = makeReply();
    await handlers.streamChat(
      {
        headers: {},
        body: { messages: [] },
        log: { warn: vi.fn() },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply as any,
    );
    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalled();
  });

  it('uses the active profile when profileName is omitted', async () => {
    const fetchImpl = vi.fn(async () => new Response(openaiSSEStream([]), { status: 200 }));
    const handlers = new ChatHandlers({ getAppConfig: () => APP_CONFIG, fetchImpl });
    const reply = makeReply();
    await handlers.streamChat(
      {
        headers: {},
        body: { messages: [{ role: 'user', content: 'hi' }] },
        log: { warn: vi.fn() },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply as any,
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://thunderbeast:8080/v1/chat/completions',
      expect.objectContaining({ body: expect.stringContaining('"model":"singlespark-qwen3.8-flash-next"') }),
    );
  });
});