/**
 * JSON-LD search handlers.
 *
 * Endpoints:
 * - POST /api/search/jsonld          → run a query against the index
 * - POST /api/search/jsonld/reindex  → drop the index and rebuild from
 *                                      store.list() (admin operation)
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { JsonLdIndex, JsonLdQuery } from '../../jsonld-index/index.js';
import type { JsonLdProjector } from '../../jsonld/JsonLdProjector.js';
import type { RecordStore } from '../../store/index.js';

export class JsonLdSearchHandlers {
  constructor(
    private readonly index: JsonLdIndex,
    private readonly projector: JsonLdProjector,
    private readonly store: RecordStore,
  ) {}

  async search(
    request: FastifyRequest<{ Body: JsonLdQuery }>,
    reply: FastifyReply,
  ) {
    const body = request.body;
    if (body !== null && typeof body !== 'object') {
      return reply.status(400).send({ error: 'Body must be a JSON object' });
    }
    const query: JsonLdQuery = body ?? {};
    try {
      const result = this.index.query(query);
      return reply.send(result);
    } catch (err) {
      request.log.error({ err, query }, 'JSON-LD search failed');
      return reply.status(500).send({ error: 'Search failed' });
    }
  }

  /**
   * Drop the index and rebuild from the authoritative record store. Cheap
   * enough on appliance-scale corpora (under a second for the current 166
   * records); reserved for admin tooling and the bootstrap path.
   */
  async reindex(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    try {
      const start = Date.now();
      this.index.clear();
      const records = await this.store.list();
      for (const env of records) {
        this.index.upsert(this.projector.project(env));
      }
      const ms = Date.now() - start;
      return reply.send({
        ok: true,
        count: this.index.size(),
        elapsedMs: ms,
      });
    } catch (err) {
      request.log.error({ err }, 'JSON-LD reindex failed');
      return reply.status(500).send({ error: 'Reindex failed' });
    }
  }
}

export function createJsonLdSearchHandlers(
  index: JsonLdIndex,
  projector: JsonLdProjector,
  store: RecordStore,
): JsonLdSearchHandlers {
  return new JsonLdSearchHandlers(index, projector, store);
}
