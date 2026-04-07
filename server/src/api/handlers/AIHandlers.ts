/**
 * REST handlers for the AI agent endpoints.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type {
  AgentOrchestrator,
  EditorContext,
  AgentEvent,
  ConversationHistoryMessage,
} from '../../ai/types.js';
import { extractFileContent, type UploadedFile, type ExtractedFile } from '../../ai/FileContentExtractor.js';

export interface DraftEventsBody {
  prompt: string;
  context: EditorContext;
  history?: ConversationHistoryMessage[];
}

export type AiSurface =
  | 'event-editor'
  | 'run-workspace'
  | 'materials'
  | 'formulations'
  | 'ingestion'
  | 'literature';

export interface AssistBody {
  prompt: string;
  surface: AiSurface;
  context: Record<string, unknown>;
  history?: ConversationHistoryMessage[];
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
}

/**
 * Create AI handlers backed by the given orchestrator.
 */
export function createAIHandlers(orchestrator: AgentOrchestrator): AIHandlers {
  return {
    async draftEvents(
      request: FastifyRequest<{ Body: DraftEventsBody }>,
      reply: FastifyReply,
    ) {
      const { prompt, context, history } = request.body;

      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'prompt is required' };
      }

      try {
        const result = await orchestrator.run({
          prompt,
          context,
          ...(history ? { history } : {}),
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
      const { prompt, context, history } = request.body;
      const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '*';

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

      try {
        const result = await orchestrator.run({
          prompt,
          context,
          ...(history ? { history } : {}),
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
      let fileAttachments: ExtractedFile[] = [];

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

        // Extract content from uploaded files
        fileAttachments = files.map((f) => extractFileContent(f));
      } else {
        // Standard JSON body
        const body = request.body;
        prompt = body.prompt;
        surface = body.surface;
        context = body.context;
        history = body.history;
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

      // Inject file attachments into context if present
      if (fileAttachments.length > 0) {
        (editorContext as unknown as Record<string, unknown>)['fileAttachments'] = fileAttachments;
      }

      try {
        sendEvent({ type: 'status', message: `Processing ${surface} request...` });

        const result = await orchestrator.run({
          prompt,
          context: editorContext,
          surface: surface as AiSurface,
          ...(history ? { history } : {}),
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
  };
}
