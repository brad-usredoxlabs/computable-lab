/**
 * Workspace-session routes — the persistent, cross-device workspace session.
 *
 *   GET  /api/session            → { session } for the requesting user
 *   PUT  /api/session            → upsert { tabs, activeTabId }
 *   GET  /api/session/:userId    → { session } for an explicit user (read-only
 *                                  attach: "show me what Brad has open")
 *
 * `userId` resolution mirrors AiThreadHandlers: the `x-user-id` header, falling
 * back to `default` so a single-user appliance works without auth. The document
 * is validated with Ajv (ctx.validator, rule #3) against
 * schema/workflow/lab-session.schema.yaml — this handler owns NO validation
 * logic of its own.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../../server.js';
import { WorkspaceSessionStore } from '../../workspace-session/index.js';

const LAB_SESSION_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/workflow/lab-session.schema.yaml';

function resolveUserId(request: FastifyRequest): string {
  const header = request.headers['x-user-id'];
  return typeof header === 'string' && header.length > 0 ? header : 'default';
}

interface PutBody {
  tabs?: unknown[];
  activeTabId?: string | null;
}

export function registerWorkspaceSessionRoutes(fastify: FastifyInstance, ctx: AppContext) {
  const store = new WorkspaceSessionStore(ctx.workspaceRoot);

  fastify.get('/session', async (request: FastifyRequest) => ({
    session: await store.get(resolveUserId(request)),
  }));

  fastify.get('/session/:userId', async (request: FastifyRequest<{ Params: { userId: string } }>) => ({
    session: await store.get(request.params.userId),
  }));

  fastify.put(
    '/session',
    async (request: FastifyRequest<{ Body: PutBody }>, reply: FastifyReply) => {
      const body = request.body ?? {};
      if (!Array.isArray(body.tabs)) {
        return reply.status(400).send({ error: 'INVALID_SESSION', message: 'body.tabs must be an array' });
      }
      const validation = ctx.validator.validate(
        { version: 1, tabs: body.tabs, activeTabId: body.activeTabId ?? null },
        LAB_SESSION_SCHEMA_ID,
      );
      if (!validation.valid) {
        return reply.status(400).send({ error: 'INVALID_SESSION', message: validation.errors });
      }
      const session = await store.put(resolveUserId(request), body.tabs, body.activeTabId ?? null);
      return reply.send({ session });
    },
  );
}
