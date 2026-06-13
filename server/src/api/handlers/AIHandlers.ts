/**
 * REST handlers for the AI agent endpoints.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type {
  AgentOrchestrator,
  EditorContext,
  AgentEvent,
  ConversationHistoryMessage,
  FileAttachment,
  AgentClarificationAnswer,
} from '../../ai/types.js';
import { type UploadedFile } from '../../ai/FileContentExtractor.js';
import { deriveContextCacheKey } from '../../ai/systemPrompt.js';
import type { PromptWarmupManager } from '../../ai/warm/PromptWarmupManager.js';

export interface DraftEventsBody {
  prompt: string;
  context: EditorContext;
  history?: ConversationHistoryMessage[];
  attachments?: FileAttachment[];
  clarificationAnswers?: AgentClarificationAnswer[];
  /**
   * When true, only the deterministic pipeline runs (no LLM call).
   * Used by the event-editor dock's Precompile mode and required when AI is
   * not configured.
   */
  deterministicOnly?: boolean;
  /** Per-request thinking-mode override for OpenAI-compatible reasoning models. */
  enableThinking?: boolean;
}

export type AiSurface =
  | 'event-editor'
  | 'run-workspace'
  | 'materials'
  | 'formulations'
  | 'ingestion'
  | 'literature'
  | 'protocol-ide';

export interface AssistBody {
  prompt: string;
  surface: AiSurface;
  context: Record<string, unknown>;
  history?: ConversationHistoryMessage[];
  clarificationAnswers?: AgentClarificationAnswer[];
  enableThinking?: boolean;
}

/**
 * Body for POST /ai/context/warm — the event editor's client-assembled
 * context, sent on Accept and after debounced graph edits so the server can
 * pre-warm the (system prompt + graph) prefix on the idle GPU while the user
 * types their next prompt.
 */
export interface WarmContextBody {
  context: EditorContext;
  history?: ConversationHistoryMessage[];
  /**
   * The surface the NEXT real request will send (e.g. 'workspace.deck').
   * The warm must render through the same prompt builder as that request —
   * a warm rendered for the wrong surface produces a prefix that never
   * matches and the KV cache misses silently.
   */
  surface?: AiSurface;
}

export interface AIHandlers {
  draftEvents(
    request: FastifyRequest<{ Body: DraftEventsBody }>,
    reply: FastifyReply,
  ): Promise<unknown>;
  draftEventsStream(
    request: FastifyRequest<{ Body: DraftEventsBody }>,
    reply: FastifyReply,
  ): Promise<void>;
  assistStream(
    request: FastifyRequest<{ Body: AssistBody }>,
    reply: FastifyReply,
  ): Promise<void>;
  warmContext(
    request: FastifyRequest<{ Body: WarmContextBody }>,
    reply: FastifyReply,
  ): Promise<unknown>;
  warmContextStatus(
    request: FastifyRequest<{ Querystring: { key?: string } }>,
    reply: FastifyReply,
  ): Promise<unknown>;
}

/**
 * Create AI handlers backed by the given orchestrator.
 */
