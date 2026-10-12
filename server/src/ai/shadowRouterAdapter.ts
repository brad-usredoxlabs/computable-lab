/**
 * PROTO-AI-12 §4 — shadow-router adapter (log-only, ZERO authority).
 *
 * The tiny model (PROTO-AI-12 §1 serving: llama-server b9450,
 * LFM2.5-350M QAD-Q4_0, CPU, endpoint supplied as DATA via
 * `ai.shadowRouter.baseUrl` — never hardcoded here) classifies the SAME turn
 * the big model handled and the pair lands in the §3 telemetry writer.
 *
 * Hard boundaries (D5, spec 2026-10-06_1152):
 *  - the router NEVER drafts payloads and NEVER writes records: this module
 *    imports nothing that can mutate a record — only the telemetry writer and
 *    the config types.
 *  - no raw prompts or payloads reach telemetry: the writer's whitelist
 *    enforces the shape; this module only ever passes classification facts.
 *  - classifyWithShadowRouter NEVER throws: every failure path resolves to a
 *    ShadowRouterPick ('timeout' on abort, 'unreachable' on network/HTTP,
 *    'parse_failure' on anything the parser cannot read).
 *  - the only timer is the AbortController on config `timeoutMs` (default
 *    8000 documented at config/types.ts ShadowRouterConfig.timeoutMs — the
 *    same documented-default pattern server.ts uses for warmup knobs). No
 *    second timer, no second policy.
 *  - shadowRouteIfNeeded is fire-and-forget: it returns void synchronously
 *    and swallows its own promise chain, so router code can never reach the
 *    user path.
 */

import type { ShadowRouterConfig } from '../config/types.js';
import {
  shadowTelemetryWriterFromConfig,
  type ShadowRouterPick,
  type ShadowTelemetryErrorClass,
  type ShadowTelemetryWriter,
} from './shadowTelemetry.js';

/** Re-export so consumers of the adapter see the same pick vocabulary. */
export type { ShadowRouterPick } from './shadowTelemetry.js';

/** The four classifiable intents, in the same spelling the orchestrator branches on. */
const INTENT_TOKENS = ['event_graph', 'deck_layout', 'create_record', 'protocol_edit'] as const;

/**
 * The user turn is sent to the router TRUNCATED to this fixed window: the
 * classifier only needs the instruction's head, and an unbounded prompt must
 * never leave the adapter.
 */
export const SHADOW_TURN_WINDOW_CHARS = 400;

/** Documented config default (config/types.ts: ShadowRouterConfig.timeoutMs "default 8_000"). */
const DEFAULT_SHADOW_TIMEOUT_MS = 8000;

