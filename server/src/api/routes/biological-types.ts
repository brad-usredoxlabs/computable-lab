/**
 * Biological Types routes — expose the declarative biological-type measure
 * registry (phase B) to the frontend add-material form.
 *
 *   GET /api/biological-types               → { registry: { default, types } }
 *   GET /api/biological-types/lookup            → { rule }
 *        ?domain=cell_line|organism&label=<type label>&curie=<NCBITaxon:...>
 *
 * The rule tells the form which invariant to record (cells/well, worms/well,
 * CFU/mL, ...) and which fields are required. Single source of truth is the
 * YAML registry; this module only loads + interprets it (repo rule #1).
 */
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../server.js';
import { loadDefaultBiologicalTypesRegistry, type BiologicalTypesRegistry } from '../../ontology/biologicalTypes.js';
import { createVerifyPlatingEvidence, type VerifyPlatingDescriptor } from '../../knowledge/verifyPlatingEvidence.js';

let cachedRegistry: BiologicalTypesRegistry | null = null;

function registryFor(schemaDir: string): BiologicalTypesRegistry {
  if (!cachedRegistry) {
    cachedRegistry = loadDefaultBiologicalTypesRegistry(schemaDir);
  }
  return cachedRegistry;
}

export function registerBiologicalTypesRoutes(fastify: FastifyInstance, ctx: AppContext) {
  fastify.get('/biological-types', async () => {
    const registry = registryFor(ctx.schemaDir);
    return { registry: registry.toJSON() };
  });

  fastify.get<{ Querystring: { domain?: string; label?: string; curie?: string } }>(
    '/biological-types/lookup',
    async (request) => {
      const registry = registryFor(ctx.schemaDir);
      const { domain, label, curie } = request.query;
      const rule = registry.lookup({
        ...(domain ? { domain } : {}),
        ...(label ? { label } : {}),
        ...(curie ? { curie } : {}),
      });
      return { rule };
    },
  );

  // D3 — wire a verification read (already staged as a read event) into the
  // knowledge layer as an EVIDENCE bundle supporting/refuting the seed-count
  // estimate. Content-addressed, idempotent.
  fastify.post<{ Body: VerifyPlatingDescriptor }>(
    '/biological-types/verify-plating',
    async (request, reply) => {
      const { eventId, materialLabel, count, measuredBy, readModality, wells } = request.body ?? {};
      if (!eventId || !materialLabel || typeof count !== 'number' || !measuredBy || !readModality) {
        return reply.status(400).send({ error: 'INVALID_INPUT', message: 'eventId, materialLabel, count, measuredBy, readModality required' });
      }
      const result = await createVerifyPlatingEvidence(ctx.store, {
        eventId,
        materialLabel,
        count,
        measuredBy,
        readModality,
        ...(Array.isArray(wells) ? { wells } : { wells: [] }),
        ...(request.body?.biologicalTypeRef ? { biologicalTypeRef: request.body.biologicalTypeRef } : {}),
      });
      return { ...result };
    },
  );
}