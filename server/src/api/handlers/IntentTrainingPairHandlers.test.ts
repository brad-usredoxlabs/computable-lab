import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  postCorpusEntry: vi.fn(async (_input: unknown, _cfg?: unknown) => ({ ok: true, entryId: 'CRM-1' })),
  resolveCorpusConfig: vi.fn(() => ({ enabled: true, serviceBaseUrl: 'http://corpus:8790' })),
}));

vi.mock('../../corpus/CorpusClient.js', () => ({
  postCorpusEntry: mocks.postCorpusEntry,
  resolveCorpusConfig: mocks.resolveCorpusConfig,
}));

import { createIntentTrainingPairHandlers } from './IntentTrainingPairHandlers.js';

const postCorpusEntry = mocks.postCorpusEntry;

const ctx = { appConfig: undefined } as never;
function mockRequest(body: unknown) { return { body, log: { error: vi.fn() } }; }
function send() {
  const calls: Array<{ status?: number; payload?: unknown }> = [];
  let s: number | undefined;
  const r = {
    status(code: number) { s = code; return r; },
    send(payload: unknown) { calls.push({ status: s, payload }); return r; },
  };
  return { r, calls };
}

describe('createIntentTrainingPairHandlers', () => {
  beforeEach(() => {
    postCorpusEntry.mockClear();
  });

  it('posts the whole accepted flow to the corpus as a macro-focused training pair', async () => {
    const h = createIntentTrainingPairHandlers(ctx);
    const reply = send();
    await h.saveTrainingPair(
      mockRequest({
        userPrompt: 'localize this zymo protocol for my lab',
        thread: [
          { role: 'user', content: 'use the Beckman centrifuge for step 5' },
          { role: 'assistant', content: 'done - revised step 5 to Beckman' },
        ],
        sourceProtocolId: 'prt-zymo',
        acceptedProtocolId: 'LPR-zymo-x',
        localMacro: {
          intentId: 'zymo-local',
          actions: [
            { action: 'spin', rpm: 4000, duration: '5 min' },
            { action: 'transfer', source: 'block', target: 'magstand', volumeUl: 200 },
          ],
        },
        acceptedGraph: { events: [{ eventId: 'e1', event_type: 'transfer' }], labwares: {} },
        confirmedAt: '2026-08-22T00:00:00Z',
      }) as never,
      reply.r as never,
    );

    expect(reply.calls[0].payload).toMatchObject({ ok: true, entryId: 'CRM-1' });
    expect(postCorpusEntry).toHaveBeenCalledTimes(1);

    const entry = (postCorpusEntry.mock.calls[0] as unknown[])[0] as any;
    expect(entry.source).toBe('protocol-loop');
    expect(entry.confirmedBy).toBe('user');
    // gold model tag (Q4)
    expect(entry.goldModel).toBe('deepseek-v4-flash-0731');
    // the macro-targeted training prompt: includes user request + thread + ACCEPTED MACRO
    expect(entry.prompt.user).toContain('localize this zymo protocol for my lab');
    expect(entry.prompt.user).toContain('use the Beckman centrifuge');
    expect(entry.prompt.user).toContain('ACCEPTED MACRO');
    expect(entry.prompt.user).toContain('"action":"spin"');
    // step_context carries the macro + source/accepted ids
    expect(entry.prompt.step_context?.localMacro).toMatchObject({ intentId: 'zymo-local' });
    expect(entry.prompt.step_context?.sourceProtocolId).toBe('prt-zymo');
    expect(entry.prompt.step_context?.acceptedProtocolId).toBe('LPR-zymo-x');
    expect(entry.acceptedGraph).toMatchObject({ events: [{ eventId: 'e1' }] });
  });

  it('is best-effort — never throws when corpus post fails', async () => {
    postCorpusEntry.mockResolvedValueOnce({ ok: false, error: 'http_500' });
    const h = createIntentTrainingPairHandlers(ctx);
    const reply = send();
    await h.saveTrainingPair(
      mockRequest({ userPrompt: 'x', acceptedGraph: { events: [] }, localMacro: { intentId: 'm' } }) as never,
      reply.r as never,
    );
    expect(reply.calls[0].payload).toMatchObject({ ok: false, error: 'http_500' });
  });
});