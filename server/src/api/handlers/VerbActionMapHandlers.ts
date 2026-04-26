/**
 * VerbActionMapHandlers — HTTP handlers for the verb-action-map registry.
 *
 * Provides a GET endpoint that looks up a single verb mapping via
 * query parameter (`/verb-action-map/lookup?verb=<encoded>`).
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { VerbMapping } from '../../registry/VerbActionMapRegistry.js';
import type { ApiError } from '../types.js';

/**
 * Response shape for a single verb-action-map lookup.
 */
export interface VerbActionMapResponse {
  success: true;
  mapping: VerbMapping;
}

/**
 * Create verb-action-map handlers bound to a VerbActionMapRegistry.
 */
export function createVerbActionMapHandlers(
  registry: { lookup(verb: string): VerbMapping | undefined; list(): VerbMapping[] },
) {
  return {
    /**
     * GET /verb-action-map/lookup?verb=<encoded>
     * Get a single verb mapping by verb name.
     */
    async getVerbActionMapping(
      request: FastifyRequest<{
        Querystring: { verb: string };
      }>,
      reply: FastifyReply,
    ): Promise<VerbActionMapResponse | ApiError> {
      const { verb } = request.query;

      const mapping = registry.lookup(verb);

      if (!mapping) {
        reply.status(404);
        return {
          error: 'NOT_FOUND',
          message: `Verb-action mapping not found: ${verb}`,
        };
      }

      return {
        success: true,
        mapping,
      };
    },
  };
}

export type VerbActionMapHandlers = ReturnType<typeof createVerbActionMapHandlers>;
