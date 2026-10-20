/**
 * MATRES-RECV §5.3 — corrected receipt keeps descendant instance/aliquot
 * identity discoverable (case 5). Fixtures reuse the ATTEST case-5 shapes:
 * receipt -> instance -> 2 aliquots; a same-entity-reattribute correction
 * re-attributes the ENTITY's facts, so descendants keep pointing at the
 * ENTITY (no orphaned or duplicated aliquots, Q4b).
 *
 * Discovery goes THROUGH CurrentAssertionView (never by re-reading superseded
 * payloads); the view is fact-name-free (advc1 defect 4), so the consumer
 * reads the lot off the returned current claim assertion.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
import { arrivalsForEntity, currentAssertion, historicalClaims } from '../attestation/CurrentAssertionView.js';
import type { AppContext } from '../server.js';
import type { RecordEnvelope } from '../store/types.js';

let ctx: AppContext;
let root: string;
let service: MaterialReceivingAcceptService;

const CLOCK_START = new Date('2026-10-20T14:00:00Z');
let clockTicks = 0; // each accept stamps one hour later: the correction's
                    // attestedAt is strictly later than the receipt's.
const ENTITY = 'MINST-RECV-CASE5';
const ALIQUOT_IDS = ['ALQ-RECV-CASE5-A', 'ALQ-RECV-CASE5-B'];

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'cl-recv-case5-'));
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
  for (const { name, spec } of lintLoad.specs) lintEngine.addSpec(name, spec);
  const store = createRecordStore(createLocalRepoAdapter({ basePath: root }), validator, lintEngine, {
    appendOnlyKinds: DEFAULT_CONFIG.server.appendOnlyKinds ?? [],
  });
  ctx = { store, validator, lintEngine, schemaRegistry: registry, workspaceRoot: root, recordsDir: root } as unknown as AppContext;
  service = new MaterialReceivingAcceptService(ctx, { now: () => new Date(CLOCK_START.getTime() + clockTicks++ * 3_600_000) });
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

function draft(overrides: Partial<MaterialReceivingDraft> = {}): MaterialReceivingDraft {
  return {
    draftId: 'RECV-C5-0001',
    revision: 1,
    envelope: {
      kind: 'material-receiving',
      artifactKind: 'attestation-chain',
      claims: [{
        claimStatus: 'completed',
        assertion: {
          verb: 'received',
          about: ref(ENTITY, 'material-instance'),
          vendorProductRef: ref('VPR-SIGMA-D8418', 'vendor-product'),
          lot: { lot_number: '09231' },
          receivedByStatus: 'known',
          receivedBy: ref('USR-brad', 'person'),
        },
        occurredAtStatus: 'approximate',
        occurredAt: '2026-10-13T09:00:00-04:00',
        approximation: 'last week',
      }],
      createdInstanceRef: ref(ENTITY, 'material-instance'),
    },
    instanceFields: { name: 'Trypan blue bottle (case 5)' },
    ...overrides,
  };
}

async function accept(d: MaterialReceivingDraft) {
  const review = await service.compile(d);
  if (!review.canAccept) throw new Error(`blocked: ${review.diagnostics.join('; ')}`);
  return service.accept({ draft: d, draftId: review.draftId, revision: review.revision, reviewHash: review.reviewHash });
}

async function receipts(): Promise<RecordEnvelope[]> { return ctx.store.list({ kind: 'material-receiving' }); }

/** The lot the CURRENT assertion carries (consumer-side read of a named fact). */
function currentLot(records: RecordEnvelope[], entityId: string): unknown {
  const current = currentAssertion(records, entityId);
  const changed = current.changedFacts.lot;
  if (changed !== undefined) return changed;
  const claim = current.claims[0];
  return claim === undefined ? undefined : object(object(claim.assertion).lot).lot_number;
}

