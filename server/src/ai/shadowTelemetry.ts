/**
 * PROTO-AI-12 §3 — Shadow-router telemetry writer (append-only paired JSONL).
 *
 * Mirrors the established foundry durable-log pattern:
 *   server/src/foundry/EventEditorFixItJobManager.ts:347 (`appendEvent`) and
 *   server/src/foundry/FoundryAcquisitionJobManager.ts:255 — `appendFile`
 *   of one JSON object per line into an `events.jsonl` under a configured
 *   root. No new infrastructure, and NEVER the record store.
 *
 * Hard boundaries (enforced by the record shape, tested in
 * shadowTelemetry.test.ts):
 *  - one record per shadowed turn with ONLY: correlation id, router pick,
 *    authoritative pick, router model version, big model version, router
 *    latency ms, big-model pick latency ms, error class, and a write-time
 *    `ts`. NO raw prompts, NO payloads, ever — fields outside the whitelist
 *    are dropped even if a caller smuggles them past the type contract.
 *  - kill-switch: MISSING config = OFF. When disabled, record() is a no-op
 *    and the telemetry file is never created.
 *  - telemetry failure can NEVER alter the user-visible result: record()
 *    never throws; failures are swallowed to a console warning.
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ShadowRouterConfig } from '../config/types.js';

/** The four router-classifiable intents plus explicit non-pick outcomes. */
export type ShadowRouterPick =
  | 'event_graph'
  | 'deck_layout'
  | 'create_record'
  | 'protocol_edit'
  | 'timeout'
  | 'parse_failure'
  | 'unreachable';

/** Coarse error classes for the paired record; never carries messages. */
export type ShadowTelemetryErrorClass = 'timeout' | 'network' | 'parse' | 'http' | 'write';

/** Input the caller supplies per shadowed turn (still no prompt/payload). */
export interface ShadowTelemetryInput {
  /** The orchestrator's per-run trace id (`tid`) — reuse, never re-mint. */
  correlationId: string;
  routerPick: ShadowRouterPick;
  authoritativePick: ShadowRouterPick;
  routerModel: string;
  bigModel: string;
  routerLatencyMs: number;
  bigModelLatencyMs?: number;
  errorClass?: ShadowTelemetryErrorClass;
}

/** What actually lands on disk — the hard whitelist shape. */
interface ShadowTelemetryRecord {
  ts: string;
  correlationId: string;
  routerPick: string;
  authoritativePick: string;
  routerModel: string;
  bigModel: string;
  routerLatencyMs: number;
  bigModelLatencyMs?: number;
  errorClass?: string;
}

export interface ShadowTelemetryWriter {
  /** False when disabled — record() is then a no-op. */
  readonly enabled: boolean;
  /**
   * Append one paired record. Fire-and-forget safe: NEVER throws — any
   * failure is swallowed to a log line so the user-visible result can never
   * change because of telemetry.
   */
  record(input: ShadowTelemetryInput): Promise<void>;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Project the input onto the whitelist shape — drops everything else. */
function toRecord(input: ShadowTelemetryInput): string {
  const rec: ShadowTelemetryRecord = {
    ts: nowIso(),
    correlationId: input.correlationId,
    routerPick: String(input.routerPick),
    authoritativePick: String(input.authoritativePick),
    routerModel: String(input.routerModel),
    bigModel: String(input.bigModel),
    routerLatencyMs: input.routerLatencyMs,
  };
  // exactOptionalPropertyTypes: absent OR value, never undefined.
  if (input.bigModelLatencyMs !== undefined) rec.bigModelLatencyMs = input.bigModelLatencyMs;
  if (input.errorClass !== undefined) rec.errorClass = String(input.errorClass);
  return JSON.stringify(rec);
}

export interface ShadowTelemetryWriterOptions {
  enabled: boolean;
  /** Append-only JSONL destination (mirrors foundry `events.jsonl`). */
  eventsPath?: string;
}

export function createShadowTelemetryWriter(
  options: ShadowTelemetryWriterOptions,
): ShadowTelemetryWriter {
  const enabled = options.enabled === true && typeof options.eventsPath === 'string' && options.eventsPath.length > 0;
  const eventsPath = options.eventsPath;

  return {
    enabled,
    async record(input: ShadowTelemetryInput): Promise<void> {
      if (!enabled || !eventsPath) return;
      try {
        await mkdir(dirname(eventsPath), { recursive: true });
        await appendFile(eventsPath, `${toRecord(input)}\n`, 'utf-8');
      } catch (err) {
        // Swallow — telemetry must never alter the user-visible result.
        console.warn(
          `[shadow-telemetry] write failed (suppressed): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  };
}

/**
 * Build the writer from the optional `ai.shadowRouter` config block.
 * MISSING block = OFF. No default endpoint, no default path — DATA only.
 *
 * `config` is typed loosely so callers can pass the raw optional block (or an
 * object shaped like `{ shadowRouter }`) without importing AppConfig.
 */
export function shadowTelemetryWriterFromConfig(config: {
  shadowRouter?: ShadowRouterConfig;
}): ShadowTelemetryWriter {
  const s = config.shadowRouter;
  if (!s || s.enabled !== true) {
    return createShadowTelemetryWriter({ enabled: false });
  }
  return createShadowTelemetryWriter({
    enabled: true,
    ...(s.telemetryPath ? { eventsPath: s.telemetryPath } : {}),
  });
}
