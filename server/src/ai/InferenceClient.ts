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

/**
 * Create an inference client for the given config.
 */
export function createInferenceClient(config: InferenceConfig): InferenceClient {
  const { apiKey, timeoutMs = 120_000 } = config;
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
  function normalizeRequest(req: CompletionRequest): Record<string, unknown> {
    const { max_tokens, ...rest } = req;
    if (max_tokens != null) {
      return { ...rest, max_completion_tokens: max_tokens };
    }
    return rest;
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

        return (await res.json()) as CompletionResponse;
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
          body: JSON.stringify({ ...normalizeRequest(request), stream: true }),
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
              yield JSON.parse(data) as StreamChunk;
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
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}
