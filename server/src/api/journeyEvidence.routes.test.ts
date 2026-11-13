// @vitest-environment node
/** L2-JOURNEY-EVIDENCE-1 (unit evroute) — GET /api/journey/evidence via the REAL registerRoutes;
 *  `stubRouteOptions` copied VERBATIM from journeyCompile.routes.test.ts; bundles written through the
 *  store's OWN save, tamper arm edits one document on disk. Scratch: /home/brad/.journey-evroute-scratch. */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildJourneyEvidenceBundle, type JourneyEvidenceBundle, type JourneyEvidenceBundleInput } from '../compiler/journey/journeyEvidenceBundle.js';
import { JourneyEvidenceStore } from '../compiler/journey/journeyEvidenceStore.js';
import { registerRoutes } from './routes.js';

const SCRATCH_ROOT = '/home/brad/.journey-evroute-scratch', JOURNEY = 'JX-2026-113';

/** Copied VERBATIM from journeyCompile.routes.test.ts (itself verbatim from journeyCapabilities.routes.test.ts). */
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

const sha256Hex = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const doc = (refId: string, text: string): { ref_id: string; sha256: string; document: string } => ({ ref_id: refId, sha256: sha256Hex(text), document: text });
const OBS_TEXT = 'observation: absorbance plateau reached at four minutes';
const input = (o: Partial<JourneyEvidenceBundleInput> = {}): JourneyEvidenceBundleInput => ({
  journey_id: JOURNEY, revision: 1,
  request: { message_id: 'msg-0001', verbatim_text: 'Run the full assay on the new extract' },
  intent_revisions: [doc('doc-intent-r1', 'intent revision 1: the AI added the extraction step')],
  compiler_versions: [{ name: 'journey-compiler', version: '1.0.0' }], retained_versions: [], compiled_manifests: [],
  observations: [doc('obs-1', OBS_TEXT)], required_approvals: [], human_approvals: [], execution_envelopes: [],
  effects: [], effect_receipts: [], checkpoint_events: [], determinism: { mode: 'replay_from_evidence' }, ...o,
});
function buildBundle(o: Partial<JourneyEvidenceBundleInput> = {}): JourneyEvidenceBundle {
  const out = buildJourneyEvidenceBundle(input(o));
  if (!out.ok) throw new Error(`fixture refused: ${out.diagnostics.map((d) => d.rule).join(',')}`);
  return out.bundle;
}

interface EvidenceBody {
  ok: boolean;
  bundle?: JourneyEvidenceBundle | null;
  verify?: { ok: boolean; mismatches: Array<{ ref_id: string; expected: string; actual: string }> };
  notice?: string;
  diagnostics?: Array<{ rule: string; message: string }>;
}
const apps: FastifyInstance[] = [], dirs: string[] = [];
async function buildApp(rootDir?: string): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(async (instance) => {
    registerRoutes(instance, rootDir === undefined ? stubRouteOptions() : { ...stubRouteOptions(), journeyEvidenceRootDir: rootDir });
  }, { prefix: '/api' });
  await app.ready(); apps.push(app); return app;
}
async function scratchDir(): Promise<string> {
  const dir = await mkdtemp(join(SCRATCH_ROOT, 'evroute-')); dirs.push(dir); return dir;
}
async function get(app: FastifyInstance, query: string): Promise<{ status: number; body: EvidenceBody }> {
  const response = await app.inject({ method: 'GET', url: `/api/journey/evidence${query}` });
  return { status: response.statusCode, body: response.json() as EvidenceBody };
}
/** A configured app plus a store over the SAME root: the test writes through the shipped save. */
async function appWithStore(): Promise<{ app: FastifyInstance; store: JourneyEvidenceStore }> {
  const root = await scratchDir();
  return { app: await buildApp(root), store: new JourneyEvidenceStore({ rootDir: root }) };
}

