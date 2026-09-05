/**
 * GraphSearchHandlers — HTTP surface for the graph query engine.
 *
 * Endpoint:
 *   POST /api/search/graph   → run a GraphQuery, return a GraphResult envelope
 *   POST /api/search/graph/collections  → tag a query result set as a collection
 *   POST /api/search/graph/selections   → create a selection from a collection
 *
 * Mirrors JsonLdSearchHandlers conventions (envelope {..} / {error} reply,
 * request.log on failure). The body is parsed + validated via the zod
 * GraphQuerySchema at the boundary; semantic checks via GraphValidation;
 * execution via GraphQueryEngine.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { GraphQuerySchema } from '../../graph-query/schema.js';
import type { GraphQueryService } from '../../graph-query/service.js';

export class GraphSearchHandlers {
  constructor(private readonly svc: GraphQueryService) {}

  async search(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as unknown;
    if (body === null || typeof body !== 'object') {
      return reply.status(400).send({ error: 'Body must be a JSON object containing a GraphQuery' });
    }
    // Parse + structural validation.
    const parsed = GraphQuerySchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error instanceof ZodError
        ? parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
        : [];
      return reply.status(400).send({ error: 'invalid_query', issues });
    }
    // Semantic validation (§17).
    const query = parsed.data as import('../../graph-query/types.js').GraphQuery;
    const semantic = await this.svc.validation.validate(query);
    if (!semantic.valid) {
      return reply.status(400).send({ error: 'invalid_query', issues: semantic.issues });
    }
    try {
      const result = await this.svc.engine.execute(query);
      return reply.send(result);
    } catch (err) {
      request.log.error({ err, body }, 'Graph query failed');
      return reply.status(500).send({ error: 'Graph query failed' });
    }
  }

  async createCollection(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as { nodeIds?: string[] } | null;
    if (!body || !Array.isArray(body.nodeIds)) {
      return reply.status(400).send({ error: 'Body must be { nodeIds: string[] }' });
    }
    const handle = this.svc.collections.createCollection(body.nodeIds);
    return reply.send({ ok: true, handle });
  }

  async createSelection(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as { collection?: string; nodeIds?: string[] } | null;
    if (!body || typeof body.collection !== 'string' || !Array.isArray(body.nodeIds)) {
      return reply.status(400).send({ error: 'Body must be { collection: string, nodeIds: string[] }' });
    }
    try {
      const handle = this.svc.collections.createSelection(body.collection, body.nodeIds);
      return reply.send({ ok: true, handle });
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'Selection failed' });
    }
  }

  async aiContext(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as { selection?: string; prompt?: string } | null;
    if (!body || typeof body.selection !== 'string') {
      return reply.status(400).send({ error: 'Body must be { selection: string, prompt?: string }' });
    }
    const ctx = this.svc.collections.toAiContext(body.selection, body.prompt ?? '');
    if (ctx.nodeIds.length === 0) {
      return reply.status(404).send({ error: `Unknown selection: ${body.selection}` });
    }
    return reply.send(ctx);
  }
}

export function createGraphSearchHandlers(svc: GraphQueryService): GraphSearchHandlers {
  return new GraphSearchHandlers(svc);
}