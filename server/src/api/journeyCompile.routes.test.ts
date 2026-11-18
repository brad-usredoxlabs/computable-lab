// @vitest-environment node
/** L2-JOURNEY-COMPILER-1 (unit croute) — POST /api/journey/compile through the REAL registerRoutes
 *  under `{ prefix: '/api' }` (sibling pattern). Provenance: `stubRouteOptions` is copied VERBATIM
 *  from journeyCapabilities.routes.test.ts (test-only duplication; that file is pinned CLOSED); the
 *  document fixture follows `doc()` at journeyCompiler.test.ts:27-38 and its `port()` helper;
 *  `handler_ref` comes from AGENT_ALLOWED_TOOLS[0]; capability ids are written to scratch YAML by
 *  THIS test; scratch lives in /home/brad/.journey-croute-scratch (never /tmp). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { AGENT_ALLOWED_TOOLS } from '../ai/index.js';
import { registerRoutes } from './routes.js';

const SCRATCH_ROOT = '/home/brad/.journey-croute-scratch';
const KNOWN_HANDLER = AGENT_ALLOWED_TOOLS[0]; // shipped allow-list; a literal id would be a second authority
const UNKNOWN_HANDLER = 'handlers.absent_tool';

/** Copied VERBATIM from journeyCapabilities.routes.test.ts (test-only duplication — provenance above). */
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

/** A schema-valid descriptor; only capability_id and handler_ref vary. */
function descriptor(capabilityId: string, handlerRef: string) {
  return {
    capability_id: capabilityId, version: '1.0.0', display_name: capabilityId,
    justification: 'Route fixture: proves a YAML-only capability is served without a TS change.',
    ports: { input: [], output: [] },
    implementation: { handler_kind: 'agent_tool', handler_ref: handlerRef },
    effects: ['read'], permissions: ['records.read'], availability: {},
    surfaces: ['journey.catalogue'], idempotency: 'pure', retry: 'none',
    reconciliation: 'not_required', evidence: ['validation_report'],
    status: { declared: true, implemented: true, available_now: true, browser_certified: false },
  };
}

/** One closed-vocabulary port (StagedDraftReference — journeyCompiler.test.ts port()). */
function port(): Record<string, unknown> {
  return { version: 'v1', draft_id: 'DRAFT-1' };
}

/** A structurally complete journey document (journeyCompiler.test.ts:27-38 shape). */
function journeyDoc(steps: Record<string, unknown>[]): Record<string, unknown> {
  return {
    journey_id: 'journey-route-fixture', revision: 1,
    authoring_actor: { actor_kind: 'person', actor_id: 'operator-1' },
    request_anchor: { message_id: 'msg-1', verbatim_text: 'move and verify the samples' },
    objective: 'transfer the samples and verify the result',
    completion_contract: ['the transfer record is committed', 'the verification record is committed'],
    parameters: [], steps,
    alternatives: { options: [{ alternative_id: 'alt-a', summary: 'a single declared option' }], selection_authority: 'user' },
    return_contract: { checkpoint_ref: 'cp-1', permitted_result_types: ['completed'], require_explicit_resume: true },
    assumptions: [], unresolved_questions: [],
  };
}

interface CompileBody {
  ok: boolean;
  manifest?: { journey_id: string; revision: number; steps: Array<{ id: string; status: string; reasons: string[]; blocked_by: string[] }>; not_ready: string[] };
  diagnostics?: Array<{ rule: string; message: string }>;
  catalogue_diagnostics?: string[];
}

const apps: FastifyInstance[] = [];
const dirs: string[] = [];
async function scratchDir(): Promise<string> {
  const dir = await mkdtemp(join(SCRATCH_ROOT, 'compile-'));
  dirs.push(dir);
  return dir;
}
async function buildApp(journeyCatalogueDir: string) {
  const app = Fastify();
  await app.register(async (instance) => {
    registerRoutes(instance, { ...stubRouteOptions(), journeyCatalogueDir });
  }, { prefix: '/api' });
  await app.ready();
  apps.push(app);
  return app;
}
async function appWithCatalogue() {
  const dir = await scratchDir();
  await writeFile(join(dir, 'a.yaml'), stringify(descriptor('journey.fixture.transfer', KNOWN_HANDLER)), 'utf8');
  await writeFile(join(dir, 'b.yaml'), stringify(descriptor('journey.fixture.measure', KNOWN_HANDLER)), 'utf8');
  return buildApp(dir);
}
async function postCompile(app: FastifyInstance, payload: unknown) {
  const response = await app.inject({ method: 'POST', url: '/api/journey/compile', payload });
  return { status: response.statusCode, body: response.json() as CompileBody };
}

