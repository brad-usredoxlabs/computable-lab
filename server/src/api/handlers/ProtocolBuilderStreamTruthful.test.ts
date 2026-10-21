/**
 * VPDF-4 — the terminal stage tells the truth (spec D1/D2/D3).
 *
 * The PureLink failure family: a thinking model spends its budget on reasoning
 * and never emits the JSON object. Today the stream folds reasoning into the
 * candidate attempt, parses nothing, merges an empty candidate, and still
 * emits `done` — the client paints "Extraction Complete" over zero parsed
 * chunks. That lie is what this suite is RED about.
 *
 * Harness (spec §RED-first test plan): the ProtocolBuilderStream.test.ts
 * pattern — Fastify inject + fetch-stubbed OpenAI-compatible SSE, `captured`
 * request bodies, `eventsOf` collector — extended with PER-CALL scripted arms
 * (the retry leg needs a different answer per call) and usage/finish_reason
 * frames the real endpoint already sends.
 *
 * Arms:
 *  1. all chunks reasoning-without-JSON -> NO `done`; stage FAILED naming the
 *     chunk count; `error` event; fetch count = chunks + retries. THE RED.
 *  2. retry saves it -> `done`, zero error events, fetch count = 3.
 *  3. exactly-one-retry pin (verified-by 3): fetch count === chunks × 2; the
 *     retry carries ONLY the failing chunk's prompt + assistant CONTENT tail
 *     (omitted when content was empty) + the emit-JSON-now turn.
 *  4. partial -> `done` + `Parsed P of M chunks` stage + PARTIAL_CHUNK_COVERAGE
 *     and CHUNK_NO_JSON diagnostics + `preview` head…tail on the failed
 *     chunk-done.
 *  5. force-JSON shape: every captured body carries response_format
 *     {type:'json_object'} and a max_tokens sourced from config (mapped to
 *     max_completion_tokens client-side per InferenceClient) — never a literal.
 *  6. finish_reason 'length' -> the failure text names the maxTokens knob; no
 *     `done` for an all-truncated run.
 *  7. zero-step merge -> FAILED terminal, no `done`, and (seam) the persist
 *     leg is NEVER reached: a zero-parsed run creating a record is the
 *     forbidden case.
 *  8. blocking-path drift guard: `extractProtocol` keeps its old terminal
 *     semantics (empty success with NO_CONTENT, no retry) while sharing the
 *     chunk-call shape.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { createProtocolBuilderHandlers } from './ProtocolBuilderHandlers.js';

const LEVELS = {
  off: { label: 'Off', enableThinking: false, chat_template_kwargs: { enable_thinking: false } },
  on: { label: 'Thinking', enableThinking: true, chat_template_kwargs: { enable_thinking: true } },
};

/** The emit-JSON-now follow-up turn (OQ-1: the retry carries ONLY this chunk). */
const EMIT_JSON_NOW =
  'Output the JSON object in full now. No further analysis, no reasoning prose — ONLY the JSON object.';

