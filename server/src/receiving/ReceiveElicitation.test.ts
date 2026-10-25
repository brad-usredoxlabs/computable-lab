/**
 * MATRES-RECV §5.4 — elicitation (emission-side) tests.
 *
 * AC-4 RESTATED per the ratified absent-before-accept posture (architect
 * ruling MATRESRECV D1/D2): the draft envelope carries NO attestedAt; after
 * accept the durable receipt's attestedAt === the pinned accept clock and
 * differs from occurredAt and from the draft's createdAt. Presence-shape +
 * value-inequality-when-present (§7 bait 8): an unknown-status receipt is
 * VALID with occurredAt ABSENT, so a bare string inequality is not the
 * contract.
 *
 * Also pinned here:
 *  - live-rail AC-2(i)/(ii): repeat-accept of an accepted revision
 *    early-returns; a re-draft of identical content lands the SAME record
 *    id with the store count staying 1 (the volatile-field idempotence);
 *  - the tool-declared `receiving` envelope vs the compile-side
 *    RECEIVING_INTENT_SCHEMA LOCKSTEP (recordDraftEnvelopeLockstep.test.ts
 *    precedent — the model-facing contract can never drift looser);
 *  - the case-4 utterance compiles to a blocked card when the vendor is
 *    unresolved, and the reported LOT INSCRIPTION SURVIVES VERBATIM in the
 *    stored draft payload (r2 discard boundary — the lint ERROR gates
 *    ACCEPTANCE only);
 *  - the emission declares artifactKind attestation-chain explicitly (Q2);
 *  - the vendor lookup is consulted for CATALOG IDENTITY ONLY: its result
 *    rides as vendorProductRef and populates NO custody/evidence/time field
 *    (P4);
 *  - parse/menu regression: all existing intents unchanged, unknown still
 *    falls to `unknown`.
 */
import { describe, expect, it, beforeAll, afterAll, beforeEach, vi } from 'vitest';
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
import { DEFAULT_CONFIG } from '../config/types.js';
import { object } from '../revisions/RecordRevisionService.js';
import { FormDraftService } from '../drafts/FormDraftService.js';
import { AGENT_INTENT_TOOL_DEF, parseAgentIntentArgs } from '../ai/submitSuggestionTool.js';
import { compileReceivingIntent, RECEIVING_INTENT_SCHEMA } from './MaterialReceivingDraft.js';
import { receivingRecordIdOf } from './receivingIdentity.js';
import type { ReceivingCompileDeps } from './MaterialReceivingDraft.js';
import type { AppContext } from '../server.js';
import type { RecordEnvelope } from '../store/types.js';

const schemaRoot = fileURLToPath(new URL('../../../schema', import.meta.url));

let registry: ReturnType<typeof createSchemaRegistry>;
let validator: ReturnType<typeof createValidator>;
let uiSpecLoader: ReturnType<typeof createUISpecLoader>;
let lintEngine: LintEngine;

beforeAll(async () => {
  registry = createSchemaRegistry();
  const loaded = await loadAllSchemas({ basePath: schemaRoot, recursive: true });
  expect(loaded.errors.map(e => `${e.path}: ${e.error}`)).toEqual([]);
  registry.addSchemas(loaded.entries);
  validator = createValidator();
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema as never, id);
  }
  uiSpecLoader = createUISpecLoader();
  await loadAllUISpecs(uiSpecLoader, schemaRoot);
  lintEngine = new LintEngine();
  const lintLoad = await loadAllLintSpecs({ basePath: schemaRoot, recursive: true });
  expect(lintLoad.errors.filter(e => /material-receiving/.test(e.path))).toEqual([]);
  for (const { name, spec } of lintLoad.specs) lintEngine.addSpec(name, spec);
}, 60000);

// ------------------------------------------------------------------ harness --
let root: string;
let ctx: AppContext;
let service: FormDraftService;

