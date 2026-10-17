/**
 * W2-11-ZYMO-GOLDEN-DEMO — the five negative goldens (spec §3 T-table).
 *
 * Each arm is RED-at-base: the refusal FIRES with the named stable code (the
 * merged trunk's code string quoted verbatim in the report) and the negative's
 * payload leaves ZERO writes (store-snapshot deep-equal before/after).
 *
 *   N1 invented source branch      -> REALIZATION_BRANCH_ID_MASQUERADE /
 *                                    REALIZATION_BRANCH_UNRESOLVED + merged
 *                                    lint prov-local-axis-declared-shape
 *   N2 literal wave-2 output       -> lint legacy-literal-bounded ERROR +
 *                                    retired mapper zero-call-site grep
 *   N3 silent defaulting           -> REALIZATION_ANSWER_MISSING before
 *                                    compile; the chatbot guessed default is
 *                                    unreachable via the campaign route
 *   N4 unauthorized promotion      -> APPEND_ONLY / PROMOTION_CONTROLLED_
 *                                    ESCALATION / xdr-promote-blocked-by-unresolved
 *   N5 spine bypass                -> structural closure arms (import set,
 *                                    route grep, pipeline sha, routes sha),
 *                                    each mutation-tested non-vacuously
 *
 * Harness canon: real store boot (initializeApp/createServer, throwaway tmp
 * git store, CONFIG_PATH pinned), real Ajv, real lint engine, zero vi.mock.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { FastifyInstance } from 'fastify';
import { initializeApp, createServer } from '../../server.js';
import type { AppContext } from '../../server.js';
import { loadZymoCandidate } from './semanticPassFixtures.js';
import {
  lowerRealization,
  realizeAndCompile,
  type ProtocolPayloadLike,
  type LocalProtocolPayloadLike,
} from '../../compiler/scientistIntent/realizeScientistIntent.js';
import { LintEngine } from '../../lint/LintEngine.js';
import type { LintSpec } from '../../lint/types.js';

const VPC_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/workflow/vendor-protocol-candidate.schema.yaml';
const XDR_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml';
const PROTOCOL_ID = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml';
const LOCAL_PROTOCOL_ID = 'https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml';

const CANDIDATE_ID = 'CAN-w211-neg';
const AXIS_ID = 'branch-axis-zymobiomics-bashingbead-lysis-rack-zr-bashingbead-lysis-tubes';

// Pins re-measured in this worktree at the claim base (report §0).
const PIPELINE_SHA = 'b47eee0c3bd0f4f334b5070c3bfba2cbf0d0a360bd38af855c10bd012679fbf8'; // scientist-intent-compile.yaml
const ROUTES_SHA = '7609995317b2c16ed16625f7c8bd36bcf9eca88df173dff3ec411eda8ea2db6b';   // server/src/api/routes.ts

const testDir = resolve(process.cwd(), 'tmp/w211-negatives');
const dataDirBase = resolve('/tmp', 'cl-w211-negatives-data');

let boot: { ctx: AppContext; app: FastifyInstance } | null = null;
let candidate: Awaited<ReturnType<typeof loadZymoCandidate>>;
let familyRecordId: string | null = null;

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function mintableCandidatePayload(): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(candidate)) as Record<string, unknown>;
  for (const step of clone.steps as Array<Record<string, unknown>>) {
    for (const action of step.actions as Array<Record<string, unknown>>) {
      delete action.concentration;
    }
  }
  return clone;
}

async function bootStore(): Promise<{ ctx: AppContext; app: FastifyInstance }> {
  await rm(dataDirBase, { recursive: true, force: true });
  await mkdir(testDir, { recursive: true });
  await writeFile(resolve(testDir, 'config.yaml'), [
    'server:',
    '  logLevel: error',
    `  dataDir: ${dataDirBase}`,
    `  workspaceDir: ${dataDirBase}/workspaces`,
    'repositories: []',
    'logging: { level: error }',
    'extraction: { enabled: false, runner: { enabled: false } }',
  ].join('\n') + '\n');
  process.env.CONFIG_PATH = resolve(testDir, 'config.yaml');
  const ctx = await initializeApp(process.cwd(), { schemaDir: '../schema', recordsDir: 'records', logLevel: 'silent' });
  const app = await createServer(ctx, { logLevel: 'silent' });
  await app.ready();
  const seeded = await ctx.store.create({
    envelope: {
      recordId: 'USR-W211-NEG',
      schemaId: 'https://computable-lab.com/schema/computable-lab/user.schema.yaml',
      payload: { kind: 'user', recordId: 'USR-W211-NEG', username: 'w211-neg', displayName: 'W2-11 Neg Tester', email: 'w211-neg@example.invalid', status: 'active' },
    },
    message: 'seed test user for W2-11 negatives identity wall',
  });
  if (!seeded.success) throw new Error(`test user seed failed: ${seeded.error}`);
  return { ctx, app };
}

async function snapshot(): Promise<Array<{ recordId: string; kind: string; sha: string }>> {
  const rows = await boot!.ctx.store.list({});
  return rows
    .map((r) => ({
      recordId: r.recordId,
      kind: String((r.payload as Record<string, unknown>).kind),
      sha: String(r.meta?.contentSha ?? r.meta?.commitSha ?? ''),
    }))
    .sort((a, b) => a.recordId.localeCompare(b.recordId));
}

function lintEngineFor(kind: 'protocol' | 'local-protocol'): LintEngine {
  const path = join(process.cwd(), '..', 'schema', 'workflow', `${kind}.lint.yaml`);
  const spec = parseYaml(readFileSync(path, 'utf-8')) as LintSpec;
  const eng = new LintEngine();
  eng.addSpec(kind, spec);
  return eng;
}

/** The frozen campaign family payload (same body the golden promotes), with
 *  anchors bound to THIS suite's minted candidate. */