describe('POST /api/journey/compile (L2-JOURNEY-COMPILER-1 croute)', () => {
  beforeAll(async () => { await mkdir(SCRATCH_ROOT, { recursive: true }); });
  afterAll(async () => {
    for (const app of apps) await app.close();
    for (const dir of dirs) await rm(dir, { recursive: true, force: true });
  });

  it('AC1: a schema-valid document compiles — 200 ok:true, steps in document order, not_ready exactly the non-READY ids', async () => {
    const { status, body } = await postCompile(await appWithCatalogue(), {
      document: journeyDoc([
        { id: 's1', capability_ref: 'journey.fixture.transfer', input_ports: [], interaction_mode: 'automatic', output_ports: [port()] },
        { id: 's2', capability_ref: 'journey.fixture.measure', input_ports: [port()], interaction_mode: 'automatic', output_ports: [] },
      ]),
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect('diagnostics' in body).toBe(false); // the failure envelope never rides alongside a manifest
    expect(body.manifest!.journey_id).toBe('journey-route-fixture'); expect(body.manifest!.revision).toBe(1);
    expect(body.manifest!.steps.map((s) => s.id)).toEqual(['s1', 's2']); // document order
    expect(body.manifest!.steps[0]!.status).toBe('READY'); expect(body.manifest!.steps[1]!.status).toBe('NOT_READY');
    expect(body.manifest!.steps[1]!.reasons).toEqual(['awaiting_producer_output']);
    expect(body.manifest!.steps[1]!.blocked_by).toEqual(['s1']); // names its producer
    expect(body.manifest!.not_ready).toEqual(['s2']); // exactly the ids whose status !== 'READY'
    expect(body.catalogue_diagnostics).toEqual([]); // always present, possibly empty
  });

  it('AC2: a capability outside the catalogue — 200 ok:false, diagnostics non-empty and naming the step, NO manifest key', async () => {
    const { status, body } = await postCompile(await appWithCatalogue(), {
      document: journeyDoc([
        { id: 'ghost-step', capability_ref: 'journey.fixture.ghost', input_ports: [], interaction_mode: 'automatic', output_ports: [] },
      ]),
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(false);
    expect('manifest' in body).toBe(false); // not null — absent
    expect(body.diagnostics!.length).toBeGreaterThan(0);
    expect(body.diagnostics!.every((d) => typeof d.rule === 'string' && typeof d.message === 'string')).toBe(true);
    expect(body.diagnostics!.some((d) => d.message.includes('ghost-step'))).toBe(true); // names the offending step
    expect(Array.isArray(body.catalogue_diagnostics)).toBe(true);
  });

  it('AC3: an empty body or a non-object document — 400 ok:false, ONE journey_compile_request_invalid diagnostic, no manifest, no 500', async () => {
    const app = await appWithCatalogue();
    for (const payload of [{}, { document: 'not-an-object' }]) {
      const { status, body } = await postCompile(app, payload);
      expect(status).toBe(400);
      expect(body.ok).toBe(false);
      expect('manifest' in body).toBe(false);
      expect(body.diagnostics).toHaveLength(1);
      expect(body.diagnostics![0]!.rule).toBe('journey_compile_request_invalid');
      expect(body.diagnostics![0]!.message.length).toBeGreaterThan(0);
    }
  });

  it('AC4a: an unreadable catalogue directory — 200 ok:false under journey_catalogue_unavailable naming it', async () => {
    const missing = join(await scratchDir(), 'not-created');
    const { status, body } = await postCompile(await buildApp(missing), {
      document: journeyDoc([
        { id: 's1', capability_ref: 'journey.fixture.transfer', input_ports: [], interaction_mode: 'automatic', output_ports: [] },
      ]),
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(false);
    expect('manifest' in body).toBe(false);
    expect(body.diagnostics).toHaveLength(1);
    expect(body.diagnostics![0]!.rule).toBe('journey_catalogue_unavailable');
    expect(body.diagnostics![0]!.message).toContain(missing);
    expect(body.catalogue_diagnostics).toEqual([]);
  });

  it('AC4b: a rejected descriptor is surfaced in catalogue_diagnostics while the admitted capability still compiles', async () => {
    const dir = await scratchDir();
    await writeFile(join(dir, 'ok.yaml'), stringify(descriptor('journey.fixture.transfer', KNOWN_HANDLER)), 'utf8');
    await writeFile(join(dir, 'dangling.yaml'), stringify(descriptor('journey.fixture.dangling', UNKNOWN_HANDLER)), 'utf8');
    const { status, body } = await postCompile(await buildApp(dir), {
      document: journeyDoc([
        { id: 's1', capability_ref: 'journey.fixture.transfer', input_ports: [], interaction_mode: 'automatic', output_ports: [] },
      ]),
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.manifest!.steps).toHaveLength(1);
    expect(body.manifest!.steps[0]!.status).toBe('READY');
    expect(body.catalogue_diagnostics!.length).toBeGreaterThan(0); // nothing is silently swallowed
    expect(body.catalogue_diagnostics!.some((line) => line.includes(UNKNOWN_HANDLER))).toBe(true);
  });
});