// The accept clock the rail injects into the receiving adapter's onAccept
// hook (architect ruling MATRESRECV D1/D2): pinned so the accepted
// receipt's attestedAt is assertable, and deliberately EARLIER than the
// real wall-clock of the run so attestedAt !== draft.createdAt is strict.
const PINNED_ACCEPT = '2026-10-20T14:00:00.000Z';

async function seedVendorProduct(): Promise<void> {
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
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cl-recv-elicitation-'));
  const repoAdapter = createLocalRepoAdapter({ basePath: root });
  // The append-only wall is the generic DATA knob (DEFAULT_CONFIG.server
  // .appendOnlyKinds carries 'material-receiving' — §2a one-line entry).
  const store = createRecordStore(repoAdapter, validator, lintEngine, {
    appendOnlyKinds: DEFAULT_CONFIG.server.appendOnlyKinds ?? [],
  });
  const policyBundleService = new PolicyBundleService();
  policyBundleService.loadFromDir(join(schemaRoot, 'core/policy-bundles'));
  const authorizationService = new AuthorizationService(store);
  ctx = {
    store, validator, lintEngine, schemaRegistry: registry, policyBundleService, repoAdapter,
    uiSpecLoader, authorizationService,
    workspaceRoot: root, recordsDir: root, schemaDir: schemaRoot,
  } as unknown as AppContext;
  service = new FormDraftService(ctx, 'USR-RECV-TEST', () => PINNED_ACCEPT);
  await seedVendorProduct();
}, 60000);
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });

function deps(): ReceivingCompileDeps {
  return {
    canonical: {
      get: (id: string) => ctx.store.get(id),
      exists: async (id: string) => !!(await ctx.store.get(id)),
      list: (filter?: { kind?: string }) => ctx.store.list(filter),
      validate: (env: RecordEnvelope) => ctx.store.validate(env),
      lint: (env: RecordEnvelope) => ctx.store.lint(env),
    } as never,
    validate: (doc, schemaId) => ctx.validator.validate(doc, schemaId),
    validateWithSchema: (doc, schema) => ctx.validator.validateWithSchema(doc, schema as never),
    lint: (payload, schemaId) => ctx.lintEngine.lint(payload, schemaId),
  };
}

async function canonical(): Promise<RecordEnvelope[]> {
  // form-draft + its access-policy sidecar (ensureOwnerPolicy) are draft
  // bookkeeping, not canonical lab records (the RecordDraftAdapter harness
  // convention).
  return (await ctx.store.list()).filter(r => {
    const kind = object(r.payload).kind;
    return kind !== 'form-draft' && kind !== 'access-policy';
  });
}

/** Case 4 utterance-shape: "the Sigma bottle that arrived last week, lot 09231". */
const CASE4 = {
  operation: 'compose-receiving',
  claim: {
    vendor: 'Sigma',
    productLabel: 'Trypan Blue',
    lotNumber: '09231',
    receivedByLabel: 'Brad',
    receivedByStatus: 'known',
    occurredAtStatus: 'approximate',
    occurredAt: '2026-10-13T00:00:00Z',
    approximation: 'last week',
  },
};

