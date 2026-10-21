/**
 * MATRES-RECV §5.2 — ReceiveAccept tests (atomic two-write accept,
 * idempotent-or-supersession, append-only wall).
 *
 * REWRITTEN per the architect ruling (MATRESRECV D1/D2, option (a)): every
 * scenario drives the PRODUCTION rail — `new FormDraftService(ctx, actor,
 * pinnedClock)` + `compile({adapter:'receiving',...})` + `accept(...)`. The
 * dead MaterialReceivingAcceptService is deleted; no test instantiates it or
 * bypasses FormDraftService. The gate ORDER the old class restated
 * (reviewHash re-check BEFORE the already-accepted early return, pinned-
 * source re-check, full re-validation before ANY write, raced-create
 * handling) is delivered by FormDraftService.accept itself + the receiving
 * adapter's onAccept hook — these tests exercise THAT code.
 *
 * AC-2(iii)'s "already received without supersedes" refusal is asserted as
 * the LIVE blocked-card behavior (compile-side alreadyReceivedDiagnostic,
 * canAccept:false — the same style ReceiveElicitation's blocked cases use),
 * never as an accept-time throw from a second accept class.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';
import { LintEngine } from '../lint/LintEngine.js';
import { loadAllLintSpecs } from '../lint/LintSpecLoader.js';
import { createUISpecLoader, loadAllUISpecs } from '../ui/UISpecLoader.js';
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { createRecordStore } from '../store/RecordStoreImpl.js';
import { PolicyBundleService } from '../policy/PolicyBundleService.js';
import { AuthorizationService } from '../security/AuthorizationService.js';
import { object } from '../revisions/RecordRevisionService.js';
import { DEFAULT_CONFIG } from '../config/types.js';
import { FormDraftService } from '../drafts/FormDraftService.js';
import type { CompiledDraft } from '../drafts/FormDraftService.js';
import type { AppContext } from '../server.js';
import type { RecordEnvelope } from '../store/types.js';

let ctx: AppContext;
let root: string;
let service: FormDraftService;

// The accept clock the rail injects into the receiving adapter's onAccept
// hook: pinned so the accepted receipt's attestedAt is assertable.
const PINNED_ACCEPT = '2026-10-20T14:00:00.000Z';

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'cl-recv-accept-'));
  const schemaDir = fileURLToPath(new URL('../../../schema', import.meta.url));
  const registry = createSchemaRegistry();
  const loaded = await loadAllSchemas({ basePath: schemaDir, recursive: true });
  expect(loaded.errors).toEqual([]);
  registry.addSchemas(loaded.entries);
  const validator = createValidator();
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema, id);
  }
  const lintEngine = new LintEngine();
  const lintLoad = await loadAllLintSpecs({ basePath: schemaDir, recursive: true });
  expect(lintLoad.errors.filter(e => /material-receiving/.test(e.path))).toEqual([]);
  for (const { name, spec } of lintLoad.specs) lintEngine.addSpec(name, spec);
  const uiSpecLoader = createUISpecLoader();
  await loadAllUISpecs(uiSpecLoader, schemaDir);
  // The append-only wall is the generic DATA knob (config/types.ts
  // DEFAULT_CONFIG.server.appendOnlyKinds) — same injection here.
  const repoAdapter = createLocalRepoAdapter({ basePath: root });
  const store = createRecordStore(repoAdapter, validator, lintEngine, {
    appendOnlyKinds: DEFAULT_CONFIG.server.appendOnlyKinds ?? [],
  });
  const policyBundleService = new PolicyBundleService();
  policyBundleService.loadFromDir(join(schemaDir, 'core/policy-bundles'));
  const authorizationService = new AuthorizationService(store);
  ctx = { store, validator, lintEngine, schemaRegistry: registry, policyBundleService, repoAdapter, uiSpecLoader, authorizationService, workspaceRoot: root, recordsDir: root, schemaDir } as unknown as AppContext;
  service = new FormDraftService(ctx, 'USR-RECV-ACCEPT', () => PINNED_ACCEPT);

  // Fixtures: the vendor-products the receipts name (exist already; RECV is
  // their receiving side — its header literally says vendor products exist
  // "without requiring inventory receiving workflows").
  await ctx.store.create({
    envelope: {
      recordId: 'VPR-SIGMA-D8418',
      schemaId: 'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml',
      payload: {
        kind: 'vendor-product', id: 'VPR-SIGMA-D8418', name: 'D8418 Trypan Blue',
        vendor: 'Sigma-Aldrich', catalog_number: 'D8418',
        material_ref: { kind: 'ontology', id: 'CHEBI:90837', label: 'trypan blue', namespace: 'CHEBI' },
      },
    },
    message: 'seed vendor-product sigma',
  });
  await ctx.store.create({
    envelope: {
      recordId: 'VPR-MERCK-M1234',
      schemaId: 'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml',
      payload: {
        kind: 'vendor-product', id: 'VPR-MERCK-M1234', name: 'M1234 Buffer A',
        vendor: 'Merck', catalog_number: 'M1234',
        material_ref: { kind: 'ontology', id: 'CHEBI:52218', label: 'HEPES', namespace: 'CHEBI' },
      },
    },
    message: 'seed vendor-product merck',
  });
}, 60000);

afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

/** Case-4-shaped elicited intent (the rail's input is the scientist's words,
 *  never a hand-made envelope — the compile is the envelope authority). */
