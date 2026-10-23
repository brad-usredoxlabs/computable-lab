/**
 * MATRES-FULFIL acceptance tests (§10 AC-2/AC-3/AC-4/AC-5 + 5.11 requirementId law).
 *
 * Harness mirrors AttestationCase5.test.ts (fresh world per it(), tmp store,
 * real validator + LintEngine over the REAL schema/lint corpus, AttestationAcceptService
 * with an injectable clock) and AddMaterialSupport.test.ts (MemoryRecordStore idiom).
 *
 * RED-first: written BEFORE server/src/fulfillment/** and requirementId.ts exist.
 *
 * Verbatim AC coverage:
 *  - AC-2 (case-3' chain): plan contentSha byte-equal before/after fulfillment
 *    accept; synthesized requirement blocks carry ids; fulfillment accepted via
 *    AttestationAcceptService with against{} pins; repeat-accept -> ONE record;
 *    post-accept plan edit + re-accept -> DIFFERENT pinned revision + different
 *    id, prior fulfillment queryable.
 *  - AC-3 (Shape-A case 3): requestedSource accepted on an unresolved future
 *    add_material via the ordinary graph-update path; no decrement vocabulary.
 *  - AC-4 (case-5): receipt -> fulfilled-by-receipt (cites) -> correction
 *    supersedes receipt -> reevaluationObligations LIVE naming the fulfillment
 *    (strip-cites control) -> re-evaluation append (changedFacts vary; prior
 *    fulfillment bytes byte-unchanged; plan bytes byte-unchanged; both
 *    "believed" and "correct" queryable).
 *  - AC-5: shared material-spec contentSha byte-equal across the sequence;
 *    the accept writes EXACTLY ONE record (store spy).
 *  - 5.11 requirementId law: same anchor -> same id; content edits -> id
 *    UNCHANGED; no Date/random artifacts; mint via helper only.
 *  - 5.12 P8 trio at the ACCEPT wall: incomplete -> canAccept with claimStatus
 *    unknown; completed + incomplete -> blocked naming the rule; mismatch ->
 *    blocked; stored claimStatus byte-equal to the draft (OQ-4 pin).
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
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
import { contentHash } from '../revisions/RecordRevisionService.js';
import { DEFAULT_CONFIG } from '../config/types.js';
import { AttestationAcceptService, ATTESTATION_SCHEMA_ID } from '../attestation/AttestationAcceptService.js';
import type { AttestationDraft } from '../attestation/AttestationAcceptService.js';
import { DraftError } from '../drafts/FormDraftService.js';
import { currentAssertion, historicalClaims, reevaluationObligations } from '../attestation/CurrentAssertionView.js';
import { requirementOccurrenceId } from '../materials/requirementId.js';
import { compileFulfillmentDraft } from '../fulfillment/FulfillmentDraft.js';
import type { FulfillmentDraftRequest } from '../fulfillment/FulfillmentDraft.js';
import type { RecordEnvelope, RecordStore } from '../store/types.js';
import type { AppContext } from '../server.js';

const EVENT_GRAPH_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml';
const MATERIAL_SPEC_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml';
const MATERIAL_DERIVATION_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material-derivation.schema.yaml';
const ADD_MATERIAL_DETAIL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/workflow/events/plate-event.add-material.schema.yaml';

const MONDAY = new Date('2026-10-19T09:00:00Z');
const TUESDAY = new Date('2026-10-20T09:00:00Z');

const PLAN_ID = 'EVG-FULFIL-1';
const SPEC_ID = 'MSP-FEN-1MM';
const DERIVATION_ID = 'MDER-BATCH-7';
const RECEIPT_ID = 'ATT-RECV-SEED-1';
// The occurrence coordinate (graph recordId, eventId, slot) — the ONLY inputs
// the mint law reads (5.11). Content never enters the anchor.
const REQUIREMENT_ID = requirementOccurrenceId(PLAN_ID, 'evt-1');

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
  expect(lintLoad.errors.filter(e => /attestation|add-material/.test(e.path))).toEqual([]);
  lintSpecs = lintLoad.specs;
}, 30000);

function materialSpecEnvelope(): RecordEnvelope {
  return {
    recordId: SPEC_ID,
    schemaId: MATERIAL_SPEC_SCHEMA_ID,
    payload: {
      kind: 'material-spec',
      id: SPEC_ID,
      name: '1 mM Fenofibrate',
      material_ref: { kind: 'record', id: 'MAT-FEN', type: 'material', label: 'Fenofibrate' },
      formulation_kind: 'single_active',
    },
  };
}

function planEnvelope(name = 'Fulfilment plan'): RecordEnvelope {
  return {
    recordId: PLAN_ID,
    schemaId: EVENT_GRAPH_SCHEMA_ID,
    payload: {
      kind: 'event-graph',
      id: PLAN_ID,
      name,
      labwares: [],
      events: [
        {
          eventId: 'evt-1',
          event_type: 'add_material',
          details: {
            wells: ['A1'],
            material_spec_ref: { kind: 'record', id: SPEC_ID, type: 'material-spec', label: '1 mM Fenofibrate' },
            // composition_snapshot rides the DETAILS level (add-material
            // schema :114) — the shipped component carrier (§6b).
            composition_snapshot: [
              { component_ref: { kind: 'record', id: 'MAT-GLU', type: 'material' }, role: 'solute' },
              {
                component_ref: { kind: 'record', id: 'MAT-MEDIUM', type: 'material' },
                role: 'solvent',
                // MIXFRAC-1 nested composition (F6): the nested component_ref
                // rides the copied componentRefs (one-level stance).
                composition: [
                  { component_ref: { kind: 'record', id: 'MAT-DMEM', type: 'material' }, role: 'solute' },
                ],
              },
            ],
            material_source_requirement: {
              status: 'unresolved',
              material_spec_ref: { kind: 'record', id: SPEC_ID, type: 'material-spec' },
              reason: 'Source lot not yet selected during drafting.',
              requirementId: REQUIREMENT_ID,
              expectedDerivations: ['preparation'],
              acceptedLots: ['LOT-09231', 'LOT-09213'],
            },
          },
        },
      ],
    },
  };
}

function derivationEnvelope(): RecordEnvelope {
  return {
    recordId: DERIVATION_ID,
    schemaId: MATERIAL_DERIVATION_SCHEMA_ID,
    payload: {
      kind: 'material-derivation',
      id: DERIVATION_ID,
      name: 'Fenofibrate stock prep batch 7',
      derivation_type: 'preparation',
      inputs: [{ kind: 'record', id: 'MAT-FEN', type: 'material' }],
      outputs: [{ kind: 'record', id: SPEC_ID, type: 'material-spec' }],
    },
  };
}

/** The seeded receipt attestation (custody evidence the fulfillment cites). */
function receiptEnvelope(lot: string): RecordEnvelope {
  return {
    recordId: RECEIPT_ID,
    schemaId: ATTESTATION_SCHEMA_ID,
    payload: {
      kind: 'attestation',
      recordId: RECEIPT_ID,
      artifactKind: 'attestation-chain',
      claims: [{
        claimStatus: 'completed',
        assertion: { verb: 'received', about: { kind: 'record', type: 'material-instance', id: 'MINST-BOTTLE-1' }, lot },
        occurredAtStatus: 'known',
        occurredAt: '2026-10-19T08:30:00-04:00',
      }],
      attestedAt: '2026-10-19T09:00:00.000Z',
    },
  };
}