// ================================= AC-4 (restated): absent-before-accept + accept stamp
describe('elicited retrospective receipt (§5.4, AC-4 restated per ratified posture)', () => {
  it('AC-4: the DRAFT envelope carries NO attestedAt; after accept the durable receipt carries attestedAt === the pinned accept clock, != occurredAt and != draft.createdAt', async () => {
    // Compile side (the draft envelope): NO attestedAt — absent-before-accept
    // is ratified policy (attestation.schema.yaml $defs/AttestedAt: "Server-
    // stamped at acceptance ... ABSENT before accept: the draft carries no
    // attestedAt"). occurredAt is PRESENT (the scientist's stated date).
    const compiled = await compileReceivingIntent(CASE4, deps());
    expect(compiled.ok).toBe(true);
    const envelope = compiled.envelope!;
    const claim = (envelope.claims as Array<Record<string, unknown>>)[0]!;
    expect('attestedAt' in envelope).toBe(false);
    expect('occurredAt' in claim).toBe(true);
    expect(claim.occurredAtStatus).toBe('approximate');
    expect(claim.approximation).toBe('last week');
    expect(claim.occurredAt).toBe('2026-10-13T00:00:00Z');
    // The server never synthesized occurredAt: it is byte-verbatim the
    // scientist's stated date.
    expect(claim.occurredAt).toBe(CASE4.claim.occurredAt);

    // Accept side (the durable receipt, live rail): the receiving adapter's
    // onAccept hook stamps attestedAt from the rail's pinned accept clock.
    const draft = await service.compile({ adapter: 'receiving', intent: structuredClone(CASE4) });
    expect(draft.canAccept).toBe(true);
    const saved = await service.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash });
    const receipt = await ctx.store.get(String((saved as Record<string, unknown>).recordId));
    expect(receipt).toBeDefined();
    const receiptPayload = object(receipt!.payload);
    expect(receiptPayload.attestedAt).toBe(PINNED_ACCEPT);
    // Value-inequality-when-present: the acceptance stamp is NOT the arrival
    // and NOT the draft's creation time (bait 8 stays dead by construction).
    const draftCreatedAt = String(object((await ctx.store.get(draft.draftId))!.payload).createdAt);
    expect(receiptPayload.attestedAt).not.toBe(claim.occurredAt);
    expect(receiptPayload.attestedAt).not.toBe(draftCreatedAt);
    // occurredAt survives the accept byte-untouched (r2 ceiling).
    const receiptClaim = (receiptPayload.claims as Array<Record<string, unknown>>)[0]!;
    expect(receiptClaim.occurredAt).toBe(CASE4.claim.occurredAt);
  });

  it('AC-4 unknown variant: occurredAt ABSENT is VALID and terminal-honest (presence-shape, not a string inequality)', async () => {
    const unknownShape = {
      operation: 'compose-receiving',
      claim: {
        vendor: 'Sigma',
        productLabel: 'Trypan Blue',
        lotNumber: '09231',
        receivedByStatus: 'unknown',
        occurredAtStatus: 'unknown',
      },
    };
    const compiled = await compileReceivingIntent(unknownShape, deps());
    expect(compiled.ok).toBe(true);
    const envelope = compiled.envelope!;
    const claim = (envelope.claims as Array<Record<string, unknown>>)[0]!;
    // attestedAt ABSENT on the draft (absent-before-accept); occurredAt ABSENT
    // (never games).
    expect('attestedAt' in envelope).toBe(false);
    expect(!('occurredAt' in claim)).toBe(true);
    expect(!('approximation' in claim)).toBe(true);
    const assertion = claim.assertion as Record<string, unknown>;
    expect(!('receivedBy' in assertion)).toBe(true);
    expect(assertion.receivedByStatus).toBe('unknown');
    // Schema-valid AND lint-clean with occurredAt absent (attestedAt is
    // schema-optional: the RECV required list omits it).
    const validation = ctx.validator.validate({ ...envelope, recordId: compiled.recordId }, 'https://computable-lab.com/schema/computable-lab/material-receiving.schema.yaml');
    expect(validation.valid).toBe(true);
    const lint = lintEngine.lint({ ...envelope, recordId: compiled.recordId }, 'https://computable-lab.com/schema/computable-lab/material-receiving.schema.yaml');
    expect(lint.violations.filter(v => v.severity === 'error')).toEqual([]);
    // The accepted variant of the same unknown-shape draft carries the
    // pinned ACCEPT stamp (the stamp is not conditional on occurredAt).
    const draft = await service.compile({ adapter: 'receiving', intent: structuredClone(unknownShape) });
    expect(draft.canAccept).toBe(true);
    const saved = await service.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash });
    const receipt = await ctx.store.get(String((saved as Record<string, unknown>).recordId));
    expect(object(receipt!.payload).attestedAt).toBe(PINNED_ACCEPT);
  });

  it('the emission declares artifactKind attestation-chain explicitly (Q2: declared, never inferred)', async () => {
    const compiled = await compileReceivingIntent(CASE4, deps());
    expect(compiled.envelope!.artifactKind).toBe('attestation-chain');
  });

  it('the vendor lookup is consulted for CATALOG IDENTITY ONLY: its result rides as vendorProductRef and populates no custody/evidence/time field (P4)', async () => {
    const listSpy = vi.spyOn(ctx.store, 'list');
    const compiled = await compileReceivingIntent(CASE4, deps());
    // The catalog provider (the vendor-product corpus) WAS consulted.
    expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ kind: 'vendor-product' }));
    listSpy.mockRestore();

    const claim = (compiled.envelope!.claims as Array<Record<string, unknown>>)[0]!;
    const assertion = claim.assertion as Record<string, unknown>;
    // The hit fills vendorProductRef ONLY.
    expect(assertion.vendorProductRef).toEqual({ kind: 'record', type: 'vendor-product', id: 'VPR-SIGMA-D8418' });
    // No custody/evidence/time field came from the catalog hit: the receiver
    // is the scientist's own words, the time is the scientist's own words.
    expect(assertion.receivedBy).toEqual(expect.objectContaining({ type: 'person' }));
    expect(assertion.receivedByStatus).toBe('known');
    expect(claim.occurredAt).toBe(CASE4.claim.occurredAt);
    expect(compiled.envelope!.evidenceRefs).toBeUndefined();
    // The pinned read is the catalog source (id -> contentHash), nothing else.
    expect(Object.keys(compiled.reads!)).toEqual(['VPR-SIGMA-D8418']);
  });
});

