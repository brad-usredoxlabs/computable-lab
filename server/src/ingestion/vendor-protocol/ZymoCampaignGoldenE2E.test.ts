/**
 * W2-11-ZYMO-GOLDEN-DEMO — the campaign convergence golden (G1-G7, spec §2.2).
 *
 * Headless, deterministic, zero model calls. The chain:
 *   G1  pinned PDF bytes -> decode -> candidate (17 steps, branches kept)
 *   G2  candidate minted via the store mint path + appendOnly refusal arm
 *   G3  FROZEN reviewed semantic draft (campaign-fixtures/, self-pinned)
 *       promoted through the REAL W2-5 promotion route -> born-draft family
 *   G4  family branches all retained as family condition ids; constraints
 *       typed (class + bindingKind; Quantity schema is the enforcer)
 *   G5  provenance ladder rungs + anchors (StepProvenanceRef shape,
 *       ref.id === candidate recordId, pageStart in [1, pageCount], prov-*
 *       lint green)
 *   G6  robot answers -> REAL W2-7 lowerRealization/realizeAndCompile ->
 *       LOCAL_REALIZATION carrier with FAMILY condition ids + robot profile
 *       closure
 *   G7  determinism: two full runs + a third after a fresh YAML re-load of
 *       policy/vocabulary — emitted YAML BYTE-equal AND serialized
 *       TerminalArtifacts BYTE-equal
 *
 * Harness canon (W2-7 §4): REAL parseScientistIntent (Ajv sole authority),
 * REAL shipped vocabulary + pipeline YAML, store-backed spine via the
 * production createResolveSpineFromContext composition — createResolveSpine({})
 * is BANNED here. Zero vi.mock. The frozen fixtures are HAND-AUTHORED per the
 * OPERATIVE W211-OQ3(b) pick — see campaign-fixtures/PROVENANCE.md; presenting
 * them as reviewed model output would be a faked green (§6.2).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { FastifyInstance } from 'fastify';
import { initializeApp, createServer } from '../../server.js';
import type { AppContext } from '../../server.js';
import { decodeVendorProtocolPdfFile, extractVendorProtocolCandidate } from './VendorProtocolPdf.js';
import { loadZymoCandidate } from './semanticPassFixtures.js';
import {
  lowerRealization,
  realizeAndCompile,
  loadRealizationPolicy,
  type ProtocolPayloadLike,
  type LocalProtocolPayloadLike,
} from '../../compiler/scientistIntent/realizeScientistIntent.js';
import { parseScientistIntent } from '../../compiler/scientistIntent/parseScientistIntent.js';
import { defaultScientistIntentVocabulary } from '../../compiler/scientistIntent/vocabulary.js';
import { createResolveSpineFromContext } from '../../resolve/index.js';
import { recordingStore, stableStringify } from '../../compiler/scientistIntent/goldens/replayKernel.js';
import { loadAllSchemas } from '../../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../../schema/SchemaRegistry.js';
import { createValidator } from '../../validation/AjvValidator.js';
import { LintEngine } from '../../lint/LintEngine.js';
import type { LintSpec } from '../../lint/types.js';

// ---------------------------------------------------------------------------
// PINS (spec §7; re-measured in this worktree at the claim base — report §0)
// ---------------------------------------------------------------------------

const ZYMO_PDF_SHA = '257f57196f6cd7a337e5ad42d7da74f2ab2c3e1e343a41c898d76c7d085d613b';
const FROZEN_DRAFT_SHA = 'd878727ae69305d73623b6e6fd99ddf7a1bc999efd7b8d84c9c9944afdc98058';
const ROBOT_ANSWERS_SHA = 'ac383fe4c71d164b52decaa332aeea1c87617a7efab29d294b3cb3a49fd7492e';

const PROTOCOL_ID = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml';
const LOCAL_PROTOCOL_ID = 'https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml';
const VPC_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/workflow/vendor-protocol-candidate.schema.yaml';

const CANDIDATE_ID = 'CAN-w211-golden';
const FIXTURES_DIR = join(process.cwd(), 'src', 'ingestion', 'vendor-protocol', 'campaign-fixtures');
const PDF_PATH = resolve(process.cwd(), '..', 'resources', 'vendor_pdfs', '_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf');

const testDir = resolve(process.cwd(), 'tmp/w211-golden-e2e');
const dataDirBase = resolve('/tmp', 'cl-w211-golden-e2e-data');

let candidateRecordId = CANDIDATE_ID;
let boot: { ctx: AppContext; app: FastifyInstance } | null = null;

// ---------------------------------------------------------------------------
// Frozen fixtures: read + SELF-PIN (a LOCAL manifest in the test;
// goldens/MANIFEST.yaml untouched per W211-OQ1 ruling (a))
// ---------------------------------------------------------------------------

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function readFixtureSelfPinned(name: string, pinnedSha: string): Promise<Record<string, unknown>> {
  const bytes = await readFile(join(FIXTURES_DIR, name));
  const actual = sha256(bytes);
  if (actual !== pinnedSha) {
    throw new Error(
      `campaign fixture drift: ${name} sha256 ${actual} != pinned ${pinnedSha} — ` +
      `the frozen reviewed artifact changed; re-review before trusting the golden`,
    );
  }
  return parseYaml(bytes.toString('utf-8')) as Record<string, unknown>;
}

async function frozenDraft(): Promise<Record<string, unknown>> {
  const draft = await readFixtureSelfPinned('zymo-semantic-draft.frozen.yaml', FROZEN_DRAFT_SHA);
  // The frozen body carries the fixture's own golden candidate id; the golden
  // mints its own candidate record, so the anchors are rebound to the minted
  // record's id (the P1 binding: ref.id === the SAID record's own recordId).
  const rebound = JSON.parse(JSON.stringify(draft)) as Record<string, unknown>;
  for (const step of rebound.steps as Array<Record<string, unknown>>) {
    const intent = step.intent as Record<string, unknown>;
    for (const ref of intent.provenance as Array<Record<string, unknown>>) {
      ref.id = candidateRecordId;
    }
  }
  return rebound;
}

async function robotAnswers(): Promise<Record<string, unknown>> {
  return readFixtureSelfPinned('zymo-robot-answers.frozen.yaml', ROBOT_ANSWERS_SHA);
}

// ---------------------------------------------------------------------------
// Store boot (W2-6 E2E harness precedent: real initializeApp/createServer,
// throwaway tmp git store, CONFIG_PATH pinned so fixtures never leak into the
// durable lane store; the REAL schema + lint wall fires at the write wall)
// ---------------------------------------------------------------------------

async function bootStore(): Promise<{ ctx: AppContext; app: FastifyInstance }> {
  const dataDir = dataDirBase;
  await rm(dataDir, { recursive: true, force: true });
  await mkdir(testDir, { recursive: true });
  await writeFile(resolve(testDir, 'config.yaml'), [
    'server:',
    '  logLevel: error',
    `  dataDir: ${dataDir}`,
    `  workspaceDir: ${dataDir}/workspaces`,
    'repositories: []',
    'logging: { level: error }',
    'extraction: { enabled: false, runner: { enabled: false } }',
  ].join('\n') + '\n');
  process.env.CONFIG_PATH = resolve(testDir, 'config.yaml');
  const ctx = await initializeApp(process.cwd(), { schemaDir: '../schema', recordsDir: 'records', logLevel: 'silent' });
  const app = await createServer(ctx, { logLevel: 'silent' });
  await app.ready();
  // Environmental note (same as W2-6's E2E): the boot's ensureLocalAdminUser
  // bootstrap fails the merged user schema (email required), so record-API
  // routes answer 401 UNAUTHENTICATED. Seed a schema-valid user so the
  // identity wall resolves and the append-only wall is reachable.
  const seeded = await ctx.store.create({
    envelope: {
      recordId: 'USR-W211-TESTER',
      schemaId: 'https://computable-lab.com/schema/computable-lab/user.schema.yaml',
      payload: {
        kind: 'user', recordId: 'USR-W211-TESTER', username: 'w211-tester',
        displayName: 'W2-11 Tester', email: 'w211-tester@example.invalid', status: 'active',
      },
    },
    message: 'seed test user for W2-11 golden identity wall',
  });
  if (!seeded.success) throw new Error(`test user seed failed: ${seeded.error}`);
  return { ctx, app };
}

async function closeBoot(b: { ctx: AppContext; app: FastifyInstance }): Promise<void> {
  await b.app.close();
  await rm(dataDirBase, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  await rm(testDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  delete process.env.CONFIG_PATH;
}

/** The real candidate with the extractor-only fields the closed VPC schema
 *  does not admit stripped (W2-6's mintableCandidatePayload precedent). */
