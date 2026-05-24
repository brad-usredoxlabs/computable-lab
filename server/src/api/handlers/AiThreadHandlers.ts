/**
 * AI thread handlers.
 *
 * Endpoints:
 * - GET  /api/ai/threads/:endpoint            → return the live thread
 * - POST /api/ai/threads/:endpoint            → append a message, return thread
 * - POST /api/ai/threads/:endpoint/promote    → promote live thread to a record
 *
 * `userId` is taken from the `x-user-id` header; absent header falls back to
 * `default` so single-user appliance mode works without auth. A future
 * authenticated build will replace that fallback at the auth boundary, not
 * here.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type {
  AiThreadStore,
  AppendMessageInput,
  PromoteOptions,
  ThreadMention,
} from '../../ai-threads/index.js';
import { isApplianceEndpoint } from '../../ai-threads/index.js';
import type { RecordStore } from '../../store/index.js';

const CONVERSATION_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/conversation.schema.yaml';

function resolveUserId(request: FastifyRequest): string {
  const header = request.headers['x-user-id'];
  if (typeof header === 'string' && header.length > 0) return header;
  return 'default';
}

export class AiThreadHandlers {
  constructor(
    private readonly store: AiThreadStore,
    private readonly records?: RecordStore,
  ) {}

  async getThread(
    request: FastifyRequest<{ Params: { endpoint: string } }>,
    reply: FastifyReply,
  ) {
    const endpoint = request.params.endpoint;
    if (!isApplianceEndpoint(endpoint)) {
      return reply.status(400).send({ error: `Unknown endpoint: ${endpoint}` });
    }
    const userId = resolveUserId(request);
    try {
      const thread = await this.store.getThread(userId, endpoint);
      return reply.send(thread);
    } catch (err) {
      request.log.error({ err }, 'Failed to read AI thread');
      return reply.status(500).send({ error: 'Failed to read thread' });
    }
  }

  async appendMessage(
    request: FastifyRequest<{
      Params: { endpoint: string };
      Body: AppendMessageInput;
    }>,
    reply: FastifyReply,
  ) {
    const endpoint = request.params.endpoint;
    if (!isApplianceEndpoint(endpoint)) {
      return reply.status(400).send({ error: `Unknown endpoint: ${endpoint}` });
    }
    const body = request.body;
    if (!body || typeof body !== 'object' || !body.message) {
      return reply.status(400).send({ error: 'Body must include a `message`' });
    }
    const userId = resolveUserId(request);
    try {
      const thread = await this.store.append(userId, endpoint, body);
      return reply.send(thread);
    } catch (err) {
      request.log.error({ err }, 'Failed to append to AI thread');
      return reply.status(500).send({ error: 'Failed to append message' });
    }
  }

  async promote(
    request: FastifyRequest<{
      Params: { endpoint: string };
      Body: PromoteOptions;
    }>,
    reply: FastifyReply,
  ) {
    if (!this.records) {
      return reply.status(501).send({
        error: 'Record store not wired; promote-to-record disabled in this build',
      });
    }
    const endpoint = request.params.endpoint;
    if (!isApplianceEndpoint(endpoint)) {
      return reply.status(400).send({ error: `Unknown endpoint: ${endpoint}` });
    }
    const opts = request.body;
    if (!opts || typeof opts.title !== 'string' || typeof opts.recordId !== 'string') {
      return reply.status(400).send({ error: 'Body must include `title` and `recordId`' });
    }

    const userId = resolveUserId(request);
    let thread;
    try {
      thread = await this.store.getThread(userId, endpoint);
    } catch (err) {
      request.log.error({ err }, 'Failed to read thread for promotion');
      return reply.status(500).send({ error: 'Failed to read thread' });
    }

    if (thread.messages.length === 0) {
      return reply.status(400).send({ error: 'Live thread is empty; nothing to promote' });
    }

    const promotedAt = new Date().toISOString();
    const payload: Record<string, unknown> = {
      kind: 'conversation',
      title: opts.title,
      endpoint,
      userId,
      messages: thread.messages,
      mentions: thread.mentions,
      linkedArtifacts: opts.linkedArtifacts ?? [],
      promotedAt,
      promotedBy: userId,
      provenance: {
        mode: opts.mode ?? 'manual',
        ...(opts.reason !== undefined ? { reason: opts.reason } : {}),
        ...(opts.passId !== undefined ? { passId: opts.passId } : {}),
      },
    };

    try {
      const result = await this.records.create({
        envelope: {
          recordId: opts.recordId,
          schemaId: CONVERSATION_SCHEMA_ID,
          payload,
        },
        message: `Promote AI thread (${endpoint}) to ${opts.recordId}`,
      });
      if (!result.success) {
        return reply.status(400).send({
          error: result.error || 'Failed to create conversation record',
          validation: result.validation,
          lint: result.lint,
        });
      }
      await this.store.clear(userId, endpoint);
      return reply.send({ recordId: opts.recordId, promotedAt });
    } catch (err) {
      request.log.error({ err }, 'Failed to promote AI thread');
      return reply.status(500).send({ error: 'Failed to promote thread' });
    }
  }
}

export function createAiThreadHandlers(
  store: AiThreadStore,
  records?: RecordStore,
): AiThreadHandlers {
  return new AiThreadHandlers(store, records);
}

export type { ThreadMention };