interface World {
  root: string;
  store: RecordStore & { createdCount: number };
  service: AttestationAcceptService;
  planHash: () => Promise<string>;
  specHash: () => Promise<string>;
  acceptDraft: (draft: AttestationDraft) => Promise<string>;
  fulfillments: () => Promise<RecordEnvelope[]>;
}

async function buildWorld(): Promise<World> {
  const root = await mkdtemp(join(tmpdir(), 'cl-fulfil-accept-'));
  const lintEngine = new LintEngine();
  for (const { name, spec } of lintSpecs) lintEngine.addSpec(name, spec);
  const base = createRecordStore(createLocalRepoAdapter({ basePath: root }), validator, lintEngine, {
    appendOnlyKinds: DEFAULT_CONFIG.server.appendOnlyKinds ?? [],
  });
  const store = Object.assign(base, { createdCount: 0 });
  const rawCreate = base.create.bind(base);
  store.create = async (options) => {
    const result = await rawCreate(options);
    if (result.success) store.createdCount += 1;
    return result;
  };
  const ctx = { store, validator, lintEngine, schemaRegistry: registry, workspaceRoot: root, recordsDir: root } as unknown as AppContext;
  const service = new AttestationAcceptService(ctx, { now: () => MONDAY });

  for (const envelope of [materialSpecEnvelope(), planEnvelope(), derivationEnvelope(), receiptEnvelope('LOT-09231')]) {
    // NOTE (base debt, disclosed not fixed): schema/lab/material-derivation.schema.yaml
    // carries a latent broken $ref ('../core/ref.schema.yaml' — the file is
    // core/datatypes/ref.schema.yaml; no baseline test ever Ajv-compiles it).
    // Seeds ride skipValidation/skipLint so this lane never depends on that
    // pre-existing defect; the fulfillment seam READS these payloads only.
    const created = await store.create({ envelope, skipValidation: true, skipLint: true });
    if (!created.success) throw new Error(`fixture seed failed (${envelope.recordId}): ${created.error}`);
  }

  const plan = await store.get(PLAN_ID);
  const spec = await store.get(SPEC_ID);
  if (!plan || !spec) throw new Error('fixture seed missing');

  return {
    root,
    store,
    service,
    planHash: async () => contentHash((await store.get(PLAN_ID))!.payload),
    specHash: async () => contentHash((await store.get(SPEC_ID))!.payload),
    acceptDraft: async (draft) => {
      const review = service.compile(draft);
      if (!review.canAccept) throw new Error(`draft not acceptable: ${review.diagnostics.join('; ')}`);
      const receipt = await service.accept({ draft, draftId: review.draftId, revision: review.revision, reviewHash: review.reviewHash });
      return receipt.recordId;
    },
    fulfillments: () => store.list({ kind: 'attestation' }),
  };
}

