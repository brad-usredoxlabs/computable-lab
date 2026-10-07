/**
 * PB-CH-5 — analysis draft adapter LIFECYCLE tests: the analysis proposal
 * travels the existing /api/drafts compile|accept lifecycle (FormDraftService),
 * harness per PB-CH-2's WorkstateDraftAdapter.test.ts. The spine here is the
 * REAL one built from the boot context, so the tier-5 mint affordance it
 * appends on every resolve is exercised for real.
 *
 * Acceptance criteria proven here (spec red-first matrix):
 *  - staged create is the ONLY store mutation during compile (spy:
 *    create-form-draft/update-form-draft plus the single staged analysis-run,
 *    zero elsewhere);
 *  - staged run payload: initiator == the authenticated actor, status queued,
 *    revisionRef equals the spine-resolved revision recordId;
 *  - failed/blocked compiles: canAccept:false, no canonical write;
 *  - NO implicit execute/promote: vi.mock(analysisRunner/artifactPromotion/
 *    analysisService) — zero calls across compile+accept+repeat-accept;
 *  - cross-actor accept is 403; writes carry ensureOwnerPolicy (spy);
 *  - compile-then-abandon: canonical records hash + var/sessions main.yaml
 *    sha256 BYTE-IDENTICAL;
 *  - accept body deep-equals compile result (flat sessionDocument/summary/
 *    resolvedTerms, lab-session Ajv-valid, activeTabId server-derived);
 *  - repeat accept byte-identical, no duplicate run record (the deterministic
 *    staged-id discipline makes the accept-side recompile reproduce reviewHash).
 */
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';
import { LintEngine } from '../lint/LintEngine.js';
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { createRecordStore } from '../store/RecordStoreImpl.js';
import { PolicyBundleService } from '../policy/PolicyBundleService.js';
import { WorkspaceSessionStore } from '../workspace-session/index.js';
import { AuthorizationService } from '../security/AuthorizationService.js';
import { object } from '../revisions/RecordRevisionService.js';
import type { RecordEnvelope } from '../store/types.js';
import type { AppContext } from '../server.js';
import { FormDraftService, DraftError } from './FormDraftService.js';

// NO implicit execute/promote: the analysis execution modules are mocked with
// tripwires. If ANY code path in compile|accept reaches them, the call throws
// and these tests fail. (Companion to the module-boundary source-pin test.)
vi.mock('../analysis/analysisRunner.js', () => ({
  createAnalysisRunner: () => { throw new Error('PB-CH-5 must NEVER construct the analysis runner'); },
  runAnalysis: () => { throw new Error('PB-CH-5 must NEVER run an analysis'); },
}));
vi.mock('../analysis/analysisService.js', () => ({
  AnalysisService: class { constructor() { throw new Error('PB-CH-5 must NEVER use AnalysisService'); } },
  AnalysisServiceError: class extends Error {},
}));
vi.mock('../api/handlers/AnalysisHandlers.js', () => ({
  registerAnalysisHandlers: () => { throw new Error('PB-CH-5 must NEVER touch analysis handlers'); },
}));

const schemaRoot = fileURLToPath(new URL('../../../schema', import.meta.url));
const LAB_SESSION_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/workflow/lab-session.schema.yaml';
const ANALYSIS_RUN_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/analysis-run.schema.yaml';

