/**
 * PB-CH-5 — pure analysis-adapter compilation module tests (RED-FIRST).
 *
 * No adapter registration, no HTTP: a FAKE spine that appends a REAL tier-5
 * `curie:''` mint candidate on EVERY resolve call (the real ResolveSpine always
 * does — a spine stub that never mints proves nothing; PB-CH-1 S2 convention),
 * the REAL loadDefaultSurfacesRegistry, a stub canonical store + the REAL
 * stagingStore proxy for the staged-create cases, and a repo-schema Ajv
 * validator built through the same SchemaLoader -> SchemaRegistry ->
 * AjvValidator pipeline the boot uses.
 *
 * The compiler injects `requestId` into the intent before staging
 * (FormDraftService.evaluate); this harness injects it too, exactly like the
 * real pipeline, so the envelope schema's requestId tolerance is exercised.
 *
 * THE load-bearing genericity case lives in workstateCompile.test.ts: with
 * ONLY the two new workstate-tab-kinds.yaml DATA entries (zero analysis-aware
 * code), the PLAIN compose-workstate compile resolves a seeded
 * analysis-revision term and projects a record-edit tab.
 */
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';
import { loadDefaultSurfacesRegistry } from '../surfaces/surfaces.js';
import { stagingStore } from './StagingStore.js';
import type { RecordEnvelope, RecordStore } from '../store/types.js';
import type { ValidationResult } from '../types/common.js';
import type { ActionCandidate, ActionSpineLike } from '../ai/compileWorkspaceAction.js';
import {
  compileAnalysisIntent,
  analysisDepsFromContext,
  ANALYSIS_INTENT_SCHEMA_ID,
  type AnalysisDeps,
} from './analysisCompile.js';

const LAB_SESSION_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/workflow/lab-session.schema.yaml';
const ANALYSIS_RUN_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/analysis-run.schema.yaml';
const schemaRoot = fileURLToPath(new URL('../../../schema', import.meta.url));

let root: string;
let validate: (doc: unknown, id: string) => ValidationResult;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'cl-analysis-pure-'));
  const registry = createSchemaRegistry();
  const loaded = await loadAllSchemas({ basePath: schemaRoot, recursive: true });
  expect(loaded.errors).toEqual([]);
  registry.addSchemas(loaded.entries);
  const validator = createValidator();
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema as never, id);
  }
  validate = (doc, id) => validator.validate(doc, id);
}, 30000);
afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

// ---------------------------------------------------------------- fixtures --
const envelopes: Record<string, RecordEnvelope> = {
  'ANREV-000001': { recordId: 'ANREV-000001', schemaId: 'https://computable-lab.com/schema/computable-lab/analysis-revision.schema.yaml', payload: { kind: 'analysis-revision', id: 'ANREV-000001', title: 'ROS mitochondrial flux analysis', entryScript: 'def run(ctx): ...', sdkVersion: '1.0' } },
  'ANR-000001': { recordId: 'ANR-000001', schemaId: 'https://computable-lab.com/schema/computable-lab/analysis-run.schema.yaml', payload: { kind: 'analysis-run', id: 'ANR-000001', title: 'Seeded ROS run', revisionRef: { kind: 'record', type: 'analysis-revision', id: 'ANREV-000001' }, status: 'succeeded' } },
  'AOUT-000001': { recordId: 'AOUT-000001', schemaId: 'https://computable-lab.com/schema/computable-lab/analysis-output-artifact.schema.yaml', payload: { kind: 'analysis-output-artifact', id: 'AOUT-000001', title: 'ROS trace artifact', runRef: { kind: 'record', type: 'analysis-run', id: 'ANR-000001' }, name: 'trace', dataKind: 'signal' } },
  'DREF-000001': { recordId: 'DREF-000001', schemaId: 'https://computable-lab.com/schema/computable-lab/data-reference.schema.yaml', payload: { kind: 'data-reference', id: 'DREF-000001', title: 'Seahorse trace file', storageDeviceId: 'DEV-LOCAL', path: 'traces/seahorse.csv', contentHash: 'a'.repeat(64), sizeBytes: 1024, dataKind: 'table', format: 'csv' } },
  // A real record whose kind is OUTSIDE the declared analysis kind sets.
  'PLR-TEST1': { recordId: 'PLR-TEST1', schemaId: 'https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml', payload: { kind: 'planned-run', recordId: 'PLR-TEST1', title: 'Zymo extraction planned run' } },
};