function derivationRequest(overrides: Partial<FulfillmentDraftRequest> = {}): FulfillmentDraftRequest {
  return {
    draftId: 'FULFIL-D1',
    revision: 1,
    planRecordId: PLAN_ID,
    requirementId: REQUIREMENT_ID,
    evidenceRecordId: DERIVATION_ID,
    fulfilledBy: 'derivation',
    claimStatus: 'completed',
    ...overrides,
  };
}

function receiptRequest(overrides: Partial<FulfillmentDraftRequest> = {}): FulfillmentDraftRequest {
  return derivationRequest({
    draftId: 'FULFIL-R1',
    evidenceRecordId: RECEIPT_ID,
    fulfilledBy: 'receipt',
    ...overrides,
  });
}

describe('5.11 requirementId law (D3 mint)', () => {
  it('same anchor -> same id (idempotent); the id is REQE-shaped and carries no Date/random artifacts', () => {
    const a = requirementOccurrenceId(PLAN_ID, 'evt-1');
    const b = requirementOccurrenceId(PLAN_ID, 'evt-1');
    expect(a).toBe(b);
    expect(a).toMatch(/^REQE-[a-z0-9-]+$/);
    expect(a).not.toMatch(/\d{13}/); // no epoch-ms artifact
  });

  it('content NEVER enters the anchor: distinct content at the same coordinate -> SAME id; distinct coordinates -> distinct ids', () => {
    const atCoordinate = requirementOccurrenceId(PLAN_ID, 'evt-1');
    // The mint signature takes ONLY the coordinate — content edits cannot even
    // be passed to it. A different event (coordinate) mints a different id.
    expect(requirementOccurrenceId(PLAN_ID, 'evt-2')).not.toBe(atCoordinate);
    expect(requirementOccurrenceId('EVG-OTHER', 'evt-1')).not.toBe(atCoordinate);
  });
});