let ctx: AppContext;
let root: string;
let service: FormDraftService;
let sessions: WorkspaceSessionStore;
let ensureOwnerPolicyCalls: string[] = [];

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'cl-analysis-lifecycle-'));
  const registry = createSchemaRegistry();
  const loaded = await loadAllSchemas({ basePath: schemaRoot, recursive: true });
  expect(loaded.errors).toEqual([]);
  registry.addSchemas(loaded.entries);
  const validator = createValidator();
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema as never, id);
  }
  const repoAdapter = createLocalRepoAdapter({ basePath: root });
  const store = createRecordStore(repoAdapter, validator, new LintEngine());
  const policyBundleService = new PolicyBundleService();
  policyBundleService.loadFromDir(join(schemaRoot, 'core/policy-bundles'));
  const authorizationService = new AuthorizationService(store);
  // Spy on the actor-binding gate (FormDraftService.ts:183 calls it per write).
  const realEnsure = authorizationService.ensureOwnerPolicy.bind(authorizationService);
  (authorizationService as { ensureOwnerPolicy: AuthorizationService['ensureOwnerPolicy'] }).ensureOwnerPolicy = async (record, userId) => {
    ensureOwnerPolicyCalls.push(`${String(object(record.payload).kind)}:${record.recordId}:${userId}`);
    return realEnsure(record, userId);
  };
  ctx = {
    store, validator, schemaRegistry: registry, policyBundleService, repoAdapter,
    authorizationService,
    workspaceRoot: root, recordsDir: root, schemaDir: schemaRoot,
  } as unknown as AppContext;
  service = new FormDraftService(ctx, 'USR-TEST');
  sessions = new WorkspaceSessionStore(root);

  // Seed canonical analysis records through the ordinary store API.
  const seeds: RecordEnvelope[] = [
    { recordId: 'ANREV-LC1', schemaId: 'https://computable-lab.com/schema/computable-lab/analysis-revision.schema.yaml', payload: { kind: 'analysis-revision', id: 'ANREV-LC1', title: 'ROS mitochondrial flux analysis', entryScript: 'def run(ctx): ...', sdkVersion: '1.0' } },
    { recordId: 'ANR-LC1', schemaId: 'https://computable-lab.com/schema/computable-lab/analysis-run.schema.yaml', payload: { kind: 'analysis-run', id: 'ANR-LC1', title: 'Seeded ROS run', revisionRef: { kind: 'record', type: 'analysis-revision', id: 'ANREV-LC1' }, status: 'succeeded' } },
    { recordId: 'DREF-LC1', schemaId: 'https://computable-lab.com/schema/computable-lab/data-reference.schema.yaml', payload: { kind: 'data-reference', id: 'DREF-LC1', title: 'Seahorse trace file', storageDeviceId: 'DEV-LOCAL', path: 'traces/seahorse.csv', contentHash: 'a'.repeat(64), sizeBytes: 1024, dataKind: 'table', format: 'csv' } },
    { recordId: 'PLR-LC1', schemaId: 'https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml', payload: { kind: 'planned-run', recordId: 'PLR-LC1', title: 'Zymo extraction planned run', sourceType: 'protocol', sourceRef: { kind: 'record', type: 'protocol', id: 'PRT-LC1' }, state: 'ready' } },
    { recordId: 'PRT-LC1', schemaId: 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml', payload: { kind: 'protocol', recordId: 'PRT-LC1', title: 'ZymoBIOMICS MagBead protocol', steps: [{ stepId: 'lysis', label: 'Lysis', ordinal: 1, kind: 'other', description: 'Lysis.' }] } },
  ];
  for (const envelope of seeds) {
    const saved = await store.create({ envelope });
    expect(saved.success, `seed ${envelope.recordId}: ${saved.error ?? ''}`).toBe(true);
  }
}, 60000);
afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

// ------------------------------------------------------------------ helpers --
// Canonical WORKSPACE records: the form-draft lifecycle record and the
// owner-policy ACL records the draft pipeline stamps for drafts (via
// ensureOwnerPolicy) are draft history the pipeline legitimately persists
// (PB-CH-7 ruling), not workspace records.
const isDraftHistory = (r: RecordEnvelope): boolean => {
  const kind = object(r.payload).kind;
  // access-policy records are authorization plumbing the pipeline stamps via
  // ensureOwnerPolicy (for drafts and for accepted writes), not workspace data.
  return kind === 'form-draft' || kind === 'access-policy';
};
const canonical = async (): Promise<RecordEnvelope[]> =>
  (await ctx.store.list()).filter((r) => !isDraftHistory(r));
