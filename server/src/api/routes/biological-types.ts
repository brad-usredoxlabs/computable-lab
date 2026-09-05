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
}