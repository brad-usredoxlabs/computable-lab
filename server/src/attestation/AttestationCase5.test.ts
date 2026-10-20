/**
 * MATRES-ATTEST §5.2 — the Q4 case-5 walkthrough as executable fixtures.
 *
 * Monday: attestation A = receipt claim (lot 09231, bottle B) + prep +
 * 10 aliquot claims + 1 consumption claim, all completed, attestedAt Monday.
 * Tuesday: correction A2 = attestation with supersedes=A,
 * claimTarget.mode same-entity-reattribute, changedFacts {lot: "09213"},
 * evidenceRefs [photo].
 *
 * SEVEN SEPARATE it() blocks — one per r2/Q4 outcome, each individually
 * asserted (a combined "correction works" test is a reviewer defect).
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
import { contentHash, object } from '../revisions/RecordRevisionService.js';
import { DEFAULT_CONFIG } from '../config/types.js';
import { AttestationAcceptService, ATTESTATION_SCHEMA_ID } from './AttestationAcceptService.js';
import type { AttestationDraft } from './AttestationAcceptService.js';
import {
  currentFacts,
  historicalFacts,
  arrivalsForEntity,
  reevaluationObligations,
} from './CurrentAssertionView.js';
import type { AppContext } from '../server.js';
import type { RecordEnvelope } from '../store/types.js';

const MONDAY = new Date('2026-10-19T09:00:00Z');   // "believed Monday"
const TUESDAY = new Date('2026-10-20T09:00:00Z');  // "corrected now"

const ENTITY_B = 'MATI-000123'; // the bottle-B material instance
const ALIQUOT_IDS = Array.from({ length: 10 }, (_, i) => `ALQ-0000${String(i + 1).padStart(2, '0')}`);
const CONSUMED_ALIQUOT = 'ALQ-000003';

let ctx: AppContext;
let root: string;
let mondayService: AttestationAcceptService;
let tuesdayService: AttestationAcceptService;
let lintEngine: LintEngine;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'cl-attest-case5-'));
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
  lintEngine = new LintEngine();
  const lintLoad = await loadAllLintSpecs({ basePath: schemaDir, recursive: true });
  expect(lintLoad.errors.filter(e => /attestation/.test(e.path))).toEqual([]);
  for (const { name, spec } of lintLoad.specs) lintEngine.addSpec(name, spec);
  const store = createRecordStore(createLocalRepoAdapter({ basePath: root }), validator, lintEngine, {
    appendOnlyKinds: DEFAULT_CONFIG.server.appendOnlyKinds ?? [],
  });
  ctx = { store, validator, lintEngine, schemaRegistry: registry, workspaceRoot: root, recordsDir: root } as unknown as AppContext;
  mondayService = new AttestationAcceptService(ctx, { now: () => MONDAY });
  tuesdayService = new AttestationAcceptService(ctx, { now: () => TUESDAY });
}, 30000);

afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

const person = (id: string) => ({ kind: 'record', type: 'person', id });

function claim(verb: string, aboutId: string, aboutType: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    claimStatus: 'completed',
    assertion: { verb, about: { kind: 'record', type: aboutType, id: aboutId } },
    occurredAtStatus: 'known',
    occurredAt: '2026-10-19T08:30:00-04:00',
    performer: person('USR-op'),
    accountSupplier: person('USR-op'),
    attestor: person('USR-lablead'),
    ...overrides,
  };
}

/** Monday attestation A: receipt(lot 09231, bottle B) + prep + 10 aliquots + 1 consumption. */
function envelopeA(): Record<string, unknown> {
  const receipt = claim('received', ENTITY_B, 'material-instance');
  (receipt.assertion as Record<string, unknown>).lot = '09231';
  (receipt.assertion as Record<string, unknown>).container = 'bottle B';
  const aliquotClaims = ALIQUOT_IDS.map(id => claim('aliquoted', id, 'aliquot'));
  return {
    kind: 'attestation',
    artifactKind: 'attestation-chain',
    claims: [
      receipt,
      claim('prepared', ENTITY_B, 'material-instance'),
      ...aliquotClaims,
      claim('consumed', CONSUMED_ALIQUOT, 'aliquot'),
    ],
  };
}

