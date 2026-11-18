// @vitest-environment node
/**
 * L2-JOURNEY-CHECKPOINT-1 (unit cproute) — the pending-intent checkpoint HTTP surface, driven with
 * a REAL PendingIntentStore over mkdtemp (NOT a mock double) and minimal fake fastify request/
 * reply objects. Cases: save→load round-trip (201 then 200, the EXACT document); load of an
 * absent id => 404 (never a fabricated document); resume twice with the SAME expectedVersion,
 * fired with Promise.all => exactly one 200 and one 409 (consumption-once is the store's CAS;
 * the handler compares nothing); a delta declaring request_revision => 422 `injection-refused`;
 * a contract-invalid checkpoint => 400 with the diagnostic codes and NOTHING persisted.
 */
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ContextDelta, PendingIntentCheckpoint } from '../../compiler/journey/checkpointContract.js';
import type { RecordEnvelope } from '../../store/types.js';
import { createPendingIntentHandlers } from './PendingIntentHandlers.js';

const roots: string[] = [];
async function makeRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}
afterAll(async () => { await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))); });

function makeCheckpoint(overrides: Partial<PendingIntentCheckpoint> = {}): PendingIntentCheckpoint {
  return {
    checkpoint_id: 'cp-journey-1', journey_ref: 'journey:J-7', revision: 'rev-3', thread_ref: 'thread-A',
    request_anchor: { message_id: 'msg-9', verbatim_text: 'add the elution to the plate' },
    pending_intent: { intent_id: 'intent-add-reagent', intent_revision: 'r1' }, unresolved_slots: [{ name: 'elution_volume', semantic_type: 'MaterialReference' }],
    origin: { surface: 'deck-surface', route: '/decks', active_tab: 'tab-1', record_revisions: [] },
    restoration_state: {}, expected_return_type: 'MaterialReference', status: 'resumable', concurrency_version: 1, ...overrides,
  };
}
function makeDelta(overrides: Partial<ContextDelta> = {}): ContextDelta {
  return { delta_id: 'delta-1', entries: [{
    kind: 'unresolved-slot', canonical_value: '20 uL', semantic_type: 'MaterialReference',
    source_records: [{ record_id: 'rec-44', revision: 'r2' }], source_journey_ref: 'journey:J-7', source_step_id: 'step-2',
    evidence: [], epistemic_status: 'user-selected', accepted_by: { actor: 'brad', at: '2026-11-13T00:00:00.000Z' },
  }], ...overrides };
}

/** Minimal fake reply: records status + payload (the handler always `reply.status(n).send(body)`). */
interface FakeReply { statusCode: number; body: unknown; status(n: number): FakeReply; send(b?: unknown): FakeReply }
function fakeReply(): FakeReply {
  const r: FakeReply = {
    statusCode: 200,
    body: undefined,
    status(n) { r.statusCode = n; return r; },
    send(b) { r.body = b; return r; },
  };
  return r;
}
/** Minimal fake request: header-carried user + route params/query/body, the way the routes supply them. */
type CpReq = FastifyRequest<{ Params: { endpoint: string; checkpointId?: string }; Querystring: { scope?: string; threadId?: string } }>;
function fakeRequest(params: { endpoint: string; checkpointId?: string }, opts: { body?: unknown; headers?: Record<string, string>; query?: { scope?: string; threadId?: string } } = {}): CpReq {
  return { params, body: opts.body, headers: { 'x-user-id': 'u1', ...opts.headers }, query: opts.query ?? {} } as unknown as CpReq;
}

