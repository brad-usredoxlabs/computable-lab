/**
 * ChatHandlers — standalone ChatGPT-style chat backed by an OpenAI-compatible
 * endpoint (vLLM / llama.cpp / Ollama's /v1 with an OpenAI-translator).
 *
 * Proxies POST /api/ai/chat/stream to the OpenAI-compatible
 * `${baseUrl}/chat/completions` endpoint with `stream: true`. The upstream
 * SSE `data:` frames (OpenAI `choices[].delta.content`) are translated into
 * the client's expected event shapes and forwarded as SSE `data:` events so
 * the browser can render token deltas live:
 *   - each content delta  -> data: {"message":{"content": "<delta>"}}
 *   - the [DONE] sentinel -> data: {"done":true}
 * This keeps the frontend client contract unchanged while pointing the chat
 * at the SAME OpenAI-compatible endpoint the rest of the app uses (config-driven,
 * never a hardcoded IP — this repo NEVER hardcodes a host as the primary path).
 *
 * Active endpoint resolution follows the config convention:
 *   1. appConfig.ai.profiles[profileName]  — explicit profile in the body
 *   2. appConfig.ai.profiles[activeProfile] — the configured active profile
 *   3. appConfig.ai.inference (legacy inline config)
 *   4. env override CLA_ORNITh_BASE_URL / CLA_ORNITh_MODEL (dev-only,
 *      never the primary path)
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

/** One OpenAI-compatible SSE data frame (parsed). */
interface OpenAiStreamChunk {
  choices?: Array<{ delta?: { content?: string } }>;
}

export interface ChatHandlersOptions {
  getAppConfig: () => AppConfig | undefined;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

const ENV_BASE_URL = process.env.CLA_ORNITh_BASE_URL;
const ENV_MODEL = process.env.CLA_ORNITh_MODEL;

/** Normalize a baseUrl to a single trailing `/v1` for the chat endpoint. */
function toChatBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/** Extract the content delta from an OpenAI SSE chunk, if any. */
function getDeltaText(data: string): string | null {
  if (!data.startsWith('[')) {
    try {
      const parsed = JSON.parse(data) as OpenAiStreamChunk;
      const delta = parsed.choices?.[0]?.delta?.content;
      return typeof delta === 'string' && delta.length > 0 ? delta : null;
    } catch {
      return null;
    }
  }
  return null;
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

  /**
   * POST /api/ai/chat/stream — proxy to an OpenAI-compatible
   * /chat/completions stream over SSE, translating upstream deltas.
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

    const url = `${toChatBase(resolved.baseUrl)}/chat/completions`;

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
      let doneSent = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';
          for (const frame of frames) {
            const data = frame
              .split('\n')
              .filter((l) => l.startsWith('data:'))
              .map((l) => l.slice(5).trim())
              .join('\n');
            if (!data) continue;
            // OpenAI sentinel: empty payload terminates the stream.
            if (data === '[DONE]' || data === '') {
              if (!doneSent) {
                send(JSON.stringify({ done: true }));
                doneSent = true;
              }
              continue;
            }
            const delta = getDeltaText(data);
            if (delta) {
              send(JSON.stringify({ message: { content: delta } }));
            }
          }
        }
        if (!doneSent) {
          // End-of-EOF could precede an explicit [DONE] on some backends.
          send(JSON.stringify({ done: true }));
          doneSent = true;
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      request.log.warn(err, 'AI chat stream failed');
      send(JSON.stringify({ type: 'error', message: err instanceof Error ? err.message : String(err) }));
    } finally {
      reply.raw.removeListener('close', onClose);
      reply.raw.end();
    }
  }
}
