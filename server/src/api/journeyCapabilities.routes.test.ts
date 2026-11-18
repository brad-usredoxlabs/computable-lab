// @vitest-environment node
/**
 * L2-JOURNEY-CAPABILITY-CATALOGUE-1 (u3route) — GET /api/journey/capabilities.
 *
 * The SERVED half of the item's two HTTP-shaped clauses. Every case registers
 * the REAL `registerRoutes` and feeds descriptors as files on disk, so no
 * capability id and no handler id appears in TypeScript: the descriptor below
 * is written by the test, and `handler_ref` is taken from AGENT_ALLOWED_TOOLS.
 * Admission is unit 2's (compiler/journey/capabilityCatalogue.ts); these cases
 * observe only what that authority serves.
 *
 * Directory: a scratch dir under /home/brad/.jcc-u3-scratch (never /tmp —
 * it hit 100% inode use on 2026-11-05).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { AGENT_ALLOWED_TOOLS } from '../ai/index.js';
import { registerRoutes } from './routes.js';

const SCRATCH_ROOT = '/home/brad/.jcc-u3-scratch';
/** The known set is the shipped allow-list; a literal id here would be a second authority. */
const KNOWN_HANDLER = AGENT_ALLOWED_TOOLS[0];
const UNKNOWN_HANDLER = 'handlers.absent_tool';

/** Minimal handler stubs for the unconditional registerRoutes registrations. */
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

/** A schema-valid descriptor document; only capability_id and handler_ref vary. */
function descriptor(capabilityId: string, handlerRef: string) {
  return {
    capability_id: capabilityId,
    version: '1.0.0',
    display_name: capabilityId,
    justification: 'Route fixture: proves a YAML-only capability is served without a TS change.',
    ports: { input: [], output: [] },
    implementation: { handler_kind: 'agent_tool', handler_ref: handlerRef },
    effects: ['read'],
    permissions: ['records.read'],
    availability: {},
    surfaces: ['journey.catalogue'],
    idempotency: 'pure',
    retry: 'none',
    reconciliation: 'not_required',
    evidence: ['validation_report'],
    status: { declared: true, implemented: true, available_now: true, browser_certified: false },
  };
}

interface CatalogueBody {
  capabilities: Array<{ capability_id: string }>;
  diagnostics: string[];
}

const apps: FastifyInstance[] = [];
const dirs: string[] = [];

async function scratchDir(): Promise<string> {
  const dir = await mkdtemp(join(SCRATCH_ROOT, 'catalogue-'));
  dirs.push(dir);
  return dir;
}

/** Real registration path; only the catalogue directory is overridden. */
async function buildApp(journeyCatalogueDir: string): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(async (instance) => {
    registerRoutes(instance, { ...stubRouteOptions(), journeyCatalogueDir });
  }, { prefix: '/api' });
  await app.ready();
  apps.push(app);
  return app;
}

async function getCatalogue(app: FastifyInstance) {
  const response = await app.inject({ method: 'GET', url: '/api/journey/capabilities' });
  return { status: response.statusCode, raw: response.body, body: response.json() as CatalogueBody };
}

beforeAll(async () => {
  await mkdir(SCRATCH_ROOT, { recursive: true });
});

afterAll(async () => {
  for (const app of apps) await app.close();
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

describe('GET /api/journey/capabilities (L2-JOURNEY-CAPABILITY-CATALOGUE-1)', () => {
  it('(a) empty catalogue directory: 200 with no capabilities and no diagnostics', async () => {
    const app = await buildApp(await scratchDir());
    const { status, body } = await getCatalogue(app);
    expect(status).toBe(200);
    expect(body.capabilities).toEqual([]);
    expect(body.diagnostics).toEqual([]);
  });

  it('(b) a descriptor naming an allowed handler is served, byte-stable across requests', async () => {
    const dir = await scratchDir();
    await writeFile(join(dir, 'known.yaml'), stringify(descriptor('journey.fixture.known', KNOWN_HANDLER)), 'utf8');
    const app = await buildApp(dir);

    const first = await getCatalogue(app);
    expect(first.status).toBe(200);
    expect(first.body.capabilities.map((c) => c.capability_id)).toContain('journey.fixture.known');
    expect(first.body.diagnostics).toEqual([]);

    // AC3: the directory did not change, so the second response is identical.
    const second = await getCatalogue(app);
    expect(second.raw).toBe(first.raw);
  });

  it('(c) a dangling handler_ref is excluded and named verbatim in diagnostics', async () => {
    const dir = await scratchDir();
    await writeFile(join(dir, 'dangling.yaml'), stringify(descriptor('journey.fixture.dangling', UNKNOWN_HANDLER)), 'utf8');
    const app = await buildApp(dir);

    const { status, body } = await getCatalogue(app);
    expect(status).toBe(200);
    expect(body.capabilities.map((c) => c.capability_id)).not.toContain('journey.fixture.dangling');
    expect(body.diagnostics.some((line) => line.includes(UNKNOWN_HANDLER))).toBe(true);
  });

  it('(d) an absent catalogue directory: 200, no capabilities, ONE diagnostic naming the directory', async () => {
    const missing = join(await scratchDir(), 'not-created');
    const app = await buildApp(missing);

    const { status, body } = await getCatalogue(app);
    expect(status).toBe(200);
    expect(body.capabilities).toEqual([]);
    expect(body.diagnostics).toHaveLength(1);
    expect(body.diagnostics[0]).toContain(missing);
  });
});
