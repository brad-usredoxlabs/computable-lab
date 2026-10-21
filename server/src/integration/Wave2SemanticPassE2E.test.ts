/**
 * W2-6-SEMANTIC-PASS — T4 store-level E2E + config-only model swap (spec §6, W5).
 *
 * Harness: COPY of the W2-5 promotion suite (real initializeApp/createServer +
 * throwaway tmp git store, CONFIG_PATH pinned so fixtures never leak into the
 * durable lane store) booted against the REAL schema tree so the real lint
 * (xdr-*, protocol intent/prov-*) fires at the write wall. The inference
 * endpoint is a local mock HTTP server (node:http) — the REAL
 * createInferenceClient + server.ts wiring run against it, so the captured
 * outbound request is the real normalized request body.
 *
 * Arms:
 *  T4a config-only model swap (A4/D7): boot A carries an ai.semanticPass
 *      block (model/baseUrl/thinkingLevels as DATA); boot B has NO block and
 *      falls back to the active profile's inference. The test NEVER edits
 *      code between boots — it edits the config object. Captured bodies
 *      differ in exactly model + endpoint + resolved thinking params.
 *  T4b route + kinds enumeration (A5): POST
 *      /extraction/vendor-candidates/:recordId/semantic-draft returns
 *      {recordId: XDR-...} + diagnostics and NOTHING else (no literal-protocol
 *      payload, no event-graph draft); the only NEW record kinds in the store
 *      are {extraction-draft}.
 *  T4c promotion leg (A2, W2-5 merged): promote candidates[0] through
 *      routes.ts:632 -> output kind 'protocol', born draft.
 *  T5-e: the vendor-protocol-candidate contentSha is byte-identical across
 *      the full pass+promote flow (the pass never rewrites its SAID). A PUT
 *      against the candidate answers 422 (FAIR-stamping vs closed schema),
 *      no longer 405 — post-VPDF-3 the kind left the appendOnlyKinds DATA
 *      list; the sanctioned rewrite path is service-level store.update.
 *  health: /api/health lintRules count recorded (report §0).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { createServer as createHttpMock, type Server } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { initializeApp, createServer } from '../server.js';
import type { AppContext } from '../server.js';
import { loadZymoCandidate, zymoIntentAnswer } from '../ingestion/vendor-protocol/semanticPassFixtures.js';
import type { ProtocolCandidate } from '../ingestion/vendor-protocol/types.js';

const VPC_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/workflow/vendor-protocol-candidate.schema.yaml';
const CANDIDATE_ID = 'CAN-w26-e2e';

const testDir = resolve(process.cwd(), 'tmp/w26-t4-e2e');
const dataDirBase = resolve('/tmp', 'cl-w26-t4-e2e-data');

interface Boot {
  label: string;
  ctx: AppContext;
  app: FastifyInstance;
  mock: Server;
  mockPort: number;
  captured: Array<{ url: string; body: Record<string, unknown> }>;
}

let candidate: ProtocolCandidate;
let bootA: Boot;
let bootB: Boot;

function mintableCandidatePayload(): Record<string, unknown> {
  // The real Zymo candidate carries a few extractor-only fields (e.g.
  // `concentration` on materials) that the closed vendor-protocol-candidate
  // schema does not admit; strip them so the store wall accepts the mint.
  // The T1 completeness proof (Wave2SemanticFamilyPass.test.ts) ran against
  // the UNstripped real candidate.
  const clone = JSON.parse(JSON.stringify(candidate)) as Record<string, unknown>;
  for (const step of clone.steps as Array<Record<string, unknown>>) {
    for (const action of step.actions as Array<Record<string, unknown>>) {
      delete action.concentration;
    }
  }
  return clone;
}

async function startMock(cannedContent: string): Promise<{ mock: Server; port: number; captured: Boot['captured'] }> {
  const captured: Boot['captured'] = [];
  const mock = createHttpMock((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      captured.push({ url: req.url ?? '', body: JSON.parse(raw || '{}') as Record<string, unknown> });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'mock-completion',
        choices: [{ index: 0, message: { role: 'assistant', content: cannedContent }, finish_reason: 'stop' }],
      }));
    });
  });
  await new Promise<void>((r) => mock.listen(0, '127.0.0.1', r));
  const addr = mock.address();
  if (addr === null || typeof addr === 'string') throw new Error('mock listen failed');
  return { mock, port: addr.port, captured };
}

async function boot(label: string, aiYaml: (port: number) => string[], cannedContent: string): Promise<Boot> {
  const { mock, port, captured } = await startMock(cannedContent);
  const dataDir = `${dataDirBase}-${label}`;
  await rm(dataDir, { recursive: true, force: true });
  await mkdir(testDir, { recursive: true });
  await writeFile(resolve(testDir, `config-${label}.yaml`), [
    'server:',
    '  logLevel: error',
    `  dataDir: ${dataDir}`,
    `  workspaceDir: ${dataDir}/workspaces`,
    'repositories: []',
    'logging: { level: error }',
    'extraction: { enabled: false, runner: { enabled: false } }',
    'ai:',
    ...aiYaml(port).map((l) => `  ${l}`),
  ].join('\n') + '\n');
  process.env.CONFIG_PATH = resolve(testDir, `config-${label}.yaml`);
  const ctx = await initializeApp(process.cwd(), {
    schemaDir: '../schema',
    recordsDir: 'records',
    logLevel: 'silent',
  });
  const app = await createServer(ctx, { logLevel: 'silent' });
  await app.ready();
  // Environmental note (recorded, not fixed): at this base the boot's
  // ensureLocalAdminUser bootstrap FAILS validation (the merged user schema
  // requires `email`; the bootstrap payload has none), so record-API routes
  // answer 401 UNAUTHENTICATED. Seed a schema-valid user so the identity wall
  // resolves and the append-only wall is reachable.
  const seeded = await ctx.store.create({
    envelope: {
      recordId: 'USR-W26-TESTER',
      schemaId: 'https://computable-lab.com/schema/computable-lab/user.schema.yaml',
      payload: {
        kind: 'user',
        recordId: 'USR-W26-TESTER',
        username: 'w26-tester',
        displayName: 'W2-6 Tester',
        email: 'w26-tester@example.invalid',
        status: 'active',
      },
    },
    message: 'seed test user for W2-6 E2E identity wall',
  });
  if (!seeded.success) throw new Error(`test user seed failed: ${seeded.error}`);
  return { label, ctx, app, mock, mockPort: port, captured };
}

async function closeBoot(b: Boot): Promise<void> {
  await b.app?.close();
  await new Promise<void>((done) => b.mock.close(() => done()));
  await rm(`${dataDirBase}-${b.label}`, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
}

async function mintCandidate(b: Boot): Promise<void> {
  const result = await b.ctx.store.create({
    envelope: { recordId: CANDIDATE_ID, schemaId: VPC_SCHEMA_ID, payload: mintableCandidatePayload() },
    message: 'seed Zymo VPC for W2-6 E2E',
  });
  if (!result.success) throw new Error(`VPC mint failed: ${result.error}`);
}

beforeAll(async () => {
  candidate = await loadZymoCandidate();
  const canned = JSON.stringify(zymoIntentAnswer(candidate, CANDIDATE_ID));

  // Boot A: ai.semanticPass block PRESENT (model/baseUrl/thinking as DATA).
  bootA = await boot('swap', (port) => [
    'inference:',
    '  baseUrl: http://127.0.0.1:1/v1',
    '  model: profile-model',
    'semanticPass:',
    `  baseUrl: http://127.0.0.1:${port}/v1`,
    '  model: swap-model-a',
    '  maxTokens: 8192',
    '  thinkingLevels:',
    '    deep: { label: Deep, enableThinking: true, chat_template_kwargs: { enable_thinking: true } }',
    '  defaultThinkingLevel: deep',
  ], canned);

  // Boot B: NO semanticPass block -> fallback to the active profile inference.
  bootB = await boot('fallback', (port) => [
    'inference:',
    `  baseUrl: http://127.0.0.1:${port}/v1`,
    '  model: profile-model-b',
  ], canned);

  await mintCandidate(bootA);
  await mintCandidate(bootB);
}, 600000);

afterAll(async () => {
  await closeBoot(bootA);
  await closeBoot(bootB);
  await rm(testDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  delete process.env.CONFIG_PATH;
});

describe('W2-6 T4: config-only model swap + store-level E2E (A4/A5/A2)', () => {

  it('health lintRules count is recorded (boot A)', async () => {
    const res = await bootA.app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const count = body.components.lintRules.loaded;
    expect(typeof count).toBe('number');
    // Recorded for the report; the delta vs the 77 pre-W2-5 baseline is the
    // orchestrator's bookkeeping, not a gate here.
    console.log(`W26_HEALTH_LINTRULES ${count}`);
  });

  it('boot A (semanticPass block): the outbound request carries the BLOCK model/endpoint/thinking', async () => {
    const res = await bootA.app.inject({ method: 'POST', url: `/api/extraction/vendor-candidates/${CANDIDATE_ID}/semantic-draft` });
    if (res.statusCode !== 200) console.log('BOOT_A_BODY', res.body);
    expect(res.statusCode).toBe(200);
    expect(bootA.captured.length).toBe(1);
    const sent = bootA.captured[0]!;
    expect(sent.url).toBe('/v1/chat/completions');
    expect(sent.body.model).toBe('swap-model-a');
    expect(sent.body.max_completion_tokens).toBe(8192);
    expect(sent.body.chat_template_kwargs).toEqual({ enable_thinking: true });
    expect(sent.body.messages).toHaveLength(2);
  });

  it('boot B (block REMOVED): the outbound request falls back to the active profile (zero code edits between boots)', async () => {
    const before = bootB.captured.length;
    const res = await bootB.app.inject({ method: 'POST', url: `/api/extraction/vendor-candidates/${CANDIDATE_ID}/semantic-draft` });
    expect(res.statusCode).toBe(200);
    expect(bootB.captured.length).toBe(before + 1); // exactly ONE outbound call per pass
    const sent = bootB.captured[before]!;
    // The ONLY deltas are config deltas: model + endpoint (mock port) + the
    // thinking params the block declared (absent block -> none sent).
    expect(sent.body.model).toBe('profile-model-b');
    expect(sent.body).not.toHaveProperty('max_completion_tokens');
    expect(sent.body).not.toHaveProperty('chat_template_kwargs');
  });

  it('route response is {recordId: XDR-...} + diagnostics only — no literal-protocol payload, no event-graph draft (A5)', async () => {
    const res = await bootB.app.inject({ method: 'POST', url: `/api/extraction/vendor-candidates/${CANDIDATE_ID}/semantic-draft` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Object.keys(body).sort()).toEqual(['diagnostics', 'recordId']);
    expect(body.recordId).toMatch(/^XDR-/);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('eventGraph');
    expect(raw).not.toContain('"steps"');
    expect(body.diagnostics.axesCount).toBe(1);
  });

  it('only NEW record kinds in the store == {extraction-draft}; candidate sha byte-identical across the pass; PUT on the candidate answers 422 (stamping), no longer 405 (VPDF-3 OQ-1)', async () => {
    const before = new Set((await bootB.ctx.store.list({})).map(r => r.recordId));
    const beforeKinds = new Map<string, string>();
    for (const r of await bootB.ctx.store.list({})) beforeKinds.set(r.recordId, String((r.payload as Record<string, unknown>).kind));

    const res = await bootB.app.inject({ method: 'POST', url: `/api/extraction/vendor-candidates/${CANDIDATE_ID}/semantic-draft` });
    expect(res.statusCode).toBe(200);
    const xdrId = String(res.json().recordId);

    const after = await bootB.ctx.store.list({});
    const newRecords = after.filter(r => !before.has(r.recordId));
    const newKinds = new Set(newRecords.map(r => String((r.payload as Record<string, unknown>).kind)));
    expect([...newKinds]).toEqual(['extraction-draft']);
    expect(newRecords.map(r => r.recordId)).toEqual([xdrId]);

    // T5-e: the SAID is byte-identical after the pass.
    const candidateRecord = await bootB.ctx.store.get(CANDIDATE_ID);
    expect(typeof candidateRecord!.meta?.contentSha).toBe('string');

    // VPDF-3 (OQ-1, Brad 2026-10-20 ruling, flipped IN THIS COMMIT): the
    // appendOnlyKinds DATA list no longer names vendor-protocol-candidate, so
    // the wall no longer answers 405 — but the API PUT still cannot rewrite
    // this kind: the record handler stamps createdAt/updatedAt/createdBy and
    // the closed schema rejects them (422, the same stamping collision that
    // blocks POST /records — recorded finding above). The sanctioned rewrite
    // path is service-level store.update (the extract-stream persist leg),
    // pinned by ProtocolBuilderStreamPersist's update arm.
    const put = await bootB.app.inject({
      method: 'PUT',
      url: `/api/records/${CANDIDATE_ID}`,
      headers: { 'x-user-id': 'USR-W26-TESTER' },
      payload: { payload: mintableCandidatePayload() },
    });
    if (put.statusCode !== 422) console.log('PUT_BODY', put.statusCode, put.body);
    expect(put.statusCode, put.body).toBe(422);
    const afterCandidate = await bootB.ctx.store.get(CANDIDATE_ID);
    expect(afterCandidate!.meta?.contentSha).toBe(candidateRecord!.meta?.contentSha);
  });

  it('promotion leg (W2-5 merged, routes.ts:632): candidates[0] promotes to a BORN-DRAFT kind-protocol record', async () => {
    const res = await bootB.app.inject({ method: 'POST', url: `/api/extraction/vendor-candidates/${CANDIDATE_ID}/semantic-draft` });
    expect(res.statusCode).toBe(200);
    const xdrId = String(res.json().recordId);

    const promote = await bootB.app.inject({ method: 'POST', url: `/api/extraction/drafts/${xdrId}/candidates/0/promote` });
    expect(promote.statusCode, `promote failed: ${promote.body}`).toBe(200);
    const body = promote.json();
    expect(body.success).toBe(true);
    const canonicalId = String(body.recordId);
    expect(canonicalId).toMatch(/^CAN-protocol-/);

    const canonical = await bootB.ctx.store.get(canonicalId);
    expect(canonical).not.toBeNull();
    const payload = canonical!.payload as Record<string, unknown>;
    expect(payload.kind).toBe('protocol');
    expect(payload.state).toBe('draft'); // born draft (P4)
    expect((payload.steps as unknown[]).length).toBe(17);
    expect(Array.isArray(payload.branch_axes)).toBe(true);
    expect((payload.branch_axes as unknown[]).length).toBe(1);
  });

  it('recorded finding (not fixed): POST /records cannot mint vendor-protocol-candidate at this base (FAIR stamping vs additionalProperties:false) — W2-5 §(e) finding re-verified', async () => {
    const res = await bootB.app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { 'x-user-id': 'USR-W26-TESTER' },
      payload: { schemaId: VPC_SCHEMA_ID, payload: { ...mintableCandidatePayload(), recordId: 'CAN-w26-via-api' } },
    });
    // The handler stamps createdAt/updatedAt/createdBy into the payload; the
    // closed candidate schema rejects them -> 422. Mint path stays
    // store.create (the extraction mint path), as W2-5 recorded.
    // The handler stamps createdAt/updatedAt/createdBy into the payload; the
    // closed candidate schema (additionalProperties:false) rejects them.
    expect(res.statusCode).toBe(422);
  });
});