/** Config after the DATA has been checked: an endpoint only exists when the config says so. */
export interface ResolvedShadowRouterConfig {
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export interface ShadowRouterAdapterDeps {
  /** Injected fetch (tests spy it; production passes globalThis.fetch). */
  fetch: typeof fetch;
  config: ResolvedShadowRouterConfig;
  telemetry: ShadowTelemetryWriter;
  /** The big model's name, for the paired record. */
  bigModel: string;
}

/**
 * Resolve the shadow-router block to a usable endpoint config. Kill-switch
 * semantics (already shipped in §3): MISSING block or `enabled !== true` =
 * OFF (null). A block that is enabled but names no baseUrl/model is OFF too
 * — endpoints are DATA, and there is no default endpoint to fall back to.
 */
export function resolveShadowRouterConfig(
  config: ShadowRouterConfig | undefined,
): ResolvedShadowRouterConfig | null {
  if (!config || config.enabled !== true) return null;
  const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : '';
  const model = typeof config.model === 'string' ? config.model.trim() : '';
  if (!baseUrl || !model) return null;
  return {
    baseUrl,
    model,
    timeoutMs: typeof config.timeoutMs === 'number' && Number.isFinite(config.timeoutMs)
      ? config.timeoutMs
      : DEFAULT_SHADOW_TIMEOUT_MS,
  };
}

/** Build the adapter deps from config + writer. null = shadow fully OFF (no call, no write). */
export function shadowRouterDepsFromConfig(options: {
  shadowRouter: ShadowRouterConfig | undefined;
  fetch: typeof fetch;
  bigModel: string;
}): { deps: ShadowRouterAdapterDeps; writer: ShadowTelemetryWriter } | null {
  const shadowRouter = options.shadowRouter;
  const config = resolveShadowRouterConfig(shadowRouter);
  if (!config || !shadowRouter) return null;
  const writer = shadowTelemetryWriterFromConfig({ shadowRouter });
  // The writer's own kill-switch (enabled + telemetryPath present) gates everything.
  if (!writer.enabled) return null;
  return {
    deps: {
      fetch: options.fetch,
      config,
      telemetry: writer,
      bigModel: options.bigModel,
    },
    writer,
  };
}

/**
 * Parse the router's answer. LFM natively emits bracket-notation, so bracket
 * and quote wrappers are accepted; anything whose FIRST LINE does not begin
 * with one of the four intent tokens is a parse_failure — never a guess.
 */
export function parseShadowRouterPick(raw: string): ShadowRouterPick | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;
  const stripped = text.replace(/^[[("'`]+/, '').replace(/[\])"'`.,;:]+$/, '');
  if (!stripped) return null;
  const firstLine = (stripped.split('\n')[0] ?? '').trim();
  if (!firstLine) return null;
  for (const token of INTENT_TOKENS) {
    if (firstLine === token) return token;
    if (firstLine.startsWith(token)) {
      // token-boundary: 'event_graphx' is garbage, 'protocol_edit.' is the token
      const next = firstLine.charAt(token.length);
      if (!/[a-z0-9_]/.test(next)) return token;
    }
  }
  return null;
}

/** The classification-only prompt: four tokens + one-line glosses + the truncated turn. */
function buildClassificationPrompt(turn: string): string {
  const clipped = turn.length > SHADOW_TURN_WINDOW_CHARS ? turn.slice(0, SHADOW_TURN_WINDOW_CHARS) : turn;
  return [
    'Classify the lab instruction as exactly one intent token:',
    'event_graph = plate/labware event; deck_layout = switch deck view;',
    'create_record = new lab record; protocol_edit = edit a protocol.',
    'Answer with only the token.',
    `Instruction: ${clipped}`,
  ].join('\n');
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
}

/**
 * One classification-only OpenAI-compatible call. NEVER throws: every failure
 * resolves to a ShadowRouterPick. No tools/tool_choice field — the router is
 * asked to name an intent, never to call anything.
 */
export async function classifyWithShadowRouter(
  deps: ShadowRouterAdapterDeps,
  turn: string,
): Promise<ShadowRouterPick> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.config.timeoutMs);
  try {
    const response = await deps.fetch(`${deps.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: deps.config.model,
        messages: [{ role: 'user', content: buildClassificationPrompt(turn) }],
        temperature: 0,
        max_tokens: 16,
      }),
      signal: controller.signal,
    });
    if (!response.ok) return 'unreachable';
    const body = (await response.json().catch(() => null)) as unknown;
    const content =
      body && typeof body === 'object'
        ? (((body as Record<string, unknown>).choices as unknown[] | undefined)?.[0] as Record<string, unknown> | undefined)?.message as Record<string, unknown> | undefined
        : undefined;
    const text = content ? content.content : undefined;
    if (typeof text !== 'string') return 'parse_failure';
    return parseShadowRouterPick(text) ?? 'parse_failure';
  } catch (err) {
    return isAbortError(err) ? 'timeout' : 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}

/** Map a non-pick outcome onto the §3 errorClass vocabulary. */
function errorClassForPick(pick: ShadowRouterPick): ShadowTelemetryErrorClass | null {
  if (pick === 'timeout') return 'timeout';
  if (pick === 'unreachable') return 'network';
  if (pick === 'parse_failure') return 'parse';
  return null;
}

export interface ShadowRouteRequest {
  /** The orchestrator's per-run `tid` — reuse, never re-mint. */
  correlationId: string;
  /** The user turn text (sent to the router, truncated; NEVER to telemetry). */
  turn: string;
  /** What the big model actually did — the branch that executed. */
  authoritativePick: ShadowRouterPick;
  /** Absent OR value (exactOptionalPropertyTypes), never undefined. */
  bigModelLatencyMs?: number;
}

/**
 * Fire-and-forget wrapper: returns void synchronously, so the dispatch path
 * never awaits the router (S1). The whole promise chain is swallowed — a
 * throw in router or writer code can never reach the user path.
 */
export function shadowRouteIfNeeded(
  deps: ShadowRouterAdapterDeps,
  request: ShadowRouteRequest,
): void {
  if (!deps.telemetry.enabled) return;
  const startedAt = Date.now();
  void classifyWithShadowRouter(deps, request.turn)
    .then((routerPick) => {
      const routerLatencyMs = Date.now() - startedAt;
      const errorClass = errorClassForPick(routerPick);
      return deps.telemetry.record({
        correlationId: request.correlationId,
        routerPick,
        authoritativePick: request.authoritativePick,
        routerModel: deps.config.model,
        bigModel: deps.bigModel,
        routerLatencyMs,
        // exactOptionalPropertyTypes: absent OR value, never undefined.
        ...(request.bigModelLatencyMs !== undefined ? { bigModelLatencyMs: request.bigModelLatencyMs } : {}),
        ...(errorClass ? { errorClass } : {}),
      });
    })
    .catch(() => {
      // Belt over braces: classify never throws and record never throws, but
      // the user path must be insulated from this module by construction.
    });
}