describe('AC-2 case-3\u2032 chain (plan unaffected, ids carried, pinned revision)', () => {
  let world: World;
  beforeEach(async () => { world = await buildWorld(); }, 30000);
  afterEach(async () => { if (world?.root) await rm(world.root, { recursive: true, force: true }); });

  it('a fulfilled-by-derivation attestation accepts via AttestationAcceptService with against{} pins, and the plan contentSha is byte-equal before/after', async () => {
    const before = await world.planHash();
    const draft = await compileFulfillmentDraft(world.store, derivationRequest());
    expect(draft.reads?.[PLAN_ID]).toBe(before);
    const recordId = await world.acceptDraft(draft);
    const stored = await world.store.get(recordId);
    expect(stored).not.toBeNull();
    const payload = stored!.payload as Record<string, unknown>;
    expect(payload.kind).toBe('attestation');
    const against = payload.against as Record<string, unknown>;
    expect((against.eventGraphRef as Record<string, unknown>).id).toBe(PLAN_ID);
    expect(typeof against.graphRevision).toBe('string');
    expect(await world.planHash()).toBe(before); // plan bytes UNTOUCHED
  });

  it('repeat-accept lands on ONE record (count, not response)', async () => {
    const draft = await compileFulfillmentDraft(world.store, derivationRequest());
    const first = await world.acceptDraft(draft);
    const second = await world.acceptDraft(draft);
    expect(second).toBe(first);
    const records = await world.fulfillments();
    // receipt seed + exactly ONE fulfillment
    expect(records.filter(r => r.recordId === first)).toHaveLength(1);
    expect(records.filter(r => r.recordId !== RECEIPT_ID)).toHaveLength(1);
  });

  it('post-review plan edit: a compiled-but-unaccepted draft 409s (pinned read moved, ZERO writes); a re-compiled draft carries a DIFFERENT graphRevision + different id', async () => {
    const draft = await compileFulfillmentDraft(world.store, derivationRequest());
    const review = world.service.compile(draft);
    expect(review.canAccept).toBe(true);

    const edited = structuredClone(await world.store.get(PLAN_ID)!);
    edited.payload = { ...(edited.payload as Record<string, unknown>), name: 'Fulfilment plan (edited)' };
    const updated = await world.store.update({ envelope: edited });
    expect(updated.success).toBe(true);

    const createdBefore = world.store.createdCount;
    await expect(world.service.accept({ draft, draftId: review.draftId, revision: review.revision, reviewHash: review.reviewHash }))
      .rejects.toThrow(DraftError);
    expect(world.store.createdCount).toBe(createdBefore); // 409, ZERO writes

    const draft2 = await compileFulfillmentDraft(world.store, derivationRequest({ draftId: 'FULFIL-D2' }));
    const r1 = (draft.envelope as Record<string, unknown>).against as Record<string, unknown>;
    const r2 = (draft2.envelope as Record<string, unknown>).against as Record<string, unknown>;
    expect(r2.graphRevision).not.toBe(r1.graphRevision); // re-pinned at the new revision
    const secondId = await world.acceptDraft(draft2);
    expect(secondId).not.toBe(review.recordId); // re-pin mints a different id
  });

  it('an accepted fulfillment stays queryable after a plan edit (the pin is a reference-copy, never a live pointer)', async () => {
    const draft = await compileFulfillmentDraft(world.store, derivationRequest());
    const firstId = await world.acceptDraft(draft);
    const priorRecord = await world.store.get(firstId);
    if (!priorRecord) throw new Error('fixture: accepted fulfillment record missing');
    const pinnedRevision = ((priorRecord.payload as Record<string, unknown>).against as Record<string, unknown>).graphRevision;

    const planRecord = await world.store.get(PLAN_ID);
    if (!planRecord) throw new Error('fixture: plan record missing');
    const edited = structuredClone(planRecord);
    edited.payload = { ...(edited.payload as Record<string, unknown>), name: 'Fulfilment plan (edited)' };
    expect((await world.store.update({ envelope: edited })).success).toBe(true);

    const stillThere = await world.store.get(firstId);
    if (!stillThere) throw new Error('accepted fulfillment vanished after a plan edit');
    expect(((stillThere.payload as Record<string, unknown>).against as Record<string, unknown>).graphRevision).toBe(pinnedRevision); // bytes unchanged
  });

  it('the synthesized requirement occurrence carries its id on the plan fixture (traceability: about.id == plan requirementId byte-for-byte)', async () => {
    const draft = await compileFulfillmentDraft(world.store, derivationRequest());
    const claims = (draft.envelope as Record<string, unknown>).claims as Array<Record<string, unknown>>;
    const assertion = claims[0].assertion as Record<string, unknown>;
    expect((assertion.about as Record<string, unknown>).id).toBe(REQUIREMENT_ID);
    expect(assertion.requirementIds).toContain(REQUIREMENT_ID);
    // F6 stance: top-level AND one-level-nested component refs are copied.
    expect(assertion.componentRefs).toEqual(expect.arrayContaining(['MAT-GLU', 'MAT-MEDIUM', 'MAT-DMEM']));
  });
});

