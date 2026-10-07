/**
 * PB-CH-2 — workstate adapter LIFECYCLE tests: the tier-2 proposal travels the
 * existing /api/drafts compile|accept lifecycle (FormDraftService), harness per
 * FormDraftService.test.ts:17-25. The spine here is the REAL one built from
 * the boot context (createResolveSpineFromContext), so the tier-5 mint
 * affordance it appends on every resolve is exercised for real.
 *
 * Acceptance criteria proven here: valid projection-only compile (zero writes,
 * canonical set-equality); unresolved tab target => diagnostic; invalid
 * activeTabId ref; cross-actor accept rejected; reject/abandon changes nothing
 * (/api/session bytes + canonical records byte-identical); repeat-accept not
 * duplicated; accept returns the authoritative compiled projection and the
 * client cannot resubmit its own document.
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
import { object } from '../revisions/RecordRevisionService.js';
import type { RecordEnvelope } from '../store/types.js';
import type { AppContext } from '../server.js';
import { FormDraftService, DraftError } from './FormDraftService.js';

const schemaRoot = fileURLToPath(new URL('../../../schema', import.meta.url));
const LAB_SESSION_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/workflow/lab-session.schema.yaml';

let ctx: AppContext;
let root: string;
let service: FormDraftService;
let sessions: WorkspaceSessionStore;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'cl-workstate-lifecycle-'));
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
  ctx = {
    store, validator, schemaRegistry: registry, policyBundleService, repoAdapter,
    workspaceRoot: root, recordsDir: root, schemaDir: schemaRoot,
  } as unknown as AppContext;
  service = new FormDraftService(ctx, 'USR-test');
  sessions = new WorkspaceSessionStore(root);

  // Seed canonical workspace records through the ordinary store API.
  const seeds: RecordEnvelope[] = [
    { recordId: 'PLR-WST1', schemaId: 'https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml', payload: { kind: 'planned-run', recordId: 'PLR-WST1', title: 'ZymoBIOMICS extraction run', sourceType: 'protocol', sourceRef: { kind: 'record', type: 'protocol', id: 'PRT-WST1' }, state: 'ready' } },
    { recordId: 'PRT-WST1', schemaId: 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml', payload: { kind: 'protocol', recordId: 'PRT-WST1', title: 'ZymoBIOMICS MagBead protocol', steps: [{ stepId: 'lysis', label: 'Lysis', ordinal: 1, kind: 'other', description: 'Lysis of the pelleted sample.' }] } },
    { recordId: 'STU-WST1', schemaId: 'https://computable-lab.com/schema/computable-lab/study.schema.yaml', payload: { kind: 'study', recordId: 'STU-WST1', title: 'Microbiome direct detection', shortSlug: 'microbiome-direct-detection' } },
    { recordId: 'BUD-WST1', schemaId: 'https://computable-lab.com/schema/computable-lab/budget.schema.yaml', payload: { kind: 'budget', recordId: 'BUD-WST1', title: 'MagBead reagent budget', sourceType: 'manual', sourceRef: { kind: 'record', type: 'study', id: 'STU-WST1' }, state: 'draft' } },
  ];
  for (const envelope of seeds) {
    const saved = await store.create({ envelope });
    expect(saved.success, `seed ${envelope.recordId}: ${saved.error ?? ''}`).toBe(true);
  }
}, 60000);
afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

// ------------------------------------------------------------------ helpers --
const canonical = async (): Promise<RecordEnvelope[]> =>
  (await ctx.store.list()).filter((r) => object(r.payload).kind !== 'form-draft');
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
/** Canonical records only: the form-draft lifecycle store is draft history the
 *  pipeline legitimately persists (PB-CH-7 ruling), not a workspace record. */