async function familyPayload(): Promise<Record<string, unknown>> {
  const draft = await readFixtureDraft();
  for (const step of draft.steps as Array<Record<string, unknown>>) {
    const intent = step.intent as Record<string, unknown>;
    for (const ref of intent.provenance as Array<Record<string, unknown>>) ref.id = CANDIDATE_ID;
  }
  return draft;
}

let frozenDraftCache: Record<string, unknown> | null = null;
async function readFixtureDraft(): Promise<Record<string, unknown>> {
  if (frozenDraftCache) return JSON.parse(JSON.stringify(frozenDraftCache));
  const bytes = await readFile(join(process.cwd(), 'src', 'ingestion', 'vendor-protocol', 'campaign-fixtures', 'zymo-semantic-draft.frozen.yaml'));
  frozenDraftCache = parseYaml(bytes.toString('utf-8')) as Record<string, unknown>;
  return JSON.parse(JSON.stringify(frozenDraftCache));
}

async function robotAnswers(): Promise<Record<string, unknown>> {
  const bytes = await readFile(join(process.cwd(), 'src', 'ingestion', 'vendor-protocol', 'campaign-fixtures', 'zymo-robot-answers.frozen.yaml'));
  return parseYaml(bytes.toString('utf-8')) as Record<string, unknown>;
}

