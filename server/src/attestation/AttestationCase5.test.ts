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
 *
 * ISOLATION (advc1 defect 2): every it() runs against its OWN freshly built
 * world (fresh store + Monday A accepted + entity/aliquots seeded) created in
 * beforeEach. No shared mutable module state, no order dependence: the
 * `-t "case5-N"` isolation probe passes for EVERY N in 1..7. The Tuesday
 * correction is applied INSIDE the outcomes that measure it, so each test
 * measures a real before-correction -> after-correction transition.
 *
 * Fact-key reading (advc1 defect 4): CurrentAssertionView returns the current
 * attestation + claims GENERICALLY; the `lot` reading below is a TEST-SIDE
 * consumer helper — the generic resolver hardcodes no domain fact key.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
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
  currentAssertion,
  historicalClaims,
  arrivalsForEntity,
  reevaluationObligations,
} from './CurrentAssertionView.js';
import type { AttestedClaim } from './CurrentAssertionView.js';
import type { RecordEnvelope, RecordStore } from '../store/types.js';
import type { AppContext } from '../server.js';

const MONDAY = new Date('2026-10-19T09:00:00Z');   // "believed Monday"
const TUESDAY = new Date('2026-10-20T09:00:00Z');  // "corrected now"

const ENTITY_B = 'MATI-000123'; // the bottle-B material instance
const ALIQUOT_IDS = Array.from({ length: 10 }, (_, i) => `ALQ-0000${String(i + 1).padStart(2, '0')}`);
const CONSUMED_ALIQUOT = 'ALQ-000003';

/** Schema/lint registry loaded ONCE (read-only); each test gets its own store. */
let registry: ReturnType<typeof createSchemaRegistry>;
let validator: ReturnType<typeof createValidator>;
let lintSpecs: Array<{ name: string; spec: Parameters<LintEngine['addSpec']>[1] }>;

beforeAll(async () => {
  const schemaDir = fileURLToPath(new URL('../../../schema', import.meta.url));
  registry = createSchemaRegistry();
  const loaded = await loadAllSchemas({ basePath: schemaDir, recursive: true });
  expect(loaded.errors).toEqual([]);
  registry.addSchemas(loaded.entries);
  validator = createValidator();
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema, id);
  }
  const lintLoad = await loadAllLintSpecs({ basePath: schemaDir, recursive: true });
  expect(lintLoad.errors.filter(e => /attestation/.test(e.path))).toEqual([]);
  lintSpecs = lintLoad.specs;
}, 30000);

const person = (id: string) => ({ kind: 'record', type: 'person', id });

function claim(verb: string, aboutId: string, aboutType: string, assertionExtras: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    claimStatus: 'completed',
    assertion: { verb, about: { kind: 'record', type: aboutType, id: aboutId }, ...assertionExtras },
    occurredAtStatus: 'known',
    occurredAt: '2026-10-19T08:30:00-04:00',
    performer: person('USR-op'),
    accountSupplier: person('USR-op'),
    attestor: person('USR-lablead'),
  };
}