describe('GET /api/journey/evidence (L2-JOURNEY-EVIDENCE-1 evroute)', () => {
  beforeAll(async () => { await mkdir(SCRATCH_ROOT, { recursive: true }); });
  afterAll(async () => {
    for (const app of apps) await app.close();
    for (const dir of dirs) await rm(dir, { recursive: true, force: true });
  });
  it('(a) a stored revision is served: 200, the stored journey_id/revision echo, verify.ok true, the plain notice', async () => {
    const { app, store } = await appWithStore();
    await store.save(buildBundle());
    const { status, body } = await get(app, `?journey_id=${JOURNEY}&revision=1`);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect([body.bundle!.journey_id, body.bundle!.revision]).toEqual([JOURNEY, 1]); // the stored identity, echoed verbatim
    expect(body.verify).toEqual({ ok: true, mismatches: [] });
    expect(body.notice).toContain('not by itself a compliance claim');
  });
  it('(b) a document edited on disk: 200, verify.ok false naming the ref_id with expected ≠ actual, bundle never re-hashed', async () => {
    const { app, store } = await appWithStore();
    await store.save(buildBundle({ revision: 2 }));
    const path = store.bundlePath(JOURNEY, 2);
    const onDisk = JSON.parse(await readFile(path, 'utf8')) as { observations: Array<{ document: string }> };
    onDisk.observations[0]!.document += ' (amended)';
    await writeFile(path, JSON.stringify(onDisk, null, 2), 'utf8');
    const { status, body } = await get(app, `?journey_id=${JOURNEY}&revision=2`);
    expect(status).toBe(200);
    expect(body.verify!.ok).toBe(false);
    expect(body.verify!.mismatches).toEqual([{ ref_id: 'obs-1', expected: sha256Hex(OBS_TEXT), actual: sha256Hex(`${OBS_TEXT} (amended)`) }]);
    expect(body.bundle).toBeNull(); // the store refuses a digest-mismatched read; nothing is repaired
  });
  it('(c) a never-stored journey id: 404, ok:false, the named not_found rule, no synthesized bundle', async () => {
    const { status, body } = await get(await buildApp(await scratchDir()), `?journey_id=${JOURNEY}&revision=42`);
    expect(status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.diagnostics!.map((d) => d.rule)).toEqual(['journey_evidence_not_found']);
    expect('bundle' in body).toBe(false);
  });
  it('(d) no evidence root configured: a named refusal, never a 500 and never a guessed path', async () => {
    const { status, body } = await get(await buildApp(), `?journey_id=${JOURNEY}&revision=1`);
    expect([status, body.ok, body.diagnostics![0]!.rule]).toEqual([403, false, 'journey_evidence_root_unavailable']);
  });
  it('(e) malformed requests: 400 ok:false with a diagnostic, never a 500', async () => {
    const app = await buildApp(await scratchDir());
    const queries = ['?revision=1', `?journey_id=${JOURNEY}`, `?journey_id=${JOURNEY}&revision=0`, `?journey_id=${JOURNEY}&revision=3.5`, `?journey_id=${JOURNEY}&revision=abc`];
    for (const query of queries) {
      const { status, body } = await get(app, query);
      expect([status, body.ok, body.diagnostics![0]!.rule], query).toEqual([400, false, 'journey_evidence_request_invalid']);
      expect('bundle' in body).toBe(false);
    }
  });
  it('(f) ids round-trip through the QUERYSTRING: "@" is served intact; "/" is a named refusal, never a split path', async () => {
    const { app, store } = await appWithStore();
    const atId = 'JX@2026-113';
    await store.save(buildBundle({ journey_id: atId }));
    const at = await get(app, `?journey_id=${encodeURIComponent(atId)}&revision=1`);
    expect([at.status, at.body.bundle!.journey_id]).toEqual([200, atId]);
    const slashId = 'JX/2026@113';
    const slash = await get(app, `?journey_id=${encodeURIComponent(slashId)}&revision=1`);
    expect([slash.status, slash.body.diagnostics![0]!.rule]).toEqual([400, 'invalid_segment']);
    expect(slash.body.diagnostics![0]!.message).toContain(slashId); // received whole, not split on '/'
  });
});