describe('PendingIntentHandlers — HTTP surface over the checkpoint store (cproute)', () => {
  it('save then load round-trips the checkpoint document (201 then 200)', async () => {
    const root = await makeRoot('cproute-roundtrip-');
    const handlers = createPendingIntentHandlers({ rootDir: root });
    const cp = makeCheckpoint();
    const saved = fakeReply();
    await handlers.save(fakeRequest({ endpoint: 'protocols' }, { body: cp }), saved as unknown as FastifyReply);
    expect(saved.statusCode).toBe(201);
    expect(saved.body).toEqual({ checkpoint_id: 'cp-journey-1', concurrency_version: 1 });
    const loaded = fakeReply();
    await handlers.load(fakeRequest({ endpoint: 'protocols', checkpointId: 'cp-journey-1' }), loaded as unknown as FastifyReply);
    expect(loaded.statusCode).toBe(200);
    expect(loaded.body).toEqual(cp); // the EXACT document, verbatim fields intact
  });

  it('load of an absent checkpoint id => 404 with a machine-readable reason, never a fabricated document', async () => {
    const root = await makeRoot('cproute-404-');
    const handlers = createPendingIntentHandlers({ rootDir: root });
    const loaded = fakeReply();
    await handlers.load(fakeRequest({ endpoint: 'protocols', checkpointId: 'no-such-checkpoint' }), loaded as unknown as FastifyReply);
    expect(loaded.statusCode).toBe(404);
    expect(loaded.body).toMatchObject({ error: 'checkpoint-not-found' });
    expect(loaded.body).toHaveProperty('reason'); // machine-readable reason
    expect(JSON.stringify(loaded.body)).not.toContain('checkpoint_id'); // NOT a fabricated/empty document
  });

  it('two tabs resume with the SAME expectedVersion (Promise.all): exactly one 200 and one 409', async () => {
    const root = await makeRoot('cproute-double-');
    const handlers = createPendingIntentHandlers({ rootDir: root });
    await handlers.save(fakeRequest({ endpoint: 'protocols' }, { body: makeCheckpoint() }), fakeReply() as unknown as FastifyReply);
    // Two TABS in one process: two handler invocations on the same (user, endpoint, thread) —
    // the store's module-level path chain serialises them; the handler itself compares nothing.
    const [a, b] = await Promise.all([
      (async () => { const r = fakeReply(); await handlers.resume(fakeRequest({ endpoint: 'protocols', checkpointId: 'cp-journey-1' }, { body: { checkpointId: 'cp-journey-1', expectedVersion: 1, resumedBy: 'tab-A' } }), r as unknown as FastifyReply); return r; })(),
      (async () => { const r = fakeReply(); await handlers.resume(fakeRequest({ endpoint: 'protocols', checkpointId: 'cp-journey-1' }, { body: { checkpointId: 'cp-journey-1', expectedVersion: 1, resumedBy: 'tab-B' } }), r as unknown as FastifyReply); return r; })(),
    ]);
    expect([a, b].map((r) => r.statusCode).sort((x, y) => x - y)).toEqual([200, 409]); // one resume wins; the other is told it was already resumed
    const winner = a.statusCode === 200 ? a : b;
    const loser = a.statusCode === 200 ? b : a;
    expect(winner.body).toHaveProperty('receipt'); // the ONE resume receipt
    expect((winner.body as { receipt: { resumed_by: string } }).receipt.resumed_by).toMatch(/tab-/);
    expect(loser.statusCode).toBe(409);
    expect(loser.body).toMatchObject({ code: 'version_conflict' }); // the SAME code the store returned
  });

  it('a delta declaring request_revision is refused in injection mode => 422 with the store named diagnostic', async () => {
    const root = await makeRoot('cproute-delta-');
    const handlers = createPendingIntentHandlers({ rootDir: root });
    await handlers.save(fakeRequest({ endpoint: 'protocols' }, { body: makeCheckpoint() }), fakeReply() as unknown as FastifyReply);
    const refused = fakeReply();
    await handlers.attachDelta(
      fakeRequest({ endpoint: 'protocols', checkpointId: 'cp-journey-1' }, { body: makeDelta({ request_revision: { changed_fields: ['quantity'], reason: 'the user changed the volume' } }) }),
      refused as unknown as FastifyReply,
    );
    expect(refused.statusCode).toBe(422);
    expect(refused.body).toMatchObject({ code: 'injection-refused' });
  });

  it('a delta naming a checkpoint id the thread does not hold => 404 checkpoint-not-found, no fabricated association (d1bind)', async () => {
    const root = await makeRoot('cproute-deltabind-');
    const handlers = createPendingIntentHandlers({ rootDir: root });
    await handlers.save(fakeRequest({ endpoint: 'protocols' }, { body: makeCheckpoint() }), fakeReply() as unknown as FastifyReply);
    // The thread holds cp-journey-1; the path names CP-GHOST. The store never had that document,
    // so the attach must refuse — NOT echo the path segment back as if it were confirmed.
    const ghost = fakeReply();
    await handlers.attachDelta(
      fakeRequest({ endpoint: 'protocols', checkpointId: 'CP-GHOST' }, { body: makeDelta() }),
      ghost as unknown as FastifyReply,
    );
    expect(ghost.statusCode).toBe(404);
    expect(ghost.body).toMatchObject({ error: 'checkpoint-not-found' });
    expect(ghost.body).not.toHaveProperty('delta_id');
    // The SAME request with the id the thread DOES hold still attaches, and the echoed id is the confirmed document's.
    const matched = fakeReply();
    await handlers.attachDelta(
      fakeRequest({ endpoint: 'protocols', checkpointId: 'cp-journey-1' }, { body: makeDelta() }),
      matched as unknown as FastifyReply,
    );
    expect(matched.statusCode).toBe(200);
    expect(matched.body).toEqual({ delta_id: 'delta-1', checkpoint_id: 'cp-journey-1' });
  });

  it('a contract-invalid checkpoint => 400 with the diagnostic codes and NOTHING persisted', async () => {
    const root = await makeRoot('cproute-invalid-');
    const handlers = createPendingIntentHandlers({ rootDir: root });
    // 'parked' is NOT a closed CheckpointStatus — the contract (the one Ajv seam, reached via the store) is the only gate before a write.
    const rejected = fakeReply();
    await handlers.save(fakeRequest({ endpoint: 'protocols' }, { body: { ...makeCheckpoint(), status: 'parked' } }), rejected as unknown as FastifyReply);
    expect(rejected.statusCode).toBe(400);
    expect((rejected.body as { codes: string[] }).codes).toContain('status-invalid');
    // The store writes tmp-then-rename ONLY after the contract passes: no file landed.
    await expect(stat(join(root, 'u1', 'protocols', '_', 'default.checkpoint.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('resume of an absent checkpoint => 400 with the store checkpoint-not-found code (a conflict is never collapsed into it)', async () => {
    const root = await makeRoot('cproute-resume404-');
    const handlers = createPendingIntentHandlers({ rootDir: root });
    const r = fakeReply();
    await handlers.resume(fakeRequest({ endpoint: 'protocols', checkpointId: 'ghost' }, { body: { checkpointId: 'ghost', expectedVersion: 1 } }), r as unknown as FastifyReply);
    expect(r.statusCode).toBe(400);
    expect((r.body as { codes: string[] }).codes).toContain('checkpoint-not-found');
  });

  // L2-JOURNEY-FALSIFY-1 (u1refdrill): the FALSIFY-1 reference drill at the HTTP surface.
  // A fake record store (the real RecordStore's `get` seam) whose live token no longer
  // equals the checkpoint's declared origin revision — restoreCheckpoint is called, never re-implemented.
  function fakeRecordStore(contentSha: string): { get: (recordId: string) => Promise<RecordEnvelope | null> } {
    return {
      get: async (recordId: string) =>
        recordId === 'rec-1'
          ? { recordId: 'rec-1', schemaId: 'https://computable-lab.com/schema/unknown', payload: {}, meta: { contentSha } }
          : null,
    };
  }

  it('a changed origin record => 409 origin-record-changed naming the record, NO receipt; the checkpoint re-reads pending with the version unchanged (u1refdrill drill)', async () => {
    const root = await makeRoot('cproute-refdrill-');
    const handlers = createPendingIntentHandlers({ rootDir: root, recordStore: fakeRecordStore('9') });
    // BEFORE: a pending checkpoint declaring origin rec-1 at revision '7' (the live token is '9').
    const cp = makeCheckpoint({
      status: 'pending',
      origin: { surface: 'deck-surface', route: '/decks', active_tab: 'tab-1', record_revisions: [{ record_id: 'rec-1', revision: '7' }] },
    });
    await handlers.save(fakeRequest({ endpoint: 'protocols' }, { body: cp }), fakeReply() as unknown as FastifyReply);
    const before = fakeReply();
    await handlers.load(fakeRequest({ endpoint: 'protocols', checkpointId: 'cp-journey-1' }), before as unknown as FastifyReply);
    expect(before.statusCode).toBe(200);
    const blocked = fakeReply();
    await handlers.resume(fakeRequest({ endpoint: 'protocols', checkpointId: 'cp-journey-1' }, { body: { checkpointId: 'cp-journey-1', expectedVersion: 1, resumedBy: 'brad' } }), blocked as unknown as FastifyReply);
    // AC1: 409 with the NAMED code, the record id in the reason, and NO receipt field in the body.
    expect(blocked.statusCode).toBe(409);
    expect(blocked.body).toMatchObject({ error: 'origin-record-changed', code: 'origin-record-changed' });
    expect((blocked.body as { reason: string }).reason).toContain('rec-1');
    expect(blocked.body).not.toHaveProperty('receipt');
    // AC2/AC4: AFTER — the stored document is untouched: status pending, version unchanged, no resume_receipt.
    const after = fakeReply();
    await handlers.load(fakeRequest({ endpoint: 'protocols', checkpointId: 'cp-journey-1' }), after as unknown as FastifyReply);
    expect(after.statusCode).toBe(200);
    expect(after.body).toMatchObject({ status: 'pending', concurrency_version: 1 });
    expect(after.body).not.toHaveProperty('resume_receipt');
  });

  it('a vanished origin record => 409 origin-record-vanished, no receipt, checkpoint untouched (u1refdrill)', async () => {
    const root = await makeRoot('cproute-refdrillvanish-');
    // get() resolves null: the record is gone from the store entirely.
    const handlers = createPendingIntentHandlers({ rootDir: root, recordStore: fakeRecordStore('7') });
    const cp = makeCheckpoint({
      status: 'pending',
      origin: { surface: 'deck-surface', route: '/decks', active_tab: 'tab-1', record_revisions: [{ record_id: 'rec-9', revision: 'r1' }] },
    });
    await handlers.save(fakeRequest({ endpoint: 'protocols' }, { body: cp }), fakeReply() as unknown as FastifyReply);
    const blocked = fakeReply();
    await handlers.resume(fakeRequest({ endpoint: 'protocols', checkpointId: 'cp-journey-1' }, { body: { checkpointId: 'cp-journey-1', expectedVersion: 1 } }), blocked as unknown as FastifyReply);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.body).toMatchObject({ error: 'origin-record-vanished', code: 'origin-record-vanished' });
    expect(blocked.body).not.toHaveProperty('receipt');
    const after = fakeReply();
    await handlers.load(fakeRequest({ endpoint: 'protocols', checkpointId: 'cp-journey-1' }), after as unknown as FastifyReply);
    expect(after.body).toMatchObject({ status: 'pending', concurrency_version: 1 });
    expect(after.body).not.toHaveProperty('resume_receipt');
  });

  it('all origin revisions still match => 200 with the receipt exactly as today (check wired, no behaviour change); absent recordStore => identical resume (u1refdrill)', async () => {
    const root = await makeRoot('cproute-refdrillmatch-');
    // Matching token: the real restoreCheckpoint runs and passes.
    const handlers = createPendingIntentHandlers({ rootDir: root, recordStore: fakeRecordStore('7') });
    const cp = makeCheckpoint({
      origin: { surface: 'deck-surface', route: '/decks', active_tab: 'tab-1', record_revisions: [{ record_id: 'rec-1', revision: '7' }] },
    });
    await handlers.save(fakeRequest({ endpoint: 'protocols' }, { body: cp }), fakeReply() as unknown as FastifyReply);
    const ok = fakeReply();
    await handlers.resume(fakeRequest({ endpoint: 'protocols', checkpointId: 'cp-journey-1' }, { body: { checkpointId: 'cp-journey-1', expectedVersion: 1, resumedBy: 'brad' } }), ok as unknown as FastifyReply);
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toHaveProperty('receipt');
    expect((ok.body as { receipt: { resumed_by: string; outcome: string } }).receipt).toMatchObject({ resumed_by: 'brad', outcome: 'resumed' });
    // Absent recordStore: no check at all (bait 5) — the resume behaves exactly as today.
    const root2 = await makeRoot('cproute-refdrillabsent-');
    const handlers2 = createPendingIntentHandlers({ rootDir: root2 });
    await handlers2.save(fakeRequest({ endpoint: 'protocols' }, { body: makeCheckpoint() }), fakeReply() as unknown as FastifyReply);
    const ok2 = fakeReply();
    await handlers2.resume(fakeRequest({ endpoint: 'protocols', checkpointId: 'cp-journey-1' }, { body: { checkpointId: 'cp-journey-1', expectedVersion: 1 } }), ok2 as unknown as FastifyReply);
    expect(ok2.statusCode).toBe(200);
    expect(ok2.body).toHaveProperty('receipt');
  });
});