// ============================================ r2 discard boundary (blocked, not discarded)
describe('unresolved vendor keeps the card blocked WITHOUT discarding the lot (§5.4, r2)', () => {
  it('a draft with a proposed receipt claim cannot reach accept (chain lint wall fires) and the lot inscription SURVIVES byte-verbatim in the stored draft payload', async () => {
    const before = await canonical();
    const unresolved = {
      operation: 'compose-receiving',
      claim: {
        vendor: 'Mystery Supplier',
        productLabel: 'Some buffer nobody catalogued',
        lotNumber: '09231',
        receivedByLabel: 'Brad',
        receivedByStatus: 'known',
        occurredAtStatus: 'approximate',
        occurredAt: '2026-10-13T00:00:00Z',
        approximation: 'last week',
      },
    };
    const draft = await service.compile({ adapter: 'receiving', intent: unresolved, userRequest: 'the mystery bottle that arrived last week, lot 09231' });

    // Blocked card: the chain wall (proposed claim under attestation-chain)
    // fires through the staging lint.
    expect(draft.canAccept).toBe(false);
    expect(draft.diagnostics.some(d => /chain|proposed/i.test(d.message))).toBe(true);

    // THE DISCARD BOUNDARY: the reported lot inscription survives VERBATIM in
    // the stored draft payload (the draft is stored, not dropped), and the
    // blocked card NAMES the vendor-scoped lot rule with its path — nothing
    // was silently dropped.
    const stored = await ctx.store.get(draft.draftId);
    expect(stored).toBeDefined();
    const storedIntent = object(object(stored!.payload).input).intent as Record<string, unknown>;
    const storedClaim = object(storedIntent.claim);
    expect(storedClaim.lotNumber).toBe('09231');
    expect(storedClaim.vendor).toBe('Mystery Supplier');
    // The card names the business wall that gates ACCEPTANCE (lint YAML data),
    // quoting the offending lot path — the inscription is visible, not discarded.
    expect(draft.diagnostics.some(d => /vendor-scoped lot|material-receiving-lot-requires-product/i.test(d.message))).toBe(true);
    expect(draft.diagnostics.some(d => /claims\[\*\]\.assertion\.lot/.test(d.message))).toBe(true);

    // Accept is refused; nothing canonical was written.
    await expect(service.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash })).rejects.toThrow(/blocked/i);
    expect(await canonical()).toEqual(before);
  });

  it('a lot WITHOUT a resolvable vendor-product gates ACCEPTANCE via the named lint rule while the draft keeps the inscription (blocked card names the rule)', async () => {
    const lotNoProduct = {
      operation: 'compose-receiving',
      claim: {
        vendor: 'Not In Catalog',
        lotNumber: '77777',
        receivedByStatus: 'unknown',
        occurredAtStatus: 'unknown',
      },
    };
    const draft = await service.compile({ adapter: 'receiving', intent: lotNoProduct });
    expect(draft.canAccept).toBe(false);
    expect(draft.diagnostics.some(d => /material-receiving-lot-requires-product|vendor-scoped lot/i.test(d.message))).toBe(true);
    const stored = await ctx.store.get(draft.draftId);
    expect(object(object(object(stored!.payload).input).intent).claim).toMatchObject({ lotNumber: '77777' });
  });
});

