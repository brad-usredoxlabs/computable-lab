/**
 * MATRES-RECV §5.2 — ReceiveAccept tests (atomic two-write accept,
 * idempotent-or-supersession, append-only wall).
 *
 * Harness mirrors AttestationAcceptService.test.ts (real RecordStoreImpl over
 * a tmp dir + the full schema/lint registry + the DEFAULT_CONFIG appendOnlyKinds
 * data knob). The accept rides the FormDraftService gate ORDER by composition
 * (reviewHash re-check BEFORE the already-accepted early return —
 * AttestationAcceptService.ts:177-188 shape), never a fork.
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
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { createRecordStore } from '../store/RecordStoreImpl.js';
import { object } from '../revisions/RecordRevisionService.js';
import { DEFAULT_CONFIG } from '../config/types.js';
import { MaterialReceivingAcceptService } from './MaterialReceivingAcceptService.js';
import type { MaterialReceivingDraft } from './MaterialReceivingAcceptService.js';
import type { AppContext } from '../server.js';
import type { RecordEnvelope } from '../store/types.js';

let ctx: AppContext;
let root: string;
let service: MaterialReceivingAcceptService;

const PINNED_CLOCK = new Date('2026-10-20T14:00:00Z');

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
  // The append-only wall is the generic DATA knob (config/types.ts
  // DEFAULT_CONFIG.server.appendOnlyKinds) — same injection here.
  const store = createRecordStore(createLocalRepoAdapter({ basePath: root }), validator, lintEngine, {
    appendOnlyKinds: DEFAULT_CONFIG.server.appendOnlyKinds ?? [],
  });
  ctx = { store, validator, lintEngine, schemaRegistry: registry, workspaceRoot: root, recordsDir: root } as unknown as AppContext;
  service = new MaterialReceivingAcceptService(ctx, { now: () => PINNED_CLOCK });

  // Fixture: the vendor-product the receipt names (exists already; RECV is its
  // receiving side — its header literally says vendor products exist "without
  // requiring inventory receiving workflows").
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
    message: 'seed vendor-product',
  });
}, 30000);

afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

const ref = (id: string, type: string) => ({ kind: 'record', id, type });

function receiptDraft(overrides: Partial<MaterialReceivingDraft> = {}): MaterialReceivingDraft {
  const instanceId = overrides.createdInstanceId ?? 'MINST-RECV-0001';
  delete (overrides as Record<string, unknown>).createdInstanceId;
  return {
    draftId: 'RECV-DRAFT-0001',
    revision: 1,
    envelope: {
      kind: 'material-receiving',
      artifactKind: 'attestation-chain',
      claims: [{
        claimStatus: 'completed',
        assertion: {
          verb: 'received',
          about: ref(instanceId, 'material-instance'),
          vendorProductRef: ref('VPR-SIGMA-D8418', 'vendor-product'),
          lot: { lot_number: '09231' },
          receivedByStatus: 'known',
          receivedBy: ref('USR-brad', 'person'),
        },
        occurredAtStatus: 'known',
        occurredAt: '2026-10-19T08:00:00-04:00',
      }],
      createdInstanceRef: ref(instanceId, 'material-instance'),
    },
    instanceFields: { name: 'Trypan blue bottle (lot 09231)' },
    ...overrides,
  };
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

describe('MaterialReceivingAcceptService (§5.2)', () => {
  it('happy accept: ONE material-receiving + ONE material-instance created atomically, attestedAt server-stamped, occurredAt byte-verbatim', async () => {
    const draft = receiptDraft({ draftId: 'RECV-DRAFT-happy', createdInstanceId: 'MINST-RECV-HAPPY' });
    const review = await service.compile(draft);
    expect(review.canAccept).toBe(true);
    // Compile writes nothing canonical.
    expect(await receiptRecords()).toEqual([]);
    expect(await instanceRecords()).toEqual([]);

    const receipt = await service.accept({ draft, draftId: review.draftId, revision: review.revision, reviewHash: review.reviewHash });
    const stored = await ctx.store.get(receipt.recordId);
    expect(stored).toBeDefined();
    const payload = object(stored!.payload);
    expect(payload.kind).toBe('material-receiving');
    // attestedAt is server-stamped from the injected clock.
    expect(payload.attestedAt).toBe(PINNED_CLOCK.toISOString());
    // occurredAt is byte-verbatim from the draft — the server never touches it.
    const claims = payload.claims as Array<Record<string, unknown>>;
    expect(claims[0]!.occurredAt).toBe('2026-10-19T08:00:00-04:00');
    // The instance the receipt created (planned write of the SAME accept).
    const instances = await instanceRecords();
    expect(instances).toHaveLength(1);
    const inst = object(instances[0]!.payload);
    expect(inst.id).toBe('MINST-RECV-HAPPY');
    expect(inst.vendor_product_ref).toEqual(ref('VPR-SIGMA-D8418', 'vendor-product'));
    expect((inst.lot as Record<string, unknown>).lot_number).toBe('09231');
    expect(await receiptsFor('MINST-RECV-HAPPY')).toHaveLength(1);
  });

  it('AC-2(i): repeat-accept of the same revision yields exactly ONE receipt + one instance (record COUNT, not response equality)', async () => {
    const draft = receiptDraft({ draftId: 'RECV-DRAFT-repeat', createdInstanceId: 'MINST-RECV-REPEAT' });
    const review = await service.compile(draft);
    await service.accept({ draft, draftId: review.draftId, revision: review.revision, reviewHash: review.reviewHash });
    await service.accept({ draft, draftId: review.draftId, revision: review.revision, reviewHash: review.reviewHash });
    await service.accept({ draft, draftId: review.draftId, revision: review.revision, reviewHash: review.reviewHash });
    expect(await receiptsFor('MINST-RECV-REPEAT')).toHaveLength(1);
    expect(await instanceCountFor('MINST-RECV-REPEAT')).toBe(1);
  });

  it('AC-2(ii): re-DRAFT of identical content lands the SAME deterministic id (content-hash, termId law) — one record', async () => {
    const first = receiptDraft({ draftId: 'RECV-DRAFT-identical-a', createdInstanceId: 'MINST-RECV-IDENT' });
    const reviewA = await service.compile(first);
    const accepted = await service.accept({ draft: first, draftId: reviewA.draftId, revision: reviewA.revision, reviewHash: reviewA.reviewHash });
    // A fresh draft, same content: deterministic content-hash id lands the same record.
    const second = receiptDraft({ draftId: 'RECV-DRAFT-identical-b', revision: 7, createdInstanceId: 'MINST-RECV-IDENT' });
    const reviewB = await service.compile(second);
    expect(reviewB.recordId).toBe(accepted.recordId);
    await service.accept({ draft: second, draftId: reviewB.draftId, revision: reviewB.revision, reviewHash: reviewB.reviewHash });
    expect(await receiptsFor('MINST-RECV-IDENT')).toHaveLength(1);
    expect(await instanceCountFor('MINST-RECV-IDENT')).toBe(1);
  });

  it('AC-2(iii): changed fact about an already-received entity WITHOUT supersedes is REFUSED with ZERO writes; the error names the entity + correction-or-distinct-arrival', async () => {
    const first = receiptDraft({ draftId: 'RECV-DRAFT-double-a', createdInstanceId: 'MINST-RECV-DOUBLE' });
    const reviewA = await service.compile(first);
    await service.accept({ draft: first, draftId: reviewA.draftId, revision: reviewA.revision, reviewHash: reviewA.reviewHash });
    const before = await receiptsFor('MINST-RECV-DOUBLE');

    // Same entity (same createdInstanceRef), changed lot, NO supersedes.
    const changed = receiptDraft({ draftId: 'RECV-DRAFT-double-b', createdInstanceId: 'MINST-RECV-DOUBLE' });
    const claims = changed.envelope.claims as Array<Record<string, unknown>>;
    (claims[0]!.assertion as Record<string, unknown>).lot = { lot_number: '99999' };
    const reviewB = await service.compile(changed);
    expect(reviewB.canAccept).toBe(false);
    expect(reviewB.diagnostics.some(d => d.includes('MINST-RECV-DOUBLE') && /correction|supersedes|distinct arrival/i.test(d))).toBe(true);

    const createSpy = vi.spyOn(ctx.store, 'create');
    await expect(
      service.accept({ draft: changed, draftId: reviewB.draftId, revision: reviewB.revision, reviewHash: reviewB.reviewHash }),
    ).rejects.toThrow(/already received|correction|distinct arrival/i);
    expect(createSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
    expect(await receiptsFor('MINST-RECV-DOUBLE')).toEqual(before);
  });

  it('AC-2(iii) other half: the SAME changed fact WITH supersedes lands a second record and the first record stays byte-unchanged', async () => {
    const first = receiptDraft({ draftId: 'RECV-DRAFT-super-a', createdInstanceId: 'MINST-RECV-SUPER' });
    const reviewA = await service.compile(first);
    const accepted = await service.accept({ draft: first, draftId: reviewA.draftId, revision: reviewA.revision, reviewHash: reviewA.reviewHash });
    const storedBefore = await ctx.store.get(accepted.recordId);
    const hashBefore = JSON.stringify(object(storedBefore!.payload));

    const correction = receiptDraft({ draftId: 'RECV-DRAFT-super-b', createdInstanceId: 'MINST-RECV-SUPER' });
    const claims = correction.envelope.claims as Array<Record<string, unknown>>;
    (claims[0]!.assertion as Record<string, unknown>).lot = { lot_number: '99999' };
    correction.envelope.supersedes = ref(accepted.recordId, 'material-receiving');
    correction.envelope.correction = {
      claimTarget: { mode: 'same-entity-reattribute' },
      changedFacts: { lot: '99999' },
    };
    const reviewB = await service.compile(correction);
    expect(reviewB.canAccept).toBe(true);
    const corrected = await service.accept({ draft: correction, draftId: reviewB.draftId, revision: reviewB.revision, reviewHash: reviewB.reviewHash });
    expect(corrected.recordId).not.toBe(accepted.recordId);
    expect(await receiptsFor('MINST-RECV-SUPER')).toHaveLength(2);
    // The superseded record is never rewritten (audit pattern).
    const storedAfter = await ctx.store.get(accepted.recordId);
    expect(JSON.stringify(object(storedAfter!.payload))).toBe(hashBefore);
  });

  it('AC-2 second half: a distinct second bottle (new instance entity ref, same product+lot) is a LEGAL second arrival', async () => {
    const a = receiptDraft({ draftId: 'RECV-DRAFT-bottle-a', createdInstanceId: 'MINST-RECV-BOTTLE-A' });
    const reviewA = await service.compile(a);
    await service.accept({ draft: a, draftId: reviewA.draftId, revision: reviewA.revision, reviewHash: reviewA.reviewHash });
    const b = receiptDraft({ draftId: 'RECV-DRAFT-bottle-b', createdInstanceId: 'MINST-RECV-BOTTLE-B' });
    const reviewB = await service.compile(b);
    expect(reviewB.canAccept).toBe(true);
    await service.accept({ draft: b, draftId: reviewB.draftId, revision: reviewB.revision, reviewHash: reviewB.reviewHash });
    // Two bottles of lot X != two arrivals of one entity: both legal.
    expect(await receiptsFor('MINST-RECV-BOTTLE-A')).toHaveLength(1);
    expect(await receiptsFor('MINST-RECV-BOTTLE-B')).toHaveLength(1);
    expect(await instanceCountFor('MINST-RECV-BOTTLE-A')).toBe(1);
    expect(await instanceCountFor('MINST-RECV-BOTTLE-B')).toBe(1);
  });

  it('post-accept payload mutation is rejected with ZERO store.create calls (409 reviewHash gate)', async () => {
    const draft = receiptDraft({ draftId: 'RECV-DRAFT-mutate', createdInstanceId: 'MINST-RECV-MUTATE' });
    const review = await service.compile(draft);
    const createSpy = vi.spyOn(ctx.store, 'create');
    const claims = draft.envelope.claims as Array<Record<string, unknown>>;
    (claims[0]!.assertion as Record<string, unknown>).lot = { lot_number: '99999-tampered' };
    await expect(
      service.accept({ draft, draftId: review.draftId, revision: review.revision, reviewHash: review.reviewHash }),
    ).rejects.toThrow(/changed/i);
    expect(createSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
    expect(await receiptsFor('MINST-RECV-MUTATE')).toEqual([]);
  });

  it('append-only wall: update/delete of a stored material-receiving hits APPEND_ONLY (generic data knob); a control kind still updates', async () => {
    const draft = receiptDraft({ draftId: 'RECV-DRAFT-wall', createdInstanceId: 'MINST-RECV-WALL' });
    const review = await service.compile(draft);
    const accepted = await service.accept({ draft, draftId: review.draftId, revision: review.revision, reviewHash: review.reviewHash });
    const stored = (await ctx.store.get(accepted.recordId))!;
    const upd = await ctx.store.update({ envelope: { ...stored, payload: { ...object(stored.payload), title: 'tampered' } } });
    expect(upd.success).toBe(false);
    expect(upd.error).toContain('APPEND_ONLY');
    const del = await ctx.store.delete({ recordId: accepted.recordId });
    expect(del.success).toBe(false);
    expect(del.error).toContain('APPEND_ONLY');
    // Control kind (the instance the receipt created) is NOT append-only.
    const inst = (await ctx.store.get('MINST-RECV-WALL'))!;
    const instUpd = await ctx.store.update({ envelope: { ...inst, payload: { ...object(inst.payload), tags: ['wall-control'] } } });
    expect(instUpd.success).toBe(true);
  });
});