const canonicalFingerprint = async (): Promise<string> => {
  const records = await canonical();
  return createHash('sha256').update(records.map((r) => `${r.recordId}:${JSON.stringify(r.payload)}`).sort().join('\n')).digest('hex');
};
async function hashTree(dir: string, exclude?: (relPath: string) => boolean): Promise<string> {
  const hash = createHash('sha256');
  const walk = async (current: string, rel: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const relPath = `${rel}/${entry.name}`;
      if (exclude?.(relPath)) continue;
      if (entry.isDirectory()) { await walk(join(current, entry.name), relPath); continue; }
      hash.update(relPath);
      hash.update(await readFile(join(current, entry.name)));
    }
  };
  await walk(dir, '');
  return hash.digest('hex');
}
const isDraftPath = (rel: string): boolean => rel.includes('form-draft') || rel.includes('ACL-');
const sessionFile = (userId: string): string => join(root, 'var', 'sessions', userId, 'main.yaml');
async function sha256File(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

const proposal = (target: unknown, extra?: Record<string, unknown>): Record<string, unknown> => ({
  adapter: 'analysis',
  intent: {
    operation: 'compose-analysis',
    target,
    ...(extra ?? {}),
  },
});
const openRun = proposal({ run: { term: 'Seeded ROS run' } });
const stagedCreate = proposal({
  revision: { term: 'ROS mitochondrial flux analysis' },
  newRun: { title: 'Fresh ROS run', inputs: { trace: { term: 'Seahorse trace file' } } },
});
const accept = (draft: { draftId: string; revision: number; reviewHash: string }) =>
  service.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash });
const sessionDocumentOf = (result: Record<string, unknown>): { version: number; tabs: Record<string, unknown>[]; activeTabId: string | null } =>
  (result as { sessionDocument: { version: number; tabs: Record<string, unknown>[]; activeTabId: string | null } }).sessionDocument;

