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
import { WorkstateJournal, auditRowsToJournalView, journalPolicyPath } from '../../workspace-session/WorkstateJournal.js';
import { resolve } from 'node:path';

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
  // PB-CH-8: the append-only workstate-snapshot journal. The store stays
  // byte-frozen — capture lives at the ROUTE's call site, never in put()
  // (WorkstateDraftAdapter.test.ts:308-319 is the load-bearing proof why).
  // Every seam is optional-chained: a harness ctx without schemaDir/store/
  // localIdentityService yields a journal whose policy file is absent ⇒ capture
  // DISABLED (decision §4.2), and the main.yaml behavior is byte-unchanged.
  const journal = new WorkstateJournal({
    workspaceRoot: ctx.workspaceRoot,
    policyPath: ctx.schemaDir ? journalPolicyPath(ctx.schemaDir) : resolve(ctx.workspaceRoot, 'var', 'journal-policy-missing.yaml'),
    // The audit seam: the store's audit-event envelopes projected onto the
    // journal's read-only view (the ONE shared projection, AuditEventService.ts:
    // 24-31 payload shape).
    auditSource: {
      list: async (filter) => auditRowsToJournalView(await (ctx.store?.list(filter) ?? Promise.resolve([]))),
    },
  });

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
      // main.yaml path BYTE-UNCHANGED: raw-header actor + LWW (decision §4.3).
      const session = await store.put(resolveUserId(request), body.tabs, body.activeTabId ?? null);
      // The journal actor is the RESOLVED identity (token > header), never the
      // header fallback: an unresolved/inactive actor captures nothing
      // (decision §4.3). No identity service ⇒ no resolved actor ⇒ no capture.
      const resolved = ctx.localIdentityService
        ? await ctx.localIdentityService.resolveRequestUser(request)
        : null;
      await journal.maybeCapture({
        userId: resolved?.userId ?? 'default',
        actor: resolved?.userId ?? null,
        snapshot: session,
      });
      return reply.send({ session });
    },
  );
}