const SIGMA = {
  operation: 'compose-receiving',
  claim: {
    vendor: 'Sigma',
    catalogNumber: 'D8418',
    productLabel: 'Trypan Blue',
    lotNumber: '09231',
    receivedByLabel: 'Brad',
    receivedByStatus: 'known',
    occurredAtStatus: 'known',
    occurredAt: '2026-10-19T08:00:00-04:00',
  },
};

/** Per-test entity isolation: each test gets its OWN lot (lot is part of
 *  the derived entity identity), so the shared store never cross-
 *  contaminates — a prior test's CURRENT receipt must not block a later
 *  test's fresh draft, and per-entity counts stay exact. */
function sigma(lot: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { operation: 'compose-receiving', claim: { ...SIGMA.claim, lotNumber: lot, ...extra } };
}

async function compileAndAccept(intent: Record<string, unknown>): Promise<{ draft: CompiledDraft; receiptId: string; instanceId: string }> {
  const draft = await service.compile({ adapter: 'receiving', intent: structuredClone(intent) });
  if (!draft.canAccept) throw new Error(`blocked: ${draft.diagnostics.map(d => d.message).join('; ')}`);
  const saved = await service.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash });
  return { draft, receiptId: String((saved as Record<string, unknown>).recordId), instanceId: String((saved as Record<string, unknown>).instanceRecordId) };
}

async function receiptRecords(): Promise<RecordEnvelope[]> { return ctx.store.list({ kind: 'material-receiving' }); }
async function instanceRecords(): Promise<RecordEnvelope[]> { return ctx.store.list({ kind: 'material-instance' }); }
/** Arrival identity = the ENTITY ref: counts are per-entity, never global
 *  (tests share one store; a global count would cross-contaminate). */
async function receiptsFor(entity: string): Promise<RecordEnvelope[]> {
  return (await receiptRecords()).filter(r => String(object(object(r.payload).createdInstanceRef).id) === entity);
}
async function instanceCountFor(entity: string): Promise<number> {
  return (await instanceRecords()).filter(r => r.recordId === entity).length;
}

