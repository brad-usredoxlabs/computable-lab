/**
 * PROTO-AI-12 §3 — RED-first unit tests for the shadow-router telemetry
 * writer (append-only JSONL, mirroring the foundry `events.jsonl` pattern:
 * EventEditorFixItJobManager.appendEvent).
 *
 * Enforced boundaries:
 *  - append-only ordering (one JSON record per line, call order preserved)
 *  - kill-switch: MISSING config = OFF (writer no-ops, file never created)
 *  - a write failure is SWALLOWED (no throw escapes; telemetry can never
 *    alter the user-visible result)
 *  - the emitted record carries NO prompt and NO payload field — the shape
 *    is a hard whitelist.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createShadowTelemetryWriter,
  shadowTelemetryWriterFromConfig,
  type ShadowTelemetryInput,
} from './shadowTelemetry.js';

let tempDir: string | undefined;

async function makeTempDir(): Promise<string> {
  tempDir = await mkdtemp(join(tmpdir(), 'cl-shadow-telemetry-'));
  return tempDir;
}

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
  vi.restoreAllMocks();
});

function sampleInput(overrides: Partial<ShadowTelemetryInput> = {}): ShadowTelemetryInput {
  return {
    correlationId: 'abc123',
    routerPick: 'protocol_edit',
    authoritativePick: 'protocol_edit',
    routerModel: 'lfm2.5-350m-qad-q4_0',
    bigModel: 'qwen3.6-35b-a3b',
    routerLatencyMs: 262,
    bigModelLatencyMs: 4100,
    ...overrides,
  };
}

describe('shadowTelemetry writer', () => {
  it('appends one JSONL line per turn, in call order (append-only)', async () => {
    const dir = await makeTempDir();
    const eventsPath = join(dir, 'shadow-router', 'events.jsonl');
    const writer = createShadowTelemetryWriter({ enabled: true, eventsPath });

    await writer.record(sampleInput({ correlationId: 'turn-1' }));
    await writer.record(sampleInput({ correlationId: 'turn-2', routerPick: 'deck_layout' }));
    await writer.record(sampleInput({ correlationId: 'turn-3', routerPick: 'create_record' }));

    const text = await readFile(eventsPath, 'utf-8');
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(3);
    const parsed = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(parsed.map((r) => r.correlationId)).toEqual(['turn-1', 'turn-2', 'turn-3']);
    expect(parsed[1]!.routerPick).toBe('deck_layout');
    // every line carries a timestamp like the foundry appendEvent precedent
    expect(typeof parsed[0]!.ts).toBe('string');
  });

  it('appends do not truncate: a second writer instance continues the same file', async () => {
    const dir = await makeTempDir();
    const eventsPath = join(dir, 'events.jsonl');
    const w1 = createShadowTelemetryWriter({ enabled: true, eventsPath });
    await w1.record(sampleInput({ correlationId: 'first' }));

    const w2 = createShadowTelemetryWriter({ enabled: true, eventsPath });
    await w2.record(sampleInput({ correlationId: 'second' }));

    const lines = (await readFile(eventsPath, 'utf-8')).split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]!).correlationId).toBe('second');
  });

  it('kill-switch: MISSING config = OFF — no file is ever created', async () => {
    const dir = await makeTempDir();
    const { existsSync } = await import('node:fs');
    const eventsPath = join(dir, 'never', 'events.jsonl');

    // No shadowRouter block at all.
    const offFromEmpty = shadowTelemetryWriterFromConfig({});
    expect(offFromEmpty.enabled).toBe(false);
    await offFromEmpty.record(sampleInput());

    // Block present but `enabled` absent — still OFF.
    const offFromPartial = shadowTelemetryWriterFromConfig({
      shadowRouter: { baseUrl: 'http://appliance-2:8900/v1', model: 'lfm2.5-350m', telemetryPath: eventsPath },
    });
    expect(offFromPartial.enabled).toBe(false);
    await offFromPartial.record(sampleInput());

    // enabled explicitly false — OFF.
    const offExplicit = shadowTelemetryWriterFromConfig({
      shadowRouter: { enabled: false, telemetryPath: eventsPath },
    });
    expect(offExplicit.enabled).toBe(false);
    await offExplicit.record(sampleInput());

    expect(existsSync(eventsPath)).toBe(false);
  });

  it('kill-switch: enabled:true turns the writer ON at the configured path', async () => {
    const dir = await makeTempDir();
    const eventsPath = join(dir, 'router', 'events.jsonl');
    const writer = shadowTelemetryWriterFromConfig({
      shadowRouter: {
        enabled: true,
        baseUrl: 'http://appliance-2:8900/v1',
        model: 'lfm2.5-350m',
        telemetryPath: eventsPath,
      },
    });
    expect(writer.enabled).toBe(true);
    await writer.record(sampleInput({ correlationId: 'on-1' }));
    const lines = (await readFile(eventsPath, 'utf-8')).split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).correlationId).toBe('on-1');
  });

  it('a write failure is swallowed: record() never throws, warning goes to the log', async () => {
    const dir = await makeTempDir();
    // A regular file where a directory is required: mkdir(dirname) must fail.
    const blocker = join(dir, 'blocker');
    await writeFile(blocker, 'not a directory', 'utf-8');
    const eventsPath = join(blocker, 'nested', 'events.jsonl');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const writer = createShadowTelemetryWriter({ enabled: true, eventsPath });

    // Must resolve, not reject — telemetry failure can never alter the
    // user-visible result.
    await expect(writer.record(sampleInput())).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('emitted records carry NO prompt and NO payload fields (hard whitelist shape)', async () => {
    const dir = await makeTempDir();
    const eventsPath = join(dir, 'events.jsonl');
    const writer = createShadowTelemetryWriter({ enabled: true, eventsPath });

    // A caller sneaking extra fields past the type contract must still not
    // leak them into the durable log.
    const sneaky = {
      ...sampleInput(),
      prompt: 'SECRET raw user prompt text',
      payload: { events: [{ secret: true }] },
      rawCompletion: '-----',
    } as unknown as ShadowTelemetryInput;
    await writer.record(sneaky);

    const line = (await readFile(eventsPath, 'utf-8')).split('\n').filter(Boolean)[0]!;
    expect(line).not.toContain('SECRET');
    expect(line).not.toContain('payload');
    expect(line).not.toContain('rawCompletion');
    const rec = JSON.parse(line) as Record<string, unknown>;
    expect(Object.keys(rec).sort()).toEqual(
      [
        'authoritativePick',
        'bigModel',
        'bigModelLatencyMs',
        'correlationId',
        'routerLatencyMs',
        'routerModel',
        'routerPick',
        'ts',
      ].sort(),
    );
  });

  it('optional fields are ABSENT (never null/undefined) under exactOptionalPropertyTypes', async () => {
    const dir = await makeTempDir();
    const eventsPath = join(dir, 'events.jsonl');
    const writer = createShadowTelemetryWriter({ enabled: true, eventsPath });

    await writer.record({
      correlationId: 'minimal',
      routerPick: 'timeout',
      authoritativePick: 'event_graph',
      routerModel: 'lfm2.5-350m-qad-q4_0',
      bigModel: 'qwen3.6-35b-a3b',
      routerLatencyMs: 4000,
      errorClass: 'timeout',
    });

    const line = (await readFile(eventsPath, 'utf-8')).split('\n').filter(Boolean)[0]!;
    const rec = JSON.parse(line) as Record<string, unknown>;
    expect('bigModelLatencyMs' in rec).toBe(false);
    expect(rec.errorClass).toBe('timeout');
  });
});
