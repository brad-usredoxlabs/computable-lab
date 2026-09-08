/**
 * ChatHandlers — standalone ChatGPT-style chat backed by a local Ollama.
 *
 * Proxies POST /api/ai/chat/stream to Ollama's NATIVE /api/chat endpoint
 * (NDJSON streaming, NOT the OpenAI-compat /v1/chat/completions). Each
 * upstream NDJSON chunk is forwarded verbatim to the client as one SSE
 * `data:` event so the browser can render token deltas live, and when the
 * final `done:true` chunk carries timing fields (prompt_eval_count,
 * prompt_eval_duration, eval_count, eval_duration) we emit ONE final
 * `data:` timing event with prompt-processing (PP) tokens/s and decode
 * tokens/s.
 *
 * Active endpoint resolution follows the config convention (this repo
 * NEVER hardcodes an IP as the primary path):
 *   1. appConfig.ai.profiles[profileName]  — explicit profile in the body
 *   2. appConfig.ai.profiles[activeProfile] — the configured active profile
 *   3. appConfig.ai.inference (legacy inline config)
 *   4. env override CLA_ORNITh_BASE_URL / CLA_ORNITh_MODEL (dev-only,
 *      never the primary path)
 *
 * The configured baseUrl is OpenAI-style (e.g. "http://host:11434/v1"); we
 * strip a trailing "/v1" so the proxy targets Ollama's native
 * `${base}/api/chat` endpoint.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppConfig } from '../../config/types.js';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatStreamBody {
  /** Optional profile name. Defaults to appConfig.ai.activeProfile. */
  profileName?: string;
  /** Ordered conversation turns (last is the user prompt). */
  messages: ChatMessage[];
}