interface Arm {
  reasoning?: string;
  content?: string;
  finishReason?: 'stop' | 'length' | null;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

/**
 * Stub the inference endpoint with PER-CALL scripted SSE arms: call k answers
 * with arms[k], so a chunk call and its retry can behave differently.
 */
function stubInferenceCalls(arms: Arm[], captured: Array<Record<string, unknown>> = []) {
  let call = 0;
  globalThis.fetch = vi.fn(async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    captured.push(body);
    const arm = arms[Math.min(call, arms.length - 1)]!;
    call += 1;
    const streaming = body.stream === true;
    if (!streaming) {
      // Blocking complete(): a JSON completion. A reasoning-only answer stays
      // on the reasoning fields — InferenceClient's blocking fold is what the
      // blocking path reads.
      return new Response(JSON.stringify({
        id: 'completion',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            ...(arm.content ? { content: arm.content } : {}),
            ...(arm.reasoning ? { reasoning: arm.reasoning } : {}),
          },
          finish_reason: arm.finishReason ?? 'stop',
        }],
        ...(arm.usage ? { usage: arm.usage } : {}),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const frames: string[] = [];
    if (arm.reasoning) {
      frames.push(JSON.stringify({
        id: 'chunk',
        choices: [{ index: 0, delta: { reasoning: arm.reasoning }, finish_reason: null }],
      }));
    }
    if (arm.content) {
      frames.push(JSON.stringify({
        id: 'chunk',
        choices: [{ index: 0, delta: { content: arm.content }, finish_reason: null }],
      }));
    }
    frames.push(JSON.stringify({
      id: 'chunk',
      choices: [{ index: 0, delta: {}, finish_reason: arm.finishReason ?? 'stop' }],
    }));
    const lines = frames.map((f) => `data: ${f}\n\n`);
    if (arm.usage) {
      lines.push(`data: ${JSON.stringify({ id: 'chunk', choices: [], usage: arm.usage })}\n\n`);
    }
    lines.push('data: [DONE]\n\n');
    return new Response(lines.join(''), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }) as unknown as typeof globalThis.fetch;
}

/** A store double that RECORDS every call — the seam's forbidden case is a call here. */
function recordingStore(calls: string[]) {
  return {
    get: async (id: string) => {
      calls.push(`get:${id}`);
      return null;
    },
    create: async () => {
      calls.push('create');
      return { success: false as const, error: 'must never be called' };
    },
    update: async () => {
      calls.push('update');
      return { success: false as const, error: 'must never be called' };
    },
  } as never;
}

async function buildApp(
  inferenceConfig: Record<string, unknown> | undefined,
  store?: unknown,
) {
  const handlers = createProtocolBuilderHandlers('/tmp', inferenceConfig as never, undefined, store as never);
  const app = Fastify();
  await app.register((instance) => {
    instance.post('/protocol-builder/extract-stream', handlers.extractProtocolStream.bind(handlers));
    instance.post('/protocol-builder/extract', handlers.extractProtocol.bind(handlers));
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

/** Two chunks: >10,000 chars forces chunkText into 2 sections (N=2 in the message). */
const TWO_CHUNK_TEXT =
  'Protocol A\n1. Add sample to tube A.\n\n'.repeat(200) + '\n\n' + 'Protocol B\n2. Read plate B.\n\n'.repeat(200);

/** Reasoning prose with distinctive head and tail fragments for the preview pin. */
function reasoningWithHeadTail(): string {
  const head = 'HEADFRAGMENT: Let me think about the PureLink protocol.';
  const middle = 'x'.repeat(400);
  const tail = 'TAILFRAGMENT: done thinking, produce output now.';
  return `${head}${middle}${tail}`;
}

const CONFIG = {
  baseUrl: 'http://ai/v1',
  model: 'qwen3',
  thinkingLevels: LEVELS,
  defaultThinkingLevel: 'off',
};

describe('VPDF-4 (1): zero parsed chunks ends FAILED, never `done`', () => {
  it('every chunk reasoning-without-JSON -> no done; stage FAILED names the chunk count; error event', async () => {
    const captured: Array<Record<string, unknown>> = [];
    // 2 chunks × (first try + retry), all reasoning-only, no JSON anywhere.
    stubInferenceCalls(
      [
        { reasoning: reasoningWithHeadTail() },
        { reasoning: 'still thinking, no JSON.' },
        { reasoning: reasoningWithHeadTail() },
        { reasoning: 'still thinking, no JSON.' },
      ],
      captured,
    );
    const app = await buildApp(CONFIG);
    const res = await app.inject({
      method: 'POST',
      url: '/api/protocol-builder/extract-stream',
      payload: { text: TWO_CHUNK_TEXT },
    });
    await app.close();

    const events = eventsOf(res.body);
    const types = events.map((e) => e.type);

    // THE LIE: trunk ends this run with `done`. The truthful stream must not.
    expect(types).not.toContain('done');

    const failedStage = events.find(
      (e) => e.type === 'stage' && String(e.message).includes('Extraction failed: no parseable candidate in 2 chunk(s)'),
    );
    expect(failedStage).toBeTruthy();

    const error = events.find((e) => e.type === 'error');
    expect(error).toBeTruthy();
    expect(String(error?.message)).toContain('Extraction failed: no parseable candidate in 2 chunk(s)');

    // one retry per failed chunk: 2 chunks + 2 retries
    expect(captured.length).toBe(4);
  });
});

describe('VPDF-4 (2): the one retry can save a chunk', () => {
  it('chunk 1 reasoning-only then retry returns JSON; chunk 2 parses first try -> done, zero errors, 3 calls', async () => {
    const captured: Array<Record<string, unknown>> = [];
    stubInferenceCalls(
      [
        { reasoning: reasoningWithHeadTail() }, // chunk 1 first try: no JSON
        { content: CANDIDATE_JSON },            // chunk 1 retry: the JSON arrives
        { content: CANDIDATE_JSON },            // chunk 2: parses first try
      ],
      captured,
    );
    const app = await buildApp(CONFIG);
    const res = await app.inject({
      method: 'POST',
      url: '/api/protocol-builder/extract-stream',
      payload: { text: TWO_CHUNK_TEXT },
    });
    await app.close();

    const events = eventsOf(res.body);
    const done = events.find((e) => e.type === 'done');
    expect(done).toBeTruthy();
    const candidate = done?.candidate as { steps: unknown[] };
    expect(candidate.steps.length).toBeGreaterThanOrEqual(1);
    expect(events.some((e) => e.type === 'error')).toBe(false);
    // a retry note is a stage event (existing kind), not a new event kind
    expect(events.some((e) => e.type === 'stage' && String(e.message).includes('Retrying chunk 1 once'))).toBe(true);
    expect(captured.length).toBe(3);
  });
});

describe('VPDF-4 (3): exactly ONE retry per failed chunk (verified-by 3)', () => {
  it('all chunks fail -> fetch count === chunks × 2; the retry carries ONLY the failing chunk: prompt + content tail + emit-JSON-now', async () => {
    const captured: Array<Record<string, unknown>> = [];
    const contentOnlyGarbage = 'PROSEHEAD not json at all ' + 'y'.repeat(400) + ' PROSETAIL';
    stubInferenceCalls(
      [
        { reasoning: reasoningWithHeadTail() },   // chunk 1: reasoning-only
        { reasoning: 'no JSON.' },                // chunk 1 retry
        { content: contentOnlyGarbage },          // chunk 2: content, unparseable
        { content: 'still not json' },            // chunk 2 retry
      ],
      captured,
    );
    const app = await buildApp(CONFIG);
    const res = await app.inject({
      method: 'POST',
      url: '/api/protocol-builder/extract-stream',
      payload: { text: TWO_CHUNK_TEXT },
    });
    await app.close();

    // exactly one follow-up per failed chunk — no loops
    expect(captured.length).toBe(4);

    interface Msg { role: string; content: string }
    const retry1 = captured[1]?.messages as Msg[];
    const retry2 = captured[3]?.messages as Msg[];

    // last turn is the emit-JSON-now instruction
    expect(retry1[retry1.length - 1]?.content).toBe(EMIT_JSON_NOW);
    expect(retry2[retry2.length - 1]?.content).toBe(EMIT_JSON_NOW);

    // first turn is ONLY this chunk's original prompt (OQ-1: no other chunks' content)
    const firstTry1 = captured[0]?.messages as Msg[];
    expect(retry1[0]?.role).toBe('user');
    expect(retry1[0]?.content).toBe(firstTry1[0]?.content);
    expect(retry1[0]?.content).toContain('Section text:');

    // the assistant turn carries the CONTENT channel only:
    // chunk 1 had empty content (reasoning-only) -> the assistant turn is OMITTED
    expect(retry1.length).toBe(2);
    // chunk 2 had content -> a truncated assistant TAIL rides the retry
    expect(retry2.length).toBe(3);
    expect(retry2[1]?.role).toBe('assistant');
    expect(retry2[1]?.content.length).toBeLessThanOrEqual(400);
    expect(retry2[1]?.content).toContain('PROSETAIL');
    // reasoning never rides the assistant turn (channel discipline, bait 5)
    expect(retry2[1]?.content).not.toContain('HEADFRAGMENT');
  });
});

describe('VPDF-4 (4): partial coverage states itself honestly', () => {
  it('1 chunk JSON + 1 chunk reasoning-only -> done + Parsed 1 of 2 chunks stage + coverage diagnostics + preview', async () => {
    const captured: Array<Record<string, unknown>> = [];
    stubInferenceCalls(
      [
        { content: CANDIDATE_JSON },             // chunk 1 parses
        { reasoning: reasoningWithHeadTail() },  // chunk 2 first try: no JSON
        { reasoning: 'RETRYHEAD ' + 'z'.repeat(400) + ' RETRYTAIL no JSON either.' }, // chunk 2 retry: still no JSON
      ],
      captured,
    );
    const app = await buildApp(CONFIG);
    const res = await app.inject({
      method: 'POST',
      url: '/api/protocol-builder/extract-stream',
      payload: { text: TWO_CHUNK_TEXT },
    });
    await app.close();

    const events = eventsOf(res.body);
    const done = events.find((e) => e.type === 'done');
    expect(done).toBeTruthy();

    // coverage line before done, riding the existing stage kind
    const coverage = events.find((e) => e.type === 'stage' && String(e.message).includes('Parsed 1 of 2 chunks'));
    expect(coverage).toBeTruthy();
    expect(events.indexOf(coverage!)).toBeLessThan(events.indexOf(done!));

    // candidate diagnostics join the existing code family
    const candidate = done?.candidate as { diagnostics?: Array<{ code: string }> };
    const codes = (candidate.diagnostics ?? []).map((d) => d.code);
    expect(codes).toContain('PARTIAL_CHUNK_COVERAGE');
    expect(codes).toContain('CHUNK_NO_JSON');

    // the failed chunk-done carries the raw tail preview (head … tail) of the
    // final unparseable answer (the retry's, which replaced the first try)
    const failedChunkDone = events.find((e) => e.type === 'chunk-done' && e.parsed === false);
    expect(failedChunkDone).toBeTruthy();
    const preview = String(failedChunkDone?.preview ?? '');
    expect(preview).toContain('RETRYHEAD');
    expect(preview).toContain('RETRYTAIL');
  });
});

describe('VPDF-4 (5): the chunk call reuses the semantic-pass force-JSON shape', () => {
  it('every captured body carries response_format json_object and max_tokens from config data (mapped client-side)', async () => {
    const captured: Array<Record<string, unknown>> = [];
    stubInferenceCalls([{ content: CANDIDATE_JSON }, { content: CANDIDATE_JSON }], captured);
    const app = await buildApp({ ...CONFIG, maxTokens: 12345 });
    const res = await app.inject({
      method: 'POST',
      url: '/api/protocol-builder/extract-stream',
      payload: { text: TWO_CHUNK_TEXT },
    });
    await app.close();

    expect(captured.length).toBe(2);
    for (const body of captured) {
      expect(body.response_format).toEqual({ type: 'json_object' });
      // the handler builds max_tokens; InferenceClient maps it to
      // max_completion_tokens on the wire (InferenceClient.ts normalizeRequest)
      expect(body.max_completion_tokens).toBe(12345);
    }
  });

  it('no config maxTokens -> no max_tokens on the wire at all (the 8192 literal is gone)', async () => {
    const captured: Array<Record<string, unknown>> = [];
    stubInferenceCalls([{ content: CANDIDATE_JSON }, { content: CANDIDATE_JSON }], captured);
    const app = await buildApp(CONFIG);
    const res = await app.inject({
      method: 'POST',
      url: '/api/protocol-builder/extract-stream',
      payload: { text: TWO_CHUNK_TEXT },
    });
    await app.close();

    for (const body of captured) {
      expect(body).not.toHaveProperty('max_completion_tokens');
      expect(body).not.toHaveProperty('max_tokens');
    }
  });
});

describe('VPDF-4 (6): truncation honesty before parse', () => {
  it('all chunks finish_reason length -> the failure names the maxTokens knob; no done', async () => {
    const captured: Array<Record<string, unknown>> = [];
    stubInferenceCalls(
      [
        { reasoning: reasoningWithHeadTail(), finishReason: 'length' },
        { reasoning: 'truncated again.', finishReason: 'length' },
        { reasoning: reasoningWithHeadTail(), finishReason: 'length' },
        { reasoning: 'truncated again.', finishReason: 'length' },
      ],
      captured,
    );
    const app = await buildApp({ ...CONFIG, maxTokens: 12345 });
    const res = await app.inject({
      method: 'POST',
      url: '/api/protocol-builder/extract-stream',
      payload: { text: TWO_CHUNK_TEXT },
    });
    await app.close();

    const events = eventsOf(res.body);
    expect(events.map((e) => e.type)).not.toContain('done');

    // the truncation message NAMES THE KNOB (SEMANTIC_PASS_TRUNCATED convention)
    const knobText = events
      .filter((e) => e.type === 'chunk-done' || e.type === 'stage')
      .map((e) => `${String(e.message ?? '')} ${String(e.preview ?? '')}`)
      .join('\n');
    expect(knobText).toContain('maxTokens');
  });
});

describe('VPDF-4 (7): a zero-step merge on a text-bearing source is a failure', () => {
  it('every chunk returns steps:[] -> FAILED terminal, no done, and the persist leg is NEVER reached', async () => {
    const captured: Array<Record<string, unknown>> = [];
    const emptySteps = JSON.stringify({ kind: 'vendor-protocol-candidate', title: 'Kit', steps: [] });
    stubInferenceCalls([{ content: emptySteps }, { content: emptySteps }], captured);
    const storeCalls: string[] = [];
    const app = await buildApp(CONFIG, recordingStore(storeCalls));
    const res = await app.inject({
      method: 'POST',
      url: '/api/protocol-builder/extract-stream',
      payload: { text: TWO_CHUNK_TEXT, documentId: 'VPDF-TEST-DOC' },
    });
    await app.close();

    const events = eventsOf(res.body);
    const types = events.map((e) => e.type);
    expect(types).not.toContain('done');
    expect(events.some((e) => e.type === 'error')).toBe(true);
    const failedStage = events.find(
      (e) => e.type === 'stage' && String(e.message).includes('Extraction failed: merged candidate has zero steps'),
    );
    expect(failedStage).toBeTruthy();

    // seam: a zero-parsed/zero-step run must NEVER touch the store
    expect(storeCalls).toEqual([]);
  });
});

describe('VPDF-4 (8): the blocking path keeps its terminal semantics (bait 9)', () => {
  it('extractProtocol still returns the empty success with NO_CONTENT and never retries', async () => {
    const captured: Array<Record<string, unknown>> = [];
    stubInferenceCalls(
      [
        { reasoning: reasoningWithHeadTail() },
        { reasoning: reasoningWithHeadTail() },
      ],
      captured,
    );
    const app = await buildApp(CONFIG);
    const res = await app.inject({
      method: 'POST',
      url: '/api/protocol-builder/extract',
      payload: { text: TWO_CHUNK_TEXT },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = res.json() as { candidate: { steps: unknown[]; diagnostics?: Array<{ code: string }> } };
    expect(body.candidate.steps).toEqual([]);
    expect((body.candidate.diagnostics ?? []).map((d) => d.code)).toContain('NO_CONTENT');
    // no retry on the blocking path — its response contract is out of scope
    expect(captured.length).toBe(2);
    // but it shares the chunk-call shape (force-JSON + data-sourced budget)
    for (const c of captured) {
      expect(c.response_format).toEqual({ type: 'json_object' });
    }
  });
});