describe('corrected receipt keeps descendants discoverable (§5.3, case 5)', () => {
  let receiptId = '';
  let correctionId = '';

  it('fixture: receipt -> instance -> 2 aliquots (aliquots point at the ENTITY)', async () => {
    const accepted = await accept(draft({ draftId: 'RECV-C5-base' }));
    receiptId = accepted.recordId;
    for (const id of ALIQUOT_IDS) {
      const saved = await ctx.store.create({
        envelope: {
          recordId: id,
          schemaId: 'https://computable-lab.com/schema/computable-lab/aliquot.schema.yaml',
          payload: {
            kind: 'aliquot', id,
            parent_material_instance_ref: ref(ENTITY, 'material-instance'),
            volume: { value: 1, unit: 'mL' },
          },
        },
        message: `seed aliquot ${id}`,
      });
      expect(saved.success).toBe(true);
    }
    expect(await receipts()).toHaveLength(1);
  });

  it('AC-3: correction (same-entity-reattribute, lot 09213, photo evidence) keeps instance+aliquot ids BYTE-UNCHANGED', async () => {
    const instancesBefore = (await ctx.store.list({ kind: 'material-instance' })).map(r => r.recordId).sort();
    const aliquotsBefore = (await ctx.store.list({ kind: 'aliquot' })).map(r => r.recordId).sort();
    expect(instancesBefore).toEqual([ENTITY]);
    expect(aliquotsBefore).toEqual(ALIQUOT_IDS);

    const correction = draft({ draftId: 'RECV-C5-corr' });
    const claims = correction.envelope.claims as Array<Record<string, unknown>>;
    (claims[0]!.assertion as Record<string, unknown>).lot = { lot_number: '09213' };
    correction.envelope.supersedes = ref(receiptId, 'material-receiving');
    correction.envelope.correction = {
      claimTarget: { mode: 'same-entity-reattribute' },
      changedFacts: { lot: '09213' },
    };
    correction.envelope.evidenceRefs = [{ file_name: 'bottle-label.jpg', media_type: 'image/jpeg', sha256: 'b'.repeat(64) }];
    const accepted = await accept(correction);
    correctionId = accepted.recordId;

    const instancesAfter = (await ctx.store.list({ kind: 'material-instance' })).map(r => r.recordId).sort();
    const aliquotsAfter = (await ctx.store.list({ kind: 'aliquot' })).map(r => r.recordId).sort();
    // Byte-equal id lists: a correction never re-runs the planned instance write.
    expect(instancesAfter).toEqual(instancesBefore);
    expect(aliquotsAfter).toEqual(aliquotsBefore);
  });

  it('AC-3(b): the current view says 09213 and the historical view still says 09231 (both queryable)', async () => {
    const records = await receipts();
    expect(currentLot(records, ENTITY)).toBe('09213');
    const superseded = (await ctx.store.get(receiptId))!;
    expect(historicalClaims(superseded)[0] && object(object(historicalClaims(superseded)[0]!.assertion).lot).lot_number).toBe('09231');
    // The correction record itself is discoverable as the current source.
    expect(currentAssertion(records, ENTITY).sourceRecordId).toBe(correctionId);
  });

  it('AC-3(c): the correction is NOT a second arrival (arrival count of the entity == 1)', async () => {
    const records = await receipts();
    expect(records).toHaveLength(2);
    expect(arrivalsForEntity(records, ENTITY, 'received')).toBe(1);
  });

  it('AC-3(d): correction double-submission lands the SAME id (content-scoped idempotence, Q4e)', async () => {
    const again = draft({ draftId: 'RECV-C5-corr-repeat', revision: 3 });
    const claims = again.envelope.claims as Array<Record<string, unknown>>;
    (claims[0]!.assertion as Record<string, unknown>).lot = { lot_number: '09213' };
    again.envelope.supersedes = ref(receiptId, 'material-receiving');
    again.envelope.correction = {
      claimTarget: { mode: 'same-entity-reattribute' },
      changedFacts: { lot: '09213' },
    };
    again.envelope.evidenceRefs = [{ file_name: 'bottle-label.jpg', media_type: 'image/jpeg', sha256: 'b'.repeat(64) }];
    const accepted = await accept(again);
    expect(accepted.recordId).toBe(correctionId);
    // Still one arrival, still the same descendant ids.
    expect(arrivalsForEntity(await receipts(), ENTITY, 'received')).toBe(1);
    expect((await ctx.store.list({ kind: 'aliquot' })).map(r => r.recordId).sort()).toEqual(ALIQUOT_IDS);
  });

  it('AC-3(e): entity-substitution over a CONSUMED ref cannot reach accepted state without the deviation fact; the error names the consumed ref', async () => {
    const substitution = draft({ draftId: 'RECV-C5-sub' });
    substitution.envelope.supersedes = ref(receiptId, 'material-receiving');
    substitution.envelope.correction = {
      claimTarget: { mode: 'entity-substitution' },
      // The deviation FACT (OQ-3 carrier): an attestation claim, claimStatus
      // unknown, about = the consumed ref.
      changedFacts: { consumedRef: ENTITY, replacement: 'MINST-RECV-CASE5-NEW' },
    };
    const review = await service.compile(substitution);
    expect(review.canAccept).toBe(false);
    expect(review.diagnostics.some(d => d.includes(ENTITY) && /deviation|resolutionNote/i.test(d))).toBe(true);
    const before = await receipts();
    await expect(
      service.accept({ draft: substitution, draftId: review.draftId, revision: review.revision, reviewHash: review.reviewHash }),
    ).rejects.toThrow(new RegExp(ENTITY));
    expect(await receipts()).toEqual(before);
  });

  it('correction kind audit: no separate receiving correction kind exists anywhere in the corpus or the diff', async () => {
    const kinds = new Set((await ctx.store.list()).map(r => String(object(r.payload).kind)));
    expect([...kinds].some(k => k.includes('-correction'))).toBe(false);
    // The correction rode the SAME kind + supersedes + correction (one generic
    // mechanism, orch ruling OQ-2).
    const records = await receipts();
    expect(records.every(r => object(r.payload).kind === 'material-receiving')).toBe(true);
  });
});