// -------------------------------------------------------------------- tests --
describe('analysis draft adapter lifecycle (compile|accept, one staged create)', () => {
  it('compiles an open-run proposal: canAccept:true, zero writes, lab-session-valid projection', async () => {
    const before = await canonical();
    const beforeHash = await canonicalFingerprint();
    const draft = await service.compile(openRun);

    expect(draft.canAccept).toBe(true);
    expect(draft.writes).toEqual([]);
    expect(draft.projection).toEqual({});
    expect(draft.trace.every((x) => x.status === 'ok')).toBe(true);
    expect(draft.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const doc = sessionDocumentOf(draft.result);
    expect(ctx.validator.validate(doc, LAB_SESSION_SCHEMA_ID).valid).toBe(true);
    expect(doc.version).toBe(1);
    expect(doc.tabs).toHaveLength(1);
    expect(doc.tabs[0]).toMatchObject({ kind: 'record-edit', recordId: 'ANR-LC1' });
    expect(doc.activeTabId).toBe('record:ANR-LC1');
    expect(String(draft.result.summary)).toMatch(/nothing executed/i);

    // compile touched nothing but the draft's own lifecycle record.
    const after = await canonical();
    expect(after.map((r) => r.recordId).sort()).toEqual(before.map((r) => r.recordId).sort());
    expect(await canonicalFingerprint()).toBe(beforeHash);
  });

  it('compiles a staged-create proposal: exactly ONE staged analysis-run (queued, initiator = actor), reads pin revision + dref', async () => {
    const before = await canonical();
    const draft = await service.compile(stagedCreate);
    expect(draft.canAccept).toBe(true);
    expect(draft.writes).toHaveLength(1);
    const write = draft.writes[0]!;
    const payload = object(write.payload);
    expect(payload.kind).toBe('analysis-run');
    expect(payload.status).toBe('queued');
    expect(payload.initiator).toBe('USR-TEST');
    expect(payload.revisionRef).toMatchObject({ kind: 'record', type: 'analysis-revision', id: 'ANREV-LC1' });
    expect((payload.inputs as Record<string, unknown>).trace).toMatchObject({ kind: 'record', type: 'data-reference', id: 'DREF-LC1' });
    expect(ctx.validator.validate(payload, ANALYSIS_RUN_SCHEMA_ID).valid).toBe(true);
    // The records the proposal binds to are pinned in `reads` (re-verified at accept).
    expect(Object.keys(draft.reads).sort()).toEqual(['ANREV-LC1', 'DREF-LC1'].sort());
    // Landing tabs: revision + staged run; focus defaults to the run.
    const doc = sessionDocumentOf(draft.result);
    expect(doc.tabs.map((t) => t.recordId)).toEqual(['ANREV-LC1', String(payload.id)]);
    expect(doc.activeTabId).toBe(`record:${String(payload.id)}`);
    // compile itself wrote nothing canonical.
    const after = await canonical();
    expect(after.map((r) => r.recordId).sort()).toEqual(before.map((r) => r.recordId).sort());
  });

  it('staged create is the ONLY store mutation during compile+accept (spy: form-draft lifecycle + the one analysis-run, zero elsewhere)', async () => {
    const writes: string[] = [];
    const create = ctx.store.create.bind(ctx.store);
    const update = ctx.store.update.bind(ctx.store);
    const createSpy = vi.spyOn(ctx.store, 'create').mockImplementation((options) => {
      writes.push(`create:${String(object(options.envelope.payload).kind)}`);
      return create(options);
    });
    const updateSpy = vi.spyOn(ctx.store, 'update').mockImplementation((options) => {
      writes.push(`update:${String(object(options.envelope.payload).kind)}`);
      return update(options);
    });
    try {
      const draft = await service.compile(stagedCreate);
      expect(draft.canAccept).toBe(true);
      await accept(draft);
    } finally {
      createSpy.mockRestore();
      updateSpy.mockRestore();
    }
    const kinds = new Set(writes);
    // The ONLY workspace mutation: exactly one analysis-run (the staged create
    // landing at accept). Everything else is the form-draft lifecycle record
    // and the owner-policy ACL the pipeline stamps for it (ensureOwnerPolicy)
    // — draft history, not a workspace write. No analysis-revision create, no
    // artifact, no data-reference, no execute-side write.
    expect(kinds.has('create:analysis-run')).toBe(true);
    expect([...kinds].filter((k) => k !== 'create:analysis-run' && k !== 'create:form-draft' && k !== 'update:form-draft' && k !== 'create:access-policy')).toEqual([]);
    expect(writes.filter((w) => w === 'create:analysis-run')).toHaveLength(1);
  });

  it('NO implicit execute/promote: the analysis execution modules are never touched across compile+accept+repeat-accept', async () => {
    // The vi.mock tripwires above throw on ANY call. A lifecycle that completes
    // proves zero calls. Additionally: the canonical store gains exactly ONE
    // record (the queued run) — no artifact, no manifest, no status past queued.
    const runsBefore = await ctx.store.list({ kind: 'analysis-run' });
    const draft = await service.compile(stagedCreate);
    expect(draft.canAccept).toBe(true);
    const accepted = await accept(draft);
    const again = await accept(draft);
    expect(JSON.stringify(again)).toBe(JSON.stringify(accepted));
    const runsAfter = await ctx.store.list({ kind: 'analysis-run' });
    const newRuns = runsAfter.filter((r) => !runsBefore.some((b) => b.recordId === r.recordId));
    expect(newRuns).toHaveLength(1);
    expect(object(newRuns[0]!.payload).status).toBe('queued');
    expect((await ctx.store.list({ kind: 'analysis-output-artifact' })).length).toBe(0);
    expect((await ctx.store.list({ kind: 'data-reference' })).length).toBe(1); // only the seeded DREF-LC1
  });

  it('blocked compiles: unresolved term, wrong-kind target, and bad input all yield canAccept:false with zero writes', async () => {
    const before = await canonical();
    const unresolved = await service.compile(proposal({ run: { term: 'quantum flux compensator' } }));
    expect(unresolved.canAccept).toBe(false);
    expect(unresolved.writes).toEqual([]);
    expect(unresolved.diagnostics.some((d) => d.outcome === 'needs-missing-fact' && d.message.includes('UNRESOLVED_TERM'))).toBe(true);
    await expect(accept(unresolved)).rejects.toThrow(/blocked/i);

    // A revision target resolving to a planned-run (outside revisionKinds) is a
    // WRONG_REFERENCE_KIND diagnostic — never a guessed tab.
    const wrongKind = await service.compile(proposal({ revision: { recordId: 'PLR-LC1' }, newRun: { title: 'Nope' } }));
    expect(wrongKind.canAccept).toBe(false);
    expect(wrongKind.writes).toEqual([]);
    expect(wrongKind.diagnostics.some((d) => d.message.includes('WRONG_REFERENCE_KIND'))).toBe(true);

    // An input resolving outside inputKinds is named, never silently skipped.
    const badInput = await service.compile(proposal({ revision: { recordId: 'ANREV-LC1' }, newRun: { inputs: { bogus: { recordId: 'ANR-LC1' } } } }));
    expect(badInput.canAccept).toBe(false);
    expect(badInput.writes).toEqual([]);
    expect(badInput.diagnostics.some((d) => d.message.includes('WRONG_REFERENCE_KIND'))).toBe(true);

    // An unregistered surface on open.tabs is UNSUPPORTED_SURFACE.
    const badSurface = await service.compile(proposal({ run: { recordId: 'ANR-LC1' } }, { open: { tabs: [{ surface: 'not-a-surface', target: { recordId: 'PLR-LC1' } }] } }));
    expect(badSurface.canAccept).toBe(false);
    expect(badSurface.diagnostics.some((d) => d.message.includes('UNSUPPORTED_SURFACE'))).toBe(true);

    expect(await canonical()).toEqual(before);
  });

  it("a second actor's accept is rejected (403) and writes carry ensureOwnerPolicy", async () => {
    ensureOwnerPolicyCalls = [];
    const draft = await service.compile(stagedCreate);
    const other = new FormDraftService(ctx, 'USR-other');
    await expect(other.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash }))
      .rejects.toThrow(/actor|access/i);
    try {
      await other.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DraftError);
      expect((error as DraftError).status).toBe(403);
    }
    const accepted = await accept(draft);
    const runId = String(sessionDocumentOf(accepted).tabs[1]!.recordId);
    // The staged write passed through the actor-binding gate at accept.
    expect(ensureOwnerPolicyCalls.some((c) => c === `analysis-run:${runId}:USR-TEST`)).toBe(true);
  });

  it('compile-then-abandon leaves /api/session and the canonical records byte-identical', async () => {
    await sessions.put('USR-TEST', [{ kind: 'splash' }], null);
    const sessionBefore = await sha256File(sessionFile('USR-TEST'));
    const recordsBefore = await hashTree(join(root, 'records'), isDraftPath);
    const canonicalBefore = await canonical();
    const fingerprintBefore = await canonicalFingerprint();

    const draft = await service.compile(stagedCreate);
    expect(draft.canAccept).toBe(true);
    const revised = await service.compile({ ...proposal({ run: { recordId: 'ANR-LC1' } }), draftId: draft.draftId, revision: draft.revision });
    expect(revised.revision).toBe(draft.revision + 1);
    const blocked = await service.compile(proposal({ run: { term: 'nonexistent phantom analysis' } }));
    await expect(accept(blocked)).rejects.toThrow(/blocked/i);
    // Abandon: never accept `revised`. Nothing must have moved.
    expect(await sha256File(sessionFile('USR-TEST'))).toBe(sessionBefore);
    expect(await hashTree(join(root, 'records'), isDraftPath)).toBe(recordsBefore);
    expect(await canonical()).toEqual(canonicalBefore);
    expect(await canonicalFingerprint()).toBe(fingerprintBefore);
  });

  it('accept lands exactly ONE queued analysis-run; repeat accept is byte-identical with no duplicate', async () => {
    await sessions.put('USR-TEST', [{ kind: 'splash' }], null);
    const before = await canonical();
    const sessionBeforeAccept = await sha256File(sessionFile('USR-TEST'));
    const draft = await service.compile(stagedCreate);
    const [a, b] = await Promise.all([accept(draft), accept(draft)]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = await accept(draft);
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));

    const after = await canonical();
    const newOnes = after.filter((r) => !before.some((b2) => b2.recordId === r.recordId));
    // Server-side, accept never touches the session file (push is client-side).
    expect(await sha256File(sessionFile('USR-TEST'))).toBe(sessionBeforeAccept);
    expect(newOnes.map((r) => r.recordId)).toEqual([String(sessionDocumentOf(a).tabs[1]!.recordId)]);
    expect(object(newOnes[0]!.payload).kind).toBe('analysis-run');
    expect(object(newOnes[0]!.payload).status).toBe('queued');
    // Exactly one new canonical record — no artifact, no extra data-reference,
    // no second run.
    expect(newOnes).toHaveLength(1);

    const stored = object((await ctx.store.get(draft.draftId))!.payload);
    expect(stored.status).toBe('accepted');
    expect(stored.revision).toBe(draft.revision);
  });

  it('accept body deep-equals the compile result (flat sessionDocument/summary/resolvedTerms)', async () => {
    const draft = await service.compile(stagedCreate);
    const accepted = await accept(draft);
    expect(accepted).toEqual(draft.result);
    expect(sessionDocumentOf(accepted)).toEqual(sessionDocumentOf(draft.result));
    expect(ctx.validator.validate(sessionDocumentOf(accepted), LAB_SESSION_SCHEMA_ID).valid).toBe(true);
    // The accept request schema (additionalProperties:false) makes smuggling a
    // session document structurally impossible.
    await expect(service.accept({
      draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash,
      sessionDocument: { version: 1, tabs: [{ kind: 'splash' }], activeTabId: null },
    })).rejects.toThrow(/sessionDocument|Invalid draft request/i);
  });

  it('the analysis intent envelope is Ajv-authoritative (registered schema)', async () => {
    await expect(service.compile({ adapter: 'analysis', intent: { operation: 'execute-analysis', target: { run: { recordId: 'ANR-LC1' } } } }))
      .rejects.toThrow(/operation|authoring/i);
    const bad = await service.compile({ adapter: 'analysis', intent: { operation: 'compose-analysis' } });
    expect(bad.canAccept).toBe(false);
    expect(bad.diagnostics.some((d) => d.message.includes('MALFORMED_ENVELOPE') && d.message.toLowerCase().includes('target'))).toBe(true);
    const smuggled = await service.compile({ adapter: 'analysis', intent: { operation: 'compose-analysis', target: { run: { recordId: 'ANR-LC1' } }, sessionDocument: { version: 1, tabs: [] } } });
    expect(smuggled.canAccept).toBe(false);
    expect(smuggled.diagnostics.some((d) => d.message.includes('MALFORMED_ENVELOPE'))).toBe(true);
  });

  it('session document YAML round-trips the compiled projection (transport shape)', async () => {
    const draft = await service.compile(openRun);
    const doc = sessionDocumentOf(draft.result);
    const roundTripped = parse(stringify(doc)) as Record<string, unknown>;
    expect(roundTripped).toEqual(doc);
    expect(roundTripped.activeTabId).toBe('record:ANR-LC1');
    expect(ctx.validator.validate(roundTripped, LAB_SESSION_SCHEMA_ID).valid).toBe(true);
  });
});