function mintableCandidatePayload(): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(candidate)) as Record<string, unknown>;
  for (const step of clone.steps as Array<Record<string, unknown>>) {
    for (const action of step.actions as Array<Record<string, unknown>>) {
      delete action.concentration;
    }
  }
  return clone;
}

let candidate: Awaited<ReturnType<typeof loadZymoCandidate>>;

beforeAll(async () => {
  candidate = await loadZymoCandidate();
  boot = await bootStore();
  // G2 mint path: store.create (the extraction mint path). POST /records
  // cannot mint a vendor-protocol-candidate at this base (FAIR stamping vs
  // the closed schema — W2-5/W2-6 recorded finding; the refusal arm is
  // proven in ZymoCampaignNegatives N4a).
  const minted = await boot.ctx.store.create({
    envelope: { recordId: CANDIDATE_ID, schemaId: VPC_SCHEMA_ID, payload: mintableCandidatePayload() },
    message: 'seed Zymo VPC for W2-11 golden',
  });
  if (!minted.success) throw new Error(`VPC mint failed: ${minted.error}`);
  candidateRecordId = CANDIDATE_ID;
}, 600000);

afterAll(async () => {
  if (boot) await closeBoot(boot);
});

async function schemaValidator() {
  const result = await loadAllSchemas({ basePath: join(process.cwd(), '..', 'schema') });
  expect(result.errors).toEqual([]);
  const registry = createSchemaRegistry();
  registry.addSchemas(result.entries);
  const validator = createValidator({ strict: false });
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema, entry.id);
  }
  return validator;
}