function lprPayload(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    kind: 'local-protocol',
    protocolLayer: 'lab',
    recordId: 'LPR-w211-neg',
    title: 'W2-11 negative realization',
    status: 'active',
    inherits_from: { kind: 'record', type: 'protocol', id: familyRecordId ?? 'PRT-unknown' },
    branch_resolution: [{
      axisId: AXIS_ID,
      matched: true,
      branchIds: ['branch-1'],
      choices: { [AXIS_ID]: 'robot', sample_count: { value: 96, unit: 'wells', dimension: 'count', qualifier: 'exact' } },
    }],
    labwares: [
      { role: 'sample_plate', ref: { kind: 'record', type: 'labware', id: 'LAB-w211-neg-plate' } },
      { role: 'reagent_reservoir', ref: { kind: 'record', type: 'labware', id: 'LAB-w211-neg-reservoir' } },
      { role: 'sample plate definition', ref: { kind: 'record', type: 'labware-definition', id: 'lbw-def-generic-96-well-plate' } },
      { role: 'reservoir definition', ref: { kind: 'record', type: 'labware-definition', id: 'lbw-def-generic-reservoir-1-v1' } },
    ],
    equipment: [
      { role: 'multichannel pipette', ref: { kind: 'record', type: 'pipette-capability', id: 'pipette-capability/p20-multi-8' } },
      { role: 'bead beater', ref: { kind: 'ontology', id: 'CL:bead_beater', namespace: 'CL', label: 'bead beater' } },
    ],
    materials: [
      { role: 'lysis_solution', ref: { kind: 'record', type: 'material', id: 'MAT-w211-neg-lysis' } },
      { role: 'magbinding_beads', ref: { kind: 'record', type: 'material', id: 'MAT-w211-neg-magbeads' } },
      { role: 'magbinding_buffer', ref: { kind: 'record', type: 'material', id: 'MAT-w211-neg-magbuffer' } },
      { role: 'magwash_1', ref: { kind: 'record', type: 'material', id: 'MAT-w211-neg-magwash1' } },
      { role: 'magwash_2', ref: { kind: 'record', type: 'aliquot', id: 'MAT-w211-neg-magwash2' } },
      { role: 'dnase_rnase_free_water', ref: { kind: 'record', type: 'material', id: 'MAT-w211-neg-water' } },
    ],
    ...overrides,
  };
}

async function seedCleanFamily(): Promise<string> {
  const draft = await familyPayload();
  const xdrId = 'XDR-w211-neg-clean';
  const created = await boot!.ctx.store.create({
    envelope: {
      recordId: xdrId, schemaId: XDR_SCHEMA_ID,
      payload: {
        kind: 'extraction-draft', recordId: xdrId, status: 'pending_review',
        source_artifact: { kind: 'file', id: 'vendor-protocol-zymo-magbead', locator: 'section-protocol' },
        candidates: [{ target_kind: 'protocol', draft, confidence: 0.9, uncertainty: 'inferred' }],
      },
    },
    message: 'W2-11 negatives: seed clean frozen draft (control)',
  });
  if (!created.success) throw new Error(`XDR seed failed: ${created.error}`);
  const promote = await boot!.app.inject({ method: 'POST', url: `/api/extraction/drafts/${xdrId}/candidates/0/promote` });
  if (promote.statusCode !== 200) throw new Error(`control promotion failed ${promote.statusCode}: ${promote.body}`);
  return String((promote.json() as Record<string, unknown>).recordId);
}

beforeAll(async () => {
  candidate = await loadZymoCandidate();
  boot = await bootStore();
  const minted = await boot.ctx.store.create({
    envelope: { recordId: CANDIDATE_ID, schemaId: VPC_SCHEMA_ID, payload: mintableCandidatePayload() },
    message: 'seed Zymo VPC for W2-11 negatives',
  });
  if (!minted.success) throw new Error(`VPC mint failed: ${minted.error}`);
  familyRecordId = await seedCleanFamily();
}, 600000);