describe('receiving accept through the production FormDraftService rail (§5.2)', () => {
  it('happy accept: ONE material-receiving + ONE material-instance created atomically, attestedAt = the pinned accept clock, occurredAt byte-verbatim', async () => {
    const { draft, receiptId, instanceId } = await compileAndAccept(sigma('10001'));
    // Compile staged the two writes and wrote NOTHING canonical.
    expect(draft.writes.map(w => object(w.payload).kind).sort()).toEqual(['material-instance', 'material-receiving']);

    const stored = await ctx.store.get(receiptId);
    expect(stored).toBeDefined();
    const payload = object(stored!.payload);
    expect(payload.kind).toBe('material-receiving');
    // attestedAt is the ACCEPT stamp from the rail's pinned clock (the
    // adapter's onAccept hook) — the draft envelope carried none.
    expect(payload.attestedAt).toBe(PINNED_ACCEPT);
    expect('attestedAt' in object(draft.result as Record<string, unknown>)).toBe(false);
    // occurredAt is byte-verbatim from the scientist — the server never touches it.
    const claims = payload.claims as Array<Record<string, unknown>>;
    expect(claims[0]!.occurredAt).toBe('2026-10-19T08:00:00-04:00');
    // The instance the receipt created (planned write of the SAME accept).
    const instances = await instanceRecords();
    expect(instances.filter(r => r.recordId === instanceId)).toHaveLength(1);
    const inst = object(instances.find(r => r.recordId === instanceId)!.payload);
    expect(inst.id).toBe(instanceId);
    expect(inst.vendor_product_ref).toEqual({ kind: 'record', type: 'vendor-product', id: 'VPR-SIGMA-D8418' });
    expect((inst.lot as Record<string, unknown>).lot_number).toBe('10001');
    expect(await receiptsFor(instanceId)).toHaveLength(1);
  });

  it('AC-2(i): repeat-accept of the same revision yields exactly ONE receipt + one instance (record COUNT, not response equality)', async () => {
    const { receiptId, instanceId } = await compileAndAccept(sigma('10002'));
    const draft = await service.compile({ adapter: 'receiving', intent: sigma('10002') });
    // Same revision accepted repeatedly: the status early-return + the
    // deterministic id keep the store at ONE record.
    await service.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash });
    await service.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash });
    await service.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash });
    expect(await receiptsFor(instanceId)).toHaveLength(1);
    expect(await instanceCountFor(instanceId)).toBe(1);
    expect((await receiptsFor(instanceId)).map(r => r.recordId)).toEqual([receiptId]);
  });

  it('AC-2(ii): re-DRAFT of identical content lands the SAME deterministic id (content-hash, termId law) — one record', async () => {
    const first = await service.compile({ adapter: 'receiving', intent: sigma('10003') });
    const accepted = await service.accept({ draftId: first.draftId, revision: first.revision, reviewHash: first.reviewHash });
    const recordId = String((accepted as Record<string, unknown>).recordId);
    const entity = String(object(object((await ctx.store.get(recordId))!.payload).createdInstanceRef).id);
    // A fresh draft, same content: deterministic content-hash id lands the
    // same record; the volatile-field prior-comparison treats the prior as
    // already accepted (equal modulo attestedAt) — no second record.
    const second = await service.compile({ adapter: 'receiving', intent: sigma('10003') });
    expect(second.canAccept).toBe(true);
    expect(String((second.result as Record<string, unknown>).recordId)).toBe(recordId);
    await service.accept({ draftId: second.draftId, revision: second.revision, reviewHash: second.reviewHash });
    expect(await receiptsFor(entity)).toHaveLength(1);
    expect(await instanceCountFor(entity)).toBe(1);
  });

  it('AC-2(ii) volatile-field skip: two drafts of identical content compiled BEFORE either accept and accepted by DIFFERENT accept clocks land ONE record — the prior-comparison is equal modulo the volatile attestedAt (never a 409 on the stamp delta)', async () => {
    const LATER_ACCEPT = '2026-10-21T09:00:00.000Z';
    const laterService = new FormDraftService(ctx, 'USR-RECV-ACCEPT', () => LATER_ACCEPT);
    const a = await service.compile({ adapter: 'receiving', intent: sigma('10004') });
    const b = await laterService.compile({ adapter: 'receiving', intent: sigma('10004') });
    const receiptId = String((a.result as Record<string, unknown>).recordId);
    expect(String((b.result as Record<string, unknown>).recordId)).toBe(receiptId);
    await service.accept({ draftId: a.draftId, revision: a.revision, reviewHash: a.reviewHash });
    const entity = String(object(object((await ctx.store.get(receiptId))!.payload).createdInstanceRef).id);
    // B's accept re-evaluation re-stages a write the hook stamps with the
    // LATER clock; the durable record carries the PINNED stamp. Raw
    // contentHashes differ; equal-modulo-volatile => already accepted (the
    // create is skipped, the owner policy is kept) — the exemption the
    // onAccept hook declared, never a generic inference.
    await laterService.accept({ draftId: b.draftId, revision: b.revision, reviewHash: b.reviewHash });
    expect((await receiptsFor(entity)).map(r => r.recordId)).toEqual([receiptId]);
    expect(await instanceCountFor(entity)).toBe(1);
    expect(object((await ctx.store.get(receiptId))!.payload).attestedAt).toBe(PINNED_ACCEPT);
  });

  it('AC-2(iii): changed fact about an already-received entity WITHOUT supersedes is REFUSED at the card (canAccept:false) with ZERO writes; the diagnostic names the entity + correction-or-distinct-arrival', async () => {
    const { instanceId } = await compileAndAccept(sigma('10005'));
    const before = await receiptsFor(instanceId);

    // Same entity (the entity hash covers the stated ENTITY facts: product
    // identity + lot; the arrival time and the receiver are NOT entity
    // identity), changed receivedBy, NO supersedes.
    const changed = sigma('10005', { receivedByLabel: 'Priya' });
    const review = await service.compile({ adapter: 'receiving', intent: changed });
    expect(review.canAccept).toBe(false);
    expect(review.diagnostics.some(d => d.message.includes(instanceId) && /correction|supersedes|distinct arrival/i.test(d.message))).toBe(true);

    const createSpy = vi.spyOn(ctx.store, 'create');
    await expect(
      service.accept({ draftId: review.draftId, revision: review.revision, reviewHash: review.reviewHash }),
    ).rejects.toThrow(/blocked/i);
    expect(createSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
    expect(await receiptsFor(instanceId)).toEqual(before);
  });

  it('AC-2(iii) other half: the SAME changed fact WITH supersedes lands a second record and the first record stays byte-unchanged', async () => {
    const { receiptId, instanceId } = await compileAndAccept(sigma('10006'));
    const storedBefore = await ctx.store.get(receiptId);
    const hashBefore = JSON.stringify(object(storedBefore!.payload));

    const correction = sigma('10006', { receivedByLabel: 'Priya', supersedesRecordId: receiptId, correctionNote: 'mis-recorded who signed for it' });
    const review = await service.compile({ adapter: 'receiving', intent: correction });
    expect(review.canAccept).toBe(true);
    const corrected = await service.accept({ draftId: review.draftId, revision: review.revision, reviewHash: review.reviewHash });
    const correctedId = String((corrected as Record<string, unknown>).recordId);
    expect(correctedId).not.toBe(receiptId);
    expect(await receiptsFor(instanceId)).toHaveLength(2);
    // The superseded record is never rewritten (audit pattern + append-only wall).
    const storedAfter = await ctx.store.get(receiptId);
    expect(JSON.stringify(object(storedAfter!.payload))).toBe(hashBefore);
  });

  it('AC-2 second half: a distinct second bottle (new instance entity ref, same lot) is a LEGAL second arrival', async () => {
    const a = await compileAndAccept(sigma('10007'));
    // A genuinely distinct product+lot (different catalog identity -> a
    // different derived entity ref) is a legal second arrival, never a
    // duplicate of the first entity.
    const b = await compileAndAccept({
      operation: 'compose-receiving',
      claim: {
        vendor: 'Merck', catalogNumber: 'M1234', productLabel: 'Buffer A', lotNumber: '10007',
        receivedByLabel: 'Brad', receivedByStatus: 'known',
        occurredAtStatus: 'known', occurredAt: '2026-10-19T09:00:00-04:00',
      },
    });
    // Two bottles of lot X != two arrivals of one entity: both legal.
    expect(await receiptsFor(a.instanceId)).toHaveLength(1);
    expect(await receiptsFor(b.instanceId)).toHaveLength(1);
    expect(await instanceCountFor(a.instanceId)).toBe(1);
    expect(await instanceCountFor(b.instanceId)).toBe(1);
    expect(b.instanceId).not.toBe(a.instanceId);
  });

  it('post-compile draft mutation is rejected with ZERO store.create calls (409 reviewHash gate)', async () => {
    const draft = await service.compile({ adapter: 'receiving', intent: sigma('10008') });
    // Tamper the STORED draft's compiled reviewHash (the form-draft record is
    // not append-only — the reviewHash pin is what forecloses the accept).
    const stored = await ctx.store.get(draft.draftId);
    const draftPayload = object(stored!.payload);
    await ctx.store.update({ envelope: { ...stored!, payload: { ...draftPayload, compiled: { ...object(draftPayload.compiled), reviewHash: 'tampered' } } } });
    const createSpy = vi.spyOn(ctx.store, 'create');
    await expect(
      service.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash }),
    ).rejects.toThrow(/changed/i);
    expect(createSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
    expect(await receiptsFor(String(object(object(draft.result as Record<string, unknown>).createdInstanceRef).id))).toEqual([]);
  });

  it('append-only wall: update/delete of a stored material-receiving hits APPEND_ONLY (generic data knob); a control kind still updates', async () => {
    const { receiptId, instanceId } = await compileAndAccept(sigma('10009'));
    const stored = (await ctx.store.get(receiptId))!;
    const upd = await ctx.store.update({ envelope: { ...stored, payload: { ...object(stored.payload), title: 'tampered' } } });
    expect(upd.success).toBe(false);
    expect(upd.error).toContain('APPEND_ONLY');
    const del = await ctx.store.delete({ recordId: receiptId });
    expect(del.success).toBe(false);
    expect(del.error).toContain('APPEND_ONLY');
    // Control kind (the instance the receipt created) is NOT append-only.
    const inst = (await ctx.store.get(instanceId))!;
    const instUpd = await ctx.store.update({ envelope: { ...inst, payload: { ...object(inst.payload), tags: ['wall-control'] } } });
    expect(instUpd.success).toBe(true);
  });
});