describe('AC-3 Shape-A case 3 (requested source on a future add_material, no decrement)', () => {
  let world: World;
  beforeEach(async () => { world = await buildWorld(); }, 30000);
  afterEach(async () => { if (world?.root) await rm(world.root, { recursive: true, force: true }); });

  it('requestedSource rides the ordinary graph-update path: the edited graph payload validates + lints clean, and the detail payload passes the add-material lint under status unresolved', async () => {
    const plan = structuredClone(await world.store.get(PLAN_ID)!);
    const payload = plan.payload as Record<string, unknown>;
    const events = payload.events as Array<Record<string, unknown>>;
    const details = events[0].details as Record<string, unknown>;
    const requirement = details.material_source_requirement as Record<string, unknown>;
    requirement.requestedSource = { kind: 'record', id: 'ALQ-REQUESTED-1', type: 'aliquot' };
    const updated = await world.store.update({ envelope: plan });
    expect(updated.success).toBe(true);

    const detail = {
      wells: ['A1'],
      material_spec_ref: { kind: 'record', id: SPEC_ID, type: 'material-spec' },
      material_source_requirement: requirement,
    };
    const validation = validator.validate(detail, ADD_MATERIAL_DETAIL_SCHEMA_ID);
    expect(validation.errors ?? []).toEqual([]);
    const lintEngine = new LintEngine();
    for (const { name, spec } of lintSpecs) lintEngine.addSpec(name, spec);
    const lint = lintEngine.lint(detail, ADD_MATERIAL_DETAIL_SCHEMA_ID);
    expect(lint.violations.filter(v => v.severity === 'error')).toEqual([]);
  });

  it('requestedSource under status linked is BLOCKED by the transition-membership lint data (never a TS branch)', () => {
    const lintEngine = new LintEngine();
    for (const { name, spec } of lintSpecs) lintEngine.addSpec(name, spec);
    const detail = {
      wells: ['A1'],
      material_source_requirement: {
        status: 'linked',
        requirementId: REQUIREMENT_ID,
        requestedSource: { kind: 'record', id: 'ALQ-REQUESTED-1', type: 'aliquot' },
      },
    };
    const lint = lintEngine.lint(detail, ADD_MATERIAL_DETAIL_SCHEMA_ID);
    expect(lint.valid).toBe(false);
    expect(lint.violations.map(v => v.ruleId)).toContain('add-material-requested-source-status');
  });
});

