/**
 * PROTO-AI-12 §4 — RED-first unit tests for the shadow-router adapter.
 *
 * Contract under test (spec 2026-10-06_1152 §Design):
 *  - classifyWithShadowRouter NEVER throws: exact/bracket token -> intent,
 *    prose-garbage -> parse_failure, abort -> timeout, network-fail -> unreachable.
 *  - the HTTP call is OpenAI-compatible POST {baseUrl}/chat/completions,
 *    CLASSIFICATION-ONLY (no tools field), AbortController on config timeoutMs.
 *  - the prompt carries the four intent tokens + glosses and the user turn
 *    TRUNCATED to a small fixed window.
 *  - shadowRouteIfNeeded is fire-and-forget (returns void synchronously),
 *    records paired telemetry via the existing writer, and a failing fetch
 *    still lands exactly one telemetry line with an errorClass.
 *  - kill-switch: a disabled writer means ZERO fetch calls and zero lines.
 *  - resolveShadowRouterConfig: MISSING/disabled config -> null (OFF);
 *    timeoutMs default 8000 is the documented config default
 *    (config/types.ts ShadowRouterConfig.timeoutMs), not a new policy.
 *
 * No real host is contacted here: fetch is always injected as a spy.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  classifyWithShadowRouter,
  parseShadowRouterPick,
  resolveShadowRouterConfig,
  shadowRouteIfNeeded,
  SHADOW_TURN_WINDOW_CHARS,
  type ResolvedShadowRouterConfig,
  type ShadowRouterAdapterDeps,
} from './shadowRouterAdapter.js';
import { createShadowTelemetryWriter } from './shadowTelemetry.js';

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
  vi.restoreAllMocks();
});

async function makeTempDir(): Promise<string> {
  tempDir = await mkdtemp(join(tmpdir(), 'cl-shadow-adapter-'));
  return tempDir;
}

/** A fake host that can never resolve (RFC 2606 .invalid) — fetch is always mocked. */
const FAKE_BASE_URL = 'http://shadow-router.invalid/v1';

function resolvedConfig(overrides: Partial<ResolvedShadowRouterConfig> = {}): ResolvedShadowRouterConfig {
  return {
    baseUrl: FAKE_BASE_URL,
    model: 'lfm-test-router',
    timeoutMs: 2000,
    ...overrides,
  };
}

function makeDeps(fetchImpl: typeof fetch, config: ResolvedShadowRouterConfig = resolvedConfig()): ShadowRouterAdapterDeps {
  return {
    fetch: fetchImpl,
    config,
    telemetry: createShadowTelemetryWriter({ enabled: false }),
    bigModel: 'big-test-model',
  };
}

/** Minimal Response stand-in: only ok/status/json are ever read. */
function jsonResponse(content: unknown): unknown {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  };
}

function asFetch(fn: (url: string, init?: RequestInit) => unknown): typeof fetch {
  return fn as unknown as typeof fetch;
}

