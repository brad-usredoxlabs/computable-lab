/**
 * Thin OpenAI-compatible HTTP client for LLM inference.
 *
 * Uses native fetch — no SDK dependency. Targets vLLM's
 * OpenAI-compatible /chat/completions endpoint.
 */

import type { InferenceConfig } from '../config/types.js';
import type {
  InferenceClient,
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
} from './types.js';

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return null;
}

function normalizeReasoningContent(response: CompletionResponse): CompletionResponse {
  for (const choice of response.choices ?? []) {
    const message = choice.message as typeof choice.message & Record<string, unknown>;
    if (typeof message.content === 'string' && message.content.trim().length > 0) continue;
    const fallback = firstText(message.reasoning, message.reasoning_content);
    if (fallback) {
      message.content = fallback;
    }
  }
  return response;
}

function normalizeReasoningDelta(chunk: StreamChunk): StreamChunk {
  for (const choice of chunk.choices ?? []) {
    const delta = choice.delta as typeof choice.delta & Record<string, unknown>;
    if (typeof delta.content === 'string' && delta.content.length > 0) continue;
    const fallback = firstText(delta.reasoning, delta.reasoning_content);
    if (fallback) {
      delta.content = fallback;
    }
  }
  return chunk;
}

/**
 * Create an inference client for the given config.
 */
export function createInferenceClient(config: InferenceConfig): InferenceClient {
  const { apiKey, timeoutMs = 120_000, enableThinking } = config;
  const baseUrl = normalizeBaseUrl(config.baseUrl);

  // Build common headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  // Normalize max_tokens → max_completion_tokens for newer OpenAI models
  // (gpt-4o, gpt-5.x, o-series require max_completion_tokens).
  // Most OpenAI-compatible providers accept both, but OpenAI rejects max_tokens
  // on newer models. Send max_completion_tokens universally for compatibility.
  //
  // When config.enableThinking === false, merge `enable_thinking: false` into
  // chat_template_kwargs. Request-level values win on key collision so callers
  // can still opt back in per-call if needed.
  function normalizeRequest(req: CompletionRequest): Record<string, unknown> {
    const { max_tokens, chat_template_kwargs, enableThinking: requestEnableThinking, ...rest } = req;
    const effectiveEnableThinking = requestEnableThinking ?? enableThinking;
    const mergedKwargs =
      effectiveEnableThinking === false
        ? { enable_thinking: false, ...(chat_template_kwargs ?? {}) }
        : chat_template_kwargs;
    return {
      ...rest,
      ...(max_tokens != null ? { max_completion_tokens: max_tokens } : {}),
      ...(mergedKwargs ? { chat_template_kwargs: mergedKwargs } : {}),
    };
  }

  return {
    async complete(request: CompletionRequest): Promise<CompletionResponse> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(normalizeRequest(request)),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Inference error ${res.status}: ${body}`);
        }

        return normalizeReasoningContent((await res.json()) as CompletionResponse);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new Error(`Inference timeout after ${timeoutMs}ms`);
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    },

    async *completeStream(request: CompletionRequest): AsyncIterable<StreamChunk> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...normalizeRequest(request), stream: true, stream_options: { include_usage: true } }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Inference error ${res.status}: ${body}`);
        }

        if (!res.body) {
          throw new Error('No response body for streaming');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // Keep incomplete last line in buffer
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') return;

            try {
              yield normalizeReasoningDelta(JSON.parse(data) as StreamChunk);
            } catch {
              // Skip malformed SSE chunks
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new Error(`Inference stream timeout after ${timeoutMs}ms`);
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * Test whether the inference endpoint is reachable.
 * Sends a lightweight GET /v1/models request.
 */
export async function testInferenceEndpoint(
  baseUrl: string,
  apiKey?: string,
): Promise<{ available: boolean; model?: string; error?: string }> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const modelsResult = await listInferenceModels(normalizedBaseUrl, apiKey);
  if (!modelsResult.available) {
    const unavailable: { available: boolean; model?: string; error?: string } = {
      available: false,
    };
    if (modelsResult.error) unavailable.error = modelsResult.error;
    return unavailable;
  }
  const available: { available: boolean; model?: string; error?: string } = {
    available: true,
  };
  const firstModel = modelsResult.models[0];
  if (firstModel) available.model = firstModel;
  return available;
}

/**
 * Fetch available model IDs from an OpenAI-compatible endpoint.
 */
export async function listInferenceModels(
  baseUrl: string,
  apiKey?: string,
): Promise<{ available: boolean; models: string[]; error?: string }> {
  try {
    const reqHeaders: Record<string, string> = {};
    if (apiKey) {
      reqHeaders['Authorization'] = `Bearer ${apiKey}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);

    try {
      const res = await fetch(`${baseUrl}/models`, {
        headers: reqHeaders,
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return {
          available: false,
          models: [],
          error: body ? `HTTP ${res.status}: ${body}` : `HTTP ${res.status}`,
        };
      }

      const json = (await res.json()) as { data?: Array<{ id?: string }> };
      const models = (json.data ?? [])
        .map((entry) => entry.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
      return { available: true, models };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return {
      available: false,
      models: [],
      error: describeFetchError(err, baseUrl),
    };
  }
}

function describeFetchError(err: unknown, baseUrl: string): string {
  if (!(err instanceof Error)) return String(err);
  // Node's undici fetch wraps the real reason in err.cause. Surface it so
  // the UI doesn't just show an opaque "fetch failed".
  const cause = (err as Error & { cause?: unknown }).cause;
  const causeMessage =
    cause instanceof Error
      ? cause.message
      : typeof cause === 'object' && cause && 'code' in cause
        ? String((cause as { code?: unknown }).code)
        : cause != null
          ? String(cause)
          : undefined;
  if (err.name === 'AbortError') {
    return `Timed out connecting to ${baseUrl}/models (5s)`;
  }
  const parts = [`${err.message} (${baseUrl}/models)`];
  if (causeMessage && causeMessage !== err.message) {
    parts.push(`cause: ${causeMessage}`);
  }
  return parts.join(' — ');
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}