function lintEngineFor(kind: 'protocol' | 'local-protocol'): LintEngine {
  const path = join(process.cwd(), '..', 'schema', 'workflow', `${kind}.lint.yaml`);
  const spec = parseYaml(readFileSync(path, 'utf-8')) as LintSpec;
  const eng = new LintEngine();
  eng.addSpec(kind, spec);
  return eng;
}

// The goldens canon (replayKernel.ts) drops incidental random event ids;
// extended verb class mirrors realizationGolden.test.ts (compound hyphenated
// segments). Event COUNT and every value stay asserted.
const INCIDENTAL_EVENT_ID = /^evt-[a-z0-9_-]+-[a-z0-9]{8}(_r\d+)?$/;
function normalizeIncidental(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map((item) => normalizeIncidental(item));
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key === 'eventId' && typeof value === 'string' && INCIDENTAL_EVENT_ID.test(value)) continue;
      out[key] = normalizeIncidental(value);
    }
    return out;
  }
  return obj;
}

function goldenStore() {
  return recordingStore([
    { recordId: 'LAB-w211-sample-plate', payload: { kind: 'labware', title: 'Sample Plate', synonyms: ['sample_plate', 'sample plate'] } },
    { recordId: 'LAB-w211-reservoir', payload: { kind: 'labware', title: 'Reagent Reservoir', synonyms: ['reagent_reservoir', 'reagent reservoir'] } },
    { recordId: 'MAT-w211-lysis', payload: { kind: 'material', title: 'Lysis Solution', synonyms: ['lysis_solution'] } },
    { recordId: 'MAT-w211-magbeads', payload: { kind: 'material', title: 'MagBinding Beads', synonyms: ['magbinding_beads'] } },
    { recordId: 'MAT-w211-magbuffer', payload: { kind: 'material', title: 'MagBinding Buffer', synonyms: ['magbinding_buffer'] } },
    { recordId: 'MAT-w211-magwash1', payload: { kind: 'material', title: 'MagWash 1', synonyms: ['magwash_1'] } },
    { recordId: 'MAT-w211-magwash2', payload: { kind: 'aliquot', title: 'MagWash 2', label: 'magwash_2' } },
    { recordId: 'MAT-w211-water', payload: { kind: 'material', title: 'DNase/RNase Free Water', synonyms: ['dnase_rnase_free_water'] } },
  ]);
}