describe('AC-4 case-5 (receipt -> fulfilled-by-receipt -> correction -> re-evaluation append)', () => {
  let world: World;
  beforeEach(async () => { world = await buildWorld(); }, 30000);
  afterEach(async () => { if (world?.root) await rm(world.root, { recursive: true, force: true }); });

  it('the fulfillment cites the receipt; a correction superseding the receipt makes reevaluationObligations LIVE naming the fulfillment record', async () => {
    const draft = await compileFulfillmentDraft(world.store, receiptRequest());
    const claims = (draft.envelope as Record<string, unknown>).claims as Array<Record<string, unknown>>;
    expect((claims[0].assertion as Record<string, unknown>).cites).toBe(RECEIPT_ID);
    const fulfillmentId = await world.acceptDraft(draft);

    // Tuesday correction: supersedes the receipt (lot changed, same-entity-reattribute).
    const correctionDraft: AttestationDraft = {
      draftId: 'CORR-1',
      revision: 1,
      envelope: {
        kind: 'attestation',
        artifactKind: 'attestation-chain',
        claims: [{
          claimStatus: 'completed',
          assertion: { verb: 'received', about: { kind: 'record', type: 'material-instance', id: 'MINST-BOTTLE-1' }, lot: 'LOT-09213' },
          occurredAtStatus: 'known',
          occurredAt: '2026-10-20T08:30:00-04:00',
        }],
        supersedes: { kind: 'record', type: 'attestation', id: RECEIPT_ID },
        correction: { claimTarget: { mode: 'same-entity-reattribute' }, changedFacts: { lot: 'LOT-09213' } },
      },
    };
    const correctionId = await world.acceptDraft(correctionDraft);

    const obligations = reevaluationObligations(await world.fulfillments());
    const obligation = obligations.find(o => o.supersededRef === RECEIPT_ID);
    expect(obligation).toBeDefined();
    expect(obligation!.corrections).toContain(correctionId);
    expect(obligation!.citingRecordIds).toContain(fulfillmentId); // the fulfillment is named
  });

  it('strip-cites control: a fulfillment that cites NOTHING yields NO obligation (citation-dependence, mirroring AttestationCase5 :385-390)', async () => {
    const draft = await compileFulfillmentDraft(world.store, receiptRequest());
    // Strip the cites from the compiled claim BEFORE accept (test-side control).
    const envelope = structuredClone(draft.envelope) as Record<string, unknown>;
    const claims = envelope.claims as Array<Record<string, unknown>>;
    delete (claims[0].assertion as Record<string, unknown>).cites;
    const stripped: AttestationDraft = { ...draft, envelope };
    const fulfillmentId = await world.acceptDraft(stripped);

    const correctionDraft: AttestationDraft = {
      draftId: 'CORR-1',
      revision: 1,
      envelope: {
        kind: 'attestation',
        artifactKind: 'attestation-chain',
        claims: [{
          claimStatus: 'completed',
          assertion: { verb: 'received', about: { kind: 'record', type: 'material-instance', id: 'MINST-BOTTLE-1' }, lot: 'LOT-09213' },
          occurredAtStatus: 'known',
          occurredAt: '2026-10-20T08:30:00-04:00',
        }],
        supersedes: { kind: 'record', type: 'attestation', id: RECEIPT_ID },
        correction: { claimTarget: { mode: 'same-entity-reattribute' }, changedFacts: { lot: 'LOT-09213' } },
      },
    };
    await world.acceptDraft(correctionDraft);

    const obligations = reevaluationObligations(await world.fulfillments());
    const obligation = obligations.find(o => o.supersededRef === RECEIPT_ID);
    expect(obligation).toBeUndefined(); // nothing cites -> nothing to re-evaluate
    expect(fulfillmentId).toBeTruthy();
  });

  it('the re-evaluation is an APPEND: new attestation (re-evaluates-fulfillment + supersedes + changedFacts varying priorEvidenceRef/newEvidenceRef); prior fulfillment bytes + plan bytes byte-unchanged; both believed and correct queryable', async () => {
    const fulfillmentId = await world.acceptDraft(await compileFulfillmentDraft(world.store, receiptRequest()));
    const priorBefore = contentHash((await world.store.get(fulfillmentId))!.payload);
    const planBefore = await world.planHash();
    const specBefore = await world.specHash();

    // Correction of the receipt (Tuesday).
    const correctionId = await world.acceptDraft({
      draftId: 'CORR-1',
      revision: 1,
      envelope: {
        kind: 'attestation',
        artifactKind: 'attestation-chain',
        claims: [{
          claimStatus: 'completed',
          assertion: { verb: 'received', about: { kind: 'record', type: 'material-instance', id: 'MINST-BOTTLE-1' }, lot: 'LOT-09213' },
          occurredAtStatus: 'known',
          occurredAt: '2026-10-20T08:30:00-04:00',
        }],
        supersedes: { kind: 'record', type: 'attestation', id: RECEIPT_ID },
        correction: { claimTarget: { mode: 'same-entity-reattribute' }, changedFacts: { lot: 'LOT-09213' } },
      },
    });

    const reEvalDraft = await compileFulfillmentDraft(world.store, receiptRequest({
      draftId: 'FULFIL-R2',
      evidenceRecordId: correctionId,
      reEvaluation: {
        supersedesRecordId: fulfillmentId,
        changedFacts: { lot: 'LOT-09213', priorEvidenceRef: RECEIPT_ID, newEvidenceRef: correctionId },
      },
    }));
    const reEvalId = await world.acceptDraft(reEvalDraft);
    expect(reEvalId).not.toBe(fulfillmentId);

    const reEval = (await world.store.get(reEvalId))!.payload as Record<string, unknown>;
    const claims = reEval.claims as Array<Record<string, unknown>>;
    expect((claims[0].assertion as Record<string, unknown>).verb).toBe('re-evaluates-fulfillment');
    expect((reEval.supersedes as Record<string, unknown>).id).toBe(fulfillmentId);
    const changedFacts = ((reEval.correction as Record<string, unknown>).changedFacts) as Record<string, unknown>;
    expect(changedFacts.priorEvidenceRef).toBe(RECEIPT_ID);
    expect(changedFacts.newEvidenceRef).toBe(correctionId);

    // Prior fulfillment bytes byte-unchanged; plan + spec bytes byte-unchanged.
    expect(contentHash((await world.store.get(fulfillmentId))!.payload)).toBe(priorBefore);
    expect(await world.planHash()).toBe(planBefore);
    expect(await world.specHash()).toBe(specBefore);

    // Both the "believed" (superseded) and the "correct" (current) fulfillment are queryable.
    const all = await world.fulfillments();
    const believed = historicalClaims((await world.store.get(fulfillmentId))!);
    expect(believed.length).toBeGreaterThan(0);
    const current = currentAssertion(all, REQUIREMENT_ID);
    expect(current.sourceRecordId).toBe(reEvalId); // the current chain head is the re-evaluation
  });

  it('a re-evaluation WITHOUT varying changedFacts is BLOCKED naming fulfil-reevaluation-changed-facts-must-vary (OQ-1 stance (a) protection)', async () => {
    const fulfillmentId = await world.acceptDraft(await compileFulfillmentDraft(world.store, receiptRequest()));
    const review = world.service.compile(await compileFulfillmentDraft(world.store, receiptRequest({
      draftId: 'FULFIL-R2',
      evidenceRecordId: RECEIPT_ID,
      reEvaluation: {
        supersedesRecordId: fulfillmentId,
        changedFacts: { lot: 'LOT-09231' }, // no priorEvidenceRef/newEvidenceRef pair
      },
    })));
    expect(review.canAccept).toBe(false);
    expect(review.diagnostics.join('\n')).toContain('fulfil-reevaluation-changed-facts-must-vary');
  });
});