/** Monday attestation A: receipt(lot 09231, bottle B) + prep + 10 aliquots + 1 consumption. */
function envelopeA(): Record<string, unknown> {
  const receipt = claim('received', ENTITY_B, 'material-instance', { lot: '09231', container: 'bottle B' });
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
  const correctedReceipt = claim('received', ENTITY_B, 'material-instance', { lot: String(changedFacts.lot ?? '') });
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

interface World {
  root: string;
  store: RecordStore;
  lintEngine: LintEngine;
  tuesdayService: AttestationAcceptService;
  /** Monday attestation A (accepted in beforeEach — the before-correction state). */
  aRecordId: string;
  /** Accept the Tuesday correction A2 in THIS world and return its record id. */
  acceptA2: (changedFacts?: Record<string, unknown>) => Promise<string>;
  acceptTuesday: (draft: AttestationDraft) => Promise<string>;
  attestations: () => Promise<RecordEnvelope[]>;
}

/**
 * Fresh world per it(): new tmp store, entity + 10 aliquots seeded, Monday A
 * accepted. The Tuesday correction is NOT applied here — outcomes that
 * measure it apply it themselves, so each measures a real transition.
 */
async function buildWorld(): Promise<World> {
  const root = await mkdtemp(join(tmpdir(), 'cl-attest-case5-'));
  const lintEngine = new LintEngine();
  for (const { name, spec } of lintSpecs) lintEngine.addSpec(name, spec);
  const store = createRecordStore(createLocalRepoAdapter({ basePath: root }), validator, lintEngine, {
    appendOnlyKinds: DEFAULT_CONFIG.server.appendOnlyKinds ?? [],
  });
  const ctx = { store, validator, lintEngine, schemaRegistry: registry, workspaceRoot: root, recordsDir: root } as unknown as AppContext;
  const mondayService = new AttestationAcceptService(ctx, { now: () => MONDAY });
  const tuesdayService = new AttestationAcceptService(ctx, { now: () => TUESDAY });

  const entityEnvelope: RecordEnvelope = {
    recordId: ENTITY_B,
    schemaId: 'https://computable-lab.com/schema/computable-lab/material-instance.schema.yaml',
    payload: { kind: 'material-instance', id: ENTITY_B, name: 'Bottle B', material_ref: { kind: 'record', type: 'material', id: 'MAT-BUFFER-B' } },
  };
  const seeded = await store.create({ envelope: entityEnvelope });
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
    const created = await store.create({ envelope });
    if (!created.success) throw new Error(`fixture aliquot seed failed: ${created.error}`);
  }

  const aDraft: AttestationDraft = { draftId: 'CASE5-A', revision: 1, envelope: envelopeA() };
  const aReview = mondayService.compile(aDraft);
  if (!aReview.canAccept) throw new Error(`fixture A not acceptable: ${aReview.diagnostics.join('; ')}`);
  const aReceipt = await mondayService.accept({ draft: aDraft, draftId: aReview.draftId, revision: aReview.revision, reviewHash: aReview.reviewHash });

  const acceptDraft = async (service: AttestationAcceptService, draft: AttestationDraft): Promise<string> => {
    const review = service.compile(draft);
    if (!review.canAccept) throw new Error(`fixture draft not acceptable: ${review.diagnostics.join('; ')}`);
    const receipt = await service.accept({ draft, draftId: review.draftId, revision: review.revision, reviewHash: review.reviewHash });
    return receipt.recordId;
  };

  return {
    root,
    store,
    lintEngine,
    tuesdayService,
    aRecordId: aReceipt.recordId,
    acceptA2: (changedFacts?: Record<string, unknown>) =>
      acceptDraft(tuesdayService, { draftId: 'CASE5-A2', revision: 1, envelope: envelopeA2(aReceipt.recordId, changedFacts ?? { lot: '09213' }) }),
    acceptTuesday: (draft: AttestationDraft) => acceptDraft(tuesdayService, draft),
    attestations: () => store.list({ kind: 'attestation' }),
  };
}

/**
 * TEST-SIDE consumer helper (advc1 defect 4): the generic view returns the
 * current attestation + its claims; reading a NAMED fact (`lot`) is the
 * consumer's job, not the resolver's.
 */
function lotFactFromClaims(claims: AttestedClaim[]): string | undefined {
  for (const c of claims) {
    const assertion = c.assertion as Record<string, unknown> | undefined;
    if (assertion !== undefined && typeof assertion.lot === 'string') return assertion.lot;
  }
  return undefined;
}

function lotFact(assertion: ReturnType<typeof currentAssertion>): string | undefined {
  const changed = assertion.changedFacts.lot;
  if (typeof changed === 'string') return changed;
  return lotFactFromClaims(assertion.claims);
}