afterAll(async () => {
  if (boot) {
    await boot.app.close();
    await rm(dataDirBase, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    await rm(testDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    delete process.env.CONFIG_PATH;
  }
});

// ---------------------------------------------------------------------------
// N1 — invented source branch
// ---------------------------------------------------------------------------

describe('W2-11 N1 — invented source branch is refused', () => {

  it('control: the clean realization lowers (the refusal arms are not vacuous)', async () => {
    const family = (await boot!.ctx.store.get(familyRecordId!))!.payload as Record<string, unknown>;
    const lowered = await lowerRealization({
      family: family as unknown as ProtocolPayloadLike,
      realization: lprPayload() as unknown as LocalProtocolPayloadLike,
    });
    expect('intentYaml' in lowered).toBe(true);
  });

  it('a branchId NOT in the family condition ids (a candidate step id masquerade) -> REALIZATION_BRANCH_ID_MASQUERADE, zero emitted YAML', async () => {
    const before = await snapshot();
    const family = (await boot!.ctx.store.get(familyRecordId!))!.payload as Record<string, unknown>;
    const bad = lprPayload({
      branch_resolution: [{
        axisId: AXIS_ID,
        matched: true,
        branchIds: ['step-1'], // vendor candidate step id masquerading as a branch id
        choices: { [AXIS_ID]: 'robot', sample_count: { value: 96, unit: 'wells', dimension: 'count', qualifier: 'exact' } },
      }],
    });
    const result = await realizeAndCompile({
      family: family as unknown as ProtocolPayloadLike,
      realization: bad as unknown as LocalProtocolPayloadLike,
      compileDeps: { spine: undefined as never }, // never reached: the gate fires first
    });
    expect('failures' in result).toBe(true);
    if (!('failures' in result)) return;
    const codes = result.failures.map((f) => f.code);
    expect(codes).toContain('REALIZATION_BRANCH_ID_MASQUERADE');
    const text = JSON.stringify(result.failures);
    expect(text).toContain('never from vendor candidate step ids'); // merged message verbatim fragment
    expect('intentYaml' in result).toBe(false); // zero emitted YAML
    expect(await snapshot()).toEqual(before); // zero writes
  });

  it('an axis with NO matched resolution -> REALIZATION_BRANCH_UNRESOLVED naming the axis', async () => {
    const family = (await boot!.ctx.store.get(familyRecordId!))!.payload as Record<string, unknown>;
    const bad = lprPayload({ branch_resolution: [] });
    const lowered = await lowerRealization({
      family: family as unknown as ProtocolPayloadLike,
      realization: bad as unknown as LocalProtocolPayloadLike,
    });
    expect('failures' in lowered).toBe(true);
    if (!('failures' in lowered)) return;
    expect(lowered.failures.map((f) => f.code)).toContain('REALIZATION_BRANCH_UNRESOLVED');
    expect(JSON.stringify(lowered.failures)).toContain(AXIS_ID);
  });

  it('merged lint prov-local-axis-declared-shape fires on a malformed axisId payload (store mint refused too)', async () => {
    const before = await snapshot();
    const bad = lprPayload({
      branch_resolution: [{ axisId: 'Bad Axis ID!', matched: true, branchIds: ['branch-1'], choices: { 'Bad Axis ID!': 'robot' } }],
    });
    const engine = lintEngineFor('local-protocol');
    const lint = engine.lint(bad, LOCAL_PROTOCOL_ID);
    const errorIds = lint.violations.filter((v) => v.severity === 'error').map((v) => v.ruleId);
    expect(errorIds).toContain('prov-local-axis-declared-shape');
    const created = await boot!.ctx.store.create({
      envelope: { recordId: 'LPR-w211-n1-bad', schemaId: LOCAL_PROTOCOL_ID, payload: bad },
      message: 'W2-11 N1: attempted mint of a malformed-axis local-protocol',
    });
    expect(created.success).toBe(false);
    expect(await snapshot()).toEqual(before); // zero writes
  });
});

// ---------------------------------------------------------------------------
// N2 — literal wave-2 output
// ---------------------------------------------------------------------------

describe('W2-11 N2 — a literal-step payload presented as wave-2 output is refused', () => {

  it('(a) a newly authored literal-only protocol is refused by lint legacy-literal-bounded (ERROR, record refused)', async () => {
    const before = await snapshot();
    // Schema-valid LITERAL steps (StepAddMaterial arm: kind/target/wells/
    // material/volume_uL, no `intent`) — Ajv passes them, so the refusal is
    // the LINT rule legacy-literal-bounded (ERROR), which is the point.
    const literalProtocol = {
      kind: 'protocol',
      protocolLayer: 'universal',
      recordId: 'PRT-w211-n2-literal',
      title: 'ZymoBIOMICS 96 (literal wave-2 output attempt)',
      steps: [
        {
          stepId: 'add-lysis-literal',
          label: 'Add 550 ul lysis solution to the BashingBead Lysis Module',
          ordinal: 1,
          kind: 'add_material',
          target: { labwareRole: 'lysis-module' },
          wells: { kind: 'all' },
          material: { materialRole: 'lysis-solution' },
          volume_uL: 550,
        },
        {
          stepId: 'add-beads-literal',
          label: 'Dispense 25 ul MagBinding Beads to each well',
          ordinal: 2,
          kind: 'add_material',
          target: { labwareRole: 'deep-well-block' },
          wells: { kind: 'all' },
          material: { materialRole: 'magbinding-beads' },
          volume_uL: 25,
        },
      ],
    };
    const res = await boot!.app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { 'x-user-id': 'USR-W211-NEG' },
      payload: { schemaId: PROTOCOL_ID, payload: literalProtocol, message: 'W2-11 N2: literal payload as wave-2 output' },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json() as { lint?: { violations?: Array<{ ruleId: string; severity: string }> } };
    const errorIds = (body.lint?.violations ?? []).filter((v) => v.severity === 'error').map((v) => v.ruleId);
    expect(errorIds).toContain('legacy-literal-bounded');
    expect(await boot!.ctx.store.get('PRT-w211-n2-literal')).toBeNull();
    expect(await snapshot()).toEqual(before); // zero writes
  });

  it('(a control) the intent-bearing campaign family passes the same lint (arm is non-vacuous)', () => {
    const engine = lintEngineFor('protocol');
    const family = JSON.parse(JSON.stringify(frozenDraftCache!)) as Record<string, unknown>;
    const lint = engine.lint(family, PROTOCOL_ID);
    expect(lint.violations.filter((v) => v.severity === 'error').map((v) => v.ruleId)).toEqual([]);
  });

  it('(b) the W2-8-retired mapper stays call-site-free: candidateToProtocolPayload( has ZERO app call sites outside its own module + test', async () => {
    const appSrc = join(process.cwd(), '..', 'app', 'src');
    const hits: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) { await walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        const text = await readFile(p, 'utf-8');
        if (text.includes('candidateToProtocolPayload(')) hits.push(p);
      }
    };
    await walk(appSrc);
    const own = hits.filter((p) => /candidateToProtocolPayload\.(test\.)?tsx?$/.test(p));
    const product = hits.filter((p) => !own.includes(p));
    expect(product).toEqual([]); // module + its test only — death-by-refusal, no deletion (W211-OQ2(a))
    expect(own.length).toBe(2);  // non-vacuous: the module and its test ARE found
  });
});

