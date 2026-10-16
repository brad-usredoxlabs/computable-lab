/**
 * QMS7-7 — the `record-drafting` draft adapter LIFECYCLE tests: an AI-proposed
 * training document travels the EXISTING /api/drafts compile|accept lifecycle
 * (FormDraftService), harness per PB-CH-5's AnalysisDraftAdapter.test.ts.
 *
 * Acceptance criteria proven here (spec QMS7-7 matrix, component layer):
 *  - AC-1: a well-formed intent compiles canAccept:true; the card field list
 *    carries the training-material.ui.yaml LABELS (projection vocabulary, not
 *    TS literals) and the schema-enum vocabulary for the select value;
 *  - AC-2: compile stages exactly ONE write in the in-memory staging map and
 *    the backing store gains ZERO training-material records before accept;
 *  - AC-3: abandon (reject is client-side, zero fetches) leaves the canonical
 *    record set byte-identical;
 *  - AC-4: accept writes EXACTLY ONE envelope; the payload carries NO
 *    state/status field (the draft-ness is the read-side lifecycle fallback —
 *    LifecycleHandlers.ts:53 + document-control initial:true), lifecycleId
 *    equals the schema const, provenance fields match the POST /records
 *    handler's field set (OQ-2 ruling); the form-draft record retained with
 *    status 'accepted' + verbatim intent + actor IS the attribution trail;
 *    repeat-accept does not duplicate;
 *  - AC-5: an intent smuggling state/lifecycleId/approval fields is rejected
 *    by the envelope's own schema shape → canAccept:false, NO accept path,
 *    accept on a blocked draft throws DraftError and writes nothing;
 *  - AC-6: malformed intents (missing materialType, unknown kind, unevaluated
 *    extra field, bad materialType enum value) → canAccept:false with
 *    readable path-named diagnostics and ZERO canonical writes;
 *  - the staged id is derived from the schema's DECLARED properties.id.pattern
 *    (AS-ORCH-L1-122: derive, never a prefix table) and is deterministic so
 *    the accept-side recompile reproduces the reviewHash.
 *
 * RED-first: at base the adapter is unregistered — compile throws
 * DraftError('Unknown form draft adapter.') (FormDraftService.ts:65).
 */
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';
import { LintEngine } from '../lint/LintEngine.js';
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { createRecordStore } from '../store/RecordStoreImpl.js';
import { PolicyBundleService } from '../policy/PolicyBundleService.js';
import { AuthorizationService } from '../security/AuthorizationService.js';
import { createUISpecLoader, loadAllUISpecs } from '../ui/UISpecLoader.js';
import { object } from '../revisions/RecordRevisionService.js';
import type { RecordEnvelope } from '../store/types.js';
import type { AppContext } from '../server.js';
import { FormDraftService, DraftError } from './FormDraftService.js';

const schemaRoot = fileURLToPath(new URL('../../../schema', import.meta.url));
const TRAINING_MATERIAL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/training-material.schema.yaml';
const LAB_SESSION_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/workflow/lab-session.schema.yaml';

let ctx: AppContext;
let root: string;
let service: FormDraftService;
let ensureOwnerPolicyCalls: string[] = [];

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'cl-record-draft-lifecycle-'));
  const registry = createSchemaRegistry();
  const loaded = await loadAllSchemas({ basePath: schemaRoot, recursive: true });
  expect(loaded.errors).toEqual([]);
  registry.addSchemas(loaded.entries);
  const validator = createValidator();
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema as never, id);
  }
  const uiSpecLoader = createUISpecLoader();
  await loadAllUISpecs(uiSpecLoader, schemaRoot);
  const repoAdapter = createLocalRepoAdapter({ basePath: root });
  const store = createRecordStore(repoAdapter, validator, new LintEngine());
  const policyBundleService = new PolicyBundleService();
  policyBundleService.loadFromDir(join(schemaRoot, 'core/policy-bundles'));
  const authorizationService = new AuthorizationService(store);
  const realEnsure = authorizationService.ensureOwnerPolicy.bind(authorizationService);
  (authorizationService as { ensureOwnerPolicy: AuthorizationService['ensureOwnerPolicy'] }).ensureOwnerPolicy = async (record, userId) => {
    ensureOwnerPolicyCalls.push(`${String(object(record.payload).kind)}:${record.recordId}:${userId}`);
    return realEnsure(record, userId);
  };
  ctx = {
    store, validator, schemaRegistry: registry, policyBundleService, repoAdapter,
    uiSpecLoader, authorizationService,
    workspaceRoot: root, recordsDir: root, schemaDir: schemaRoot,
  } as unknown as AppContext;
  service = new FormDraftService(ctx, 'USR-QMS-TEST');
}, 60000);
afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