/** The frozen draft -> the REAL W2-5 promotion route -> the born-draft family.
 *  Idempotent: the promotion runs ONCE per boot (the route mints a Date.now()-
 *  based CAN- id; re-running it would duplicate the family). */
let promotedFamily: { canonicalId: string; xdrId: string } | null = null;
async function promoteFrozenDraft(): Promise<{ canonicalId: string; xdrId: string }> {
  if (promotedFamily) return promotedFamily;
  const b = boot!;
  const draft = await frozenDraft();
  const xdrId = 'XDR-w211-golden';
  const created = await b.ctx.store.create({
    envelope: {
      recordId: xdrId,
      schemaId: 'https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml',
      payload: {
        kind: 'extraction-draft',
        recordId: xdrId,
        status: 'pending_review',
        source_artifact: { kind: 'file', id: 'vendor-protocol-zymo-magbead', locator: 'section-protocol' },
        candidates: [{ target_kind: 'protocol', draft, confidence: 0.9, uncertainty: 'inferred' }],
      },
    },
    message: 'W2-11 golden: seed the frozen reviewed semantic draft',
  });
  if (!created.success) throw new Error(`XDR seed failed: ${created.error}`);
  const promote = await b.app.inject({ method: 'POST', url: `/api/extraction/drafts/${xdrId}/candidates/0/promote` });
  if (promote.statusCode !== 200) {
    throw new Error(`promotion route failed ${promote.statusCode}: ${promote.body}`);
  }
  const body = promote.json() as Record<string, unknown>;
  const canonicalId = String(body.recordId);
  expect(canonicalId).toMatch(/^CAN-protocol-/);
  promotedFamily = { canonicalId, xdrId };
  return promotedFamily;
}

// ---------------------------------------------------------------------------
// G1 — pinned PDF bytes -> decode -> candidate: 17 steps, branches kept
// ---------------------------------------------------------------------------

describe('W2-11 G1 — pinned PDF -> decode -> candidate (branches kept)', () => {

  it('the Zymo PDF bytes carry the pinned sha256 (frozen SAID input)', async () => {
    const bytes = await readFile(PDF_PATH);
    expect(sha256(bytes)).toBe(ZYMO_PDF_SHA);
  });

  it('decode -> extract yields 17 steps and keeps the branchy steps', async () => {
    const document = await decodeVendorProtocolPdfFile(PDF_PATH, { documentId: 'vendor-protocol-zymo-magbead' });
    const fresh = extractVendorProtocolCandidate(document);
    expect(fresh.steps.length).toBe(17);
    const branchy = fresh.steps.filter((s) => Array.isArray(s.branches) && s.branches.length > 0).map((s) => s.id);
    expect(branchy).toEqual(['step-1', 'step-4']);
    expect(fresh.source.pageCount).toBe(31);
  });
});

// ---------------------------------------------------------------------------
// G2 — candidate minted via the store mint path; appendOnly wall proven by a
// refusal arm (the mutation attempt 405s and the sha is unchanged)
// ---------------------------------------------------------------------------

describe('W2-11 G2 — candidate mint + appendOnly wall (proven by refusal)', () => {

  it('the minted candidate carries the real 17-step payload and a contentSha', async () => {
    const env = await boot!.ctx.store.get(CANDIDATE_ID);
    expect(env).not.toBeNull();
    const payload = env!.payload as Record<string, unknown>;
    expect(payload.kind).toBe('vendor-protocol-candidate');
    expect((payload.steps as unknown[]).length).toBe(17);
    expect(typeof env!.meta?.contentSha).toBe('string');
  });

  it('a PUT against the minted candidate 405s APPEND_ONLY and the sha is unchanged', async () => {
    const before = await boot!.ctx.store.get(CANDIDATE_ID);
    const put = await boot!.app.inject({
      method: 'PUT',
      url: `/api/records/${CANDIDATE_ID}`,
      headers: { 'x-user-id': 'USR-W211-TESTER' },
      payload: { payload: mintableCandidatePayload(), message: 'golden: attempted SAID rewrite' },
    });
    expect(put.statusCode).toBe(405);
    expect((put.json() as Record<string, unknown>).error).toBe('APPEND_ONLY');
    const after = await boot!.ctx.store.get(CANDIDATE_ID);
    expect(after!.meta?.contentSha).toBe(before!.meta?.contentSha);
  });
});

