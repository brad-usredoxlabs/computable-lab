/**
 * MATRES-SHELF — read-only HTTP surface for the concept-keyed shelf lookup.
 *
 * GET /inventory/shelf?term=... -> ShelfReport (grouped bill of recorded
 * material). Thin wrapper: all resolution law lives in
 * server/src/resolve/shelfLookup.ts. No writes, no vocabulary verb.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RecordStore } from '../../store/types.js';
import { createShelfLookup, type ShelfLookup } from '../../resolve/shelfLookup.js';

interface ShelfQuery {
  term?: string;
}

export class InventoryShelfHandlers {
  private readonly lookup: ShelfLookup;

  constructor(store: RecordStore) {
    this.lookup = createShelfLookup(store);
  }

  async getShelf(request: FastifyRequest<{ Querystring: ShelfQuery }>, reply: FastifyReply) {
    const term = typeof request.query?.term === 'string' ? request.query.term.trim() : '';
    if (!term) {
      reply.code(400);
      return { error: 'term query parameter is required' };
    }
    return this.lookup.queryShelf(term);
  }
}

export function createInventoryShelfHandlers(store: RecordStore): InventoryShelfHandlers {
  return new InventoryShelfHandlers(store);
}