describe('AC-5 fulfillment NEVER mutates the shared material-spec', () => {
  let world: World;
  beforeEach(async () => { world = await buildWorld(); }, 30000);
  afterEach(async () => { if (world?.root) await rm(world.root, { recursive: true, force: true }); });

  it('material-spec contentSha byte-equal across the whole accept sequence; the accept writes EXACTLY ONE record (the attestation)', async () => {
    const specBefore = await world.specHash();
    const createdBefore = world.store.createdCount;

    const draft = await compileFulfillmentDraft(world.store, derivationRequest());
    await world.acceptDraft(draft);

    expect(await world.specHash()).toBe(specBefore);
    expect(world.store.createdCount - createdBefore).toBe(1); // exactly one write
  });

  it('an accepted fulfillment record hits the append-only wall on PUT (APPEND_ONLY carried)', async () => {
    const recordId = await world.acceptDraft(await compileFulfillmentDraft(world.store, derivationRequest()));
    const stored = await world.store.get(recordId);
    const tampered = structuredClone(stored!);
    tampered.payload = { ...(tampered.payload as Record<string, unknown>), claims: [] };
    const result = await world.store.update({ envelope: tampered });
    expect(result.success).toBe(false);
    expect(String(result.error)).toContain('APPEND_ONLY');
  });
});