// ---------------------------------------------------------------------------
// G3 — frozen reviewed draft (self-pinned) -> REAL W2-5 promotion route ->
// born-draft family (P4: state draft, never ACTIVE)
// ---------------------------------------------------------------------------

describe('W2-11 G3 — frozen draft -> promotion route -> born-draft family', () => {

  it('the frozen fixtures self-pin at open (drift fails loud)', async () => {
    const draft = await frozenDraft();
    expect(draft.kind).toBe('protocol');
    expect(draft.protocolLayer).toBe('universal');
    expect((draft.steps as unknown[]).length).toBe(17);
    const answers = await robotAnswers();
    expect(answers.axisAnswer).toBeDefined();
  });

  it('the frozen draft validates against the REAL merged protocol schema', async () => {
    const validator = await schemaValidator();
    const draft = await frozenDraft();
    const result = validator.validate(draft, PROTOCOL_ID);
    expect(result.errors ?? []).toEqual([]);
  });

  it('promotion through the real route yields a kind-protocol family BORN DRAFT with 17 steps + 1 axis', async () => {
    const { canonicalId } = await promoteFrozenDraft();
    const canonical = await boot!.ctx.store.get(canonicalId);
    expect(canonical).not.toBeNull();
    const payload = canonical!.payload as Record<string, unknown>;
    expect(payload.kind).toBe('protocol');
    expect(payload.state).toBe('draft'); // born draft (P4) — a golden claiming ACTIVE is the state-spoof it must catch
    expect((payload.steps as unknown[]).length).toBe(17);
    expect(Array.isArray(payload.branch_axes)).toBe(true);
    expect((payload.branch_axes as unknown[]).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// G4 — branches kept + constraints typed
// ---------------------------------------------------------------------------

describe('W2-11 G4 — every candidate branchy step maps to a family condition id; constraints typed', () => {

  it('every candidate branch (step-1/step-4 a/b) maps to a family condition id — zero deletions', async () => {
    const { canonicalId } = await promoteFrozenDraft();
    const family = (await boot!.ctx.store.get(canonicalId))!.payload as Record<string, unknown>;
    const axes = family.branch_axes as Array<{ axisId: string; conditions: Array<{ id: string; then_stepIds?: string[] }> }>;
    expect(axes.length).toBe(1);
    const conditionIds = axes[0]!.conditions.map((c) => c.id);
    expect(conditionIds).toEqual(['branch-1', 'branch-2']);
    const gated = new Set(axes[0]!.conditions.flatMap((c) => c.then_stepIds ?? []));
    expect([...gated].sort()).toEqual(['step-1', 'step-4']);
    // W2-6 A3 semantics: the candidate's branchy steps are ALL covered by
    // condition then_stepIds — no branch was silently dropped.
    for (const step of candidate.steps) {
      if (Array.isArray(step.branches) && step.branches.length > 0) {
        expect(gated.has(step.id)).toBe(true);
      }
    }
    // every family step still exists (17 in, 17 out)
    expect((family.steps as unknown[]).length).toBe(17);
  });

  it('every constraint carries class + bindingKind and the Quantity schema enforces the dims', async () => {
    const validator = await schemaValidator();
    const QUANTITY_ID = 'https://computable-lab.com/schema/computable-lab/datatypes/quantity.schema.yaml';
    const draft = await frozenDraft();
    let constraintCount = 0;
    for (const step of draft.steps as Array<Record<string, unknown>>) {
      const constraints = ((step.intent as Record<string, unknown>).constraints ?? []) as Array<Record<string, unknown>>;
      for (const c of constraints) {
        constraintCount += 1;
        expect(typeof c.class).toBe('string');
        expect(['vendor_default', 'hard_bound']).toContain(c.bindingKind);
        const bound = c.bound as Record<string, unknown>;
        expect(['volume', 'count', 'mass', 'molar']).toContain(bound.dimension);
        const q = validator.validate(bound, QUANTITY_ID);
        expect(q.errors ?? []).toEqual([]);
      }
    }
    expect(constraintCount).toBeGreaterThanOrEqual(6); // the volume caps the vendor states (200/25/500/900/50 uL)
  });
});

// ---------------------------------------------------------------------------
// G5 — ladder rungs + anchors: StepProvenanceRef shape, P1 binding, page
// range, prov-* lint green
// ---------------------------------------------------------------------------

describe('W2-11 G5 — provenance rungs + anchors on the promoted family', () => {

  it('every intent step provenance[0] is StepProvenanceRef shape with ref.id === candidate recordId and pageStart in [1, pageCount]', async () => {
    const { canonicalId } = await promoteFrozenDraft();
    const family = (await boot!.ctx.store.get(canonicalId))!.payload as Record<string, unknown>;
    const pageCount = candidate.source.pageCount;
    const candidatePageStarts = new Map(candidate.steps.map((s) => [s.id, s.provenance.pageStart]));
    for (const step of family.steps as Array<Record<string, unknown>>) {
      const intent = step.intent as Record<string, unknown>;
      const provenance = intent.provenance as Array<Record<string, unknown>>;
      expect(Array.isArray(provenance)).toBe(true);
      expect(provenance.length).toBeGreaterThan(0);
      const ref = provenance[0]!;
      expect(ref.kind).toBe('record');
      expect(ref.type).toBe('vendor-protocol-candidate');
      expect(ref.id).toBe(candidateRecordId); // P1 binding
      expect(typeof ref.pageStart).toBe('number');
      expect(ref.pageStart).toBeGreaterThanOrEqual(1);
      expect(ref.pageStart).toBeLessThanOrEqual(pageCount);
      // the anchor is the REAL page of the step it names
      expect(ref.pageStart).toBe(candidatePageStarts.get(String(step.stepId)));
    }
  });

  it('the promoted family passes the merged prov-* protocol lint rules (write wall already proved it)', async () => {
    const { canonicalId } = await promoteFrozenDraft();
    const family = (await boot!.ctx.store.get(canonicalId))!.payload as Record<string, unknown>;
    const engine = lintEngineFor('protocol');
    const result = engine.lint(family, PROTOCOL_ID);
    const errorFindings = result.violations.filter((v) => v.severity === 'error');
    expect(errorFindings.map((v) => v.ruleId)).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// G6 — robot answers -> REAL realization leg -> LOCAL_REALIZATION carrier +
// robot profile closure
// ---------------------------------------------------------------------------

function localProtocolPayload(familyRecordId: string, answers: Record<string, unknown>): Record<string, unknown> {
  const axisAnswer = answers.axisAnswer as { chosenValue: string; branchIds: string[] };
  const axisId = 'branch-axis-zymobiomics-bashingbead-lysis-rack-zr-bashingbead-lysis-tubes';
  return {
    kind: 'local-protocol',
    protocolLayer: 'lab',
    recordId: 'LPR-w211-robot-96',
    title: 'ZymoBIOMICS 96 on the ASSIST PLUS (robot realization)',
    status: 'active',
    inherits_from: { kind: 'record', type: 'protocol', id: familyRecordId },
    branch_resolution: [{
      axisId,
      matched: true,
      branchIds: axisAnswer.branchIds,
      choices: {
        [axisId]: axisAnswer.chosenValue,
        sample_count: answers.sampleCount,
      },
    }],
    labwares: answers.labwares as unknown[],
    equipment: answers.equipment as unknown[],
    materials: answers.materials as unknown[],
  };
}

describe('W2-11 G6 — robot realization: answers -> lowerRealization -> intent YAML -> run graph', () => {

  it('the robot-answers local-protocol validates against the REAL merged local-protocol schema + lint', async () => {
    const { canonicalId } = await promoteFrozenDraft();
    const answers = await robotAnswers();
    const lpr = localProtocolPayload(canonicalId, answers);
    const validator = await schemaValidator();
    const result = validator.validate(lpr, LOCAL_PROTOCOL_ID);
    expect(result.errors ?? []).toEqual([]);
    const engine = lintEngineFor('local-protocol');
    const lint = engine.lint(lpr, LOCAL_PROTOCOL_ID);
    expect(lint.violations.filter((v) => v.severity === 'error').map((v) => v.ruleId)).toEqual([]);
  });

  it('lowerRealization emits a contract-valid scientist-intent YAML (real Ajv, real vocabulary)', async () => {
    const { canonicalId } = await promoteFrozenDraft();
    const family = (await boot!.ctx.store.get(canonicalId))!.payload as Record<string, unknown>;
    const answers = await robotAnswers();
    const lowered = await lowerRealization({
      family: family as unknown as ProtocolPayloadLike,
      realization: localProtocolPayload(canonicalId, answers) as unknown as LocalProtocolPayloadLike,
    });
    expect('intentYaml' in lowered).toBe(true);
    if (!('intentYaml' in lowered)) return;
    const doc = parseScientistIntent(lowered.intentYaml);
    expect(doc.actions.length).toBeGreaterThanOrEqual(15); // 15 surviving intent steps (branch-1 chosen)
    const vocabulary = defaultScientistIntentVocabulary();
    for (const action of doc.actions) expect(vocabulary.has(action.action)).toBe(true);
    // profile-sourced symbolic labels rode the emission (gate+labels depth)
    expect(lowered.intentYaml).toContain('sample_plate');
    expect(lowered.intentYaml).toContain('reagent_reservoir');
    // branch-1 chosen: the rack branch steps stay active
    expect(lowered.activeStepIds).toContain('step-1');
    expect(lowered.activeStepIds).toContain('step-4');
  });

  it('the LOCAL_REALIZATION carrier: branch_resolution robot entry carries FAMILY condition ids + the merged choices carrier', async () => {
    const { canonicalId } = await promoteFrozenDraft();
    const family = (await boot!.ctx.store.get(canonicalId))!.payload as Record<string, unknown>;
    const answers = await robotAnswers();
    const lpr = localProtocolPayload(canonicalId, answers);
    const axes = family.branch_axes as Array<{ axisId: string; conditions: Array<{ id: string }> }>;
    const resolution = lpr.branch_resolution as Array<{ axisId: string; matched: boolean; branchIds: string[]; choices: Record<string, unknown> }>;
    for (const entry of resolution) {
      const axis = axes.find((a) => a.axisId === entry.axisId)!;
      expect(entry.matched).toBe(true);
      expect(Object.keys(entry.choices).length).toBeGreaterThan(0);
      for (const branchId of entry.branchIds) {
        expect(axis.conditions.map((c) => c.id)).toContain(branchId); // FAMILY condition ids, never candidate step ids
      }
    }
    const robot = resolution[0]!;
    expect(robot.choices[robot.axisId]).toBe('robot'); // "neither spin column nor plate — the robot"
    expect(robot.choices.sample_count).toEqual({ value: 96, unit: 'wells', dimension: 'count', qualifier: 'exact' });
  });

  it('realizeAndCompile (production spine composition) -> outcome complete + non-empty events + robot profile closure', async () => {
    const { canonicalId } = await promoteFrozenDraft();
    const family = (await boot!.ctx.store.get(canonicalId))!.payload as Record<string, unknown>;
    const answers = await robotAnswers();
    const recorder = goldenStore();
    const spine = createResolveSpineFromContext({ store: recorder.store as never });
    const result = await realizeAndCompile({
      family: family as unknown as ProtocolPayloadLike,
      realization: localProtocolPayload(canonicalId, answers) as unknown as LocalProtocolPayloadLike,
      compileDeps: { spine },
    });
    expect('compile' in result, JSON.stringify((result as { failures?: unknown }).failures ?? {})).toBe(true);
    if (!('compile' in result)) return;
    expect(result.compile.outcome).toBe('complete');
    expect(result.compile.terminalArtifacts.events.length).toBeGreaterThan(0);
    expect(recorder.writeCalls()).toBe(0);
    // robot profile closure: the ASSIST PLUS 96 profile bound the roles — the
    // symbolic labels rode the emission and the events name the bound labware.
    const serialized = stableStringify(result.compile.terminalArtifacts);
    expect(serialized).toContain('sample_plate');
    expect(serialized).toContain('reagent_reservoir');
    // The profile closure itself is the L4 GATE: drop a profile-required row
    // and the lowering refuses naming the missing requirement (honest proof —
    // the compiled artifacts do not echo the definition ids).
    const answers2 = JSON.parse(JSON.stringify(answers)) as Record<string, unknown>;
    answers2.equipment = [];
    answers2.labwares = (answers2.labwares as Array<Record<string, unknown>>)
      .filter((row) => !String(row.role).endsWith('definition'));
    const broken = await lowerRealization({
      family: family as unknown as ProtocolPayloadLike,
      realization: localProtocolPayload(canonicalId, answers2) as unknown as LocalProtocolPayloadLike,
    });
    expect('failures' in broken).toBe(true);
    if (!('failures' in broken)) return;
    const codes = broken.failures.map((f) => f.code);
    expect(codes).toContain('REALIZATION_CAPABILITY_MISSING');
    const closureText = JSON.stringify(broken.failures);
    expect(closureText).toContain('pipette-capability/p20-multi-8');
    expect(closureText).toContain('lbw-def-generic-96-well-plate');
    expect(closureText).toContain('lbw-def-generic-reservoir-1-v1');
  });
});

// ---------------------------------------------------------------------------
// G7 — determinism: two full runs + a third after a fresh YAML re-load of
// policy/vocabulary; emitted YAML BYTE-equal AND serialized artifacts
// BYTE-equal (Map order / Date.now / randomUUID / locale sort are fakes —
// the byte compare is the bar)
// ---------------------------------------------------------------------------

describe('W2-11 G7 — deterministic lowering (three-run byte equality)', () => {

  it('two in-process runs + a fresh-policy-reload run are byte-equal (YAML + TerminalArtifacts)', async () => {
    const { canonicalId } = await promoteFrozenDraft();
    const family = (await boot!.ctx.store.get(canonicalId))!.payload as Record<string, unknown>;
    const answers = await robotAnswers();

    const run = async (policyPath?: string): Promise<{ yaml: string; artifacts: string; events: number }> => {
      const recorder = goldenStore();
      const spine = createResolveSpineFromContext({ store: recorder.store as never });
      const policy = policyPath ? loadRealizationPolicy(policyPath) : undefined;
      const result = await realizeAndCompile({
        family: family as unknown as ProtocolPayloadLike,
        realization: localProtocolPayload(canonicalId, answers) as unknown as LocalProtocolPayloadLike,
        ...(policy ? { policy } : {}),
        compileDeps: { spine },
      });
      if (!('compile' in result)) throw new Error(`lowering failed: ${JSON.stringify(result.failures)}`);
      return {
        yaml: result.intentYaml,
        artifacts: stableStringify(normalizeIncidental(result.compile.terminalArtifacts)),
        events: result.compile.terminalArtifacts.events.length,
      };
    };

    const runA = await run();
    const runB = await run();
    const runC = await run(join(process.cwd(), '..', 'schema', 'registry', 'realization', 'robot-realization.policy.yaml'));

    expect(runB.yaml).toBe(runA.yaml);
    expect(runC.yaml).toBe(runA.yaml);
    if (runB.artifacts !== runA.artifacts) {
      let i = 0;
      while (i < runA.artifacts.length && runA.artifacts[i] === runB.artifacts[i]) i += 1;
      console.log('W211_DET_DIFF at', i, JSON.stringify(runA.artifacts.slice(Math.max(0, i - 80), i + 120)));
    }
    expect(runB.artifacts).toBe(runA.artifacts);
    expect(runC.artifacts).toBe(runA.artifacts);
    expect(runA.events).toBeGreaterThan(0);
    expect(runB.events).toBe(runA.events);
    // report §5: the three-run digests
    console.log('W211_G7_DIGESTS', JSON.stringify({
      yaml: sha256(runA.yaml),
      artifacts: sha256(runA.artifacts),
      events: runA.events,
    }));
  });
});