export function createAIHandlers(
  orchestrator: AgentOrchestrator,
  getWarmup?: () => PromptWarmupManager | undefined,
): AIHandlers {
  return {
    async draftEvents(
      request: FastifyRequest<{ Body: DraftEventsBody }>,
      reply: FastifyReply,
    ) {
      const { prompt, context, history, attachments, deterministicOnly, enableThinking, clarificationAnswers } = request.body;

      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'prompt is required' };
      }

      try {
        const result = await orchestrator.run({
          prompt,
          context,
          ...(history ? { history } : {}),
          ...(attachments ? { attachments } : {}),
          ...(clarificationAnswers ? { clarificationAnswers } : {}),
          ...(deterministicOnly !== undefined ? { deterministicOnly } : {}),
          ...(!deterministicOnly ? { forceDraftTool: true } : {}),
          ...(enableThinking !== undefined ? { enableThinking } : {}),
        });
        return result;
      } catch (err) {
        request.log.error(err, 'Agent orchestrator failed');
        reply.status(500);
        return {
          error: 'AGENT_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async draftEventsStream(
      request: FastifyRequest<{ Body: DraftEventsBody }>,
      reply: FastifyReply,
    ) {
      const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '*';
      const contentType = request.headers['content-type'] ?? '';

      let prompt: string;
      let context: EditorContext;
      let history: ConversationHistoryMessage[] | undefined;
      let attachments: FileAttachment[] | undefined;
      let deterministicOnly: boolean | undefined;
      let enableThinking: boolean | undefined;
      let clarificationAnswers: AgentClarificationAnswer[] | undefined;

      if (contentType.includes('multipart/form-data')) {
        // Parse multipart form-data so the event-editor surface can send
        // file uploads the same way other surfaces do.
        const parts = request.parts();
        const fields: Record<string, string> = {};
        const files: UploadedFile[] = [];
        for await (const part of parts) {
          if (part.type === 'field') {
            fields[part.fieldname] = part.value as string;
          } else if (part.type === 'file') {
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) chunks.push(chunk);
            files.push({
              originalName: part.filename ?? 'unknown',
              mimeType: part.mimetype ?? 'application/octet-stream',
              sizeBytes: Buffer.concat(chunks).length,
              buffer: Buffer.concat(chunks),
            });
          }
        }
        prompt = fields['prompt'] ?? '';
        context = fields['context'] ? JSON.parse(fields['context']) as EditorContext : ({} as EditorContext);
        history = fields['history'] ? JSON.parse(fields['history']) as ConversationHistoryMessage[] : undefined;
        attachments = files.length > 0
          ? files.map((f) => ({ name: f.originalName, mime_type: f.mimeType, content: f.buffer }))
          : undefined;
        deterministicOnly = fields['deterministicOnly'] === 'true' ? true : undefined;
        enableThinking = fields['enableThinking'] === 'true' ? true : fields['enableThinking'] === 'false' ? false : undefined;
        clarificationAnswers = fields['clarificationAnswers'] ? JSON.parse(fields['clarificationAnswers']) as AgentClarificationAnswer[] : undefined;
      } else {
        const body = request.body;
        prompt = body.prompt;
        context = body.context;
        history = body.history;
        attachments = body.attachments;
        deterministicOnly = body.deterministicOnly;
        enableThinking = body.enableThinking;
        clarificationAnswers = body.clarificationAnswers;
      }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': origin,
        'Vary': 'Origin',
      });

      const sendEvent = (event: AgentEvent) => {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      sendEvent({ type: 'status', message: 'Received — preparing agent…' });

      try {
        const result = await orchestrator.run({
          prompt,
          context,
          ...(history ? { history } : {}),
          ...(attachments ? { attachments } : {}),
          ...(clarificationAnswers ? { clarificationAnswers } : {}),
          ...(deterministicOnly !== undefined ? { deterministicOnly } : {}),
          ...(!deterministicOnly ? { forceDraftTool: true } : {}),
          ...(enableThinking !== undefined ? { enableThinking } : {}),
          onEvent: sendEvent,
        });

        sendEvent({ type: 'done', result });
      } catch (err) {
        sendEvent({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        reply.raw.end();
      }
    },

    async assistStream(
      request: FastifyRequest<{ Body: AssistBody }>,
      reply: FastifyReply,
    ) {
      const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '*';
      const contentType = request.headers['content-type'] ?? '';

      let prompt: string;
      let surface: string;
      let context: Record<string, unknown>;
      let history: ConversationHistoryMessage[] | undefined;
      let enableThinking: boolean | undefined;
      let clarificationAnswers: AgentClarificationAnswer[] | undefined;
      let fileAttachments: FileAttachment[] = [];

      if (contentType.includes('multipart/form-data')) {
        // Parse multipart form data
        const parts = request.parts();
        const fields: Record<string, string> = {};
        const files: UploadedFile[] = [];

        for await (const part of parts) {
          if (part.type === 'field') {
            fields[part.fieldname] = part.value as string;
          } else if (part.type === 'file') {
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) {
              chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);
            files.push({
              originalName: part.filename ?? 'unknown',
              mimeType: part.mimetype ?? 'application/octet-stream',
              sizeBytes: buffer.length,
              buffer,
            });
          }
        }

        prompt = fields['prompt'] ?? '';
        surface = fields['surface'] ?? '';
        context = fields['context'] ? JSON.parse(fields['context']) : {};
        history = fields['history'] ? JSON.parse(fields['history']) : undefined;
        enableThinking = fields['enableThinking'] === 'true' ? true : undefined;
        clarificationAnswers = fields['clarificationAnswers'] ? JSON.parse(fields['clarificationAnswers']) as AgentClarificationAnswer[] : undefined;

        // Convert to FileAttachment[] for the pipeline (do NOT extract content for inlining)
        fileAttachments = files.map((f) => ({
          name: f.originalName,
          mime_type: f.mimeType,
          content: f.buffer,
        }));
      } else {
        // Standard JSON body
        const body = request.body;
        prompt = body.prompt;
        surface = body.surface;
        context = body.context;
        history = body.history;
        enableThinking = body.enableThinking;
        clarificationAnswers = body.clarificationAnswers;
      }

      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        reply.status(400);
        reply.send({ error: 'INVALID_REQUEST', message: 'prompt is required' });
        return;
      }

      if (!surface || typeof surface !== 'string') {
        reply.status(400);
        reply.send({ error: 'INVALID_REQUEST', message: 'surface is required' });
        return;
      }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': origin,
        'Vary': 'Origin',
      });

      const sendEvent = (event: AgentEvent) => {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      // Build an EditorContext-compatible object from the surface context.
      const editorContext: EditorContext = {
        labwares: [],
        eventSummary: '',
        vocabPackId: 'general',
        availableVerbs: [],
        ...context,
      };

      // NOTE: File attachments are passed directly to orchestrator.run(),
      // NOT inlined into the LLM messages. The extract_entities pass
      // is the sole consumer of attachment content.

      try {
        sendEvent({ type: 'status', message: `Processing ${surface} request...` });

        const result = await orchestrator.run({
          prompt,
          context: editorContext,
          surface: surface as AiSurface,
          ...(history ? { history } : {}),
          ...(fileAttachments.length > 0 ? { attachments: fileAttachments } : {}),
          ...(clarificationAnswers ? { clarificationAnswers } : {}),
          ...(enableThinking !== undefined ? { enableThinking } : {}),
          onEvent: sendEvent,
        });

        sendEvent({ type: 'done', result });
      } catch (err) {
        sendEvent({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        reply.raw.end();
      }
    },

    async warmContext(
      request: FastifyRequest<{ Body: WarmContextBody }>,
      reply: FastifyReply,
    ) {
      const { context, history, surface } = request.body ?? {};
      if (!context || typeof context !== 'object') {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'context is required' };
      }

      const warmup = getWarmup?.();
      const buildPrefixRequest = orchestrator.buildPrefixRequest?.bind(orchestrator);
      if (!warmup || !buildPrefixRequest) {
        reply.status(202);
        return { accepted: false, reason: 'warming disabled' };
      }

      // Mirror assistStream byte-for-byte: same context defaults, same
      // surface-aware prompt builder, run()'s own forceDraftTool default,
      // and the same derived cache_key — so the real request routes to the
      // slot this warm fills. Any drift here is a silent KV-cache miss.
      const editorContext: EditorContext = {
        ...context,
        labwares: context.labwares ?? [],
        eventSummary: context.eventSummary ?? '',
        vocabPackId: context.vocabPackId ?? 'general',
        availableVerbs: context.availableVerbs ?? [],
      };
      const key = deriveContextCacheKey(surface, editorContext);
      warmup.requestWarm({
        key,
        buildPrefix: () =>
          buildPrefixRequest({
            context: editorContext,
            ...(surface ? { surface } : {}),
            ...(history ? { history } : {}),
          }),
      });
      reply.status(202);
      // Key + current status let the client show a prefill indicator and
      // poll /ai/context/warm/status while the warm runs.
      return { accepted: true, key, status: warmup.status(key) };
    },

    async warmContextStatus(
      request: FastifyRequest<{ Querystring: { key?: string } }>,
      reply: FastifyReply,
    ) {
      const key = request.query?.key;
      if (!key) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'key is required' };
      }
      const warmup = getWarmup?.();
      if (!warmup) return { key, status: { state: 'disabled' } };
      return { key, status: warmup.status(key) };
    },
  };
}

