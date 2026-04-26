/**
 * OntologyTermHandlers — HTTP handlers for the ontology-term registry.
 *
 * Provides a GET endpoint that looks up a single ontology term by id via
 * query parameter (`/ontology-terms/lookup?id=<encoded>`).
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AggregateRegistryLoader } from '../../registry/RegistryLoader.js';
import type { OntologyTerm } from '../../registry/OntologyTermRegistry.js';
import type { ApiError } from '../types.js';

/**
 * Response shape for a single ontology-term lookup.
 */
export interface OntologyTermResponse {
  success: true;
  term: OntologyTerm;
}

/**
 * Create ontology-term handlers bound to an ontology-term registry.
 */
export function createOntologyTermHandlers(
  registry: AggregateRegistryLoader<OntologyTerm>,
) {
  return {
    /**
     * GET /ontology-terms/lookup?id=<encoded>
     * Get a single ontology term by id.
     */
    async getOntologyTerm(
      request: FastifyRequest<{
        Querystring: { id: string };
      }>,
      reply: FastifyReply,
    ): Promise<OntologyTermResponse | ApiError> {
      const { id } = request.query;

      const term = registry.get(id);

      if (!term) {
        reply.status(404);
        return {
          error: 'NOT_FOUND',
          message: `Ontology term not found: ${id}`,
        };
      }

      return {
        success: true,
        term,
      };
    },
  };
}

export type OntologyTermHandlers = ReturnType<typeof createOntologyTermHandlers>;
