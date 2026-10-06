/**
 * PROTO-AI-12 §4 — RED-first integration tests for the shadow-router wiring
 * at the submit-selection site in AgentOrchestrator.
 *
 * Contract under test (spec 2026-10-06_1152 §Verification-2 + kill-switch):
 *  1. With the shadow adapter ON, each of the four intents produces exactly
 *     ONE paired telemetry line: correlationId = the run's tid (the tid is
 *     captured from the orchestrator's own [agent <tid>] log lines — reuse,
 *     never re-mint), authoritativePick = the branch that actually executed.
 *  2. Dispatch is BIT-IDENTICAL with shadow on/off: same onEvent stream and
 *     same AgentResult for the same scripted model output.
 *  3. Kill-switch: no shadowRouter config -> ZERO router fetch calls AND zero
 *     telemetry lines; enabled:false -> same.
 *  4. enabled:true + failing fetch -> user-visible result bit-identical AND
 *     exactly one telemetry line with an errorClass.
 *  5. S1 guard: the router call is never awaited in the dispatch path — a
 *     router fetch that hangs far past the run must not delay the result.
 *
 * No real host is contacted: the router fetch is always an injected spy.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { AGENT_INTENT_TOOL_NAME } from './submitSuggestionTool.js';
import type { AgentEvent, AgentResult, CompletionRequest, InferenceClient, StreamChunk } from './types.js';
import type { ShadowRouterConfig } from '../config/types.js';
import * as runChatbotCompileModule from './runChatbotCompile.js';

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
  vi.restoreAllMocks();
});

async function makeTempDir(): Promise<string> {
  tempDir = await mkdtemp(join(tmpdir(), 'cl-shadow-int-'));
  return tempDir;
}

/** Fake host that can never resolve (RFC 2606 .invalid) — fetch is always mocked. */
const FAKE_BASE_URL = 'http://shadow-router.invalid/v1';

/** The compiler stand-in the existing orchestrator suites use. */
const COMPILE_NOOP = {
  events: [],
  labwareAdditions: [],
  unresolvedRefs: [],
  diagnostics: [{ severity: 'error' as const, code: 'CONFIG_MISSING', message: 'no extractor', pass_id: 'extract_entities' }],
  terminalArtifacts: { events: [], directives: [], gaps: [] },
  outcome: 'error' as const,
};

/** A fake model that answers with exactly one agent_intent tool call. */
function intentClient(args: unknown) {
  const completeStream = vi.fn(async function* (_request: CompletionRequest) {
    yield {
      id: 'resp-shadow',
      choices: [{
        index: 0,
        delta: {
          role: 'assistant',
          tool_calls: [{
            id: 'call-shadow',
            type: 'function' as const,
            function: {
              name: AGENT_INTENT_TOOL_NAME,
              arguments: JSON.stringify(args),
            },
          }],
        },
        finish_reason: 'tool_calls' as const,
      }],
    };
  });
  return { client: { complete: vi.fn(), completeStream }, completeStream };
}

const EDIT_OPS = [{ op: 'step_delete', stepId: 'step-003' }];

/** The four scripted turns: one per intent branch (spec §Verification-2). */
const INTENT_TURNS = [
  {
    intent: 'event_graph' as const,
    prompt: 'Transfer 10 uL of DMEM from reservoir A1 to well B2.',
    toolArgs: { intent: 'event_graph', events: [{ verb: 'transfer', event_type: 'transfer', details: { source: 'A1', target: 'B2' } }] },
  },
  {
    intent: 'create_record' as const,
    prompt: 'We do not have a tube rack yet — create one.',
    toolArgs: { intent: 'create_record', records: [{ kind: 'labware', name: 'Tube rack 24' }] },
  },
  {
    intent: 'deck_layout' as const,
    prompt: 'Switch the deck to the freeform bench.',
    toolArgs: { intent: 'deck_layout', variantId: 'manual_freeform' },
  },
  {
    intent: 'protocol_edit' as const,
    prompt: 'Delete the wash step from the attached protocol.',
    toolArgs: { intent: 'protocol_edit', ops: EDIT_OPS },
  },
];

interface RunOutcome {
  result: AgentResult;
  events: AgentEvent[];
  tid: string;
}

