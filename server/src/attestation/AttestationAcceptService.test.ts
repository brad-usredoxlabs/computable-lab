/**
 * MATRES-ATTEST §5.3 — AttestationAcceptService tests (payload-revision
 * pinning + idempotent accept).
 *
 * Harness mirrors FormDraftService.test.ts (real RecordStoreImpl over a tmp
 * dir + the full schema/lint registry). The accept flow reuses the
 * FormDraftService reviewHash discipline (FormDraftService.ts:168 reviewHash
 * re-check BEFORE the :169 already-accepted early-return) — composition, not
 * a fork of its internals.
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
import { contentHash, object } from '../revisions/RecordRevisionService.js';
import { DEFAULT_CONFIG } from '../config/types.js';
import { AttestationAcceptService } from './AttestationAcceptService.js';
import type { AttestationDraft } from './AttestationAcceptService.js';
import type { AppContext } from '../server.js';
import type { RecordEnvelope } from '../store/types.js';

let ctx: AppContext;
let root: string;
let service: AttestationAcceptService;

const PINNED_CLOCK = new Date('2026-10-19T14:00:00Z');

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'cl-attest-accept-'));
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
  expect(lintLoad.errors.filter(e => /attestation/.test(e.path))).toEqual([]);
  for (const { name, spec } of lintLoad.specs) lintEngine.addSpec(name, spec);
  // The append-only wall is the generic data knob: server.ts:532 injects
  // DEFAULT_CONFIG.server.appendOnlyKinds — same injection here.
  const store = createRecordStore(createLocalRepoAdapter({ basePath: root }), validator, lintEngine, {
    appendOnlyKinds: DEFAULT_CONFIG.server.appendOnlyKinds ?? [],
  });
  ctx = { store, validator, lintEngine, schemaRegistry: registry, workspaceRoot: root, recordsDir: root } as unknown as AppContext;
  service = new AttestationAcceptService(ctx, { now: () => PINNED_CLOCK });
}, 30000);

afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

const claim = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  claimStatus: 'completed',
  assertion: { verb: 'received', about: { kind: 'record', type: 'material-instance', id: 'MATI-000500' }, lot: '09231' },
  occurredAtStatus: 'known',
  occurredAt: '2026-10-19T08:00:00-04:00',
  ...overrides,
});

function draftFixture(overrides: Partial<AttestationDraft> = {}): AttestationDraft {
  return {
    draftId: 'ATT-DRAFT-0001',
    revision: 1,
    envelope: {
      kind: 'attestation',
      artifactKind: 'attestation-chain',
      claims: [claim()],
    },
    ...overrides,
  };
}

async function attestationRecords(): Promise<RecordEnvelope[]> {
  return (await ctx.store.list({ kind: 'attestation' }));
}

describe('AttestationAcceptService (§2b)', () => {
  it('compile validates the envelope and yields a reviewHash over the payload revision', async () => {
    const draft = draftFixture({ draftId: 'ATT-DRAFT-review' });
    const review = service.compile(draft);
    expect(review.reviewHash).toMatch(/^[a-f0-9]{64}$/);
    expect(review.canAccept).toBe(true);
    // Compile writes nothing canonical.
    expect(await attestationRecords()).toEqual([]);
  });

  it('post-accept payload mutation is rejected with ZERO writes (AC (b))', async () => {
    const draft = draftFixture({ draftId: 'ATT-DRAFT-mutate' });
    const review = service.compile(draft);
    const createSpy = vi.spyOn(ctx.store, 'create');
    const updateSpy = vi.spyOn(ctx.store, 'update');
    // AI edits the payload AFTER review: change the lot string.
    const claims = draft.envelope.claims as Array<Record<string, unknown>>;
    const assertion = claims[0]!.assertion as Record<string, unknown>;
    assertion.lot = '99999-tampered';
    await expect(
      service.accept({ draft, draftId: review.draftId, revision: review.revision, reviewHash: review.reviewHash }),
    ).rejects.toThrow(/changed/i);
    // Zero writes is the proof, not just the 409.
    expect(createSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
    updateSpy.mockRestore();
    expect(await attestationRecords()).toEqual([]);
  });

  it('double submission is idempotent: one record, identical receipts (task-block named test)', async () => {
    const draft = draftFixture({ draftId: 'ATT-DRAFT-double' });
    const review = service.compile(draft);
    const input = { draft, draftId: review.draftId, revision: review.revision, reviewHash: review.reviewHash };
    const first = await service.accept(input);
    const second = await service.accept(input);
    const records = await attestationRecords();
    const mine = records.filter(r => r.recordId === first.recordId);
    expect(mine).toHaveLength(1);
    expect(second).toEqual(first);
    // Third accept: still exactly one record (create-if-absent + deterministic id).
    await service.accept(input);
    expect((await attestationRecords()).filter(r => r.recordId === first.recordId)).toHaveLength(1);
  });

  it('attestedAt is server-stamped from the injected clock; occurredAt is never rewritten', async () => {
    const draft = draftFixture({ draftId: 'ATT-DRAFT-clock' });
    const review = service.compile(draft);
    const receipt = await service.accept({ draft, draftId: review.draftId, revision: review.revision, reviewHash: review.reviewHash });
    expect(receipt.attestedAt).toBe(PINNED_CLOCK.toISOString());
    const stored = await ctx.store.get(receipt.recordId);
    expect(stored).not.toBeNull();
    const storedClaims = (object(stored!.payload).claims) as Array<Record<string, unknown>>;
    // occurredAt preserved byte-verbatim from the draft — the server never writes it.
    expect(storedClaims[0]!.occurredAt).toBe('2026-10-19T08:00:00-04:00');
  });

  it('unknown-status payload comes out with occurredAt ABSENT (no server synthesis, Q5)', async () => {
    const unknownClaim = claim({ occurredAtStatus: 'unknown' });
    delete unknownClaim.occurredAt;
    const draft = draftFixture({ draftId: 'ATT-DRAFT-unknown', envelope: {
      kind: 'attestation', artifactKind: 'attestation-chain', claims: [unknownClaim],
    } });
    const review = service.compile(draft);
    const receipt = await service.accept({ draft, draftId: review.draftId, revision: review.revision, reviewHash: review.reviewHash });
    const stored = await ctx.store.get(receipt.recordId);
    const storedClaims = (object(stored!.payload).claims) as Array<Record<string, unknown>>;
    expect('occurredAt' in storedClaims[0]!).toBe(false);
    expect('approximation' in storedClaims[0]!).toBe(false);
    // attestedAt IS present (server-stamped acceptance time) — distinct from occurredAt.
    expect(typeof object(stored!.payload).attestedAt).toBe('string');
  });

  it('against pinning survives accept byte-stable', async () => {
    const graphEnvelope: RecordEnvelope = {
      recordId: 'EVTG-0001',
      schemaId: 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml',
      payload: { kind: 'event-graph', id: 'EVG-0001', events: [], labwares: [] },
    };
    const created = await ctx.store.create({ envelope: graphEnvelope });
    expect(created.success).toBe(true);
    const graphHash = contentHash(graphEnvelope.payload);
    const against = {
      eventGraphRef: { kind: 'record', type: 'event-graph', id: 'EVTG-0001' },
      graphRevision: graphHash,
    };
    const draft = draftFixture({
      draftId: 'ATT-DRAFT-pin',
      envelope: { kind: 'attestation', artifactKind: 'attestation-chain', claims: [claim()], against },
      reads: { 'EVTG-0001': graphHash },
    });
    const review = service.compile(draft);
    const receipt = await service.accept({ draft, draftId: review.draftId, revision: review.revision, reviewHash: review.reviewHash });
    const stored = await ctx.store.get(receipt.recordId);
    // Reference-copy semantics: the pin is frozen payload data, byte-stable.
    expect(object(stored!.payload).against).toEqual(against);
  });

  it('a graph sha that moved after compile is refused at the accept re-check (409, zero writes)', async () => {
    const graphEnvelope: RecordEnvelope = {
      recordId: 'EVTG-0002',
      schemaId: 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml',
      payload: { kind: 'event-graph', id: 'EVG-0002', events: [], labwares: [] },
    };
    expect((await ctx.store.create({ envelope: graphEnvelope })).success).toBe(true);
    const staleHash = contentHash(graphEnvelope.payload);
    // Distinct envelope (own claim about MATI-000502) so the deterministic id is
    // this draft's own — the zero-write proof is scoped to that record id.
    const draft = draftFixture({
      draftId: 'ATT-DRAFT-stalepin',
      envelope: { kind: 'attestation', artifactKind: 'attestation-chain', claims: [
        claim({ assertion: { verb: 'received', about: { kind: 'record', type: 'material-instance', id: 'MATI-000502' }, lot: '09231' } }),
      ], against: {
        eventGraphRef: { kind: 'record', type: 'event-graph', id: 'EVTG-0002' },
        graphRevision: staleHash,
      } },
      reads: { 'EVTG-0002': staleHash },
    });
    const review = service.compile(draft);
    // Mutate the graph AFTER compile: the pin no longer matches the live source.
    const live = (await ctx.store.get('EVTG-0002'))!;
    const moved = await ctx.store.update({ envelope: { ...live, payload: { ...object(live.payload), name: 'edited after review' } } });
    expect(moved.success).toBe(true);
    const createSpy = vi.spyOn(ctx.store, 'create');
    await expect(
      service.accept({ draft, draftId: review.draftId, revision: review.revision, reviewHash: review.reviewHash }),
    ).rejects.toThrow(/changed|stale/i);
    expect(createSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
    // Zero writes: this draft's deterministic record id was never created.
    expect(await ctx.store.get(review.recordId)).toBeNull();
  });

  it('a content-identical correction resubmitted under a FRESH draftId lands on the SAME record id (Q4e, §2c)', async () => {
    const supersedes = { kind: 'record', type: 'attestation', id: 'ATT-TARGET-0001' };
    const correction = {
      claimTarget: { mode: 'same-entity-reattribute' },
      changedFacts: { lot: '09213' },
    };
    const envelope = { kind: 'attestation', artifactKind: 'attestation-chain', claims: [claim()], supersedes, correction };
    const firstDraft: AttestationDraft = { draftId: 'ATT-DRAFT-CORR-1', revision: 1, envelope };
    const firstReview = service.compile(firstDraft);
    expect(firstReview.canAccept).toBe(true);
    const first = await service.accept({ draft: firstDraft, draftId: firstReview.draftId, revision: firstReview.revision, reviewHash: firstReview.reviewHash });

    // SAME correction content (supersedes + changedFacts + claimTarget.mode),
    // FRESH draftId + revision: content-scoped identity (Q4e) mints the SAME
    // record id — a draft-scoped id would mint a duplicate correction record.
    const freshDraft: AttestationDraft = { draftId: 'ATT-DRAFT-CORR-2', revision: 9, envelope: { ...envelope } };
    const freshReview = service.compile(freshDraft);
    expect(freshReview.recordId).toBe(first.recordId);
    const fresh = await service.accept({ draft: freshDraft, draftId: freshReview.draftId, revision: freshReview.revision, reviewHash: freshReview.reviewHash });
    expect(fresh.recordId).toBe(first.recordId);
    // Exactly ONE correction record, proven by count, not response equality.
    const mine = (await attestationRecords()).filter(r => r.recordId === first.recordId);
    expect(mine).toHaveLength(1);
  });

  it('a lint-invalid envelope (chain carrying a proposed claim) is refused before any write', async () => {
    const draft = draftFixture({ draftId: 'ATT-DRAFT-lint', envelope: {
      kind: 'attestation', artifactKind: 'attestation-chain',
      claims: [claim({ claimStatus: 'proposed' })],
    } });
    const review = service.compile(draft);
    expect(review.canAccept).toBe(false);
    const createSpy = vi.spyOn(ctx.store, 'create');
    await expect(
      service.accept({ draft, draftId: review.draftId, revision: review.revision, reviewHash: review.reviewHash }),
    ).rejects.toThrow(/proposed|claim/i);
    expect(createSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
  });
});