// ------------------------------------------------------------------ helpers --
const canonical = async (): Promise<RecordEnvelope[]> =>
  (await ctx.store.list()).filter((r) => object(r.payload).kind !== 'form-draft');
const trainingMaterials = async (): Promise<RecordEnvelope[]> =>
  (await canonical()).filter((r) => object(r.payload).kind === 'training-material');
const canonicalFingerprint = async (): Promise<string> => {
  const records = await canonical();
  return createHash('sha256').update(records.map((r) => `${r.recordId}:${JSON.stringify(r.payload)}`).sort().join('\n')).digest('hex');
};

const INTENT = {
  operation: 'compose-record',
  kind: 'training-material',
  fields: {
    title: 'Pipetting safety basics',
    materialType: 'slide_deck',
    notes: 'Dispose tips in the sharps bin; never pipette by mouth.',
  },
};
const proposal = (intent: Record<string, unknown>): Record<string, unknown> => ({ adapter: 'record-drafting', intent });
const accept = (draft: { draftId: string; revision: number; reviewHash: string }) =>
  service.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash });

/** The ui-v1 labels the card MUST carry (read from the YAML, never literals). */
async function uiLabels(): Promise<Map<string, { label: string; options?: Array<{ value: string; label: string }> }>> {
  const raw = parse(await readFile(join(schemaRoot, 'lab/training-material.ui.yaml'), 'utf8')) as {
    form: { sections: Array<{ fields: Array<{ path: string; label: string; options?: Array<{ value: string; label: string }> }> }> };
  };
  const map = new Map<string, { label: string; options?: Array<{ value: string; label: string }> }>();
  for (const section of raw.form.sections) {
    for (const field of section.fields) {
      map.set(field.path, { label: field.label, ...(field.options ? { options: field.options } : {}) });
    }
  }
  return map;
}

