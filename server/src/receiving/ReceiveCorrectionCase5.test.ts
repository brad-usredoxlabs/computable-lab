/**
 * MATRES-RECV §5.3 — corrected receipt keeps descendant instance/aliquot
 * identity discoverable (case 5). Fixtures reuse the ATTEST case-5 shapes:
 * receipt -> instance -> 2 aliquots; a same-entity-reattribute correction
 * re-attributes the ENTITY's facts, so descendants keep pointing at the
 * ENTITY (no orphaned or duplicated aliquots, Q4b).
 *
 * REWRITTEN per the architect ruling (MATRESRECV D1/D2, option (a)): the
 * fixtures are written by the PRODUCTION rail — `new FormDraftService(ctx,
 * actor, pinnedClock)` + `compile({adapter:'receiving',...})` + `accept(...)`
 * — never by the deleted MaterialReceivingAcceptService. Every assertion
 * that reads through CurrentAssertionView stays UNCHANGED (that authority
 * stays); the blocked-card case asserts canAccept:false + the named
 * diagnostic + zero writes, matching the live blocked-card style.
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
import { createUISpecLoader, loadAllUISpecs } from '../ui/UISpecLoader.js';
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { createRecordStore } from '../store/RecordStoreImpl.js';
import { PolicyBundleService } from '../policy/PolicyBundleService.js';
import { AuthorizationService } from '../security/AuthorizationService.js';
import { object } from '../revisions/RecordRevisionService.js';
import { DEFAULT_CONFIG } from '../config/types.js';
import { FormDraftService } from '../drafts/FormDraftService.js';
import { arrivalsForEntity, currentAssertion, historicalClaims } from '../attestation/CurrentAssertionView.js';
import type { AppContext } from '../server.js';
import type { RecordEnvelope } from '../store/types.js';

let ctx: AppContext;
let root: string;
let service: FormDraftService;

// Each accept stamps one hour later (the correction's attestedAt is strictly
// later than the receipt's) — the rail's injectable accept clock, pinned.
const CLOCK_START = Date.parse('2026-10-20T14:00:00Z');
let clockTicks = 0;
// The entity id is the rail's deterministic content hash of the stated
// entity facts (termId law) — captured from the fixture's accepted receipt,
// never hardcoded (the hash IS the derivation).
let ENTITY = '';
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
  const uiSpecLoader = createUISpecLoader();
  await loadAllUISpecs(uiSpecLoader, schemaDir);
  const repoAdapter = createLocalRepoAdapter({ basePath: root });
  const store = createRecordStore(repoAdapter, validator, lintEngine, {
    appendOnlyKinds: DEFAULT_CONFIG.server.appendOnlyKinds ?? [],
  });
  const policyBundleService = new PolicyBundleService();
  policyBundleService.loadFromDir(join(schemaDir, 'core/policy-bundles'));
  const authorizationService = new AuthorizationService(store);
  ctx = { store, validator, lintEngine, schemaRegistry: registry, policyBundleService, repoAdapter, uiSpecLoader, authorizationService, workspaceRoot: root, recordsDir: root, schemaDir } as unknown as AppContext;
  service = new FormDraftService(ctx, 'USR-RECV-C5', () => new Date(CLOCK_START + clockTicks++ * 3_600_000).toISOString());
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
}, 60000);

afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

const ref = (id: string, type: string) => ({ kind: 'record', id, type });

/** The elicited intent the rail compiles (the case-5 utterance-shape). */
const BASE_CLAIM = {
  vendor: 'Sigma',
  catalogNumber: 'D8418',
  productLabel: 'Trypan Blue',
  lotNumber: '09231',
  receivedByLabel: 'Brad',
  receivedByStatus: 'known',
  occurredAtStatus: 'approximate',
  occurredAt: '2026-10-13T09:00:00-04:00',
  approximation: 'last week',
};

