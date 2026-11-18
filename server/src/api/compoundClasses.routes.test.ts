// @vitest-environment node
/**
 * L2-GC-PEAK-NAMING-1 (u4surface) — GET /api/compound-classes.
 *
 * GC-BUNDLE r2 gate defect T2-3: the compound-class registry (schema/
 * registry/compound-classes — fame-medium-chain with 8 FAME candidates)
 * resolved only through GET /api/ontology-terms/lookup and NO UI surface
 * rendered it. This route serves the registry verbatim; these cases
 * register the REAL registerRoutes and read the REAL registry content —
 * no fixture (the served list must carry fame-medium-chain's declared
 * candidates straight from the registry file).
 */
import { afterAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerRoutes } from './routes.js';

/** Minimal handler stubs for the unconditional registerRoutes registrations
 *  (same shape as journeyCapabilities.routes.test.ts). */
function stubRouteOptions() {
  const noop = async () => ({});
  return {
    recordHandlers: {
      listRecords: noop, listRevisions: noop, draftCopy: noop, acceptGraph: noop,
      getRecord: noop, createRecord: noop, updateRecord: noop, deleteRecord: noop,
      listClaims: noop, checkClaimDuplicates: noop, listDanglingReferences: noop,
    } as never,
    schemaHandlers: { listSchemas: noop, getSchema: noop, getSchemaByPath: noop } as never,
    validationHandlers: { validate: noop, lint: noop, validateFull: noop } as never,
    schemaCount: () => 0,
    ruleCount: () => 0,
  };
}

interface CompoundClassesBody {
  classes: Array<{
    id: string;
    name: string;
    candidates: Array<{ compoundId: string; name: string }>;
  }>;
}

const apps: FastifyInstance[] = [];

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(async (instance) => {
    registerRoutes(instance, stubRouteOptions());
  }, { prefix: '/api' });
  await app.ready();
  apps.push(app);
  return app;
}

afterAll(async () => {
  for (const app of apps) await app.close();
});

describe('GET /api/compound-classes (L2-GC-PEAK-NAMING-1)', () => {
  it('serves the real registry: fame-medium-chain with all 8 candidates', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/compound-classes' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as CompoundClassesBody;
    const fame = body.classes.find((c) => c.id === 'fame-medium-chain');
    expect(fame, 'fame-medium-chain must be served from the real registry file').toBeDefined();
    expect(fame!.candidates.length).toBeGreaterThanOrEqual(8);
    // The served content is the file's declared candidate order (the 6:0
    // standard first) — not a fixture and not an invention.
    expect(fame!.candidates[0].compoundId).toBe('FAME-LOCAL:methyl-hexanoate-n6');
    expect(fame!.candidates[0].name).toBe('Methyl hexanoate (FAME, 6:0-OMe)');
  });

  it('serves every registry class with a non-empty candidates array', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/compound-classes' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as CompoundClassesBody;
    expect(body.classes.length).toBeGreaterThanOrEqual(1);
    for (const cls of body.classes) {
      expect(cls.candidates.length).toBeGreaterThanOrEqual(1);
      for (const c of cls.candidates) expect(typeof c.compoundId).toBe('string');
    }
  });
});
