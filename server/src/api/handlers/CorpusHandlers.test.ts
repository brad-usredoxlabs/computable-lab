/**
 * CorpusHandlers tests — the SPA→moat bridge.
 *
 * - returns {ok:false,error:'corpus.disabled'} when the corpus is disabled
 * - forwards a valid body to postCorpusEntry and returns its result shape
 * - rejects unknown sources before forwarding
 * - empty body → corpus.empty-body
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../../config/types.js';

const mockPostCorpusEntry = vi.hoisted(() => vi.fn());
const mockResolveCorpusConfig = vi.hoisted(() => vi.fn());

vi.mock('../../corpus/CorpusClient.js', () => ({
  postCorpusEntry: mockPostCorpusEntry,
  resolveCorpusConfig: mockResolveCorpusConfig,
}));

import { createCorpusHandlers } from './CorpusHandlers.js';

function makeReply() {
  let statusCode = 200;
  let body: unknown;
  const reply = {
    status(code: number) {
      statusCode = code;
      return reply;
    },
    code(code: number) {
      statusCode = code;
      return reply;
    },
    send(payload: unknown) {
      body = payload;
      return reply;
    },
  } as unknown as FastifyReply;
  return {
    reply,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
  };
}

function makeRequest(body: unknown) {
  return { body, log: { warn: vi.fn() } } as unknown as FastifyRequest<{ Body: typeof body }>;
}

const VALID_BODY = {
  source: 'event-editor',
  sourceType: 'app',
  prompt: { user: 'build a ROS assay' },
  acceptedGraph: { events: [{ eventGraphId: 'EVG-0002' }] },
  confirmedBy: 'accepted-EVG',
};

describe('CorpusHandlers.saveCorpusEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveCorpusConfig.mockReturnValue({ enabled: true, serviceBaseUrl: 'http://127.0.0.1:8790' });
  });

  it('forwards to postCorpusEntry which returns corpus.disabled when disabled', async () => {
    mockResolveCorpusConfig.mockReturnValue({ enabled: false, serviceBaseUrl: 'http://x' });
    mockPostCorpusEntry.mockResolvedValue({ ok: false, error: 'corpus.disabled' });
    const handlers = createCorpusHandlers({ appConfig: { corpus: { enabled: false } } as AppConfig });
    const { reply } = makeReply();
    const res = await handlers.saveCorpusEntry(makeRequest(VALID_BODY), reply);
    expect(res).toEqual({ ok: false, error: 'corpus.disabled' });
    expect(mockPostCorpusEntry).toHaveBeenCalledTimes(1);
  });

  it('forwards a valid body to postCorpusEntry and returns its result', async () => {
    mockPostCorpusEntry.mockResolvedValue({ ok: true, entryId: 'ENT-1', deduped: false });
    const handlers = createCorpusHandlers({ appConfig: { corpus: { enabled: true } } as AppConfig });
    const { reply } = makeReply();
    const res = await handlers.saveCorpusEntry(makeRequest(VALID_BODY), reply);
    expect(mockPostCorpusEntry).toHaveBeenCalledTimes(1);
    expect(mockPostCorpusEntry.mock.calls[0]?.[0]).toEqual(VALID_BODY);
    expect(mockPostCorpusEntry.mock.calls[0]?.[1]).toEqual({ enabled: true, serviceBaseUrl: 'http://127.0.0.1:8790' });
    expect(res).toEqual({ ok: true, entryId: 'ENT-1', deduped: false });
  });

  it('rejects an unknown source before forwarding', async () => {
    const handlers = createCorpusHandlers({});
    const { reply } = makeReply();
    const res = await handlers.saveCorpusEntry(
      makeRequest({ ...VALID_BODY, source: 'preview-ghost' }),
      reply,
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain('corpus.bad-source');
    expect(mockPostCorpusEntry).not.toHaveBeenCalled();
  });

  it('returns corpus.empty-body when no body is sent', async () => {
    const handlers = createCorpusHandlers({});
    const { reply } = makeReply();
    const res = await handlers.saveCorpusEntry(makeRequest(undefined), reply);
    expect(res).toEqual({ ok: false, error: 'corpus.empty-body' });
    expect(mockPostCorpusEntry).not.toHaveBeenCalled();
  });
});