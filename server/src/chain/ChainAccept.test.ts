/**
 * MATRES-CHAIN §4/§9 — the end-to-end accept tests through the PRODUCTION rail.
 *
 * Verbatim ACs (§4, task list :10965-10969) mapped to named it()s:
 *  AC-1 "end-to-end fixture of the case-3' sentence" ->
 *      'case-3 end-to-end: make 1 mL, 10x100uL aliquots, 1 today, 9 at -20 -> derivation + instance + 10 aliquots + ONE attestation-chain'
 *  AC-2 "double-accept produces one chain" (store COUNTS, not responses) ->
 *      'AC-2 double-accept: repeat-accept of the same revision leaves ONE chain (store counts)'
 *      'AC-2 volatile-field exemption: two drafts compiled before either accept, accepted by DIFFERENT clocks, land ONE chain'
 *  AC-3 "partial-failure replay produces one chain" (bait 11: mid-loop create failure) ->
 *      'AC-3 partial failure: a mid-loop create fault 503s with Save-incomplete and the replay lands the tail with ONE chain'
 *  AC-4 "arithmetic lint rejects sum>prepared and orphan aliquots" ->
 *      'AC-4 arithmetic: 11x100uL > 1mL blocks the card naming volume-sum-lte-prepared with ZERO writes'
 *      'AC-4 count: declared 10 vs 9 staged aliquots blocks naming aliquot-count-matches-declared'
 *      (orphan-aliquot lint rule fires at the data level in ChainDraftSchemas.test.ts)
 *  OQ-1(a) ruling (born-in-session only, bait 12) ->
 *      'OQ-1(a): consuming a PRE-EXISTING aliquot renders unsupported-by-design (named diagnostic, canAccept:false, zero writes) — never silently converted'
 *      'bait 12: the born-in-session consumed aliquot is staged at CREATION with status consumed — the accept loop stages ZERO updates'
 *  D4 deterministic ids (bait 3) ->
 *      'D4: the same sentence twice compiles byte-identical id sets (seed-hash, never token/randomUUID)'
 *  D4 stale-source 409 ->
 *      'D4 stale source: a post-review plan edit 409s with the rail message VERBATIM'
 *  §7.2 instructed-vs-attested (D3) ->
 *      'instructed payload: plan-slot-reference stages ZERO physical records; acceptance attests nothing physical'
 *  §7.6 FULFIL ride ->
 *      'fulfillment claims ride the SAME envelope: verb fulfills, about REQE-, fulfilledBy derivation, evaluations from the DATA policy'
 *      'a plan without requirement ids yields ZERO fulfillment claims + an honest note (no minting from the chain side)'
 *  bait 4 exactOptionalPropertyTypes ->
 *      'attestedAt ABSENT from the draft envelope pre-accept and = the pinned accept clock post-accept; protocol_ref ABSENT on a one-off prep'
 *  bait 1 (rail integrity) -> this suite drives ONLY FormDraftService.compile/accept; it never
 *      instantiates AttestationAcceptService and never edits the loop.
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
import { contentHash, object } from '../revisions/RecordRevisionService.js';
import { DEFAULT_CONFIG } from '../config/types.js';
import { FormDraftService } from '../drafts/FormDraftService.js';
import type { CompiledDraft } from '../drafts/FormDraftService.js';
import { requirementOccurrenceId } from '../materials/requirementId.js';
import type { AppContext } from '../server.js';
import type { RecordEnvelope } from '../store/types.js';

let ctx: AppContext;
let root: string;
let service: FormDraftService;

const PINNED_ACCEPT = '2026-10-21T14:00:00.000Z';
const PLAN_ID = 'EVTG-CHAIN-PLAN';
const SPEC_ID = 'SPEC-CHAIN-FENOFIBRATE';
const REQUIREMENT_ID = requirementOccurrenceId(PLAN_ID, 'evt-1');

const EVENT_GRAPH_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml';
const MATERIAL_SPEC_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml';

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'cl-chain-accept-'));
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
  expect(lintLoad.errors.filter(e => /chain-draft/.test(e.path))).toEqual([]);
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
  service = new FormDraftService(ctx, 'USR-CHAIN-ACCEPT', () => PINNED_ACCEPT);

  // Fixtures the chain READS (never writes): the plan formulation + the pinned
  // plan carrying a REQE- requirement occurrence (FULFIL's mint law). Seeded
  // with skipValidation/skipLint per the FulfillmentAccept.test.ts precedent —
  // these are read-side fixtures; every CHAIN write rides the rail's REAL
  // validate + lint.
  const spec: RecordEnvelope = {
    recordId: SPEC_ID,
    schemaId: MATERIAL_SPEC_SCHEMA_ID,
    payload: {
      kind: 'material-spec', id: SPEC_ID, name: '1 mM Fenofibrate in DMSO',
      material_ref: { kind: 'ontology', id: 'CHEBI:48430', label: 'fenofibrate', namespace: 'CHEBI' },
      formulation_kind: 'single_active',
    },
  };
  const plan: RecordEnvelope = {
    recordId: PLAN_ID,
    schemaId: EVENT_GRAPH_SCHEMA_ID,
    payload: {
      kind: 'event-graph', id: PLAN_ID, name: 'Chain execute plan', labwares: [],
      events: [{
        eventId: 'evt-1',
        event_type: 'add_material',
        details: {
          wells: ['A1'],
          material_spec_ref: { kind: 'record', id: SPEC_ID, type: 'material-spec', label: '1 mM Fenofibrate' },
          composition_snapshot: [
            { component_ref: { kind: 'record', id: 'MAT-FEN', type: 'material' }, role: 'solute' },
          ],
          material_source_requirement: {
            status: 'unresolved',
            material_spec_ref: { kind: 'record', id: SPEC_ID, type: 'material-spec' },
            reason: 'Stock to be prepared in-house.',
            requirementId: REQUIREMENT_ID,
            expectedDerivations: ['preparation'],
          },
        },
      }],
    },
  };
  for (const envelope of [spec, plan]) {
    const created = await ctx.store.create({ envelope, skipValidation: true, skipLint: true });
    if (!created.success) throw new Error(`fixture seed failed (${envelope.recordId}): ${created.error}`);
  }
}, 60000);

afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

/** The case-3' sentence as the elicited intent: "make 1 mL, 10x100uL aliquots,
 *  1 today, 9 at -20" — ATTESTED posture (the scientist declares completed). */
