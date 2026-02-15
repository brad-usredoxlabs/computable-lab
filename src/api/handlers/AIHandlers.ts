/**
 * REST handlers for the AI agent endpoints.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AgentOrchestrator, EditorContext, AgentEvent } from '../../ai/types.js';

export interface DraftEventsBody {
  prompt: string;
  context: EditorContext;
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
      const { prompt, context } = request.body;

      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'prompt is required' };
      }

      try {
        const result = await orchestrator.run({ prompt, context });
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
      const { prompt, context } = request.body;

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const sendEvent = (event: AgentEvent) => {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      try {
        const result = await orchestrator.run({
          prompt,
          context,
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