const isDraftPath = (rel: string): boolean => rel.includes('form-draft');
const sessionFile = (userId: string): string => join(root, 'var', 'sessions', userId, 'main.yaml');
async function sha256File(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

const proposal = (tabs: unknown[], activeTab?: unknown): Record<string, unknown> => ({
  adapter: 'workstate',
  intent: {
    operation: 'compose-workstate',
    tabs,
    ...(activeTab !== undefined ? { activeTab } : {}),
  },
});
const runTab = { surface: 'run-plan', target: { term: 'ZymoBIOMICS extraction run' } };
const protoTab = { surface: 'protocol-review', target: { term: 'ZymoBIOMICS MagBead protocol' } };
const accept = (draft: { draftId: string; revision: number; reviewHash: string }) =>
  service.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash });
const sessionDocumentOf = (result: Record<string, unknown>): { version: number; tabs: Record<string, unknown>[]; activeTabId: string | null } => {
  const doc = (result as { sessionDocument: { version: number; tabs: Record<string, unknown>[]; activeTabId: string | null } }).sessionDocument;
  return doc;
};

// -------------------------------------------------------------------- tests --
describe('workstate draft adapter lifecycle (compile|accept, projection-only)', () => {
  it('compiles a proposal to a schema-valid version:1 session document with zero writes', async () => {
    const before = await canonical();
    const beforeHash = await canonicalFingerprint();
    const draft = await service.compile(proposal([runTab, protoTab], { index: 0 }));

    expect(draft.canAccept).toBe(true);
    expect(draft.writes).toEqual([]);
    expect(draft.projection).toEqual({});
    expect(draft.trace.every((x) => x.status === 'ok')).toBe(true);
    expect(draft.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const doc = sessionDocumentOf(draft.result);
    expect(ctx.validator.validate(doc, LAB_SESSION_SCHEMA_ID).valid).toBe(true);
    expect(doc.version).toBe(1);
    expect(doc.tabs).toHaveLength(2);
    expect(doc.tabs[0]).toMatchObject({ kind: 'run', runId: 'PLR-WST1' });
    expect(doc.tabs[1]).toMatchObject({ kind: 'record-edit', recordId: 'PRT-WST1' });
    expect(doc.activeTabId).toBe('run:PLR-WST1');

    // compile touched nothing but the draft's own lifecycle record.
    const after = await canonical();
    expect(after.map((r) => r.recordId).sort()).toEqual(before.map((r) => r.recordId).sort());
    expect(await canonicalFingerprint()).toBe(beforeHash);
  });

  it('workstate compile stages nothing: no store.create/store.update for any non-draft record', async () => {
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
      const draft = await service.compile(proposal([runTab], { index: 0 }));
      expect(draft.canAccept).toBe(true);
      await accept(draft);
    } finally {
      createSpy.mockRestore();
      updateSpy.mockRestore();
    }
    // The ONLY store mutations are the form-draft lifecycle record itself.
    expect(new Set(writes)).toEqual(new Set(['create:form-draft', 'update:form-draft']));
    expect(writes.some((w) => !w.endsWith(':form-draft'))).toBe(false);
  });

  it('unresolvable tab term yields a needs-missing-fact diagnostic and canAccept:false', async () => {
    const before = await canonical();
    const draft = await service.compile(proposal([{ surface: 'run-plan', target: { term: 'quantum flux compensator' } }]));
    expect(draft.canAccept).toBe(false);
    expect(draft.writes).toEqual([]);
    expect(draft.diagnostics.some((d) => d.outcome === 'needs-missing-fact' && d.message.includes('UNRESOLVED_TERM'))).toBe(true);
    // The spine's tier-5 mint affordance was appended by the real spine and
    // rejected: the diagnostic says nothing resolved.
    expect(draft.diagnostics.some((d) => d.message.includes('did not resolve'))).toBe(true);
    await expect(accept(draft)).rejects.toThrow(/blocked/i);
    expect(await canonical()).toEqual(before);
  });

  it('invalid activeTab reference yields ACTIVE_TAB_UNRESOLVED and blocks accept', async () => {
    const draft = await service.compile(proposal([runTab], { term: 'Microbiome direct detection' }));
    expect(draft.canAccept).toBe(false);
    expect(draft.diagnostics.some((d) => d.message.includes('ACTIVE_TAB_UNRESOLVED'))).toBe(true);
    await expect(accept(draft)).rejects.toThrow(/blocked/i);
    const invented = await service.compile(proposal([runTab], { recordId: 'STU-invented-77' }));
    expect(invented.canAccept).toBe(false);
    expect(invented.diagnostics.some((d) => d.message.includes('UNKNOWN_RECORD'))).toBe(true);
  });

  it('unmappable record kind yields a diagnostic (no TS kind branch)', async () => {
    // A REAL record whose kind has no entry in workstate-tab-kinds.yaml.
    const draft = await service.compile(proposal([{ surface: 'knowledge', target: { recordId: 'BUD-WST1' } }]));
    expect(draft.canAccept).toBe(false);
    expect(draft.diagnostics.some((d) => d.message.includes('UNMAPPABLE_RECORD_KIND') && d.message.includes('budget'))).toBe(true);
  });

  it("a second actor's accept is rejected (403, draft access restricted to its actor)", async () => {
    const draft = await service.compile(proposal([runTab, protoTab], { index: 0 }));
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
    // The other actor cannot even read the draft to compile a revision of it.
    await expect(other.compile({ ...proposal([runTab], { index: 0 }), draftId: draft.draftId, revision: draft.revision }))
      .rejects.toThrow(/actor|access/i);
  });

  it('compile-then-abandon leaves /api/session and the canonical records byte-identical', async () => {
    // Seed the user's persisted workspace session (the /api/session document).
    await sessions.put('USR-test', [{ kind: 'splash' }], null);
    const sessionBefore = await sha256File(sessionFile('USR-test'));
    const recordsBefore = await hashTree(join(root, 'records'), isDraftPath);
    const canonicalBefore = await canonical();
    const fingerprintBefore = await canonicalFingerprint();

    const draft = await service.compile(proposal([runTab, protoTab], { index: 0 }));
    expect(draft.canAccept).toBe(true);
    // A revision recompile, then a blocked accept on the stale revision — the
    // "reject" path today is compile-only + abandon (no reject endpoint).
    const revised = await service.compile({ ...proposal([runTab], { index: 0 }), draftId: draft.draftId, revision: draft.revision });
    expect(revised.revision).toBe(draft.revision + 1);
    const blocked = await service.compile(proposal([{ surface: 'run-plan', target: { term: 'nonexistent phantom run' } }]));
    await expect(accept(blocked)).rejects.toThrow(/blocked/i);
    // Abandon: never accept `revised`. Nothing must have moved.
    expect(await sha256File(sessionFile('USR-test'))).toBe(sessionBefore);
    expect(await hashTree(join(root, 'records'), isDraftPath)).toBe(recordsBefore);
    expect(await canonical()).toEqual(canonicalBefore);
    expect(await canonicalFingerprint()).toBe(fingerprintBefore);
  });

  it('accept twice (and concurrently) returns byte-identical results without duplicating anything', async () => {
    const before = await canonical();
    const fingerprintBefore = await canonicalFingerprint();
    const draft = await service.compile(proposal([runTab, protoTab], { index: 0 }));

    const [a, b] = await Promise.all([accept(draft), accept(draft)]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = await accept(draft);
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));

    const after = await canonical();
    expect(after.map((r) => r.recordId).sort()).toEqual(before.map((r) => r.recordId).sort());
    expect(await canonicalFingerprint()).toBe(fingerprintBefore);

    const stored = object((await ctx.store.get(draft.draftId))!.payload);
    expect(stored.status).toBe('accepted');
    expect(stored.revision).toBe(draft.revision);
  });

  it('accept returns the authoritative compiled projection; the client cannot resubmit its own document', async () => {
    const draft = await service.compile(proposal([runTab, protoTab], { index: 0 }));
    const accepted = await accept(draft);
    expect(accepted).toEqual(draft.result);
    expect(sessionDocumentOf(accepted)).toEqual(sessionDocumentOf(draft.result));

    // The accept request schema (additionalProperties:false) makes smuggling a
    // session document structurally impossible.
    await expect(service.accept({
      draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash,
      sessionDocument: { version: 1, tabs: [{ kind: 'splash' }], activeTabId: null },
    })).rejects.toThrow(/sessionDocument|Invalid draft request/i);
  });

  it('revisions recompile through the existing draftId+revision path', async () => {
    const first = await service.compile(proposal([runTab], { index: 0 }));
    const second = await service.compile({ ...proposal([protoTab], { index: 0 }), draftId: first.draftId, revision: first.revision });
    expect(second.draftId).toBe(first.draftId);
    expect(second.revision).toBe(first.revision + 1);
    expect(second.reviewHash).not.toBe(first.reviewHash);
    expect(sessionDocumentOf(second.result).tabs[0]).toMatchObject({ kind: 'record-edit', recordId: 'PRT-WST1' });
    const accepted = await accept(second);
    expect(sessionDocumentOf(accepted).activeTabId).toBe('record:PRT-WST1');
    // A stale reviewHash is rejected.
    await expect(accept(first)).rejects.toThrow(/changed|stale/i);
  });

  it('the workstate intent envelope is Ajv-authoritative (registered schema)', async () => {
    // Unknown verb: rejected by the generic operations gate (adapters.yaml).
    await expect(service.compile({ adapter: 'workstate', intent: { operation: 'push-workstate', tabs: [runTab] } }))
      .rejects.toThrow(/operation|authoring/i);
    // Malformed envelope: the registered workstate-intent schema names the path.
    const bad = await service.compile({ adapter: 'workstate', intent: { operation: 'compose-workstate', tabs: [] } });
    expect(bad.canAccept).toBe(false);
    expect(bad.diagnostics.some((d) => d.message.includes('MALFORMED_ENVELOPE') && d.message.includes('tabs'))).toBe(true);
    // A smuggled top-level sessionDocument in the intent is envelope-invalid.
    const smuggled = await service.compile({ adapter: 'workstate', intent: { operation: 'compose-workstate', tabs: [runTab], sessionDocument: { version: 1, tabs: [] } } });
    expect(smuggled.canAccept).toBe(false);
    expect(smuggled.diagnostics.some((d) => d.message.includes('MALFORMED_ENVELOPE'))).toBe(true);
  });

  it('the compiled projection is persisted only inside the actor-bound form-draft record (no journal widening)', async () => {
    const draft = await service.compile(proposal([runTab], { index: 0 }));
    await accept(draft);
    const stored = object((await ctx.store.get(draft.draftId))!.payload);
    expect(stored.kind).toBe('form-draft');
    expect(stored.actor).toBe('USR-test');
    expect((stored.compiled as Record<string, unknown>).result).toMatchObject({ sessionDocument: { version: 1 } });
    // No var/sessions/**/journal capture anywhere under the workspace root.
    const varDir = join(root, 'var');
    const entries = await readdir(varDir, { recursive: true });
    expect(entries.some((e) => String(e).includes('journal'))).toBe(false);
    expect(entries.map(String).filter((e) => e.startsWith('sessions'))).toEqual(['sessions', 'sessions/USR-test', 'sessions/USR-test/main.yaml']);
  });

  it('session document YAML round-trips the compiled projection (transport shape)', async () => {
    const draft = await service.compile(proposal([runTab, protoTab], { term: 'ZymoBIOMICS extraction run' }));
    const doc = sessionDocumentOf(draft.result);
    const roundTripped = parse(stringify(doc)) as Record<string, unknown>;
    expect(roundTripped).toEqual(doc);
    expect(roundTripped.activeTabId).toBe('run:PLR-WST1');
    expect(ctx.validator.validate(roundTripped, LAB_SESSION_SCHEMA_ID).valid).toBe(true);
  });
});