// ==================================================== adapter lifecycle (two writes)
describe('receiving adapter lifecycle through FormDraftService (§5.4, §2b)', () => {
  it('compile stages TWO writes (receipt + instance) with zero canonical writes; accept writes both atomically and the receipt is append-only immutable', async () => {
    const before = await canonical();
    const draft = await service.compile({ adapter: 'receiving', intent: CASE4, userRequest: 'the Sigma bottle that arrived last week, lot 09231' });
    expect(draft.canAccept).toBe(true);
    // Compile stages exactly the two planned writes and writes NOTHING canonical.
    expect(draft.writes.map(w => object(w.payload).kind).sort()).toEqual(['material-instance', 'material-receiving']);
    expect(await canonical()).toEqual(before);

    const saved = await service.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash });
    const receiptId = String((saved as Record<string, unknown>).recordId);
    const instanceId = String((saved as Record<string, unknown>).instanceRecordId);
    const receipt = await ctx.store.get(receiptId);
    const instance = await ctx.store.get(instanceId);
    expect(receipt).toBeDefined();
    expect(instance).toBeDefined();
    expect(object(receipt!.payload).kind).toBe('material-receiving');
    expect(object(instance!.payload).kind).toBe('material-instance');
    // attestedAt is the ACCEPT stamp from the rail's pinned accept clock
    // (the receiving adapter's onAccept hook) — NOT the compile stamp and
    // NOT the draft's createdAt (the decorative typeof check is replaced).
    expect(object(receipt!.payload).attestedAt).toBe(PINNED_ACCEPT);
    // The append-only wall (appendOnlyKinds DATA) keeps the stored receipt immutable.
    const upd = await ctx.store.update({ envelope: { ...receipt!, payload: { ...object(receipt!.payload), title: 'tampered' } } });
    expect(upd.success).toBe(false);
    expect(upd.error).toContain('APPEND_ONLY');
  });

  it('AC-2(i) live rail: repeat-accept of an accepted revision early-returns and writes nothing new (record COUNT, not response equality)', async () => {
    const draft = await service.compile({ adapter: 'receiving', intent: structuredClone(CASE4) });
    expect(draft.canAccept).toBe(true);
    const saved = await service.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash });
    const receiptId = String((saved as Record<string, unknown>).recordId);
    await service.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash });
    await service.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash });
    expect((await ctx.store.list({ kind: 'material-receiving' })).map(r => r.recordId)).toEqual([receiptId]);
    expect((await ctx.store.list({ kind: 'material-instance' })).length).toBe(1);
  });

  it('AC-2(ii) live rail: re-DRAFT of identical content under a FRESH draftId lands the SAME record id and the store count stays 1 (idempotence, never 2 arrivals)', async () => {
    const first = await service.compile({ adapter: 'receiving', intent: structuredClone(CASE4) });
    expect(first.canAccept).toBe(true);
    const firstReceiptId = String((first.result as Record<string, unknown>).recordId);
    await service.accept({ draftId: first.draftId, revision: first.revision, reviewHash: first.reviewHash });

    // A fresh draft of the SAME stated facts: the deterministic content-hash
    // id (attestedAt-excluded) names the SAME record, and the already-
    // received gate exempts the idempotent case (the current receipt IS the
    // draft's own deterministic id) — the card is NOT blocked and the accept
    // lands on the SAME single record.
    const again = await service.compile({ adapter: 'receiving', intent: structuredClone(CASE4) });
    expect(again.canAccept).toBe(true);
    expect(String((again.result as Record<string, unknown>).recordId)).toBe(firstReceiptId);
    await service.accept({ draftId: again.draftId, revision: again.revision, reviewHash: again.reviewHash });

    expect((await ctx.store.list({ kind: 'material-receiving' })).map(r => r.recordId)).toEqual([firstReceiptId]);
    expect((await ctx.store.list({ kind: 'material-instance' })).length).toBe(1);
    // The stored receipt keeps the FIRST accept's stamp: the already-accepted
    // record is never rewritten (append-only wall forecloses a rewrite anyway).
    const stored = await ctx.store.get(firstReceiptId);
    expect(object(stored!.payload).attestedAt).toBe(PINNED_ACCEPT);
  });

  it('AC-2(ii) accepted-form re-draft: a re-draft compiled AFTER the first accept is NOT blocked (the accepted form IS the plan) and lands the SAME single record — the stored receipt keeps its first accept stamp (never rewritten, never a second record)', async () => {
    const first = await service.compile({ adapter: 'receiving', intent: structuredClone(CASE4) });
    const receiptId = String((first.result as Record<string, unknown>).recordId);
    await service.accept({ draftId: first.draftId, revision: first.revision, reviewHash: first.reviewHash });

    // A fresh draft compiled AFTER the accept: the canonical lookup shows the
    // deterministic id already holds content equal modulo the acceptance
    // stamp (accepted form) -> the card is NOT blocked and the already-
    // received gate exempts the idempotent case (the current receipt IS the
    // draft's own deterministic id).
    const again = await service.compile({ adapter: 'receiving', intent: structuredClone(CASE4) });
    expect(again.canAccept).toBe(true);
    expect(String((again.result as Record<string, unknown>).recordId)).toBe(receiptId);
    await service.accept({ draftId: again.draftId, revision: again.revision, reviewHash: again.reviewHash });
    expect((await ctx.store.list({ kind: 'material-receiving' })).map(r => r.recordId)).toEqual([receiptId]);
    expect((await ctx.store.list({ kind: 'material-instance' })).length).toBe(1);
    expect(object((await ctx.store.get(receiptId))!.payload).attestedAt).toBe(PINNED_ACCEPT);
  });

  it('AC-2(iii) live rail: a CHANGED fact (arrival time) about an already-received entity WITHOUT supersedes is refused at the card with the named correction-or-distinct-arrival diagnostic and zero writes', async () => {
    const first = await service.compile({ adapter: 'receiving', intent: structuredClone(CASE4) });
    expect(first.canAccept).toBe(true);
    await service.accept({ draftId: first.draftId, revision: first.revision, reviewHash: first.reviewHash });
    const before = await canonical();

    // Same entity (the entity hash covers the stated ENTITY facts; occurredAt
    // is deliberately NOT in it — the entity is the bottle, not the story
    // about it), changed arrival time, NO supersedes -> the already-received
    // gate names the entity and the correction-or-distinct-arrival remedy.
    const changed = {
      operation: 'compose-receiving',
      claim: { ...CASE4.claim, occurredAt: '2026-10-12T00:00:00Z', approximation: 'the week before' },
    };
    const draft = await service.compile({ adapter: 'receiving', intent: changed });
    expect(draft.canAccept).toBe(false);
    expect(draft.diagnostics.some(d => /already received/i.test(d.message) && /correction|distinct arrival/i.test(d.message))).toBe(true);

    const createSpy = vi.spyOn(ctx.store, 'create');
    await expect(service.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash })).rejects.toThrow(/blocked/i);
    expect(createSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
    expect(await canonical()).toEqual(before);
  });

  it('a correction compiled from chat keeps the SAME instance entity and stages NO instance write (supersession is never a second arrival)', async () => {
    const first = await service.compile({ adapter: 'receiving', intent: CASE4 });
    const saved = await service.accept({ draftId: first.draftId, revision: first.revision, reviewHash: first.reviewHash });
    const receiptId = String((saved as Record<string, unknown>).recordId);
    const instanceId = String((saved as Record<string, unknown>).instanceRecordId);
    const instancesBefore = (await ctx.store.list({ kind: 'material-instance' })).map(r => r.recordId);

    const correction = {
      operation: 'compose-receiving',
      claim: {
        ...CASE4.claim,
        lotNumber: '09213',
        supersedesRecordId: receiptId,
        correctionNote: 'lot was misread off the packing slip',
      },
    };
    const draft = await service.compile({ adapter: 'receiving', intent: correction });
    expect(draft.canAccept).toBe(true);
    // ONE staged write (the corrected receipt) — never the instance again.
    expect(draft.writes.map(w => object(w.payload).kind)).toEqual(['material-receiving']);
    expect(object(draft.writes[0]!.payload).supersedes).toEqual(expect.objectContaining({ id: receiptId }));

    await service.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash });
    const instancesAfter = (await ctx.store.list({ kind: 'material-instance' })).map(r => r.recordId);
    // Instance id list byte-equal before/after the correction.
    expect(instancesAfter).toEqual(instancesBefore);
    expect(instancesAfter).toEqual([instanceId]);
  });
});