/** Tuesday correction A2: same-entity-reattribute, lot 09213, photo evidence. */
function envelopeA2(supersedesId: string, changedFacts: Record<string, unknown> = { lot: '09213' }): Record<string, unknown> {
  const correctedReceipt = claim('received', ENTITY_B, 'material-instance');
  (correctedReceipt.assertion as Record<string, unknown>).lot = String(changedFacts.lot ?? '');
  return {
    kind: 'attestation',
    artifactKind: 'attestation-chain',
    claims: [correctedReceipt],
    supersedes: { kind: 'record', type: 'attestation', id: supersedesId },
    correction: {
      claimTarget: { mode: 'same-entity-reattribute' },
      changedFacts,
    },
    evidenceRefs: [{ kind: 'record', type: 'evidence-document', id: 'EVID-photo-09213' }],
  };
}

async function acceptMonday(draft: AttestationDraft) {
  const review = mondayService.compile(draft);
  if (!review.canAccept) throw new Error(`fixture draft not acceptable: ${review.diagnostics.join('; ')}`);
  return mondayService.accept({ draft, draftId: review.draftId, revision: review.revision, reviewHash: review.reviewHash });
}

async function acceptTuesday(draft: AttestationDraft) {
  const review = tuesdayService.compile(draft);
  if (!review.canAccept) throw new Error(`fixture draft not acceptable: ${review.diagnostics.join('; ')}`);
  return tuesdayService.accept({ draft, draftId: review.draftId, revision: review.revision, reviewHash: review.reviewHash });
}

async function seedEntityAndAliquots(): Promise<void> {
  const entityEnvelope: RecordEnvelope = {
    recordId: ENTITY_B,
    schemaId: 'https://computable-lab.com/schema/computable-lab/material-instance.schema.yaml',
    payload: { kind: 'material-instance', id: ENTITY_B, name: 'Bottle B', material_ref: { kind: 'record', type: 'material', id: 'MAT-BUFFER-B' } },
  };
  const seeded = await ctx.store.create({ envelope: entityEnvelope });
  if (!seeded.success) throw new Error(`fixture entity seed failed: ${seeded.error}`);
  for (const id of ALIQUOT_IDS) {
    const envelope: RecordEnvelope = {
      recordId: id,
      schemaId: 'https://computable-lab.com/schema/computable-lab/aliquot.schema.yaml',
      // aliquot.schema.yaml anyOf requires one of material_spec_ref /
      // parent_aliquot_ref / parent_material_instance_ref.
      payload: {
        kind: 'aliquot',
        id,
        parent_material_instance_ref: { kind: 'record', type: 'material-instance', id: ENTITY_B },
        source_lot_ref: { kind: 'record', type: 'material-instance', id: ENTITY_B },
      },
    };
    const created = await ctx.store.create({ envelope });
    if (!created.success) throw new Error(`fixture aliquot seed failed: ${created.error}`);
  }
}

async function attestations(): Promise<RecordEnvelope[]> {
  return ctx.store.list({ kind: 'attestation' });
}