/**
 * Build a draft-events handler that only runs the deterministic portion of the
 * chatbot-compile pipeline (no LLM). Used when AI is not configured so the
 * event-editor's Precompile mode still works.
 *
 * The returned handlers reject any request without `deterministicOnly: true`
 * via the supplied `unavailableMessage` (the AI-unavailable 503).
 */
export function createDeterministicOnlyAIHandlers(deps: {
  runDeterministic: (args: {
    prompt: string;
    context: EditorContext;
    history?: ConversationHistoryMessage[];
    attachments?: FileAttachment[];
    onEvent: (event: AgentEvent) => void;
  }) => Promise<unknown>;
  unavailableMessage: () => string;
}): AIHandlers {
  const aiUnavailable = (reply: FastifyReply) => {
    reply.status(503);
    return { error: 'AI_UNAVAILABLE', message: deps.unavailableMessage() };
  };

  return {
    async draftEvents(request, reply) {
      const body = request.body;
      if (!body?.deterministicOnly) return aiUnavailable(reply);
      if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'prompt is required' };
      }
      try {
        const events: AgentEvent[] = [];
        const result = await deps.runDeterministic({
          prompt: body.prompt,
          context: body.context,
          ...(body.history ? { history: body.history } : {}),
          ...(body.attachments ? { attachments: body.attachments } : {}),
          onEvent: (event) => events.push(event),
        });
        return { ...(result as object), events };
      } catch (err) {
        reply.status(500);
        return { error: 'PIPELINE_ERROR', message: err instanceof Error ? err.message : String(err) };
      }
    },

    async draftEventsStream(request, reply) {
      const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '*';
      const contentType = request.headers['content-type'] ?? '';

      let prompt: string;
      let context: EditorContext;
      let history: ConversationHistoryMessage[] | undefined;
      let attachments: FileAttachment[] | undefined;
      let deterministicOnly: boolean | undefined;

      if (contentType.includes('multipart/form-data')) {
        const parts = request.parts();
        const fields: Record<string, string> = {};
        const files: UploadedFile[] = [];
        for await (const part of parts) {
          if (part.type === 'field') {
            fields[part.fieldname] = part.value as string;
          } else if (part.type === 'file') {
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) chunks.push(chunk);
            files.push({
              originalName: part.filename ?? 'unknown',
              mimeType: part.mimetype ?? 'application/octet-stream',
              sizeBytes: Buffer.concat(chunks).length,
              buffer: Buffer.concat(chunks),
            });
          }
        }
        prompt = fields['prompt'] ?? '';
        context = fields['context'] ? JSON.parse(fields['context']) as EditorContext : ({} as EditorContext);
        history = fields['history'] ? JSON.parse(fields['history']) as ConversationHistoryMessage[] : undefined;
        attachments = files.length > 0
          ? files.map((f) => ({ name: f.originalName, mime_type: f.mimeType, content: f.buffer }))
          : undefined;
        deterministicOnly = fields['deterministicOnly'] === 'true' ? true : undefined;
      } else {
        const body = request.body;
        prompt = body.prompt;
        context = body.context;
        history = body.history;
        attachments = body.attachments;
        deterministicOnly = body.deterministicOnly;
      }

      if (!deterministicOnly) {
        reply.status(503);
        await reply.send({ error: 'AI_UNAVAILABLE', message: deps.unavailableMessage() });
        return;
      }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': origin,
        'Vary': 'Origin',
      });

      const sendEvent = (event: AgentEvent) => {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      sendEvent({ type: 'status', message: 'Received — running deterministic precompile…' });

      try {
        const result = await deps.runDeterministic({
          prompt,
          context,
          ...(history ? { history } : {}),
          ...(attachments ? { attachments } : {}),
          onEvent: sendEvent,
        });
        sendEvent({ type: 'done', result: result as never });
      } catch (err) {
        sendEvent({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        reply.raw.end();
      }
    },

    async assistStream(_request, reply) {
      reply.status(503);
      await reply.send({ error: 'AI_UNAVAILABLE', message: deps.unavailableMessage() });
    },

    async warmContext(_request, reply) {
      // No LLM configured — nothing to warm.
      reply.status(202);
      return { accepted: false, reason: 'AI not configured' };
    },

    async warmContextStatus(request, _reply) {
      return { key: request.query?.key ?? '', status: { state: 'disabled' } };
    },
  };
}