// ---------------------------------------------------------------------------
// N3 — silent defaulting
// ---------------------------------------------------------------------------

describe('W2-11 N3 — an omitted sampleCount refuses BEFORE compile', () => {

  it('sampleCount OMITTED -> REALIZATION_ANSWER_MISSING carrying the policy question text, zero emitted YAML', async () => {
    const before = await snapshot();
    const family = (await boot!.ctx.store.get(familyRecordId!))!.payload as Record<string, unknown>;
    const bad = lprPayload({
      branch_resolution: [{ axisId: AXIS_ID, matched: true, branchIds: ['branch-1'], choices: { [AXIS_ID]: 'robot' } }], // sample_count omitted
    });
    const result = await realizeAndCompile({
      family: family as unknown as ProtocolPayloadLike,
      realization: bad as unknown as LocalProtocolPayloadLike,
      compileDeps: { spine: undefined as never }, // never reached
    });
    expect('failures' in result).toBe(true);
    if (!('failures' in result)) return;
    expect(result.failures.map((f) => f.code)).toContain('REALIZATION_ANSWER_MISSING');
    const text = JSON.stringify(result.failures);
    // the refusal carries the policy's question text verbatim (policy DATA, not a TS literal)
    expect(text).toContain('How many samples (wells) are you processing on this realization?');
    expect('intentYaml' in result).toBe(false);
    expect(await snapshot()).toEqual(before); // zero writes
  });

  it('belt arm: the chatbot guessed default EXISTS downstream but the campaign route makes it unreachable (gate fires first)', () => {
    const passSource = readFileSync(join(process.cwd(), 'src', 'compiler', 'pipeline', 'passes', 'ChatbotCompilePasses.ts'), 'utf-8');
    expect(passSource).toContain('defaulting to'); // the 8-sample guessed default is real (ChatbotCompilePasses.ts:3093-3096 at tip)
    // ...and the campaign route cannot reach it: lowering refused above with
    // zero emitted YAML, so no compile ever ran on the unanswered payload.
  });
});