const stubStore = {
  get: async (id: string) => envelopes[id] ?? null,
  list: async () => Object.values(envelopes),
  // The staging proxy validates through the backing store (StagingStore.ts:24):
  // envelope validation goes to the REAL registered schema via the same Ajv.
  validate: async (envelope: RecordEnvelope) => validate(envelope.payload, envelope.schemaId),
  lint: async () => ({ valid: true }),
} as unknown as RecordStore;

/** THE MINT LEAK IS EXERCISED: every resolve call appends the tier-5 mint the
 *  real spine appends (ResolveSpine.ts mintAffordance). */
function fakeSpine(table: Record<string, ActionCandidate[]>): ActionSpineLike {
  return {
    async resolve(term: string): Promise<readonly ActionCandidate[]> {
      const hits = table[term] ?? [];
      return [...hits, { curie: '', label: `Create local term “${term}”`, tier: 5, source: 'mint', namespace: 'local', score: 0.05 }];
    },
  };
}

const spine = fakeSpine({
  'ROS mitochondrial flux analysis': [{ curie: 'local:ANREV-000001', label: 'ROS mitochondrial flux analysis', tier: 1, source: 'local-record', namespace: 'local', score: 1.15 }],
  'Seeded ROS run': [{ curie: 'local:ANR-000001', label: 'Seeded ROS run', tier: 1, source: 'local-record', namespace: 'local', score: 1.15 }],
  'ROS trace artifact': [{ curie: 'local:AOUT-000001', label: 'ROS trace artifact', tier: 1, source: 'local-record', namespace: 'local', score: 1.15 }],
  'Seahorse trace file': [{ curie: 'local:DREF-000001', label: 'Seahorse trace file', tier: 1, source: 'local-record', namespace: 'local', score: 1.15 }],
  'Zymo extraction planned run': [{ curie: 'local:PLR-TEST1', label: 'Zymo extraction planned run', tier: 1, source: 'local-record', namespace: 'local', score: 1.15 }],
  // Two records at the SAME tier with the SAME score — the ambiguity arm.
  'ROS flux': [
    { curie: 'local:ANREV-000001', label: 'ROS flux', tier: 1, source: 'local-record', namespace: 'local', score: 1.15 },
    { curie: 'local:ANR-000001', label: 'ROS flux', tier: 1, source: 'local-record', namespace: 'local', score: 1.15 },
  ],
});

/** `store` is the canonical READ view; `stage` is where a staged create lands
 *  (during a real compile the pipeline swaps ctx.store for the staging proxy —
 *  same split here). */
const deps = (stage?: RecordStore): AnalysisDeps => ({
  resolveSpine: spine,
  surfaces: loadDefaultSurfacesRegistry(schemaRoot),
  store: stubStore,
  stage: stage ?? stubStore,
  validate: (doc: unknown, id: string) => validate(doc, id),
});

/** The draft compiler injects requestId before staging; the harness does too. */
const intent = (target: unknown, extra?: Record<string, unknown>): Record<string, unknown> => ({
  operation: 'compose-analysis',
  requestId: 'DRAFT-pure-1',
  target,
  ...(extra ?? {}),
});