function case3(tag: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    operation: 'compose-execute-chain',
    artifactKind: 'attestation-chain',
    plan: { recordId: PLAN_ID },
    prepared: {
      name: `Fenofibrate stock ${tag}`,
      volume: { value: 1, unit: 'mL' },
      sourceSpecRef: { kind: 'record', type: 'material-spec', id: SPEC_ID },
    },
    aliquotCount: 10,
    aliquots: [
      { disposition: 'consumed', volume: { value: 100, unit: 'uL' }, occurredAtStatus: 'known', occurredAt: '2026-10-21T10:00:00-04:00' },
      ...Array.from({ length: 9 }, () => ({
        disposition: 'stored', volume: { value: 100, unit: 'uL' },
        storage: { temperature_C: -20, location: 'cryobox-1/box-A' },
        occurredAtStatus: 'unknown',
      })),
    ],
    attested: {
      claimStatus: 'completed',
      attestorLabel: 'Brad',
      occurredAtStatus: 'known',
      occurredAt: '2026-10-21T09:30:00-04:00',
    },
    ...overrides,
  };
}

function refIdOf(value: unknown, field: string): string {
  const ref = object(object(value)[field]);
  return typeof ref.id === 'string' ? ref.id : '';
}

async function counts(): Promise<{ derivation: number; instance: number; aliquot: number; attestation: number }> {
  const [derivation, instance, aliquot, attestation] = await Promise.all([
    ctx.store.list({ kind: 'material-derivation' }),
    ctx.store.list({ kind: 'material-instance' }),
    ctx.store.list({ kind: 'aliquot' }),
    ctx.store.list({ kind: 'attestation' }),
  ]);
  return { derivation: derivation.length, instance: instance.length, aliquot: aliquot.length, attestation: attestation.length };
}