async function runTurn(
  turn: (typeof INTENT_TURNS)[number],
  shadowRouter: ShadowRouterConfig | undefined,
  fetchSpy: typeof fetch,
  logLines: string[],
): Promise<RunOutcome> {
  const { client } = intentClient(turn.toolArgs);
  const orchestrator = createAgentOrchestrator(
    client,
    { getToolDefinitions: () => [], executeTool: vi.fn(async () => { throw new Error('shadow test must not execute tools'); }) },
    { baseUrl: 'http://inference.invalid/v1', model: 'big-test-model', temperature: 0.1, maxTokens: 512 },
    { maxTurns: 2, draftFlowMode: 'preflight-llm' },
    // The construction seam under test: the shadow config rides in via deps,
    // mirroring how server.ts passes the rest of the AI config (server.ts:1068).
    shadowRouter ? { shadowRouter, fetch: fetchSpy } : {},
  );
  const events: AgentEvent[] = [];
  const result = await orchestrator.run({
    prompt: turn.prompt,
    forceDraftTool: true,
    onEvent: (event) => events.push(event),
    context: {
      labwares: [],
      eventSummary: 'No events yet.',
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['transfer'],
    },
  });
  // The tid is the orchestrator's own per-run trace id, captured from its log
  // line — the telemetry correlationId must be THIS value, never a re-mint.
  const tidMatch = logLines
    .map((l) => /^\[agent ([a-z0-9]+)\] start /.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m[1]!);
  expect(tidMatch.length).toBeGreaterThan(0);
  return { result, events, tid: tidMatch[tidMatch.length - 1]! };
}

function jsonResponse(content: unknown): unknown {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) };
}

function asFetch(fn: (url: string, init?: RequestInit) => unknown): typeof fetch {
  return fn as unknown as typeof fetch;
}

/**
 * Bit-identical comparison needs the volatile fields the draft path mints per
 * run (eventId / actionGroupId / provenance timestamp) removed — everything
 * else in the result and the onEvent stream is deterministic for a scripted
 * model output.
 */
const VOLATILE_KEYS = new Set(['eventId', 'actionGroupId', 'timestamp']);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (VOLATILE_KEYS.has(key)) continue;
      out[key] = canonicalize(entry);
    }
    return out;
  }
  return value;
}

async function readLines(path: string): Promise<string[]> {
  const text = await readFile(path, 'utf-8');
  return text.split('\n').filter((l) => l.trim().length > 0);
}