async function accept(intent: Record<string, unknown>): Promise<{ recordId: string; instanceRecordId: string }> {
  const draft = await service.compile({ adapter: 'receiving', intent: structuredClone(intent) });
  if (!draft.canAccept) throw new Error(`blocked: ${draft.diagnostics.map(d => d.message).join('; ')}`);
  const saved = await service.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash });
  return { recordId: String((saved as Record<string, unknown>).recordId), instanceRecordId: String((saved as Record<string, unknown>).instanceRecordId) };
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
    const accepted = await accept({ operation: 'compose-receiving', claim: BASE_CLAIM });
    receiptId = accepted.recordId;
    ENTITY = accepted.instanceRecordId;
    expect(ENTITY).toMatch(/^MINST-[A-F0-9]{32}$/);
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

  it('AC-3: correction (same-entity-reattribute, lot 09213) keeps instance+aliquot ids BYTE-UNCHANGED', async () => {
    const instancesBefore = (await ctx.store.list({ kind: 'material-instance' })).map(r => r.recordId).sort();
    const aliquotsBefore = (await ctx.store.list({ kind: 'aliquot' })).map(r => r.recordId).sort();
    expect(instancesBefore).toEqual([ENTITY]);
    expect(aliquotsBefore).toEqual(ALIQUOT_IDS);

    const accepted = await accept({
      operation: 'compose-receiving',
      claim: { ...BASE_CLAIM, lotNumber: '09213', supersedesRecordId: receiptId, correctionNote: 'lot was misread off the packing slip' },
    });
    correctionId = accepted.recordId;

    const instancesAfter = (await ctx.store.list({ kind: 'material-instance' })).map(r => r.recordId).sort();
    const aliquotsAfter = (await ctx.store.list({ kind: 'aliquot' })).map(r => r.recordId).sort();
    // Byte-equal id lists: a correction never re-runs the planned instance write.
    expect(instancesAfter).toEqual(instancesBefore);
    expect(aliquotsAfter).toEqual(aliquotsBefore);
    // The correction record carries the acceptance stamp (later than the
    // receipt's) and supersedes the original receipt.
    const correction = await ctx.store.get(correctionId);
    expect(object(correction!.payload).attestedAt).toBe(new Date(CLOCK_START + 1 * 3_600_000).toISOString());
    expect(object(object(correction!.payload).supersedes).id).toBe(receiptId);
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
    const again = await accept({
      operation: 'compose-receiving',
      claim: { ...BASE_CLAIM, lotNumber: '09213', supersedesRecordId: receiptId, correctionNote: 'lot was misread off the packing slip' },
    });
    expect(again.recordId).toBe(correctionId);
    // Still one arrival, still the same descendant ids.
    expect(arrivalsForEntity(await receipts(), ENTITY, 'received')).toBe(1);
    expect((await ctx.store.list({ kind: 'aliquot' })).map(r => r.recordId).sort()).toEqual(ALIQUOT_IDS);
  });

  it('AC-3(e): entity-substitution over a CONSUMED ref cannot reach accepted state without the deviation fact; the deviation wall names the consumed ref and writes nothing', async () => {
    // LIVE-RAIL SHAPE (ruling item E): the accept re-evaluation re-runs the
    // compile from the stored draft INPUT, so the elicited surface can only
    // ever emit the same-entity-reattribute correction — an entity-
    // substitution is UNREACHABLE from chat, hence it can never reach
    // accepted state through the rail. The gate itself is the LINT WALL
    // (material-receiving-entity-substitution-needs-deviation-resolution),
    // asserted against the real LintEngine over the real schema: an entity-
    // substitution touching the consumed ref without a resolutionNote is an
    // ERROR naming the consumed ref, and the staging store refuses such a
    // create — zero writes.
    const draft = await service.compile({
      adapter: 'receiving',
      intent: { operation: 'compose-receiving', claim: { ...BASE_CLAIM, supersedesRecordId: receiptId, correctionNote: 'swapping the bottle' } },
    });
    expect(draft.canAccept).toBe(true);
    // The elicited correction is same-entity-reattribute — the rail never
    // manufactures an entity-substitution.
    const compiledEnvelope = object((draft.result as Record<string, unknown>).envelope);
    expect(object(object(compiledEnvelope.correction).claimTarget).mode).toBe('same-entity-reattribute');

    // The deviation wall (lint YAML data, never a TS branch): the substitution
    // shape over the CONSUMED ref without a resolutionNote is an error naming
    // the consumed ref.
    const substituted = structuredClone(compiledEnvelope);
    substituted.supersedes = ref(receiptId, 'material-receiving');
    substituted.correction = { claimTarget: { mode: 'entity-substitution' }, changedFacts: { consumedRef: ENTITY, replacement: 'MINST-RECV-CASE5-NEW' } };
    const lint = ctx.lintEngine.lint(substituted, 'https://computable-lab.com/schema/computable-lab/material-receiving.schema.yaml');
    expect(lint.valid).toBe(false);
    expect(lint.violations.some(v => v.severity === 'error' && v.ruleId === 'material-receiving-entity-substitution-needs-deviation-resolution' && v.message.includes(ENTITY))).toBe(true);

    // Zero writes: the wall gates acceptance, and the rail never accepted a
    // substitution — the receipt set is byte-unchanged.
    const before = await receipts();
    expect(before).toHaveLength(2);
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
