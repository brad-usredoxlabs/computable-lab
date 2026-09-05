/**
 * Surfaces routes — expose the declarative work-surface registry so the
 * frontend can render "where am I" from DATA (repo rule #1), not hardcode it.
 *
 *   GET /api/surfaces   → { surfaces: SurfaceSpec[] }
 */
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../server.js';
import { loadDefaultSurfacesRegistry } from '../../surfaces/surfaces.js';

let cached: ReturnType<typeof loadDefaultSurfacesRegistry> | null = null;

function surfacesFor(schemaDir: string): ReturnType<typeof loadDefaultSurfacesRegistry> {
  if (!cached) cached = loadDefaultSurfacesRegistry(schemaDir);
  return cached;
}

export function registerSurfacesRoutes(fastify: FastifyInstance, ctx: AppContext) {
  fastify.get('/surfaces', async () => {
    const registry = surfacesFor(ctx.schemaDir);
    return { surfaces: registry.list() };
  });
}