describe('record-drafting adapter — compile→accept lifecycle (QMS7-7)', () => {
  it('AC-1: a well-formed intent compiles canAccept:true with the ui-v1 label vocabulary on the card field list', async () => {
    const compiled = await service.compile(proposal(INTENT));
    expect(compiled.canAccept, compiled.diagnostics.map((d) => d.message).join('; ')).toBe(true);
    const result = compiled.result as {
      summary?: unknown;
      recordId?: unknown;
      recordFields?: Array<{ label: unknown; value: unknown }>;
      sessionDocument?: { version: unknown; tabs: Array<Record<string, unknown>>; activeTabId: unknown };
    };
    // The staged id is derived from the schema's declared ^TRM- pattern.
    expect(typeof result.recordId).toBe('string');
    expect(String(result.recordId)).toMatch(/^TRM-[A-Z0-9][A-Z0-9_-]*$/);
    // Field labels come from training-material.ui.yaml (projection vocabulary).
    const labels = await uiLabels();
    const fields = result.recordFields ?? [];
    const byLabel = new Map(fields.map((f) => [String(f.label), String(f.value)]));
    expect(byLabel.get(labels.get('$.title')!.label)).toBe('Pipetting safety basics');
    // The select value renders with the ui option label for the schema enum value.
    expect(byLabel.get(labels.get('$.materialType')!.label)).toBe('Slide Deck');
    expect(byLabel.get(labels.get('$.notes')!.label)).toContain('sharps bin');
    // Landing tab: the DECLARATIVE workstate-tab-kinds mapping (record-edit),
    // server-derived activeTabId (never model-named).
    expect(result.sessionDocument?.version).toBe(1);
    expect(result.sessionDocument?.tabs[0]?.kind).toBe('record-edit');
    expect(result.sessionDocument?.tabs[0]?.recordId).toBe(result.recordId);
    expect(result.sessionDocument?.activeTabId).toBe(`record:${String(result.recordId)}`);
    expect(typeof result.summary).toBe('string');
  });

  it('AC-2: compile stages exactly one write and the backing store gains ZERO training-material records', async () => {
    const before = await trainingMaterials();
    expect(before.length).toBe(0);
    const compiled = await service.compile(proposal(INTENT));
    expect(compiled.writes.length).toBe(1);
    expect(object(compiled.writes[0]!.payload).kind).toBe('training-material');
    // Staging writes are in-memory only: the backing store sees nothing.
    expect((await trainingMaterials()).length).toBe(0);
    const backing = await ctx.store.get(String((compiled.result as { recordId: string }).recordId));
    expect(backing).toBeNull();
    // Only the form-draft history record is durable (by design — the attribution trail).
    const drafts = (await ctx.store.list()).filter((r) => object(r.payload).kind === 'form-draft');
    expect(drafts.length).toBeGreaterThanOrEqual(1);
  });

  it('AC-3: abandon after compile changes nothing (canonical set byte-identical)', async () => {
    const fpBefore = await canonicalFingerprint();
    const compiled = await service.compile(proposal({ ...INTENT, fields: { ...INTENT.fields, title: 'Abandoned proposal' } }));
    expect(compiled.canAccept).toBe(true);
    // Reject is client-side (zero fetches): server-side, the draft simply
    // stays in 'review' and nothing canonical moves.
    expect(await canonicalFingerprint()).toBe(fpBefore);
    expect((await trainingMaterials()).length).toBe(0);
  });

  it('AC-4: accept writes EXACTLY ONE governed DRAFT envelope — no state field, schema-const lifecycleId, handler-identical provenance, attribution retained', async () => {
    const compiled = await service.compile(proposal(INTENT));
    const recordId = (compiled.result as { recordId: string }).recordId;
    const idsBefore = new Set((await canonical()).map((r) => r.recordId));
    const body = await accept(compiled);
    const trms = await trainingMaterials();
    expect(trms.length).toBe(1);
    const env = trms[0]!;
    expect(env.recordId).toBe(recordId);
    expect(env.schemaId).toBe(TRAINING_MATERIAL_SCHEMA_ID);
    const payload = object(env.payload);
    // CRITICAL correction pinned: NO state/status field leaked into the payload.
    expect(payload.state).toBeUndefined();
    expect(payload.status).toBeUndefined();
    // lifecycleId consistent with the schema const (read from the schema, not a literal).
    const entry = ctx.schemaRegistry.getById(TRAINING_MATERIAL_SCHEMA_ID);
    const declaredLifecycle = (entry!.schema as { properties?: { lifecycleId?: { const?: unknown } } }).properties?.lifecycleId?.const;
    expect(payload.lifecycleId).toBe(declaredLifecycle);
    // The lifecycle READ (LifecycleHandlers.ts:53 fallback) reads 'draft'.
    const lifecycleState = String(payload.state ?? payload.status ?? 'draft');
    expect(lifecycleState).toBe('draft');
    // OQ-2: field-identical provenance to a POST /records create.
    expect(payload.createdBy).toBe('USR-QMS-TEST');
    expect(typeof payload.createdAt).toBe('string');
    expect(typeof payload.updatedAt).toBe('string');
    expect(payload.title).toBe('Pipetting safety basics');
    expect(payload.materialType).toBe('slide_deck');
    // Owner policy ran on the accepted write.
    expect(ensureOwnerPolicyCalls).toContain(`training-material:${recordId}:USR-QMS-TEST`);
    // Attribution: the form-draft record IS the proposal provenance.
    const draftEnv = await ctx.store.get(compiled.draftId);
    expect(draftEnv).not.toBeNull();
    const draft = object(draftEnv!.payload);
    expect(draft.status).toBe('accepted');
    expect(draft.actor).toBe('USR-QMS-TEST');
    expect(object(draft.input).adapter).toBe('record-drafting');
    expect(object(draft.input).intent).toEqual(INTENT);
    // The accept body deep-equals the compile result (client can never resubmit).
    expect(body).toEqual(compiled.result);
    // Exactly one new canonical record — no revision/audit detritus.
    const added = (await canonical()).filter((r) => !idsBefore.has(r.recordId));
    expect(added.map((r) => r.recordId)).toEqual([recordId]);
    // Repeat accept: idempotent, no duplicate record (deterministic staged id).
    const again = await accept(compiled);
    expect(again).toEqual(compiled.result);
    expect((await trainingMaterials()).length).toBe(1);
  });

  it('AC-5: an intent smuggling state/lifecycleId/approval is envelope-rejected — blocked card, no accept path, zero writes', async () => {
    const smuggled = {
      operation: 'compose-record',
      kind: 'training-material',
      fields: { title: 'Signed SOP', materialType: 'sop', state: 'approved', lifecycleId: 'registry-ops' },
    };
    const compiled = await service.compile(proposal(smuggled));
    expect(compiled.canAccept).toBe(false);
    expect(compiled.diagnostics.length).toBeGreaterThan(0);
    expect(compiled.diagnostics.every((d) => d.message.length > 0)).toBe(true);
    expect(compiled.writes.length).toBe(0);
    await expect(accept(compiled)).rejects.toThrow(DraftError);
    await expect(accept(compiled)).rejects.toThrow(/blocked/i);
    expect((await trainingMaterials()).length).toBe(0);
  });

  it('AC-6: malformed model output → canAccept:false with readable diagnostics and ZERO writes', async () => {
    const cases: Array<{ label: string; intent: Record<string, unknown>; expectPath: string }> = [
      { label: 'missing materialType', intent: { operation: 'compose-record', kind: 'training-material', fields: { title: 'No type' } }, expectPath: 'fields' },
      { label: 'unknown kind', intent: { operation: 'compose-record', kind: 'training-unicorn', fields: { title: 'Ghost', materialType: 'sop' } }, expectPath: 'kind' },
      { label: 'unevaluated extra field', intent: { operation: 'compose-record', kind: 'training-material', fields: { title: 'Extra', materialType: 'sop', signatureRefs: ['SIG-1'] } }, expectPath: 'fields' },
      { label: 'bad enum value', intent: { operation: 'compose-record', kind: 'training-material', fields: { title: 'Bad type', materialType: 'interpretive-dance' } }, expectPath: 'materialType' },
      { label: 'missing title', intent: { operation: 'compose-record', kind: 'training-material', fields: { materialType: 'sop' } }, expectPath: 'title' },
    ];
    const fpBefore = await canonicalFingerprint();
    for (const c of cases) {
      const compiled = await service.compile(proposal(c.intent));
      expect(compiled.canAccept, `${c.label}: expected blocked`).toBe(false);
      expect(compiled.writes.length, `${c.label}: expected zero writes`).toBe(0);
      // The stage-failure diagnostic carries the adapter's path-named message
      // verbatim (FormDraftService.ts:119 — DRAFT_INVALID + the joined text).
      const messages = compiled.diagnostics.map((d) => `${d.code} ${d.message}`.toLowerCase());
      expect(messages.some((m) => m.includes(c.expectPath.toLowerCase())), `${c.label}: diagnostics ${messages.join(' | ')}`).toBe(true);
    }
    expect(await canonicalFingerprint()).toBe(fpBefore);
  });

  it('target-change guard is reachable for this adapter (409 "Draft target changed.")', async () => {
    const first = await service.compile(proposal(INTENT));
    await expect(
      service.compile({ ...proposal(INTENT), draftId: first.draftId, revision: first.revision, target: { recordId: 'TRM-SOMETHING-ELSE' } }),
    ).rejects.toThrow(/target changed/i);
  });

  it('the staged id is deterministic across recompiles (accept-side recompile reproduces the reviewHash)', async () => {
    const a = await service.compile(proposal(INTENT));
    const b = await service.compile(proposal(INTENT));
    expect((a.result as { recordId: string }).recordId).toBe((b.result as { recordId: string }).recordId);
    expect(a.reviewHash).toBe(b.reviewHash);
  });

  it('the compiled landing document is lab-session valid (Ajv against the registered $id)', async () => {
    const compiled = await service.compile(proposal(INTENT));
    const doc = (compiled.result as { sessionDocument: unknown }).sessionDocument;
    const check = ctx.validator.validate(doc, LAB_SESSION_SCHEMA_ID);
    expect(check.valid, (check.errors ?? []).map((e) => e.message).join('; ')).toBe(true);
  });
});
