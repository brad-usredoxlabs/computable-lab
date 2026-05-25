/**
 * PredicatesHandlers — exposes the curated relationship-predicate registry
 * over HTTP.
 *
 * The registry is loaded once at startup from `schema/registry/predicates.registry.yaml`
 * and reused here. Returning a stable JSON payload lets the app's wizard UI
 * surface the same predicates that the lint engine and knowledge-AI prompts
 * already see.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { PredicateRegistry, PredicateEntry, PredicateFamily } from '../../registry/PredicateRegistry.js';
export type { PredicateEntry, PredicateFamily };
import type { ApiError } from '../types.js';

export interface PredicatesResponse {
  registryVersion: number;
  families: PredicateFamily[];
  predicates: PredicateEntry[];
}

export interface PredicatesHandlers {
  listPredicates(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<PredicatesResponse | ApiError>;
}

export function createPredicatesHandlers(
  registry: PredicateRegistry | undefined,
): PredicatesHandlers {
  return {
    async listPredicates(_request, reply) {
      if (!registry) {
        reply.status(503);
        return {
          error: 'PREDICATE_REGISTRY_UNAVAILABLE',
          message: 'The predicate registry failed to load at server startup.',
        };
      }

      return {
        registryVersion: 1,
        families: registry.getFamilies(),
        predicates: registry.getAll(),
      };
    },
  };
}
