/**
 * Thin OpenAI-compatible HTTP client for LLM inference.
 *
 * Uses native fetch — no SDK dependency. Supports local OpenAI-compatible
 * endpoints and OpenRouter's provider-specific reasoning/tool conventions.
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
  const {
    apiKey,
    timeoutMs = 120_000,
    // Streaming: a long generation is NORMAL, silence is the failure. The old
    // code armed one timer for the whole request, so a healthy chunk that
    // needed more than `timeoutMs` was killed mid-stream ("Inference stream
    // timeout after 120000ms") — which is what a large vendor PDF hit on its
    // second chunk. The idle timer resets on every byte the server sends.
    streamIdleTimeoutMs = 300_000,
    streamMaxMs,
    enableThinking,
  } = config;
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const isOpenRouter = new URL(baseUrl).hostname === 'openrouter.ai';

  // Build common headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  // Normalize max_tokens → max_completion_tokens for newer OpenAI models
  // (gpt-4o, gpt-5.x, o-series require max_completion_tokens).
  // Local/OpenAI-compatible requests retain max_completion_tokens; OpenRouter
  // uses its documented max_tokens field and unified reasoning controls.
  //
  // Forward enableThinking as `enable_thinking` inside chat_template_kwargs
  // (Qwen3+ template control). Request-level values win on key collision so
  // callers can override per-call if needed.
  function normalizeRequest(req: CompletionRequest): Record<string, unknown> {
    const { max_tokens, chat_template_kwargs, enableThinking: requestEnableThinking, ...rest } = req;
    const effectiveEnableThinking = requestEnableThinking ?? enableThinking;
    if (isOpenRouter) {
      const { cache_key: _key, cache_prompt: _cache, id_slot: _slot, reasoning, ...cloud } = rest;
      const thinking = requestEnableThinking ?? (typeof chat_template_kwargs?.enable_thinking === 'boolean' ? chat_template_kwargs.enable_thinking : enableThinking);
      const body: Record<string, unknown> = {
        ...cloud,
        ...(max_tokens != null ? { max_tokens } : {}),
        ...((thinking !== undefined || reasoning) ? { reasoning: { ...(thinking !== undefined ? { enabled: thinking } : {}), ...reasoning } } : {}),
      };
      // Alibaba's Qwen routes cannot force a tool while thinking (often on by default).
      // Preserve thinking and restrict a named choice to that tool; the caller still validates its result.
      if (/^qwen\//i.test(req.model) && (reasoning?.enabled ?? thinking) !== false) allowAutomaticToolChoice(body);
      return body;
    }

    const mergedKwargs =
      effectiveEnableThinking !== undefined
        ? { enable_thinking: effectiveEnableThinking, ...(chat_template_kwargs ?? {}) }
        : chat_template_kwargs;
    return {
      ...rest,
      ...(max_tokens != null ? { max_completion_tokens: max_tokens } : {}),
      ...(mergedKwargs ? { chat_template_kwargs: mergedKwargs } : {}),
    };
  }


  function allowAutomaticToolChoice(body: Record<string, unknown>): boolean {
    const choice = body.tool_choice;
    if (choice !== 'required' && (!choice || typeof choice !== 'object')) return false;
    if (typeof choice === 'object') {
      const name = (choice as {function?: {name?: string}}).function?.name;
      const tools = body.tools as CompletionRequest['tools'];
      const selected = tools?.filter(tool => tool.function.name === name);
      if (!selected?.length) throw new Error('The requested inference tool is not in the supplied tool list.');
      body.tools = selected;
    }
    body.tool_choice = 'auto';
    return true;
  }

  async function fetchCompletion(request: CompletionRequest, stream: boolean, signal: AbortSignal): Promise<Response> {
    const body = { ...normalizeRequest(request), ...(stream ? {stream:true,stream_options:{include_usage:true}} : {}) };
    for (let attempt=0; attempt<2; attempt++) {
      const response = await fetch(`${baseUrl}/chat/completions`, {method:'POST',headers,body:JSON.stringify(body),signal});
      if (response.ok) return response;
      const detail = await response.text();
      // Provider routing can change. Retry this specific rejected combination once,
      // before any generated output or tool execution, without disabling reasoning.
      if (isOpenRouter && attempt===0 && response.status===400 && /tool_choice/i.test(detail)
        && /thinking|reasoning/i.test(detail) && /not support|unsupported|not allowed|cannot|incompatible/i.test(detail)
        && allowAutomaticToolChoice(body)) continue;
      throw new Error(`Inference error ${response.status}: ${detail}`);
    }
    throw new Error('Inference compatibility retry failed.');
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function completeOnce(request: CompletionRequest): Promise<CompletionResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetchCompletion(request, false, controller.signal);

      const response = await res.json() as CompletionResponse & {error?: unknown};
      if(response.error)throw new Error(`Inference response error: ${JSON.stringify(response.error)}`);
      return normalizeReasoningContent(response);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(`Inference timeout after ${timeoutMs}ms`);
      }
      if (err instanceof TypeError && err.message === 'fetch failed') {
        // vLLM may reject large requests or drop connections silently.
        const requestStr = JSON.stringify(normalizeRequest(request));
        throw new Error(
          `Inference fetch failed to ${baseUrl}/chat/completions ("fetch failed", ` +
          `${requestStr.length} bytes).  Usually means the server rejected the connection, ` +
          `returned an invalid or incomplete response, or the request body exceeded server limits.`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async complete(request: CompletionRequest): Promise<CompletionResponse> {
      const maxRetries = 3;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await completeOnce(request);
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          // Only retry on transient network errors (fetch failed, ECONNRESET, etc.)
          const isTransient =
            lastError.message.includes('fetch failed') ||
            lastError.message.includes('ECONNRESET') ||
            lastError.message.includes('ECONNREFUSED') ||
            lastError.message.includes('socket hang up');
          if (!isTransient || attempt >= maxRetries) throw lastError;
          // Exponential backoff: 2s, 4s, 8s
          const delay = Math.min(2000 * Math.pow(2, attempt - 1), 15000);
          console.warn(`Inference retry ${attempt}/${maxRetries} after ${delay}ms: ${lastError.message}`);
          await sleep(delay);
        }
      }

      throw lastError!;
    },

    async *completeStream(request: CompletionRequest): AsyncIterable<StreamChunk> {
      const controller = new AbortController();
      // Idle (stall) timer, re-armed on every received chunk; plus an optional
      // hard ceiling for callers that want one.
      let abortReason: 'idle' | 'max' | null = null;
      let idleTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        abortReason = 'idle';
        controller.abort();
      }, streamIdleTimeoutMs);
      const armIdle = (): void => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          abortReason = 'idle';
          controller.abort();
        }, streamIdleTimeoutMs);
      };
      const maxTimer =
        typeof streamMaxMs === 'number' && streamMaxMs > 0
          ? setTimeout(() => {
              abortReason = 'max';
              controller.abort();
            }, streamMaxMs)
          : null;

      try {
        const res = await fetchCompletion(request, true, controller.signal);

        if (!res.body) {
          throw new Error('No response body for streaming');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // Data arrived: the stream is alive, so the stall clock starts over.
          armIdle();

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // Keep incomplete last line in buffer
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') return;

            let parsed: StreamChunk & {error?: unknown};
            try { parsed = JSON.parse(data); } catch { continue; }
            // OpenRouter may report provider failures inside an HTTP 200 SSE stream.
            // Do not swallow them as malformed chunks or pass them off as an empty answer.
            if (parsed.error) throw new Error(`Inference stream error: ${JSON.stringify(parsed.error)}`);
            yield normalizeReasoningDelta(parsed);
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          if (abortReason === 'max') {
            throw new Error(`Inference stream exceeded the configured maximum ${streamMaxMs}ms`);
          }
          throw new Error(
            `Inference stream stalled: no data for ${streamIdleTimeoutMs}ms (raise streamIdleTimeoutMs if the model legitimately takes longer to start)`,
          );
        }
        throw err;
      } finally {
        if (idleTimer) clearTimeout(idleTimer);
        if (maxTimer) clearTimeout(maxTimer);
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

      // Two shapes are common: OpenAI's { data: [{ id }] } and the
      // { models: [{ name|model }] } that Ollama and llama.cpp servers answer
      // with. Reading only the first made a working local server look wrong
      // ("Model X not returned by provider /models list") in the settings test.
      const json = (await res.json()) as {
        data?: Array<{ id?: string }>;
        models?: Array<{ id?: string; name?: string; model?: string }>;
      };
      const ids = [
        ...(json.data ?? []).map((entry) => entry.id),
        ...(json.models ?? []).map((entry) => entry.id ?? entry.name ?? entry.model),
      ];
      const models = [...new Set(ids)].filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      );
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