async function pollFileLines(path: string, expected: number, timeoutMs = 2000): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const text = await readFile(path, 'utf-8');
      const lines = text.split('\n').filter((l) => l.trim().length > 0);
      if (lines.length >= expected) return lines;
    } catch {
      // file not created yet
    }
    if (Date.now() > deadline) throw new Error(`telemetry file never reached ${expected} line(s)`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('parseShadowRouterPick', () => {
  it('accepts the four exact tokens', () => {
    expect(parseShadowRouterPick('event_graph')).toBe('event_graph');
    expect(parseShadowRouterPick('deck_layout')).toBe('deck_layout');
    expect(parseShadowRouterPick('create_record')).toBe('create_record');
    expect(parseShadowRouterPick('protocol_edit')).toBe('protocol_edit');
  });

  it('accepts bracket-notation and quoted forms (LFM native bracket output)', () => {
    expect(parseShadowRouterPick('[event_graph]')).toBe('event_graph');
    expect(parseShadowRouterPick('"deck_layout"')).toBe('deck_layout');
    expect(parseShadowRouterPick("'create_record'")).toBe('create_record');
    expect(parseShadowRouterPick('  [protocol_edit]  ')).toBe('protocol_edit');
  });

  it('accepts a token at the start of a line with trailing punctuation/prose', () => {
    expect(parseShadowRouterPick('protocol_edit.')).toBe('protocol_edit');
    expect(parseShadowRouterPick('event_graph\nI think this is a plate event')).toBe('event_graph');
  });

  it('is case-insensitive (trim + lowercase first)', () => {
    expect(parseShadowRouterPick('Event_Graph')).toBe('event_graph');
    expect(parseShadowRouterPick(' DECK_LAYOUT ')).toBe('deck_layout');
  });

  it('rejects prose-garbage, mid-string tokens, and near-miss tokens', () => {
    expect(parseShadowRouterPick('The best intent is event_graph')).toBeNull();
    expect(parseShadowRouterPick('I cannot classify this')).toBeNull();
    expect(parseShadowRouterPick('event_graphx')).toBeNull();
    expect(parseShadowRouterPick('')).toBeNull();
    expect(parseShadowRouterPick('   ')).toBeNull();
    expect(parseShadowRouterPick('[intent]')).toBeNull();
  });
});

describe('resolveShadowRouterConfig', () => {
  it('MISSING config or enabled!==true resolves to null (kill-switch OFF)', () => {
    expect(resolveShadowRouterConfig(undefined)).toBeNull();
    expect(resolveShadowRouterConfig({})).toBeNull();
    expect(resolveShadowRouterConfig({ enabled: false })).toBeNull();
    expect(resolveShadowRouterConfig({ enabled: true })).toBeNull(); // no baseUrl = no endpoint DATA
    expect(resolveShadowRouterConfig({ enabled: true, baseUrl: FAKE_BASE_URL })).toBeNull(); // no model DATA
  });

  it('applies the documented 8000 ms default and honours an explicit timeoutMs', () => {
    const resolved = resolveShadowRouterConfig({ enabled: true, baseUrl: FAKE_BASE_URL, model: 'lfm-test-router' });
    expect(resolved).toEqual({ baseUrl: FAKE_BASE_URL, model: 'lfm-test-router', timeoutMs: 8000 });
    const explicit = resolveShadowRouterConfig({
      enabled: true,
      baseUrl: FAKE_BASE_URL,
      model: 'lfm-test-router',
      timeoutMs: 1234,
    });
    expect(explicit?.timeoutMs).toBe(1234);
  });
});

describe('classifyWithShadowRouter — parsing', () => {
  it('exact token resolves to the intent and POSTs {baseUrl}/chat/completions classification-only', async () => {
    const fetchSpy = vi.fn(asFetch(async () => jsonResponse('event_graph')));
    const pick = await classifyWithShadowRouter(makeDeps(fetchSpy), 'Transfer 10 uL of DMEM to well A1.');
    expect(pick).toBe('event_graph');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(`${FAKE_BASE_URL}/chat/completions`);
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.model).toBe('lfm-test-router');
    // classification-only: no tool authority is ever offered to the router
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages).toHaveLength(1);
    for (const token of ['event_graph', 'deck_layout', 'create_record', 'protocol_edit']) {
      expect(messages[0]!.content).toContain(token);
    }
    expect(messages[0]!.content).toContain('Transfer 10 uL of DMEM to well A1.');
  });

  it('bracket-notation token is accepted', async () => {
    const pick = await classifyWithShadowRouter(makeDeps(vi.fn(asFetch(async () => jsonResponse('[deck_layout]')))), 'switch to the freeform bench');
    expect(pick).toBe('deck_layout');
  });

  it('prose-garbage resolves to parse_failure', async () => {
    const pick = await classifyWithShadowRouter(
      makeDeps(vi.fn(asFetch(async () => jsonResponse('I am a small model and this looks like a transfer to me')))),
      'Transfer 10 uL',
    );
    expect(pick).toBe('parse_failure');
  });

  it('empty or missing message content resolves to parse_failure', async () => {
    const empty = await classifyWithShadowRouter(makeDeps(vi.fn(asFetch(async () => jsonResponse('')))), 'x');
    expect(empty).toBe('parse_failure');
    const noChoices = await classifyWithShadowRouter(
      makeDeps(vi.fn(asFetch(async () => ({ ok: true, status: 200, json: async () => ({ choices: [] }) })))),
      'x',
    );
    expect(noChoices).toBe('parse_failure');
  });

  it('truncates the user turn to the fixed window (no unbounded prompt leaves the adapter)', async () => {
    const longTurn = `${'A'.repeat(SHADOW_TURN_WINDOW_CHARS)}${'Z'.repeat(2000)}`;
    const fetchSpy = vi.fn(asFetch(async () => jsonResponse('event_graph')));
    await classifyWithShadowRouter(makeDeps(fetchSpy), longTurn);
    const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]?.body)) as { messages: Array<{ content: string }> };
    const sent = body.messages[0]!.content;
    expect(sent).toContain('A'.repeat(100));
    expect(sent).not.toContain('Z'.repeat(100));
    expect(sent.length).toBeLessThan(longTurn.length);
  });
});

describe('classifyWithShadowRouter — failure paths never throw', () => {
  it('abort on config timeoutMs resolves to timeout', async () => {
    const hangFetch = asFetch((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }),
    );
    const started = Date.now();
    const pick = await classifyWithShadowRouter(makeDeps(vi.fn(hangFetch), resolvedConfig({ timeoutMs: 40 })), 'x');
    const elapsed = Date.now() - started;
    expect(pick).toBe('timeout');
    // the abort fired on the CONFIG timeoutMs, not some other timer
    expect(elapsed).toBeGreaterThanOrEqual(30);
    expect(elapsed).toBeLessThan(1000);
  });

  it('network failure resolves to unreachable', async () => {
    const failFetch = asFetch(async () => {
      throw new TypeError('fetch failed');
    });
    const pick = await classifyWithShadowRouter(makeDeps(vi.fn(failFetch)), 'x');
    expect(pick).toBe('unreachable');
  });

  it('a synchronously throwing fetch still resolves (never throws)', async () => {
    const boomFetch = asFetch(() => {
      throw new Error('sync boom');
    });
    await expect(classifyWithShadowRouter(makeDeps(vi.fn(boomFetch)), 'x')).resolves.toBe('unreachable');
  });

  it('non-2xx HTTP resolves to unreachable', async () => {
    const errFetch = asFetch(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    const pick = await classifyWithShadowRouter(makeDeps(vi.fn(errFetch)), 'x');
    expect(pick).toBe('unreachable');
  });

  it('a malformed JSON body resolves to parse_failure', async () => {
    const badJson = asFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('not json');
      },
    }));
    const pick = await classifyWithShadowRouter(makeDeps(vi.fn(badJson)), 'x');
    expect(pick).toBe('parse_failure');
  });
});