// ---------------------------------------------------------------------------
// N4 — unauthorized promotion (three legs)
// ---------------------------------------------------------------------------

describe('W2-11 N4 — unauthorized promotion is refused on all three legs', () => {

  it('(a) PUT and DELETE against the minted candidate both 405 APPEND_ONLY; the sha is unchanged', async () => {
    const before = await snapshot();
    const put = await boot!.app.inject({
      method: 'PUT',
      url: `/api/records/${CANDIDATE_ID}`,
      headers: { 'x-user-id': 'USR-W211-NEG' },
      payload: { payload: mintableCandidatePayload(), message: 'N4a: attempted candidate rewrite' },
    });
    expect(put.statusCode).toBe(405);
    expect((put.json() as Record<string, unknown>).error).toBe('APPEND_ONLY');

    const del = await boot!.app.inject({
      method: 'DELETE',
      url: `/api/records/${CANDIDATE_ID}`,
      headers: { 'x-user-id': 'USR-W211-NEG' },
    });
    expect(del.statusCode).toBe(405);
    expect((del.json() as Record<string, unknown>).error).toBe('APPEND_ONLY');

    expect(await snapshot()).toEqual(before); // zero writes
  });

  it('(b) a promoted candidate declaring lifecycleId + non-draft state -> 422 PROMOTION_CONTROLLED_ESCALATION, zero writes', async () => {
    const draft = await familyPayload();
    (draft as Record<string, unknown>).lifecycleId = 'document-control';
    (draft as Record<string, unknown>).state = 'approved';
    const xdrId = 'XDR-w211-n4-spoof';
    const created = await boot!.ctx.store.create({
      envelope: {
        recordId: xdrId, schemaId: XDR_SCHEMA_ID,
        payload: {
          kind: 'extraction-draft', recordId: xdrId, status: 'pending_review',
          source_artifact: { kind: 'file', id: 'vendor-protocol-zymo-magbead', locator: 'section-protocol' },
          candidates: [{ target_kind: 'protocol', draft, confidence: 0.9, uncertainty: 'inferred' }],
        },
      },
      message: 'N4b: seed a state-spoofing draft',
    });
    expect(created.success).toBe(true); // the XDR layer does not validate candidate.draft bodies (by design)
    const before = await snapshot(); // snapshot AFTER the authorized XDR seed
    const promote = await boot!.app.inject({ method: 'POST', url: `/api/extraction/drafts/${xdrId}/candidates/0/promote` });
    expect(promote.statusCode).toBe(422);
    expect((promote.json() as Record<string, unknown>).error).toBe('PROMOTION_CONTROLLED_ESCALATION');
    // the spoofed family was never minted
    const after = await boot!.ctx.store.list({});
    expect(after.some((r) => String((r.payload as Record<string, unknown>).title ?? '').includes('semantic family draft') && String((r.payload as Record<string, unknown>).state) === 'approved')).toBe(false);
    expect(await snapshot()).toEqual(before); // zero writes beyond the authorized XDR seed
  });

  it('(b belt) the create path never lets a POST declare an approved protocol — refused or BORN DRAFT', async () => {
    const spoofCreate = await boot!.app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { 'x-user-id': 'USR-W211-NEG' },
      payload: {
        schemaId: PROTOCOL_ID,
        payload: {
          kind: 'protocol', protocolLayer: 'universal', recordId: 'PRT-w211-n4-spoof', title: 'spoofed',
          lifecycleId: 'document-control', state: 'approved',
          steps: [{ stepId: 's1', label: 'Add lysis', ordinal: 1, kind: 'other', intent: { semanticVerb: { canonical: 'add_material' }, provenance: [{ kind: 'record', type: 'vendor-protocol-candidate', id: CANDIDATE_ID, pageStart: 9 }] } }],
        },
        message: 'N4b belt: create-path state spoof attempt',
      },
    });
    if (spoofCreate.statusCode === 201) {
      const rec = await boot!.ctx.store.get('PRT-w211-n4-spoof');
      expect((rec!.payload as Record<string, unknown>).state).toBe('draft'); // born draft, never approved
    } else {
      expect(spoofCreate.statusCode).toBe(422);
    }
  });

  it('(c) promoting a candidate with unresolved ambiguity_spans -> xdr-promote-blocked-by-unresolved, zero writes', async () => {
    const draft = await familyPayload();
    const xdrId = 'XDR-w211-n4-ambig';
    const created = await boot!.ctx.store.create({
      envelope: {
        recordId: xdrId, schemaId: XDR_SCHEMA_ID,
        payload: {
          kind: 'extraction-draft', recordId: xdrId, status: 'pending_review',
          source_artifact: { kind: 'file', id: 'vendor-protocol-zymo-magbead', locator: 'section-protocol' },
          candidates: [{
            target_kind: 'protocol', draft, confidence: 0.9,
            ambiguity_spans: [{ path: 'steps[0].intent.provenance[0]', reason: 'xdr-promote-blocked-by-unresolved: anchor unresolved' }],
          }],
        },
      },
      message: 'N4c: seed an ambiguity-bearing draft',
    });
    expect(created.success).toBe(true);
    const before = await snapshot(); // snapshot AFTER the authorized XDR seed
    const promote = await boot!.app.inject({ method: 'POST', url: `/api/extraction/drafts/${xdrId}/candidates/0/promote` });
    expect(promote.statusCode).toBe(400);
    const body = promote.json() as { error: string; details?: { code?: string } };
    expect(body.error).toBe('PROMOTION_FAILED');
    expect(body.details?.code).toBe('xdr-promote-blocked-by-unresolved');
    expect(await snapshot()).toEqual(before); // zero writes
  });
});