async function pollLineCount(path: string, expected: number, timeoutMs = 2000): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const lines = await readLines(path);
      if (lines.length >= expected) return lines;
    } catch {
      // file not created yet
    }
    if (Date.now() > deadline) throw new Error(`telemetry file never reached ${expected} line(s)`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('AgentOrchestrator shadow-router wiring (PROTO-AI-12 §4)', () => {
  beforeEach(() => {
    vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({ ...COMPILE_NOOP });
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      (console as unknown as { __logLines: string[] }).__logLines.push(String(args[0]));
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    (console as unknown as { __logLines: string[] }).__logLines = [];
  });

  const logLines = (): string[] => (console as unknown as { __logLines: string[] }).__logLines;

  it('four intents -> four paired telemetry lines, correlationId = the run tid, authoritativePick = the executed branch', async () => {
    const dir = await makeTempDir();
    const eventsPath = join(dir, 'events.jsonl');
    const fetchSpy = vi.fn(asFetch(async () => jsonResponse('event_graph')));

    const tids: string[] = [];
    for (const turn of INTENT_TURNS) {
      const { tid } = await runTurn(
        turn,
        { enabled: true, baseUrl: FAKE_BASE_URL, model: 'lfm-test-router', timeoutMs: 2000, telemetryPath: eventsPath },
        fetchSpy,
        logLines(),
      );
      tids.push(tid);
    }

    const lines = await pollLineCount(eventsPath, 4);
    expect(lines).toHaveLength(4);
    const records = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    // Append order can interleave (async writes); the pairing is what matters:
    // every run's tid appears exactly once, with its authoritative pick.
    expect([...records.map((r) => r.correlationId)].sort()).toEqual([...tids].sort());
    const byTid = new Map(records.map((r) => [r.correlationId, r.authoritativePick]));
    expect(INTENT_TURNS.map((t) => t.intent).sort()).toEqual([...byTid.values()].sort());
    for (const turn of INTENT_TURNS) {
      const tid = tids[INTENT_TURNS.indexOf(turn)]!;
      expect(byTid.get(tid)).toBe(turn.intent);
    }
    // the router pick is what the tiny model said (the spy always answers event_graph)
    expect(records.every((r) => r.routerPick === 'event_graph')).toBe(true);
    expect(records.every((r) => r.routerModel === 'lfm-test-router')).toBe(true);
    expect(records.every((r) => r.bigModel === 'big-test-model')).toBe(true);
    expect(records.every((r) => typeof r.routerLatencyMs === 'number')).toBe(true);
    // one router call per turn, classification-only
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    // hard boundary: no raw prompt text in telemetry
    for (const turn of INTENT_TURNS) {
      expect(lines.join('\n')).not.toContain(turn.prompt);
    }
  });

  it('dispatch is bit-identical with shadow ON vs OFF (same onEvent stream, same result)', async () => {
    const dir = await makeTempDir();
    const eventsPath = join(dir, 'events.jsonl');
    const onFetch = vi.fn(asFetch(async () => jsonResponse('event_graph')));

    for (const turn of INTENT_TURNS) {
      const off = await runTurn(turn, undefined, vi.fn(asFetch(async () => jsonResponse('event_graph'))), logLines());
      const on = await runTurn(
        turn,
        { enabled: true, baseUrl: FAKE_BASE_URL, model: 'lfm-test-router', timeoutMs: 2000, telemetryPath: eventsPath },
        onFetch,
        logLines(),
      );
      expect(on.events).toEqual(off.events);
      expect(canonicalize(on.result)).toEqual(canonicalize(off.result));
    }
    // all four shadowed turns did fire
    const lines = await pollLineCount(eventsPath, 4);
    expect(lines).toHaveLength(4);
  });

  it('kill-switch: NO shadowRouter config -> ZERO router fetch calls AND zero telemetry lines', async () => {
    const dir = await makeTempDir();
    const eventsPath = join(dir, 'events.jsonl');
    const fetchSpy = vi.fn(asFetch(async () => jsonResponse('event_graph')));
    for (const turn of INTENT_TURNS) {
      await runTurn(turn, undefined, fetchSpy, logLines());
    }
    await new Promise((r) => setTimeout(r, 150));
    expect(fetchSpy).not.toHaveBeenCalled();
    await expect(readFile(eventsPath, 'utf-8')).rejects.toThrow();
  });

  it('kill-switch: enabled:false -> ZERO router fetch calls AND zero telemetry lines', async () => {
    const dir = await makeTempDir();
    const eventsPath = join(dir, 'events.jsonl');
    const fetchSpy = vi.fn(asFetch(async () => jsonResponse('event_graph')));
    for (const turn of INTENT_TURNS) {
      await runTurn(
        turn,
        { enabled: false, baseUrl: FAKE_BASE_URL, model: 'lfm-test-router', telemetryPath: eventsPath },
        fetchSpy,
        logLines(),
      );
    }
    await new Promise((r) => setTimeout(r, 150));
    expect(fetchSpy).not.toHaveBeenCalled();
    await expect(readFile(eventsPath, 'utf-8')).rejects.toThrow();
  });

  it('enabled:true + failing fetch -> user-visible result bit-identical AND one telemetry line with errorClass', async () => {
    const dir = await makeTempDir();
    const eventsPath = join(dir, 'events.jsonl');
    const failFetch = vi.fn(asFetch(async () => {
      throw new TypeError('fetch failed');
    }));

    const turn = INTENT_TURNS[3]!;
    const off = await runTurn(turn, undefined, vi.fn(asFetch(async () => jsonResponse('event_graph'))), logLines());
    const on = await runTurn(
      turn,
      { enabled: true, baseUrl: FAKE_BASE_URL, model: 'lfm-test-router', timeoutMs: 2000, telemetryPath: eventsPath },
      failFetch,
      logLines(),
    );

    expect(on.events).toEqual(off.events);
    expect(canonicalize(on.result)).toEqual(canonicalize(off.result));

    const lines = await pollLineCount(eventsPath, 1);
    expect(lines).toHaveLength(1);
    const rec = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(rec.routerPick).toBe('unreachable');
    expect(rec.errorClass).toBe('network');
    expect(rec.authoritativePick).toBe('protocol_edit');
    expect(rec.correlationId).toBe(on.tid);
  });

  it('S1: a router fetch that hangs past the run never delays the user-visible result (never awaited)', async () => {
    const dir = await makeTempDir();
    const eventsPath = join(dir, 'events.jsonl');
    const hangFetch = asFetch((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }),
    );

    const turn = INTENT_TURNS[2]!; // deck_layout returns immediately
    const started = Date.now();
    const on = await runTurn(
      turn,
      { enabled: true, baseUrl: FAKE_BASE_URL, model: 'lfm-test-router', timeoutMs: 5000, telemetryPath: eventsPath },
      vi.fn(hangFetch),
      logLines(),
    );
    const elapsed = Date.now() - started;
    expect(on.result.success).toBe(true);
    expect(on.result.deckLayout?.variantId).toBe('manual_freeform');
    // a 5000 ms hanging router must not gate a turn that completes in ms
    expect(elapsed).toBeLessThan(2000);
  });
});