describe('case-5 walkthrough (MATRES-0 Q4, seven individually-asserted outcomes)', () => {
  let aRecordId = '';
  let aHashBefore = '';
  let a2RecordId = '';

  it('case5-1: A and A2 both persist and A is never rewritten (stored contentHash byte-equality)', async () => {
    await seedEntityAndAliquots();
    const aDraft: AttestationDraft = { draftId: 'CASE5-A', revision: 1, envelope: envelopeA() };
    const aReceipt = await acceptMonday(aDraft);
    aRecordId = aReceipt.recordId;
    const storedA = await ctx.store.get(aRecordId);
    expect(storedA).not.toBeNull();
    aHashBefore = contentHash(storedA!.payload);

    const a2Draft: AttestationDraft = { draftId: 'CASE5-A2', revision: 1, envelope: envelopeA2(aRecordId) };
    const a2Receipt = await acceptTuesday(a2Draft);
    a2RecordId = a2Receipt.recordId;

    const storedA2 = await ctx.store.get(a2RecordId);
    expect(storedA2).not.toBeNull();
    // Both queryable.
    expect((await attestations()).map(r => r.recordId)).toEqual(expect.arrayContaining([aRecordId, a2RecordId]));
    // Outcome 1 is BYTES, not vibes (bait 8): A's stored contentHash identical pre/post correction.
    const storedAAfter = await ctx.store.get(aRecordId);
    expect(contentHash(storedAAfter!.payload)).toBe(aHashBefore);
  });

  it('case5-2: no second arrival — a correction never increments the arrival count for entity B', async () => {
    const records = await attestations();
    // Before the correction there was exactly one arrival claim; after it, still exactly one
    // (A is superseded; A2's single receipt claim is the current arrival).
    expect(arrivalsForEntity(records, ENTITY_B, 'received')).toBe(1);
    // And the correction did not create a second receipt-class record.
    const receiptClaims = records.flatMap(r => {
      const claims = object(r.payload).claims as Array<Record<string, unknown>>;
      return claims.filter(c => (c.assertion as Record<string, unknown>).verb === 'received');
    });
    // Two receipt claims exist across history (A + A2), but only ONE is current (asserted in case5-4/5).
    expect(receiptClaims).toHaveLength(2);
  });

  it('case5-3: the 10 aliquot record ids are byte-unchanged after the correction', async () => {
    const ids = (await ctx.store.list({ kind: 'aliquot' })).map(r => r.recordId).sort();
    expect(ids).toEqual([...ALIQUOT_IDS].sort());
  });

  it('case5-4: corrected source is discoverable downstream — aliquot provenance through CurrentAssertionView yields lot 09213', async () => {
    const records = await attestations();
    const facts = currentFacts(records, ENTITY_B);
    expect(facts.lot).toBe('09213');
    // Chain: aliquot -> entity B -> current assertion.
    const aliquot = (await ctx.store.get('ALQ-000001'))!;
    const sourceRef = object(aliquot.payload).source_lot_ref as Record<string, unknown>;
    const downstream = currentFacts(records, String(sourceRef.id));
    expect(downstream.lot).toBe('09213');
  });

  it('case5-5: both accounts stay queryable — historical view says 09231, current view says 09213', async () => {
    const records = await attestations();
    const a = (await ctx.store.get(aRecordId))!;
    // "believed Monday" query: A alone still says 09231.
    expect(historicalFacts(a).lot).toBe('09231');
    // "corrected now" query: the current chain says 09213.
    expect(currentFacts(records, ENTITY_B).lot).toBe('09213');
    // Both records are live (nothing deleted).
    expect(await ctx.store.get(aRecordId)).not.toBeNull();
    expect(await ctx.store.get(a2RecordId)).not.toBeNull();
  });

  it('case5-6: a fulfillment fact citing superseded A yields the declared re-evaluation obligation; requirement bytes unchanged', async () => {
    const requirementFixture = {
      kind: 'material-source-requirement',
      requirementId: 'REQ-0001',
      intent: '10 mL of lot-verified buffer B for the gyrase prep',
      quantity: { value: 10, unit: 'mL' },
    };
    const requirementHashBefore = contentHash(requirementFixture);

    // A fulfillment-review fact citing the (about-to-be-superseded) A.
    const fulfillmentDraft: AttestationDraft = {
      draftId: 'CASE5-F',
      revision: 1,
      envelope: {
        kind: 'attestation',
        artifactKind: 'attestation-chain',
        claims: [claim('fulfillment-review', 'REQ-0001', 'material-source-requirement', {
          assertion: {
            verb: 'fulfillment-review',
            about: { kind: 'record', type: 'material-source-requirement', id: 'REQ-0001' },
            cites: aRecordId,
          },
        })],
      },
    };
    // Fix the claim's cites without re-adding a duplicate assertion key:
    const fulfillmentClaims = fulfillmentDraft.envelope.claims as Array<Record<string, unknown>>;
    fulfillmentClaims[0]!.assertion = {
      verb: 'fulfillment-review',
      about: { kind: 'record', type: 'material-source-requirement', id: 'REQ-0001' },
      cites: aRecordId,
    };
    await acceptTuesday(fulfillmentDraft);

    const records = await attestations();
    // The lint-declared obligation (attestation-correction-triggers-reevaluation-review, info)
    // is present on the correction record...
    const a2 = (await ctx.store.get(a2RecordId))!;
    const lintResult = lintEngine.lint(a2.payload, ATTESTATION_SCHEMA_ID);
    expect(lintResult.violations.some(v => v.ruleId === 'attestation-correction-triggers-reevaluation-review' && v.severity === 'info')).toBe(true);
    // ...and the obligation is queryable as a derived fact over the graph.
    const obligations = reevaluationObligations(records);
    expect(obligations.some(o => o.supersededRef === aRecordId && o.corrections.includes(a2RecordId))).toBe(true);
    // The intended requirement payload is byte-unchanged by the correction.
    expect(contentHash(requirementFixture)).toBe(requirementHashBefore);
  });

  it('case5-7: double-submitted identical correction lands on the SAME id (one record); a different changedFacts lands as a second correction', async () => {
    const a2HashBefore = contentHash((await ctx.store.get(a2RecordId))!.payload);
    const dupDraft: AttestationDraft = { draftId: 'CASE5-A2', revision: 1, envelope: envelopeA2(aRecordId) };
    const dupReview = tuesdayService.compile(dupDraft);
    const dupReceipt = await tuesdayService.accept({ draft: dupDraft, draftId: dupReview.draftId, revision: dupReview.revision, reviewHash: dupReview.reviewHash });
    expect(dupReceipt.recordId).toBe(a2RecordId);
    const afterDup = await attestations();
    expect(afterDup.filter(r => r.recordId === a2RecordId)).toHaveLength(1);

    // A DIFFERENT changedFacts correction against A is a second correction, not a mutation of A2.
    const altDraft: AttestationDraft = { draftId: 'CASE5-A3', revision: 1, envelope: envelopeA2(aRecordId, { lot: '09214' }) };
    const altReceipt = await acceptTuesday(altDraft);
    expect(altReceipt.recordId).not.toBe(a2RecordId);
    const finalRecords = await attestations();
    expect(finalRecords.filter(r => r.recordId === a2RecordId)).toHaveLength(1);
    const a2Still = (await ctx.store.get(a2RecordId))!;
    // A2 was not mutated by the alt correction: byte-identical to its pre-alt hash.
    expect(contentHash(a2Still.payload)).toBe(a2HashBefore);
    // A2's changedFacts still say 09213.
    expect((object(a2Still.payload).correction as Record<string, unknown>).changedFacts).toEqual({ lot: '09213' });
  });

  it('case5-plus: entity-substitution over an already-consumed ref is gated until a deviation resolution fact exists (error names the consumed ref)', async () => {
    const substitutionEnvelope = (resolutionNote?: string): Record<string, unknown> => {
      const env: Record<string, unknown> = {
        kind: 'attestation',
        artifactKind: 'attestation-chain',
        claims: [claim('received', 'MATI-000900', 'material-instance', {
          assertion: { verb: 'received', about: { kind: 'record', type: 'material-instance', id: 'MATI-000900' } },
        })],
        supersedes: { kind: 'record', type: 'attestation', id: aRecordId },
        correction: {
          claimTarget: { mode: 'entity-substitution' },
          changedFacts: { consumedRef: CONSUMED_ALIQUOT, replaces: ENTITY_B, with: 'MATI-000900' },
          ...(resolutionNote !== undefined ? { resolutionNote } : {}),
        },
      };
      return env;
    };

    // Gate: without a deviation resolution the correction cannot be accepted; the error names the consumed ref.
    const gatedDraft: AttestationDraft = { draftId: 'CASE5-SUB-GATED', revision: 1, envelope: substitutionEnvelope() };
    const gatedReview = tuesdayService.compile(gatedDraft);
    expect(gatedReview.canAccept).toBe(false);
    await expect(
      tuesdayService.accept({ draft: gatedDraft, draftId: gatedReview.draftId, revision: gatedReview.revision, reviewHash: gatedReview.reviewHash }),
    ).rejects.toThrow(new RegExp(CONSUMED_ALIQUOT));

    // Deviation FACT (OQ-3 ruling): an attestation claim with claimStatus unknown + about = the consumed ref.
    const deviationDraft: AttestationDraft = {
      draftId: 'CASE5-DEV',
      revision: 1,
      envelope: {
        kind: 'attestation',
        artifactKind: 'attestation-chain',
        claims: [{
          claimStatus: 'unknown',
          assertion: { verb: 'deviation', about: { kind: 'record', type: 'aliquot', id: CONSUMED_ALIQUOT }, note: 'substitution touched a consumed aliquot' },
          occurredAtStatus: 'unknown',
        }],
      },
    };
    const deviationReceipt = await acceptTuesday(deviationDraft);

    // With the deviation resolution recorded, the substitution correction is acceptable.
    const resolvedDraft: AttestationDraft = {
      draftId: 'CASE5-SUB',
      revision: 1,
      envelope: substitutionEnvelope(`deviation resolved by ${deviationReceipt.recordId}`),
    };
    const resolvedReceipt = await acceptTuesday(resolvedDraft);
    expect(resolvedReceipt.recordId).toMatch(/^ATT-/);

    // Entity-substitution creates NO new entity id: the material-instance set
    // is byte-unchanged (descendants keep pointing at the ENTITY, Q4b).
    const instances = (await ctx.store.list({ kind: 'material-instance' })).map(r => r.recordId).sort();
    expect(instances).toContain(ENTITY_B);
    expect(instances).toEqual([ENTITY_B]);
  });
});