describe('5.12 P8 trio at the ACCEPT wall (canAccept, not just lint)', () => {
  let world: World;
  beforeEach(async () => { world = await buildWorld(); }, 30000);
  afterEach(async () => { if (world?.root) await rm(world.root, { recursive: true, force: true }); });

  it('missing declared fact (requirement declares no acceptedLots) -> evaluation INCOMPLETE -> canAccept ONLY with claimStatus unknown; stored claimStatus byte-equal to the draft (OQ-4)', async () => {
    // Requirement WITHOUT acceptedLots: the accepted-lot check has a missing
    // declared fact -> incomplete verdict (never a silent compatible).
    const plan = structuredClone(await world.store.get(PLAN_ID)!);
    const payload = plan.payload as Record<string, unknown>;
    const events = payload.events as Array<Record<string, unknown>>;
    const requirement = (events[0].details as Record<string, unknown>).material_source_requirement as Record<string, unknown>;
    delete requirement.acceptedLots;
    expect((await world.store.update({ envelope: plan })).success).toBe(true);

    const blocked = world.service.compile(await compileFulfillmentDraft(world.store, receiptRequest()));
    expect(blocked.canAccept).toBe(false);
    expect(blocked.diagnostics.join('\n')).toContain('fulfil-completed-needs-compatible-evaluations');

    const honest = world.service.compile(await compileFulfillmentDraft(world.store, receiptRequest({ claimStatus: 'unknown' })));
    expect(honest.canAccept).toBe(true);
    const recordId = await world.acceptDraft(await compileFulfillmentDraft(world.store, receiptRequest({ claimStatus: 'unknown' })));
    const stored = (await world.store.get(recordId))!.payload as Record<string, unknown>;
    const claims = stored.claims as Array<Record<string, unknown>>;
    expect(claims[0].claimStatus).toBe('unknown'); // never rewritten by the server
    const assertion = claims[0].assertion as Record<string, unknown>;
    const evaluations = assertion.evaluations as Array<Record<string, unknown>>;
    expect(evaluations.some(e => e.verdict === 'incomplete')).toBe(true);
  });

  it('a declared mismatch (evidence lot outside the requirement acceptedLots) BLOCKS acceptance naming fulfil-mismatch-blocks', async () => {
    // The receipt evidence carries lot LOT-09231; move the requirement's
    // acceptedLots so the declared-fact comparison genuinely mismatches.
    const plan = structuredClone(await world.store.get(PLAN_ID)!);
    const payload = plan.payload as Record<string, unknown>;
    const events = payload.events as Array<Record<string, unknown>>;
    const requirement = (events[0].details as Record<string, unknown>).material_source_requirement as Record<string, unknown>;
    requirement.acceptedLots = ['LOT-OTHER'];
    expect((await world.store.update({ envelope: plan })).success).toBe(true);

    const review = world.service.compile(await compileFulfillmentDraft(world.store, receiptRequest({ draftId: 'FULFIL-M1' })));
    expect(review.canAccept).toBe(false);
    expect(review.diagnostics.join('\n')).toContain('fulfil-mismatch-blocks');
  });

  // advc DEFECT 1 (fix cycle 1): the zero-check family. fulfillment-compatibility.yaml
  // declares checks ONLY for derivation/receipt; `instance` is a spec-enumerated
  // fulfilledBy value (§7.3), so the evaluator yields evaluations: [] through the
  // SHIPPED seam. An empty array declares NO satisfaction evaluations — the P8
  // stance ("satisfaction declared, never assumed") means a completed claim for a
  // family with NO declared checks is BLOCKED, not vacuously accepted.
  it('completed fulfilled-by-instance (zero-check family -> evaluations: [] from the shipped seam) BLOCKS acceptance naming fulfil-completed-needs-compatible-evaluations (empty array = declares nothing, never a vacuous pass)', async () => {
    const draft = await compileFulfillmentDraft(world.store, derivationRequest({
      draftId: 'FULFIL-I1',
      fulfilledBy: 'instance',
      claimStatus: 'completed',
    }));
    // The seam genuinely emits the empty array (no TS branch involved — the
    // policy data declares no checks for `instance`).
    const claims = (draft.envelope as Record<string, unknown>).claims as Array<Record<string, unknown>>;
    expect((claims[0].assertion as Record<string, unknown>).evaluations).toEqual([]);

    const review = world.service.compile(draft);
    expect(review.canAccept).toBe(false);
    expect(review.diagnostics.join('\n')).toContain('fulfil-completed-needs-compatible-evaluations');
    expect(review.diagnostics.join('\n')).toContain('fulfil-evaluations-declared');
  });

  it('unknown claimStatus + zero-check family (evaluations: []) is ALSO blocked naming fulfil-evaluations-declared — a fulfillment must declare at least one evaluation whatever the label', async () => {
    const review = world.service.compile(await compileFulfillmentDraft(world.store, derivationRequest({
      draftId: 'FULFIL-I2',
      fulfilledBy: 'instance',
      claimStatus: 'unknown',
    })));
    expect(review.canAccept).toBe(false);
    expect(review.diagnostics.join('\n')).toContain('fulfil-evaluations-declared');
  });
});