async function compileAndAccept(tag: string, overrides: Record<string, unknown> = {}): Promise<{ draft: CompiledDraft; result: Record<string, unknown> }> {
  const draft = await service.compile({ adapter: 'chain', intent: case3(tag, overrides) });
  if (!draft.canAccept) throw new Error(`compile blocked: ${draft.diagnostics.map(d => d.message).join('; ')}`);
  const result = await service.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash }) as Record<string, unknown>;
  return { draft, result };
}

describe('MATRES-CHAIN accept through the production FormDraftService rail (case-3\' end to end)', () => {
  it('case-3 end-to-end: make 1 mL, 10x100uL aliquots, 1 today, 9 at -20 -> derivation + instance + 10 aliquots + ONE attestation-chain', async () => {
    const before = await counts();
    const { draft } = await compileAndAccept('batch-A');
    // The compile staged the full graph as writes and wrote NOTHING canonical before accept.
    const kinds = draft.writes.map(w => String(object(w.payload).kind)).sort();
    expect(kinds).toEqual(['aliquot', 'aliquot', 'aliquot', 'aliquot', 'aliquot', 'aliquot', 'aliquot', 'aliquot', 'aliquot', 'aliquot', 'attestation', 'material-derivation', 'material-instance']);

    const after = await counts();
    expect(after.derivation - before.derivation).toBe(1);
    expect(after.instance - before.instance).toBe(1);
    expect(after.aliquot - before.aliquot).toBe(10);
    expect(after.attestation - before.attestation).toBe(1);

    // The instance: 1 mL, born of the derivation, spec ref rides (READ, never written).
    const instanceId = String((draft.result as Record<string, unknown>).instanceRecordId);
    const inst = object((await ctx.store.get(instanceId))!.payload);
    expect(inst.volume).toEqual({ value: 1, unit: 'mL' });
    expect(inst.material_spec_ref).toEqual({ kind: 'record', type: 'material-spec', id: SPEC_ID });
    expect(inst.derivation_ref).toBeDefined();
    expect(inst.status).toBe('available');

    // The aliquots: 10x100uL, 1 consumed AT CREATION (born-in-session), 9 stored at -20.
    const aliquots = (await ctx.store.list({ kind: 'aliquot' })).filter(a => refIdOf(a.payload, 'parent_material_instance_ref') === instanceId);
    expect(aliquots).toHaveLength(10);
    const consumed = aliquots.filter(a => object(a.payload).status === 'consumed');
    const stored = aliquots.filter(a => object(a.payload).status === 'available');
    expect(consumed).toHaveLength(1);
    expect(stored).toHaveLength(9);
    for (const a of stored) {
      expect(object(a.payload).storage).toMatchObject({ temperature_C: -20, location: 'cryobox-1/box-A' });
      expect(object(a.payload).volume).toEqual({ value: 100, unit: 'uL' });
    }

    // The derivation: preparation, protocol_ref ABSENT (one-off prep, bait 4).
    const derivationId = String((draft.result as Record<string, unknown>).derivationRecordId);
    const deriv = object((await ctx.store.get(derivationId))!.payload);
    expect(deriv.derivation_type).toBe('preparation');
    expect('protocol_ref' in deriv).toBe(false);
    expect(deriv.source_event_graph_ref).toEqual({ kind: 'record', type: 'event-graph', id: PLAN_ID });

    // The attestation: ONE envelope, artifactKind attestation-chain, attestedAt = the
    // pinned accept clock (the onAccept hook), occurredAt byte-verbatim from the scientist.
    const attId = String((draft.result as Record<string, unknown>).recordId);
    const att = object((await ctx.store.get(attId))!.payload);
    expect(att.kind).toBe('attestation');
    expect(att.artifactKind).toBe('attestation-chain');
    expect(att.attestedAt).toBe(PINNED_ACCEPT);
    const claims = att.claims as Array<Record<string, unknown>>;
    const labels = claims.map(c => String(c.claimStatus));
    expect(labels.every(l => ['completed', 'unknown', 'reported-by-other'].includes(l))).toBe(true);
    // Q5 terminal honesty: the unknown-occurrence stored claims carry NO time fields.
    for (const c of claims.filter(c => c.occurredAtStatus === 'unknown')) {
      expect('occurredAt' in c).toBe(false);
      expect('approximation' in c).toBe(false);
    }
    // The stated occurrence times survive byte-verbatim.
    expect(claims.some(c => c.occurredAt === '2026-10-21T10:00:00-04:00')).toBe(true);
  });

  it('attestedAt ABSENT from the draft envelope pre-accept (bait 4: conditional spread, never key:undefined)', async () => {
    const draft = await service.compile({ adapter: 'chain', intent: case3('batch-absent') });
    expect(draft.canAccept).toBe(true);
    const envelope = object((draft.result as Record<string, unknown>).envelope);
    expect('attestedAt' in envelope).toBe(false);
    for (const w of draft.writes) {
      if (String(object(w.payload).kind) === 'attestation') expect('attestedAt' in object(w.payload)).toBe(false);
    }
  });

  it('D4: the same sentence twice compiles byte-identical id sets (seed-hash over draft content + plan coordinate, never token/randomUUID)', async () => {
    const a = await service.compile({ adapter: 'chain', intent: case3('batch-idem') });
    const b = await service.compile({ adapter: 'chain', intent: case3('batch-idem') });
    expect(a.writes.map(w => w.recordId).sort()).toEqual(b.writes.map(w => w.recordId).sort());
    expect(String((a.result as Record<string, unknown>).recordId)).toBe(String((b.result as Record<string, unknown>).recordId));
    // And the ids are content-scoped: a DIFFERENT preparation name mints a DIFFERENT chain.
    const c = await service.compile({ adapter: 'chain', intent: case3('batch-different') });
    expect(c.writes.map(w => w.recordId).sort()).not.toEqual(a.writes.map(w => w.recordId).sort());
  });

  it('AC-2 double-accept: repeat-accept of the same revision leaves ONE chain (store COUNTS, not responses)', async () => {
    const { draft } = await compileAndAccept('batch-double');
    const instanceId = String((draft.result as Record<string, unknown>).instanceRecordId);
    await service.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash });
    await service.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash });
    const aliquots = (await ctx.store.list({ kind: 'aliquot' })).filter(a => refIdOf(a.payload, 'parent_material_instance_ref') === instanceId);
    expect(aliquots).toHaveLength(10);
    const attId = String((draft.result as Record<string, unknown>).recordId);
    expect((await ctx.store.list({ kind: 'attestation' })).filter(a => a.recordId === attId)).toHaveLength(1);
  });

  it('AC-2 volatile-field exemption (bait 2): two drafts compiled BEFORE either accept, accepted by DIFFERENT clocks, land ONE chain — never a 409 on the attestedAt delta', async () => {
    const LATER_ACCEPT = '2026-10-22T09:00:00.000Z';
    const laterService = new FormDraftService(ctx, 'USR-CHAIN-ACCEPT', () => LATER_ACCEPT);
    const a = await service.compile({ adapter: 'chain', intent: case3('batch-volatile') });
    const b = await laterService.compile({ adapter: 'chain', intent: case3('batch-volatile') });
    const attId = String((a.result as Record<string, unknown>).recordId);
    expect(String((b.result as Record<string, unknown>).recordId)).toBe(attId);
    await service.accept({ draftId: a.draftId, revision: a.revision, reviewHash: a.reviewHash });
    // B's re-evaluation re-stages writes the hook stamps with the LATER clock;
    // the durable records carry the PINNED stamp. Equal modulo the declared
    // volatile attestedAt => already accepted (create skipped, ONE chain).
    await laterService.accept({ draftId: b.draftId, revision: b.revision, reviewHash: b.reviewHash });
    expect((await ctx.store.list({ kind: 'attestation' })).filter(x => x.recordId === attId)).toHaveLength(1);
    expect(object((await ctx.store.get(attId))!.payload).attestedAt).toBe(PINNED_ACCEPT);
    const instanceId = String((a.result as Record<string, unknown>).instanceRecordId);
    expect((await ctx.store.list({ kind: 'aliquot' })).filter(x => refIdOf(x.payload, 'parent_material_instance_ref') === instanceId)).toHaveLength(10);
  });

  it('AC-2 re-draft after accept: a fresh draft of identical content lands the SAME ids and ONE chain (prior-scan equal-modulo-volatile)', async () => {
    const first = await service.compile({ adapter: 'chain', intent: case3('batch-redraft') });
    await service.accept({ draftId: first.draftId, revision: first.revision, reviewHash: first.reviewHash });
    const attId = String((first.result as Record<string, unknown>).recordId);
    const instanceId = String((first.result as Record<string, unknown>).instanceRecordId);
    const second = await service.compile({ adapter: 'chain', intent: case3('batch-redraft') });
    expect(second.canAccept).toBe(true);
    expect(String((second.result as Record<string, unknown>).recordId)).toBe(attId);
    await service.accept({ draftId: second.draftId, revision: second.revision, reviewHash: second.reviewHash });
    expect((await ctx.store.list({ kind: 'attestation' })).filter(x => x.recordId === attId)).toHaveLength(1);
    expect((await ctx.store.list({ kind: 'material-derivation' })).filter(x => x.recordId === String((first.result as Record<string, unknown>).derivationRecordId))).toHaveLength(1);
    expect((await ctx.store.list({ kind: 'aliquot' })).filter(x => refIdOf(x.payload, 'parent_material_instance_ref') === instanceId)).toHaveLength(10);
  });

  it('AC-3 partial failure (bait 11): a mid-loop create fault 503s with Save-incomplete and the replay lands the tail with ONE chain', async () => {
    const draft = await service.compile({ adapter: 'chain', intent: case3('batch-partial') });
    const instanceId = String((draft.result as Record<string, unknown>).instanceRecordId);
    const attId = String((draft.result as Record<string, unknown>).recordId);
    // Fail ONE create mid-loop (the 12th write — an aliquot), then restore.
    const targetId = draft.writes[11]!.recordId;
    const realCreate = ctx.store.create.bind(ctx.store);
    let failedOnce = false;
    ctx.store.create = async (options: Parameters<typeof realCreate>[0]) => {
      if (!failedOnce && options.envelope.recordId === targetId) {
        failedOnce = true;
        return { success: false, error: 'simulated mid-loop fault' };
      }
      return realCreate(options);
    };
    await expect(
      service.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash }),
    ).rejects.toThrow(/Save incomplete; retry Accept/i);
    ctx.store.create = realCreate;
    // Replay: existing equal-modulo-volatile records skip, the missing tail
    // creates — ONE chain, exact counts.
    await service.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash });
    expect(failedOnce).toBe(true);
    expect((await ctx.store.list({ kind: 'attestation' })).filter(x => x.recordId === attId)).toHaveLength(1);
    expect((await ctx.store.list({ kind: 'aliquot' })).filter(x => refIdOf(x.payload, 'parent_material_instance_ref') === instanceId)).toHaveLength(10);
    expect((await ctx.store.list({ kind: 'material-instance' })).filter(x => x.recordId === instanceId)).toHaveLength(1);
  });

  it('AC-4 arithmetic (DATA rule volume-sum-lte-prepared): 11x100uL > 1mL blocks the card naming the rule id, with ZERO writes', async () => {
    const intent = case3('batch-sum');
    (intent.aliquots as unknown[]).push({ disposition: 'stored', volume: { value: 100, unit: 'uL' }, storage: { temperature_C: -20 }, occurredAtStatus: 'unknown' });
    intent.aliquotCount = 11;
    const review = await service.compile({ adapter: 'chain', intent });
    expect(review.canAccept).toBe(false);
    expect(review.diagnostics.some(d => d.message.includes('volume-sum-lte-prepared'))).toBe(true);
    const createSpy = vi.spyOn(ctx.store, 'create');
    await expect(
      service.accept({ draftId: review.draftId, revision: review.revision, reviewHash: review.reviewHash }),
    ).rejects.toThrow(/blocked/i);
    expect(createSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
  });

  it('AC-4 arithmetic (DATA rule aliquot-count-matches-declared): declared 10 vs 9 staged blocks naming the rule id', async () => {
    const intent = case3('batch-count');
    (intent.aliquots as unknown[]).pop();
    const review = await service.compile({ adapter: 'chain', intent });
    expect(review.canAccept).toBe(false);
    expect(review.diagnostics.some(d => d.message.includes('aliquot-count-matches-declared'))).toBe(true);
  });

  it('OQ-1(a) ruling: consuming a PRE-EXISTING aliquot renders unsupported-by-design (named diagnostic, canAccept:false, zero writes) — never silently converted', async () => {
    const review = await service.compile({ adapter: 'chain', intent: case3('batch-cross', { consumeExistingAliquotRef: 'ALQ-SOME-BOTTLE-ALREADY-ON-THE-SHELF' }) });
    expect(review.canAccept).toBe(false);
    expect(review.diagnostics.some(d => /cross-session|out of scope|unsupported/i.test(d.message))).toBe(true);
    const createSpy = vi.spyOn(ctx.store, 'create');
    const updateSpy = vi.spyOn(ctx.store, 'update');
    await expect(
      service.accept({ draftId: review.draftId, revision: review.revision, reviewHash: review.reviewHash }),
    ).rejects.toThrow(/blocked/i);
    expect(createSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
    updateSpy.mockRestore();
  });

  it('bait 12: the born-in-session consumed aliquot is staged at CREATION (status consumed on the create) — the staged plan contains ZERO updates to pre-existing records', async () => {
    const draft = await service.compile({ adapter: 'chain', intent: case3('batch-creation') });
    // Every staged write is a CREATE of a deterministic id; the consumed aliquot
    // is among them already carrying status consumed.
    const consumedStaged = draft.writes.find(w => object(w.payload).status === 'consumed');
    expect(consumedStaged).toBeDefined();
    expect(String(object(consumedStaged!.payload).kind)).toBe('aliquot');
    // The consumption fact is ALSO a declared claim (verb consumed, about the aliquot),
    // never inferred from the status field alone (bait 10).
    const envelope = object((draft.result as Record<string, unknown>).envelope);
    const claims = envelope.claims as Array<Record<string, unknown>>;
    const consumptionClaim = claims.find(c => object(c.assertion).verb === 'consumed');
    expect(consumptionClaim).toBeDefined();
    expect(refIdOf(object(consumptionClaim!.assertion), 'about')).toBe(consumedStaged!.recordId);
  });

  it('instructed payload (D3): plan-slot-reference stages ZERO physical records; acceptance attests nothing physical', async () => {
    const intent = case3('batch-instructed', { artifactKind: 'plan-slot-reference' });
    delete (intent as Record<string, unknown>).attested;
    const draft = await service.compile({ adapter: 'chain', intent });
    expect(draft.canAccept).toBe(true);
    const kinds = draft.writes.map(w => String(object(w.payload).kind));
    expect(kinds.filter(k => k !== 'attestation')).toEqual([]); // ZERO physical writes
    const envelope = draft.writes.find(w => String(object(w.payload).kind) === 'attestation')!;
    expect(object(envelope.payload).artifactKind).toBe('plan-slot-reference');
    const result = await service.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash }) as Record<string, unknown>;
    expect(result.attestsNothingPhysical).toBe(true);
    expect((await ctx.store.list({ kind: 'aliquot' })).some(a => String(object(a.payload).name ?? '').includes('batch-instructed'))).toBe(false);
  });

  it('§7.6 FULFIL ride: fulfillment claims ride the SAME envelope — verb fulfills, about REQE-, fulfilledBy derivation, evaluations from the DATA policy, against{} pin', async () => {
    const { draft } = await compileAndAccept('batch-fulfil');
    const attId = String((draft.result as Record<string, unknown>).recordId);
    const att = object((await ctx.store.get(attId))!.payload);
    const claims = att.claims as Array<Record<string, unknown>>;
    const fulfil = claims.filter(c => object(c.assertion).fulfilledBy !== undefined);
    expect(fulfil.length).toBeGreaterThanOrEqual(1);
    const claim = fulfil[0]!;
    const assertion = object(claim.assertion);
    expect(assertion.verb).toBe('fulfills');
    expect(assertion.about).toEqual({ kind: 'record', type: 'event-requirement', id: REQUIREMENT_ID });
    expect(assertion.fulfilledBy).toBe('derivation');
    expect(assertion.requirementIds).toContain(REQUIREMENT_ID);
    expect(Array.isArray(assertion.evaluations)).toBe(true);
    const evaluations = assertion.evaluations as Array<Record<string, unknown>>;
    expect(evaluations.length).toBeGreaterThan(0); // P8 gate: NON-EMPTY evaluations (claim-ready addendum)
    expect(evaluations.every(e => ['compatible', 'mismatch', 'incomplete'].includes(String(e.verdict)))).toBe(true);
    expect(object(att.against).eventGraphRef).toEqual({ kind: 'record', type: 'event-graph', id: PLAN_ID });
    expect(typeof object(att.against).graphRevision).toBe('string');
  });

  it('§7.6 honesty: a draft with NO pinned plan carries ZERO fulfillment claims and the result says so (no minting requirement ids from the chain side)', async () => {
    const intent = case3('batch-noplan');
    delete (intent as Record<string, unknown>).plan;
    const draft = await service.compile({ adapter: 'chain', intent });
    expect(draft.canAccept).toBe(true);
    const envelope = object((draft.result as Record<string, unknown>).envelope);
    const claims = envelope.claims as Array<Record<string, unknown>>;
    expect(claims.some(c => object(c.assertion).fulfilledBy !== undefined)).toBe(false);
    expect(String((draft.result as Record<string, unknown>).fulfillmentNote)).toMatch(/no fulfillment claims/i);
  });

  it('D4 stale source: a post-review plan edit 409s with the rail message VERBATIM', async () => {
    const draft = await service.compile({ adapter: 'chain', intent: case3('batch-stale') });
    const planRecord = (await ctx.store.get(PLAN_ID))!;
    await ctx.store.update({ envelope: { ...planRecord, payload: { ...object(planRecord.payload), name: 'Edited after review' } } });
    await expect(
      service.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash }),
    ).rejects.toThrow('Source changed. Reload and review the draft.');
  });

  it('append-only wall rides the chain attestation (DATA knob, zero new code): update/delete of the stored chain hits APPEND_ONLY', async () => {
    const { draft } = await compileAndAccept('batch-wall');
    const attId = String((draft.result as Record<string, unknown>).recordId);
    const stored = (await ctx.store.get(attId))!;
    const upd = await ctx.store.update({ envelope: { ...stored, payload: { ...object(stored.payload), title: 'tampered' } } });
    expect(upd.success).toBe(false);
    expect(upd.error).toContain('APPEND_ONLY');
    const del = await ctx.store.delete({ recordId: attId });
    expect(del.success).toBe(false);
    expect(del.error).toContain('APPEND_ONLY');
  });
});