// ==================================================== envelope lockstep (§7 bait 3)
describe('receiving envelope lockstep — tool-def property vs compile-side schema', () => {
  type Shape = {
    type?: string;
    required?: string[];
    additionalProperties?: boolean;
    enum?: string[];
    properties?: Record<string, Shape>;
  };
  const envelope = RECEIVING_INTENT_SCHEMA as unknown as Shape;
  const toolParams = AGENT_INTENT_TOOL_DEF.function.parameters as unknown as Shape;
  const toolReceiving = toolParams.properties?.receiving;

  it('the tool-def receiving property exists and is an object shape', () => {
    expect(toolReceiving).toBeDefined();
    expect(toolReceiving?.type).toBe('object');
  });

  it('required keys are IDENTICAL on both sides (no looser model-facing contract)', () => {
    expect(toolReceiving?.required).toEqual(envelope.required);
    expect(envelope.required).toEqual(['operation', 'claim']);
  });

  it('additionalProperties:false on BOTH sides — neither side accepts smuggled keys', () => {
    expect(toolReceiving?.additionalProperties).toBe(false);
    expect(envelope.additionalProperties).toBe(false);
  });

  it('every tool-declared property exists in the compile-side envelope with the same structural type; the envelope carries ONLY the compiler-injected requestId extra', () => {
    const toolProps = toolReceiving?.properties ?? {};
    const envelopeProps = envelope.properties ?? {};
    for (const [key, shape] of Object.entries(toolProps)) {
      const twin = envelopeProps[key];
      expect(twin, `envelope is missing the tool-declared property "${key}"`).toBeDefined();
      expect(twin!.type).toBe(shape.type);
    }
    const extras = Object.keys(envelopeProps).filter(k => !(k in toolProps));
    expect(extras).toEqual(['requestId']);
  });

  it('the claim sub-shape matches on both sides (same keys, same enums)', () => {
    const toolClaim = toolReceiving?.properties?.claim;
    const envelopeClaim = envelope.properties?.claim;
    expect(toolClaim?.additionalProperties).toBe(false);
    expect(envelopeClaim?.additionalProperties).toBe(false);
    expect(Object.keys(toolClaim?.properties ?? {}).sort()).toEqual(Object.keys(envelopeClaim?.properties ?? {}).sort());
    expect(toolClaim?.properties?.receivedByStatus?.enum).toEqual(['known', 'approximate', 'unknown']);
    expect(envelopeClaim?.properties?.occurredAtStatus?.enum).toEqual(['known', 'approximate', 'unknown']);
  });
});