describe('shadowRouteIfNeeded — fire-and-forget paired telemetry', () => {
  it('records one paired line (correlationId, picks, models, latency) and returns void synchronously', async () => {
    const dir = await makeTempDir();
    const eventsPath = join(dir, 'events.jsonl');
    const writer = createShadowTelemetryWriter({ enabled: true, eventsPath });
    const fetchSpy = vi.fn(asFetch(async () => jsonResponse('[protocol_edit]')));
    const deps: ShadowRouterAdapterDeps = {
      fetch: fetchSpy,
      config: resolvedConfig(),
      telemetry: writer,
      bigModel: 'big-test-model',
    };

    const returned = shadowRouteIfNeeded(deps, {
      correlationId: 'tid-abc',
      turn: 'delete the wash step from the attached protocol',
      authoritativePick: 'protocol_edit',
      bigModelLatencyMs: 4321,
    });
    expect(returned).toBeUndefined(); // fire-and-forget: no promise handed to the caller

    const lines = await pollFileLines(eventsPath, 1);
    expect(lines).toHaveLength(1);
    const rec = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(rec.correlationId).toBe('tid-abc');
    expect(rec.routerPick).toBe('protocol_edit');
    expect(rec.authoritativePick).toBe('protocol_edit');
    expect(rec.routerModel).toBe('lfm-test-router');
    expect(rec.bigModel).toBe('big-test-model');
    expect(typeof rec.routerLatencyMs).toBe('number');
    expect(rec.routerLatencyMs).toBeGreaterThanOrEqual(0);
    expect(rec.bigModelLatencyMs).toBe(4321);
    expect(rec.errorClass).toBeUndefined();
    // hard boundary: no raw prompt text ever reaches telemetry
    expect(lines[0]!).not.toContain('wash step');
  });

  it('a failing fetch still lands exactly one telemetry line with an errorClass', async () => {
    const dir = await makeTempDir();
    const eventsPath = join(dir, 'events.jsonl');
    const deps: ShadowRouterAdapterDeps = {
      fetch: vi.fn(asFetch(async () => {
        throw new TypeError('fetch failed');
      })),
      config: resolvedConfig(),
      telemetry: createShadowTelemetryWriter({ enabled: true, eventsPath }),
      bigModel: 'big-test-model',
    };
    shadowRouteIfNeeded(deps, { correlationId: 'tid-net', turn: 'x', authoritativePick: 'event_graph' });
    const lines = await pollFileLines(eventsPath, 1);
    const rec = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(rec.routerPick).toBe('unreachable');
    expect(rec.errorClass).toBe('network');
  });

  it('a disabled writer means ZERO fetch calls and no telemetry file (kill-switch)', async () => {
    const dir = await makeTempDir();
    const eventsPath = join(dir, 'events.jsonl');
    const fetchSpy = vi.fn(asFetch(async () => jsonResponse('event_graph')));
    const deps: ShadowRouterAdapterDeps = {
      fetch: fetchSpy,
      config: resolvedConfig(),
      telemetry: createShadowTelemetryWriter({ enabled: false, eventsPath }),
      bigModel: 'big-test-model',
    };
    shadowRouteIfNeeded(deps, { correlationId: 'tid-off', turn: 'x', authoritativePick: 'event_graph' });
    await new Promise((r) => setTimeout(r, 100));
    expect(fetchSpy).not.toHaveBeenCalled();
    await expect(stat(eventsPath)).rejects.toThrow();
  });

  it('a throwing fetch AND a throwing writer can never escape the wrapper', async () => {
    const dir = await makeTempDir();
    const eventsPath = join(dir, 'events.jsonl');
    const deps: ShadowRouterAdapterDeps = {
      fetch: vi.fn(asFetch(() => {
        throw new Error('sync boom');
      })),
      config: resolvedConfig(),
      telemetry: {
        enabled: true,
        record: async () => {
          throw new Error('writer boom');
        },
      },
      bigModel: 'big-test-model',
    };
    expect(() =>
      shadowRouteIfNeeded(deps, { correlationId: 'tid-boom', turn: 'x', authoritativePick: 'deck_layout' }),
    ).not.toThrow();
    await new Promise((r) => setTimeout(r, 100));
    await expect(stat(eventsPath)).rejects.toThrow();
  });
});