// ------------------------------------------------------------------- tests --
describe('analysis proposal compilation (pure module)', () => {
  it('compiles an open-existing-run proposal to a schema-valid version:1 session document', async () => {
    const compiled = await compileAnalysisIntent(intent({ run: { term: 'Seeded ROS run' } }), deps(), 'USR-test');
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const doc = compiled.result.sessionDocument;
    expect(validate(doc, LAB_SESSION_SCHEMA_ID).valid).toBe(true);
    expect(doc.version).toBe(1);
    expect(doc.tabs).toHaveLength(1);
    expect(doc.tabs[0]).toMatchObject({ kind: 'record-edit', recordId: 'ANR-000001' });
    // focus defaults to `run`: the active tab is the run's derived record: id.
    expect(doc.activeTabId).toBe('record:ANR-000001');
    expect(compiled.result.resolvedTerms.map((t) => t.curieOrRecordId)).toEqual(['ANR-000001']);
    expect(typeof compiled.result.summary).toBe('string');
    expect(compiled.result.summary).toMatch(/nothing executed/i);
  });

  it('compiles a staged-create proposal: ONE analysis-run create, status queued, revisionRef chained', async () => {
    const staging = stagingStore(stubStore);
    const compiled = await compileAnalysisIntent(
      intent({ revision: { term: 'ROS mitochondrial flux analysis' }, newRun: { title: 'Fresh ROS run', inputs: { trace: { term: 'Seahorse trace file' } } } }),
      deps(staging.store),
      'USR-test',
    );
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(staging.writes.size).toBe(1);
    const write = [...staging.writes.values()][0]!;
    const payload = write.payload as Record<string, unknown>;
    expect(payload.kind).toBe('analysis-run');
    expect(payload.status).toBe('queued');
    expect(payload.initiator).toBe('USR-test');
    // Deterministic id: nextId-scan of the canonical store (max ANR-000001 + 1).
    expect(write.recordId).toBe('ANR-000002');
    expect(payload.id).toBe('ANR-000002');
    // Revision chaining: the staged run's revisionRef.id EQUALS the resolved revision recordId.
    expect(payload.revisionRef).toMatchObject({ kind: 'record', type: 'analysis-revision', id: 'ANREV-000001' });
    // Inputs resolved through referenceKinds ∩ inputKinds (data-reference here).
    expect(payload.inputs).toMatchObject({ trace: { kind: 'record', type: 'data-reference', id: 'DREF-000001' } });
    // The staged envelope is Ajv-valid against the REGISTERED analysis-run schema.
    expect(validate(payload, ANALYSIS_RUN_SCHEMA_ID).valid).toBe(true);
    // Landing tabs: revision tab + the staged run's tab; focus defaults to the run.
    const doc = compiled.result.sessionDocument;
    expect(validate(doc, LAB_SESSION_SCHEMA_ID).valid).toBe(true);
    expect(doc.tabs.map((t) => t.recordId)).toEqual(['ANREV-000001', 'ANR-000002']);
    expect(doc.activeTabId).toBe('record:ANR-000002');
    expect(compiled.result.summary).toMatch(/queued/i);
    expect(compiled.result.summary).toMatch(/nothing executed/i);
  });

  it('focus:revision lands on the revision tab of a staged-create proposal', async () => {
    const staging = stagingStore(stubStore);
    const compiled = await compileAnalysisIntent(
      intent({ revision: { recordId: 'ANREV-000001' }, newRun: { title: 'Focus check' } }, { focus: 'revision' }),
      deps(staging.store),
      'USR-test',
    );
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.result.sessionDocument.activeTabId).toBe('record:ANREV-000001');
  });

  it('open.tabs append extra cross-page tabs resolved with the same mapping + registry', async () => {
    const compiled = await compileAnalysisIntent(
      intent({ run: { term: 'Seeded ROS run' } }, { open: { tabs: [{ surface: 'run-plan', target: { recordId: 'PLR-TEST1' } }] } }),
      deps(),
      'USR-test',
    );
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.result.sessionDocument.tabs).toHaveLength(2);
    // Same DECLARATIVE mapping as the workstate adapter: planned-run → run tab.
    expect(compiled.result.sessionDocument.tabs[1]).toMatchObject({ kind: 'run', runId: 'PLR-TEST1' });
  });

  it('unresolvable target term yields UNRESOLVED_TERM with ok:false', async () => {
    const compiled = await compileAnalysisIntent(intent({ run: { term: 'unobtanium flux capacitor' } }), deps(), 'USR-test');
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.diagnostics.some((d) => d.code === 'UNRESOLVED_TERM' && d.path.includes('/target'))).toBe(true);
  });

  it('ambiguous term (two same-tier equal-score candidates) yields AMBIGUOUS_TERM with ok:false', async () => {
    const compiled = await compileAnalysisIntent(intent({ run: { term: 'ROS flux' } }), deps(), 'USR-test');
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.diagnostics.some((d) => d.code === 'AMBIGUOUS_TERM' && d.path.includes('/target'))).toBe(true);
  });

  it('mint-only candidate never binds (tier-5 leak guard exercised every call)', async () => {
    const compiled = await compileAnalysisIntent(intent({ revision: { term: 'brand new method nobody authored' } }), deps(), 'USR-test');
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.diagnostics.some((d) => d.code === 'UNRESOLVED_TERM')).toBe(true);
  });

  it('invented recordId never projects (UNKNOWN_RECORD)', async () => {
    const compiled = await compileAnalysisIntent(intent({ run: { recordId: 'ANR-made-up-999' } }), deps(), 'USR-test');
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.diagnostics.some((d) => d.code === 'UNKNOWN_RECORD')).toBe(true);
  });

  it('WRONG_REFERENCE_KIND: a revision target resolving to an analysis-run is a diagnostic, nothing staged', async () => {
    const staging = stagingStore(stubStore);
    const compiled = await compileAnalysisIntent(
      intent({ revision: { term: 'Seeded ROS run' }, newRun: { title: 'Should not stage' } }),
      deps(staging.store),
      'USR-test',
    );
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.diagnostics.some((d) => d.code === 'WRONG_REFERENCE_KIND' && d.path.includes('/target/revision'))).toBe(true);
    expect(staging.writes.size).toBe(0);
  });

  it('WRONG_REFERENCE_KIND: an input resolving outside inputKinds is a diagnostic, never a skipped input', async () => {
    const staging = stagingStore(stubStore);
    const compiled = await compileAnalysisIntent(
      intent({ revision: { recordId: 'ANREV-000001' }, newRun: { inputs: { bogus: { recordId: 'ANR-000001' } } } }),
      deps(staging.store),
      'USR-test',
    );
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.diagnostics.some((d) => d.code === 'WRONG_REFERENCE_KIND' && d.path.includes('/target/newRun/inputs'))).toBe(true);
    expect(staging.writes.size).toBe(0);
  });

  it('UNSUPPORTED_SURFACE on open.tabs (registry membership only)', async () => {
    const compiled = await compileAnalysisIntent(
      intent({ run: { term: 'Seeded ROS run' } }, { open: { tabs: [{ surface: 'totally-unregistered-surface', target: { recordId: 'ANR-000001' } }] } }),
      deps(),
      'USR-test',
    );
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.diagnostics.some((d) => d.code === 'UNSUPPORTED_SURFACE')).toBe(true);
  });

  it('ACTIVE_TAB_UNRESOLVED when the focus target is not among the landing tabs', async () => {
    // A run-only proposal projects no revision tab; focus:revision names a tab
    // that cannot exist. Named diagnostic, never a silently dropped tab.
    const compiled = await compileAnalysisIntent(intent({ run: { recordId: 'ANR-000001' } }, { focus: 'revision' }), deps(), 'USR-test');
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.diagnostics.some((d) => d.code === 'ACTIVE_TAB_UNRESOLVED')).toBe(true);
  });

  it('the staged create is the ONLY store mutation (StagingStore capability boundary)', async () => {
    const staging = stagingStore(stubStore);
    const compiled = await compileAnalysisIntent(
      intent({ revision: { recordId: 'ANREV-000001' }, newRun: { title: 'Queued only' } }),
      deps(staging.store),
      'USR-test',
    );
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect([...staging.writes.values()].map((w) => (w.payload as Record<string, unknown>).kind)).toEqual(['analysis-run']);
    // update/delete/list still throw on the staging proxy — never called here.
    await expect(staging.store.update({ envelope: { recordId: 'ANR-000001', schemaId: 'x', payload: {} } })).rejects.toThrow(/unavailable/i);
    await expect(staging.store.delete({ recordId: 'ANR-000001' })).rejects.toThrow(/unavailable/i);
    await expect(staging.store.list()).rejects.toThrow(/unavailable/i);
  });

  it('a failed staged create (Ajv/lint reject) yields a named diagnostic, nothing partial lands', async () => {
    // The staging proxy rejects the create on validation; the compile must
    // surface a NAMED diagnostic (the adapter turns it into the pipeline's
    // DRAFT_INVALID) and the staging Map must stay empty.
    const rejectingBacking = {
      get: (id: string) => stubStore.get(id),
      list: () => stubStore.list(),
      validate: async () => ({ valid: false, errors: [{ path: '/status', message: 'bad status' }] }),
      lint: async () => ({ valid: true }),
    } as unknown as RecordStore;
    const staging = stagingStore(rejectingBacking);
    const compiled = await compileAnalysisIntent(
      intent({ revision: { recordId: 'ANREV-000001' }, newRun: { title: 'Rejected run' } }),
      deps(staging.store),
      'USR-test',
    );
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.diagnostics.some((d) => d.code === 'STAGED_CREATE_REJECTED')).toBe(true);
    expect(staging.writes.size).toBe(0);
  });

  it('envelope pins: requestId tolerated; malformed envelopes are MALFORMED_ENVELOPE; XOR enforced in schema', async () => {
    expect(ANALYSIS_INTENT_SCHEMA_ID).toBe('https://computable-lab.com/schema/computable-lab/workflow/analysis-intent.schema.yaml');
    const good = await compileAnalysisIntent(intent({ run: { term: 'Seeded ROS run' } }), deps(), 'USR-test');
    expect(good.ok).toBe(true);
    const missingTarget = await compileAnalysisIntent({ operation: 'compose-analysis', requestId: 'DRAFT-pure-2' }, deps(), 'USR-test');
    expect(missingTarget.ok).toBe(false);
    if (missingTarget.ok) return;
    expect(missingTarget.diagnostics.some((d) => d.code === 'MALFORMED_ENVELOPE' && d.message.toLowerCase().includes('target'))).toBe(true);
    // XOR: both a revision target and a run target in one envelope is schema-invalid.
    const both = await compileAnalysisIntent({ operation: 'compose-analysis', requestId: 'DRAFT-pure-3', target: { revision: { recordId: 'ANREV-000001' }, run: { recordId: 'ANR-000001' } } }, deps(), 'USR-test');
    expect(both.ok).toBe(false);
    if (both.ok) return;
    expect(both.diagnostics.some((d) => d.code === 'MALFORMED_ENVELOPE')).toBe(true);
    // A smuggled sessionDocument is envelope-invalid.
    const smuggled = await compileAnalysisIntent({ operation: 'compose-analysis', requestId: 'DRAFT-pure-4', target: { run: { recordId: 'ANR-000001' } }, sessionDocument: { version: 1, tabs: [] } }, deps(), 'USR-test');
    expect(smuggled.ok).toBe(false);
  });

  it('exactOptionalPropertyTypes discipline: no undefined-valued keys in the staged payload', async () => {
    const staging = stagingStore(stubStore);
    const compiled = await compileAnalysisIntent(
      intent({ revision: { recordId: 'ANREV-000001' }, newRun: {} }),
      deps(staging.store),
      'USR-test',
    );
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const payload = [...staging.writes.values()][0]!.payload as Record<string, unknown>;
    // No title given → the compiler supplies a deterministic fallback title
    // derived from the resolved revision label; never an `undefined` value.
    expect(Object.values(payload).some((v) => v === undefined)).toBe(false);
    expect(payload.parameters === undefined).toBe(true);
    expect(payload.title).toBe('ROS mitochondrial flux analysis');
    expect(payload.status).toBe('queued');
  });
});