// ==================================================== parse/menu regression
describe('parse/menu regression (§5.4 mirror of submitSuggestionTool.test)', () => {
  it('the menu carries compose_receiving and ALL existing intents stay pinned in order', () => {
    const props = (AGENT_INTENT_TOOL_DEF.function.parameters as { properties: Record<string, { enum?: string[] }> }).properties;
    // MATRES-CHAIN (OQ-3(a) RATIFIED, DELIBERATE golden diff): compose_execute_chain
    // joins the menu tail — the one-tool lock is about the tool, not a frozen enum.
    expect(props.intent?.enum).toEqual(['event_graph', 'deck_layout', 'create_record', 'protocol_edit', 'workspace_action', 'compose_workstate', 'compose_analysis', 'query_workstate_history', 'event_shorthand', 'compose_record_draft', 'compose_receiving', 'compose_execute_chain']);
  });

  it('parses compose_receiving and retains the envelope VERBATIM (by reference — the compile endpoint is the trust boundary)', () => {
    const parsed = parseAgentIntentArgs({ intent: 'compose_receiving', receiving: CASE4 });
    expect(parsed.intent).toBe('compose_receiving');
    expect(parsed.receiving).toBe(CASE4);
  });

  it('a compose_receiving call with a non-object envelope drops the envelope (never guesses one)', () => {
    expect(parseAgentIntentArgs({ intent: 'compose_receiving' }).receiving).toBeUndefined();
    expect(parseAgentIntentArgs({ intent: 'compose_receiving', receiving: 'compose-receiving' }).receiving).toBeUndefined();
    expect(parseAgentIntentArgs({ intent: 'compose_receiving', receiving: [1, 2] }).receiving).toBeUndefined();
  });

  it('unknown intents still fall to `unknown` and existing intents parse unchanged', () => {
    expect(parseAgentIntentArgs({ intent: 'compose_receiving_but_not' }).intent).toBe('unknown');
    expect(parseAgentIntentArgs({ intent: 'compose_record_draft', recordDraft: { operation: 'compose-record', kind: 'training-material', fields: {} } }).intent).toBe('compose_record_draft');
    expect(parseAgentIntentArgs({ intent: 'event_graph', events: [] }).intent).toBe('event_graph');
  });
});

// ==================================================== correction id determinism
describe('correction id determinism (§5.4/§2a)', () => {
  it('a content-identical correction resubmitted under a FRESH draft lands the SAME record id (Q4e formula)', async () => {
    const first = await service.compile({ adapter: 'receiving', intent: CASE4 });
    const saved = await service.accept({ draftId: first.draftId, revision: first.revision, reviewHash: first.reviewHash });
    const receiptId = String((saved as Record<string, unknown>).recordId);

    const correctionIntent = {
      operation: 'compose-receiving',
      claim: { ...CASE4.claim, lotNumber: '09213', supersedesRecordId: receiptId, correctionNote: 'lot misread' },
    };
    const a = await compileReceivingIntent(correctionIntent, deps());
    const b = await compileReceivingIntent(structuredClone(correctionIntent), deps());
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a.recordId).toBe(b.recordId);
    // The id is the exported formula over (supersedes + changedFacts + mode).
    expect(a.recordId).toBe(receivingRecordIdOf(a.envelope!));
  });
});
