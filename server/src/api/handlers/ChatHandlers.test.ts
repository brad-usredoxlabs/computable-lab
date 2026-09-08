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
          baseUrl: 'http://100.111.141.22:11434/v1',
          model: 'ornith-1.0-9b:latest',
        },
        agent: {},
      },
    },
    inference: {
      baseUrl: 'http://100.111.141.22:11434/v1',
      model: 'ornith-1.0-9b:latest',
    },
    agent: {},
  },
};

/** Build a web ReadableStream that emits each line as a UTF-8 NDJSON line. */
function ndjsonStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`${line}\n`));
      }
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
  it('proxies Ollama NDJSON to SSE and emits a timing event with PP + decode tokens/s', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        ndjsonStream([
          JSON.stringify({ model: 'x', message: { role: 'assistant', content: 'Hel' }, done: false }),
          JSON.stringify({ model: 'x', message: { role: 'assistant', content: 'lo' }, done: false }),
          JSON.stringify({
            model: 'x',
            message: { role: 'assistant', content: '' },
            done: true,
            done_reason: 'stop',
            prompt_eval_count: 17,
            prompt_eval_duration: 115785000,
            eval_count: 1808,
            eval_duration: 58549794000,
          }),
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

    const out = written(reply.raw);

    // Upstream requested from the NATIVE endpoint with /v1 stripped.
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://100.111.141.22:11434/api/chat',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"model":"ornith-1.0-9b:latest"'),
      }),
    );

    // Each NDJSON chunk forwarded as one SSE data: event.
    expect(out).toContain('data: {"model":"x","message":{"role":"assistant","content":"Hel"},"done":false}');
    expect(out).toContain('data: {"model":"x","message":{"role":"assistant","content":"lo"},"done":false}');

    // Final timing event with computed rates:
    //   pp = 17 / (115785000 / 1e9) = 146.8
    //   decode = 1808 / (58549794000 / 1e9) = 30.9
    expect(out).toContain('"type":"timing"');
    expect(out).toContain('"ppTokensPerSec":146.');
    expect(out).toContain('"decodeTokensPerSec":30.');
    expect(reply.raw.end).toHaveBeenCalled();
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
    const fetchImpl = vi.fn(async () => new Response(ndjsonStream([]), { status: 200 }));
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
      'http://100.111.141.22:11434/api/chat',
      expect.objectContaining({ body: expect.stringContaining('"model":"ornith-1.0-9b:latest"') }),
    );
  });
});