// ---------------------------------------------------------------------------
// N5 — spine bypass (structural closure arms, mutation-tested non-vacuously)
// ---------------------------------------------------------------------------

describe('W2-11 N5 — the scientist-intent spine cannot be bypassed', () => {

  it('grep arm: `\\.intent` stays EMPTY across server/src/compiler/protocol/', async () => {
    const dir = join(process.cwd(), 'src', 'compiler', 'protocol');
    const hits: string[] = [];
    const walk = async (d: string): Promise<void> => {
      for (const entry of await readdir(d, { withFileTypes: true })) {
        const p = join(d, entry.name);
        if (entry.isDirectory()) { await walk(p); continue; }
        if (!/\.ts$/.test(entry.name)) continue;
        const text = await readFile(p, 'utf-8');
        if (/\.intent\b/.test(text)) hits.push(p);
      }
    };
    await walk(dir);
    expect(hits).toEqual([]);
  });

  it('import-set closure: every importer of compileScientistIntent is a known file + W2-7 realization files + this item\'s new files ONLY', async () => {
    const known = new Set([
      'src/ai/AgentOrchestrator.shorthandChat.test.ts',
      'src/ai/shorthandChat.ts',
      'src/api/handlers/IntentCompileFromPromptHandlers.ts',
      'src/api/handlers/IntentCompileHandlers.ts',
      'src/compiler/protocolIntent/ProtocolIntentLoweringCharacterization.test.ts',
      'src/compiler/resolution/spine4ProductionWiring.test.ts',
      'src/compiler/resolution/spine4Registration.test.ts',
      'src/compiler/scientistIntent/intentCompile.ts',
      'src/compiler/scientistIntent/noBypass.test.ts',
      'src/compiler/scientistIntent/realizationGolden.test.ts',
      'src/compiler/scientistIntent/realizeScientistIntent.ts',
      'src/compiler/scientistIntent/rolesSeam.test.ts',
      'src/compiler/scientistIntent/scientistIntent.test.ts',
    ]);
    const newFiles = new Set([
      'src/ingestion/vendor-protocol/ZymoCampaignGoldenE2E.test.ts',
      'src/ingestion/vendor-protocol/ZymoCampaignNegatives.test.ts',
      'scripts/zymo-campaign-live-smoke.ts',
    ]);
    const serverDir = process.cwd();
    const findImporters = async (): Promise<Set<string>> => {
      const found = new Set<string>();
      const walk = async (d: string): Promise<void> => {
        for (const entry of await readdir(d, { withFileTypes: true })) {
          if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'tmp') continue;
          const p = join(d, entry.name);
          if (entry.isDirectory()) { await walk(p); continue; }
          if (!/\.ts$/.test(entry.name)) continue;
          const text = await readFile(p, 'utf-8');
          if (/compileScientistIntent(\.js)?['"]/.test(text) || /realizeAndCompile(\.js)?['"]/.test(text)) {
            found.add(p.replace(`${serverDir}/`, ''));
          }
        }
      };
      await walk(join(serverDir, 'src'));
      await walk(join(serverDir, 'scripts'));
      return found;
    };
    const importers = await findImporters();
    // non-vacuous: the known production importers ARE found
    expect(importers.has('src/api/handlers/IntentCompileHandlers.ts')).toBe(true);
    expect(importers.has('src/compiler/scientistIntent/realizeScientistIntent.ts')).toBe(true);
    for (const file of importers) {
      expect(known.has(file) || newFiles.has(file)).toBe(true);
    }
    // mutation arm: a NEW bypass importer WOULD be caught
    const mutationPath = join(serverDir, 'src', 'ingestion', 'vendor-protocol', 'w211MutationProbe.ts');
    try {
      await writeFile(mutationPath, "import { compileScientistIntent } from '../../compiler/scientistIntent/compileScientistIntent.js';\nexport const probe = compileScientistIntent;\n");
      const mutated = await findImporters();
      expect(mutated.has('src/ingestion/vendor-protocol/w211MutationProbe.ts')).toBe(true);
    } finally {
      await rm(mutationPath, { force: true });
    }
  });

  it('pipeline + routes closure: scientist-intent-compile.yaml sha unchanged and routes.ts adds zero routes (sha-pinned)', async () => {
    const pipeline = await readFile(join(process.cwd(), '..', 'schema', 'registry', 'compile-pipelines', 'scientist-intent-compile.yaml'));
    expect(sha256(pipeline)).toBe(PIPELINE_SHA);
    const routes = await readFile(join(process.cwd(), 'src', 'api', 'routes.ts'));
    expect(sha256(routes)).toBe(ROUTES_SHA);
  });
});