describe('case-5 walkthrough (MATRES-0 Q4, seven individually-asserted outcomes)', () => {
  let world: World;

  beforeEach(async () => { world = await buildWorld(); }, 30000);
  afterEach(async () => { if (world?.root) await rm(world.root, { recursive: true, force: true }); });

  it('case5-1: A and A2 both persist and A is never rewritten (stored contentHash byte-equality)', async () => {
    const storedABefore = await world.store.get(world.aRecordId);
    expect(storedABefore).not.toBeNull();
    const aHashBefore = contentHash(storedABefore!.payload);

    const a2RecordId = await world.acceptA2();

    const storedA2 = await world.store.get(a2RecordId);
    expect(storedA2).not.toBeNull();
    // Both queryable.
    const ids = (await world.attestations()).map(r => r.recordId);
    expect(ids).toEqual(expect.arrayContaining([world.aRecordId, a2RecordId]));
    // Outcome 1 is BYTES, not vibes (bait 8): A's stored contentHash identical
    // pre-correction vs post-correction — measured from the store AFTER A2 landed.
    const storedAAfter = await world.store.get(world.aRecordId);
    expect(contentHash(storedAAfter!.payload)).toBe(aHashBefore);
  });

  it('case5-2: no second arrival — a correction never increments the arrival count for entity B', async () => {
    // BEFORE the correction: exactly one arrival.
    const beforeRecords = await world.attestations();
    expect(arrivalsForEntity(beforeRecords, ENTITY_B, 'received')).toBe(1);

    const a2RecordId = await world.acceptA2();

    // AFTER the correction: still exactly one (A is superseded; A2's single
    // receipt claim replaces it 1:1).
    const records = await world.attestations();
    expect(arrivalsForEntity(records, ENTITY_B, 'received')).toBe(1);
    // The correction did not create a second receipt-class RECORD either:
    // two receipt claims exist across history (A + A2), but only ONE is current.
    const receiptClaims = records.flatMap(r => {
      const claims = object(r.payload).claims as Array<Record<string, unknown>>;
      return claims.filter(c => (c.assertion as Record<string, unknown>).verb === 'received');
    });
    expect(receiptClaims).toHaveLength(2);
    expect(arrivalsForEntity(records, ENTITY_B, 'received')).toBeLessThan(receiptClaims.length);
    expect(a2RecordId).not.toBe(world.aRecordId);
  });

  it('case5-3: the 10 aliquot record ids are byte-unchanged after the correction', async () => {
    const idsBefore = (await world.store.list({ kind: 'aliquot' })).map(r => r.recordId).sort();
    expect(idsBefore).toEqual([...ALIQUOT_IDS].sort());
    const payloadsBefore = (await world.store.list({ kind: 'aliquot' })).map(r => contentHash(r.payload));

    await world.acceptA2();

    const afterRecords = await world.store.list({ kind: 'aliquot' });
    expect(afterRecords.map(r => r.recordId).sort()).toEqual(idsBefore);
    // Byte-unchanged, not just id-unchanged.
    expect(afterRecords.map(r => contentHash(r.payload))).toEqual(payloadsBefore);
  });

  it('case5-4: corrected source is discoverable downstream — aliquot provenance through CurrentAssertionView yields lot 09213', async () => {
    // Before the correction the view yields the believed-Monday lot.
    const beforeRecords = await world.attestations();
    expect(lotFact(currentAssertion(beforeRecords, ENTITY_B))).toBe('09231');

    await world.acceptA2();

    const records = await world.attestations();
    const assertion = currentAssertion(records, ENTITY_B);
    expect(lotFact(assertion)).toBe('09213');
    // Chain: aliquot -> entity B -> current assertion.
    const aliquot = (await world.store.get('ALQ-000001'))!;
    const sourceRef = object(aliquot.payload).source_lot_ref as Record<string, unknown>;
    const downstream = currentAssertion(records, String(sourceRef.id));
    expect(lotFact(downstream)).toBe('09213');
    // The view is generic: it names the source record, not a fact key.
    expect(downstream.sourceRecordId).toBe(assertion.sourceRecordId);
  });

  it('case5-5: both accounts stay queryable — historical view says 09231, current view says 09213', async () => {
    const a2RecordId = await world.acceptA2();
    const records = await world.attestations();
    const a = (await world.store.get(world.aRecordId))!;
    // "believed Monday" query: A alone still says 09231 (historical claims).
    expect(lotFactFromClaims(historicalClaims(a))).toBe('09231');
    // "corrected now" query: the current chain says 09213.
    expect(lotFact(currentAssertion(records, ENTITY_B))).toBe('09213');
    // The two answers differ and both records are live (nothing deleted).
    expect(lotFact(currentAssertion(records, ENTITY_B))).not.toBe(lotFactFromClaims(historicalClaims(a)));
    expect(await world.store.get(world.aRecordId)).not.toBeNull();
    expect(await world.store.get(a2RecordId)).not.toBeNull();
  });

  it('case5-6: a fulfillment fact citing superseded A yields the declared re-evaluation obligation; requirement bytes unchanged', async () => {
    // The intended requirement is PERSISTED as a real artifact on disk before
    // the correction; its bytes are measured from disk BEFORE and AFTER the
    // correction + fulfillment accept (advc1 defect 1: no hash(x)===hash(x)
    // tautology). A store record for it is out of scope: no
    // material-source-requirement schema exists (spec §1 row 7 — requirementId
    // is FULFIL's audit-first work) and inventing a kind would break the
    // OQ-2 zero-new-kinds ruling.
    const requirementFixture = {
      kind: 'material-source-requirement',
      requirementId: 'REQ-0001',
      intent: '10 mL of lot-verified buffer B for the gyrase prep',
      quantity: { value: 10, unit: 'mL' },
    };
    const requirementPath = join(world.root, 'REQ-0001.requirement.yaml');
    await writeFile(requirementPath, stringifyYaml(requirementFixture), 'utf8');
    const readRequirement = async (): Promise<{ bytes: string; payload: Record<string, unknown> }> => {
      const bytes = await readFile(requirementPath, 'utf8');
      return { bytes, payload: parseYaml(bytes) as Record<string, unknown> };
    };

    const before = await readRequirement();
    const requirementHashBefore = contentHash(before.payload);
    const requirementShaBefore = createHash('sha256').update(before.bytes).digest('hex');

    // BEFORE the correction: no supersession exists, so NO obligation exists.
    const preCorrection = await world.attestations();
    expect(reevaluationObligations(preCorrection)).toEqual([]);

    const a2RecordId = await world.acceptA2();

    // The correction ALONE does not create a live obligation: nothing yet
    // rests on the superseded evidence. (The standing lint info finding on
    // the correction record is asserted below.)
    const postCorrection = await world.attestations();
    expect(reevaluationObligations(postCorrection).some(o => o.supersededRef === world.aRecordId)).toBe(false);

    // The lint-declared obligation (attestation-correction-triggers-reevaluation-review,
    // info) is present on the correction record...
    const a2 = (await world.store.get(a2RecordId))!;
    const lintResult = world.lintEngine.lint(a2.payload, ATTESTATION_SCHEMA_ID);
    expect(lintResult.violations.some(v => v.ruleId === 'attestation-correction-triggers-reevaluation-review' && v.severity === 'info')).toBe(true);
    // ...and it is STANDING: severity info never blocks acceptance.
    expect(lintResult.valid).toBe(true);

    // A fulfillment-review fact CITING superseded A.
    const fulfillmentDraft: AttestationDraft = {
      draftId: 'CASE5-F',
      revision: 1,
      envelope: {
        kind: 'attestation',
        artifactKind: 'attestation-chain',
        claims: [claim('fulfillment-review', 'REQ-0001', 'material-source-requirement', {
          cites: world.aRecordId,
          requirementRef: { kind: 'record', type: 'material-source-requirement', id: 'REQ-0001' },
        })],
      },
    };
    const fulfillmentRecordId = await world.acceptTuesday(fulfillmentDraft);

    // NOW the obligation is live, and it is live BECAUSE of the citation:
    // it names the correction AND the citing fulfillment record.
    const records = await world.attestations();
    const obligations = reevaluationObligations(records);
    const mine = obligations.filter(o => o.supersededRef === world.aRecordId);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.corrections).toContain(a2RecordId);
    expect(mine[0]!.citingRecordIds).toEqual([fulfillmentRecordId]);
    // Without the citing fact the same graph yields nothing (the hook is
    // citation-dependent, not decorative): strip the cites from the
    // fulfillment claim in an in-memory copy of the graph.
    const fulfillmentStill = (await world.store.get(fulfillmentRecordId))!;
    const strippedClaims = (object(fulfillmentStill.payload).claims as Array<Record<string, unknown>>).map(c => {
      const assertion = { ...(c.assertion as Record<string, unknown>) };
      delete assertion.cites;
      return { ...c, assertion };
    });
    const graphWithoutCitation = [
      ...records.filter(r => r.recordId !== fulfillmentRecordId),
      { ...fulfillmentStill, payload: { ...object(fulfillmentStill.payload), claims: strippedClaims } } as RecordEnvelope,
    ];
    expect(reevaluationObligations(graphWithoutCitation).some(o => o.supersededRef === world.aRecordId)).toBe(false);

    // The persisted requirement bytes are UNCHANGED by the correction and the
    // fulfillment fact — measured from disk after both accepts.
    const after = await readRequirement();
    expect(contentHash(after.payload)).toBe(requirementHashBefore);
    expect(createHash('sha256').update(after.bytes).digest('hex')).toBe(requirementShaBefore);
    expect(after.payload).toEqual(requirementFixture);
  });

  it('case5-7: double-submitted identical correction lands on the SAME id (one record); a different changedFacts lands as a second correction', async () => {
    const a2RecordId = await world.acceptA2();
    const a2HashBefore = contentHash((await world.store.get(a2RecordId))!.payload);

    // A content-identical correction resubmitted under a FRESH draftId +
    // revision lands on the SAME record id (advc1 defect 3 / spec §2c Q4e:
    // correction identity is CONTENT-scoped, not draft-scoped).
    const dupDraft: AttestationDraft = { draftId: 'CASE5-A2-FRESH-DRAFT', revision: 7, envelope: envelopeA2(world.aRecordId) };
    const dupReview = world.tuesdayService.compile(dupDraft);
    expect(dupReview.recordId).toBe(a2RecordId);
    const dupReceipt = await world.tuesdayService.accept({ draft: dupDraft, draftId: dupReview.draftId, revision: dupReview.revision, reviewHash: dupReview.reviewHash });
    expect(dupReceipt.recordId).toBe(a2RecordId);
    const afterDup = await world.attestations();
    expect(afterDup.filter(r => r.recordId === a2RecordId)).toHaveLength(1);

    // A DIFFERENT changedFacts correction against A is a second correction, not a mutation of A2.
    const altDraft: AttestationDraft = { draftId: 'CASE5-A3', revision: 1, envelope: envelopeA2(world.aRecordId, { lot: '09214' }) };
    const altReceipt = await world.acceptTuesday(altDraft);
    expect(altReceipt.recordId).not.toBe(a2RecordId);
    const finalRecords = await world.attestations();
    expect(finalRecords.filter(r => r.recordId === a2RecordId)).toHaveLength(1);
    const a2Still = (await world.store.get(a2RecordId))!;
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
        claims: [claim('received', 'MATI-000900', 'material-instance')],
        supersedes: { kind: 'record', type: 'attestation', id: world.aRecordId },
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
    const gatedReview = world.tuesdayService.compile(gatedDraft);
    expect(gatedReview.canAccept).toBe(false);
    await expect(
      world.tuesdayService.accept({ draft: gatedDraft, draftId: gatedReview.draftId, revision: gatedReview.revision, reviewHash: gatedReview.reviewHash }),
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
    const deviationReceipt = await world.acceptTuesday(deviationDraft);

    // With the deviation resolution recorded, the substitution correction is acceptable.
    const resolvedDraft: AttestationDraft = {
      draftId: 'CASE5-SUB',
      revision: 1,
      envelope: substitutionEnvelope(`deviation resolved by ${deviationReceipt}`),
    };
    const resolvedReceipt = await world.acceptTuesday(resolvedDraft);
    expect(resolvedReceipt).toMatch(/^ATT-/);

    // Entity-substitution creates NO new entity id: the material-instance set
    // is byte-unchanged (descendants keep pointing at the ENTITY, Q4b).
    const instances = (await world.store.list({ kind: 'material-instance' })).map(r => r.recordId).sort();
    expect(instances).toContain(ENTITY_B);
    expect(instances).toEqual([ENTITY_B]);
  });
});
