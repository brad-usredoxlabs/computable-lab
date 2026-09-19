/**
 * thinkingLevels — named "how hard should the model think" presets, resolved
 * from CONFIG (data), never hardcoded.
 *
 * Why data: what a level MEANS depends on the serving stack. vLLM with a
 * Qwen3-style chat template takes `chat_template_kwargs.enable_thinking`;
 * OpenAI-compatible reasoning endpoints take `reasoning_effort`; some take
 * neither. The lab declares the levels it actually has, e.g.
 *
 *   ai.profiles.<name>.inference:
 *     defaultThinkingLevel: off
 *     thinkingLevels:
 *       off:  { label: 'Off — direct JSON', enableThinking: false, chat_template_kwargs: { enable_thinking: false } }
 *       on:   { label: 'Thinking — show the reasoning', enableThinking: true, chat_template_kwargs: { enable_thinking: true } }
 *       high: { label: 'High effort', reasoning_effort: high }
 *
 * The request carries the chosen level id; this module turns it into the
 * request parameters, and REFUSES an unknown level (an unknown level silently
 * falling back to the default is how a "high effort" run quietly becomes a
 * cheap one).
 */

/** One named level: request params, plus an optional UI label. */
export interface ThinkingLevelDefinition {
  /** Human-readable label for the picker; defaults to the level id. */
  label?: string;
  enableThinking?: boolean;
  chat_template_kwargs?: Record<string, unknown>;
  reasoning_effort?: string;
  max_tokens?: number;
  [key: string]: unknown;
}

export type ThinkingLevels = Record<string, ThinkingLevelDefinition>;

/** The request params a level resolves to (everything except `label`). */
export interface ResolvedThinkingLevel {
  /** The level id that was applied. */
  level: string;
  params: Record<string, unknown>;
}

export type ThinkingLevelResolution =
  | { ok: true; resolved: ResolvedThinkingLevel }
  | { ok: false; error: string; available: string[] };

/** A picker row for the UI. */
export interface ThinkingLevelOption {
  id: string;
  label: string;
}

function paramsOf(definition: ThinkingLevelDefinition): Record<string, unknown> {
  const { label: _label, ...params } = definition;
  return params;
}

/**
 * Resolve a requested level id against the configured levels.
 *
 * `requested` undefined → the configured default, else the first configured
 * level (config order), else NO params at all (the endpoint's own default).
 */
export function resolveThinkingLevel(
  levels: ThinkingLevels | undefined,
  requested: string | undefined,
  defaultLevel?: string,
): ThinkingLevelResolution {
  const available = Object.keys(levels ?? {});
  const configured = levels ?? {};

  const wanted = (requested ?? defaultLevel ?? available[0] ?? '').trim();
  if (wanted.length === 0) {
    return { ok: true, resolved: { level: '', params: {} } };
  }
  const definition = configured[wanted];
  if (!definition) {
    return {
      ok: false,
      error:
        available.length === 0
          ? `no thinking levels are configured (ai.profiles.<name>.inference.thinkingLevels); cannot honour "${wanted}"`
          : `unknown thinking level "${wanted}"; configured: ${available.join(', ')}`,
      available,
    };
  }
  return { ok: true, resolved: { level: wanted, params: paramsOf(definition) } };
}

/** The picker rows, in config order (YAML order), default marked. */
export function thinkingLevelOptions(
  levels: ThinkingLevels | undefined,
  defaultLevel?: string,
): ThinkingLevelOption[] {
  return Object.entries(levels ?? {}).map(([id, definition]) => ({
    id,
    label:
      typeof definition?.label === 'string' && definition.label.trim().length > 0
        ? definition.label.trim()
        : id === defaultLevel
          ? `${id} (default)`
          : id,
  }));
}