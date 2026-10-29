/**
 * AI thread handlers.
 *
 * Endpoints:
 * - GET  /api/ai/threads/:endpoint            → return the live thread
 * - POST /api/ai/threads/:endpoint            → append a message, return thread
 * - POST /api/ai/threads/:endpoint/promote    → promote the live thread to a record
 * - GET  /api/ai/threads/:endpoint/threads    → list the user's threads (scope-filtered)
 *
 * L2-THREAD-SCOPED-1: threads key on (userId, endpoint, scope, threadId).
 * The two new identity headers ride on the SAME requests as x-user-id:
 * - `x-cl-thread-id`   — the tab's minted thread id (per-tab, per-scope map
 *                        on the client; one UUID per (tab, scope)).
 * - `x-cl-thread-scope` — the surface's instance identity (deck: the loaded
 *                        event-graph recordId); absent on non-instance
 *                        surfaces => the reserved "_" scope.
 *
 * NO-FALLBACK RULE (binding): an absent or MALFORMED threadId header is a
 * FRESH EMPTY thread — the handler NEVER reads another thread of the same
 * (user, endpoint) (not the legacy flat file, not a sibling threadId, not
 * "most recently updated"), NEVER 4xx's, NEVER falls back. Absent/malformed
 * scope => no scope (the store's reserved "_" segment). The handler mints a
 * fresh id only for the absent/malformed case so GET/POST/promote stay
 * well-formed (the client always sends one; this is the robustness edge).
 *
 * `userId` is taken from the `x-user-id` header; absent header falls back to
 * `default` so single-user appliance mode works without auth. A future
 * authenticated build will replace that fallback at the auth boundary, not
 * here.
 */

import { randomUUID } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type {
  AiThreadStore,
  AppendMessageInput,
  PromoteOptions,
  ThreadMention,
  ThreadSummary,
} from '../../ai-threads/index.js';
import { isApplianceEndpoint, isValidThreadSegment } from '../../ai-threads/index.js';
import type { RecordStore } from '../../store/index.js';

const CONVERSATION_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/conversation.schema.yaml';

/**
 * Header name constants — the single place the wire identity is named.
 * (The client mints these in threadHeaders(); keeping the names here as
 * constants keeps both sides honest without a shared package.)
 */
const HEADER_THREAD_ID = 'x-cl-thread-id';
const HEADER_THREAD_SCOPE = 'x-cl-thread-scope';

function resolveUserId(request: FastifyRequest): string {
  const header = request.headers['x-user-id'];
  if (typeof header === 'string' && header.length > 0) return header;
  return 'default';
}

/**
 * The effective (scope, threadId) for a request.
 *
 * - scope: a SAFE segment header is passed through; absent/malformed =>
 *   `undefined` (the store places it under the reserved "_" segment).
 * - threadId: a SAFE segment header is passed through; absent/malformed =>
 *   a FRESH minted UUID (fresh-empty semantics — never another thread).
 */
function resolveThreadContext(request: FastifyRequest): { scope: string | undefined; threadId: string } {
  const scopeHeader = request.headers[HEADER_THREAD_SCOPE];
  const scope = isValidThreadSegment(scopeHeader) ? scopeHeader : undefined;

  const threadIdHeader = request.headers[HEADER_THREAD_ID];
  const threadId = isValidThreadSegment(threadIdHeader) ? threadIdHeader : randomUUID();
  return { scope, threadId };
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
    const { scope, threadId } = resolveThreadContext(request);
    try {
      const thread = await this.store.getThread(userId, endpoint, scope, threadId);
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
    const { scope, threadId } = resolveThreadContext(request);
    try {
      const thread = await this.store.append(userId, endpoint, body, scope, threadId);
      return reply.send(thread);
    } catch (err) {
      request.log.error({ err }, 'Failed to append to AI thread');
      return reply.status(500).send({ error: 'Failed to append message' });
    }
  }

  /**
   * List the CALLING user's threads for (endpoint, scope) only
   * (amendment A-3). Scope comes from the SAME header as the thread routes
   * (absent => the reserved "_" segment). Pure store data: no schema, no
   * record type — threads remain non-records until promoted.
   */
  async listThreads(
    request: FastifyRequest<{ Params: { endpoint: string } }>,
    reply: FastifyReply,
  ) {
    const endpoint = request.params.endpoint;
    if (!isApplianceEndpoint(endpoint)) {
      return reply.status(400).send({ error: `Unknown endpoint: ${endpoint}` });
    }
    const userId = resolveUserId(request);
    const { scope } = resolveThreadContext(request);
    try {
      const threads: ThreadSummary[] = await this.store.listThreads(userId, endpoint, scope);
      return reply.send({ threads });
    } catch (err) {
      request.log.error({ err }, 'Failed to list AI threads');
      return reply.status(500).send({ error: 'Failed to list threads' });
    }
  }

  /**
   * Promote the header-carried (scope, threadId) thread to a `conversation`
   * record. Semantics UNCHANGED IN KIND (amendment A-4): exactly ONE record,
   * the promoted payload's schema-visible fields byte-identical, and
   * `store.clear` of EXACTLY the promoted (scope, threadId) — never the whole
   * surface, never a sibling thread. A missing/malformed thread header
   * resolves to a FRESH EMPTY thread => the existing honest 400.
   */
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
    const { scope, threadId } = resolveThreadContext(request);
    let thread;
    try {
      thread = await this.store.getThread(userId, endpoint, scope, threadId);
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
      await this.store.clear(userId, endpoint, scope, threadId);
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