/** One NDJSON chunk from Ollama's native /api/chat (stream:true). */
export interface OllamaChatChunk {
  model?: string;
  message?: { role?: string; content?: string };
  done?: boolean;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface ChatHandlersOptions {
  getAppConfig: () => AppConfig | undefined;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

const ENV_BASE_URL = process.env.CLA_ORNITh_BASE_URL;
const ENV_MODEL = process.env.CLA_ORNITh_MODEL;

function toOllamaNativeBase(baseUrl: string): string {
  return baseUrl.replace(/\/v1\/?$/, '');
}

function computeTiming(
  chunk: OllamaChatChunk,
): { type: 'timing'; ppTokensPerSec: number | null; decodeTokensPerSec: number | null } | null {
  const promptSeconds =
    typeof chunk.prompt_eval_duration === 'number' && chunk.prompt_eval_duration > 0
      ? chunk.prompt_eval_duration / 1e9
      : null;
  const evalSeconds =
    typeof chunk.eval_duration === 'number' && chunk.eval_duration > 0
      ? chunk.eval_duration / 1e9
      : null;

  const ppTokensPerSec =
    typeof chunk.prompt_eval_count === 'number' && chunk.prompt_eval_count > 0 && promptSeconds !== null
      ? chunk.prompt_eval_count / promptSeconds
      : null;
  const decodeTokensPerSec =
    typeof chunk.eval_count === 'number' && chunk.eval_count > 0 && evalSeconds !== null
      ? chunk.eval_count / evalSeconds
      : null;

  if (ppTokensPerSec === null && decodeTokensPerSec === null) return null;
  return { type: 'timing', ppTokensPerSec, decodeTokensPerSec };
}

export class ChatHandlers {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ChatHandlersOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /**
   * Resolve the { baseUrl, model } the chat should target.
   * Follows the config-first, env-only-as-override rule.
   */
  private resolveEndpoint(profileName?: string): { baseUrl: string; model: string } {
    const ai = this.options.getAppConfig()?.ai;

    if (ai) {
      // 1. Explicit profile (body.profileName).
      if (profileName) {
        const profile = ai.profiles?.[profileName];
        if (!profile) {
          throw new Error(`Unknown AI profile "${profileName}".`);
        }
        return { baseUrl: profile.inference.baseUrl, model: profile.inference.model };
      }

      // 2. Active profile.
      const activeName = ai.activeProfile;
      const active = activeName ? ai.profiles?.[activeName] : undefined;
      if (active) {
        return { baseUrl: active.inference.baseUrl, model: active.inference.model };
      }

      // 3. Legacy inline inference config.
      if (ai.inference?.baseUrl && ai.inference?.model) {
        return { baseUrl: ai.inference.baseUrl, model: ai.inference.model };
      }
    }

    // 4. Dev-only env override (never the primary path).
    if (ENV_BASE_URL && ENV_MODEL) {
      return { baseUrl: ENV_BASE_URL, model: ENV_MODEL };
    }

    throw new Error(
      'No AI profile available for chat. Configure ai.profiles (and ai.activeProfile) in config.yaml, or set CLA_ORNITh_BASE_URL and CLA_ORNITh_MODEL.',
    );
  }

  /** Parse one NDJSON line and forward it as an SSE event. */
  private async handleUpstreamLine(
    line: string,
    send: (data: string) => void,
    seenDone: boolean,
  ): Promise<{ seenDone: boolean; chunk: OllamaChatChunk | null }> {
    const trimmed = line.trim();
    if (!trimmed) return { seenDone, chunk: null };

    let chunk: OllamaChatChunk;
    try {
      chunk = JSON.parse(trimmed) as OllamaChatChunk;
    } catch {
      // Partial line / keepalive — ignore, wait for the next chunk.
      return { seenDone, chunk: null };
    }

    send(trimmed);

    if (chunk.done === true && !seenDone) {
      const timing = computeTiming(chunk);
      if (timing) {
        send(JSON.stringify(timing));
      }
      return { seenDone: true, chunk };
    }
    return { seenDone, chunk };
  }

  /**
   * POST /api/ai/chat/stream — proxy to Ollama native /api/chat over SSE.
   */
  async streamChat(
    request: FastifyRequest<{ Body: ChatStreamBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '*';
    const { profileName, messages } = request.body ?? ({} as ChatStreamBody);

    if (!Array.isArray(messages) || messages.length === 0) {
      reply.status(400);
      await reply.send({ error: 'INVALID_REQUEST', message: 'messages is required and must be non-empty.' });
      return;
    }

    let resolved: { baseUrl: string; model: string };
    try {
      resolved = this.resolveEndpoint(profileName);
    } catch (err) {
      reply.status(400);
      await reply.send({
        error: 'NO_AI_PROFILE',
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const nativeBase = toOllamaNativeBase(resolved.baseUrl);
    const url = `${nativeBase}/api/chat`;

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin',
    });

    const send = (data: string): void => {
      reply.raw.write(`data: ${data}\n\n`);
    };

    // Abort the upstream request if the client disconnects mid-stream.
    const abortController = new AbortController();
    const onClose = () => abortController.abort();
    reply.raw.once('close', onClose);

    try {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: resolved.model, messages, stream: true }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        send(JSON.stringify({ type: 'error', message: `Upstream ${response.status}: ${text || response.statusText}` }));
        return;
      }
      if (!response.body) {
        send(JSON.stringify({ type: 'error', message: 'Upstream did not return a streaming body.' }));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let seenDone = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const result = await this.handleUpstreamLine(line, send, seenDone);
            if (result.seenDone) seenDone = true;
          }
        }
        // Flush any trailing partial line (should be none, but be safe).
        if (buffer.trim()) {
          const result = await this.handleUpstreamLine(buffer, send, seenDone);
          if (result.seenDone) seenDone = true;
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      request.log.warn(err, 'Ollama chat stream failed');
      send(JSON.stringify({ type: 'error', message: err instanceof Error ? err.message : String(err) }));
    } finally {
      reply.raw.removeListener('close', onClose);
      reply.raw.end();
    }
  }
}
