// @vitest-environment node
/**
 * L2-JOURNEY-CHECKPOINT-1 (unit cpstore3) — the pending-intent checkpoint store
 * contract. mkdtemp roots under os.tmpdir(), removed in afterAll; nothing is
 * written outside a root. Cases: round-trip; malformed file => null (NO-FALLBACK);
 * a contract-rejected checkpoint is NOT persisted; the consumption-once compare-and-set
 * fired with Promise.all (two store instances = two tabs); post-resume state; a
 * revision-requiring delta refused in injection mode; a `..` scope cannot escape rootDir.
 */
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { ContextDelta, PendingIntentCheckpoint } from '../compiler/journey/checkpointContract.js';
import { DEFAULT_THREAD_SCOPE } from './AiThreadStore.js';
import { PendingIntentStore } from './PendingIntentStore.js';

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
/** Absent scope lands under the reserved segment (DEFAULT_THREAD_SCOPE). */
function fileAt(root: string): string {
  return join(root, 'u1', 'protocols', DEFAULT_THREAD_SCOPE, 'thread-A.checkpoint.json');
}
function resumeInput(id: string, at: string, by: string) {
  return { expectedVersion: 1, receiptId: id, resumedAt: at, resumedBy: by, outcome: 'returned-to-prompt' };
}
function store(root: string, scope?: string) {
  return new PendingIntentStore({ rootDir: root, userId: 'u1', endpoint: 'protocols', ...(scope === undefined ? {} : { scope }), threadId: 'thread-A' });
}

describe('PendingIntentStore — durable checkpoint beside the thread (cpstore3)', () => {
  it('save then load round-trips the contract-validated document', async () => {
    const s = store(await makeRoot('cpstore3-roundtrip-'));
    expect(await s.load('cp-journey-1')).toBeNull(); // absent before any write
    const cp = makeCheckpoint();
    await expect(s.save(cp)).resolves.toMatchObject({ ok: true });
    expect(await s.load('cp-journey-1')).toEqual(cp);
  });

  it('a wrong id and a malformed file both yield null (NO-FALLBACK)', async () => {
    const root = await makeRoot('cpstore3-malformed-');
    const s = store(root);
    await expect(s.save(makeCheckpoint())).resolves.toMatchObject({ ok: true });
    expect(await s.load('other-checkpoint-id')).toBeNull();
    await writeFile(fileAt(root), '{ this is not json', 'utf8');
    expect(await s.load('cp-journey-1')).toBeNull();
  });

  it('a checkpoint the contract rejects is NOT persisted (file absent afterwards)', async () => {
    const root = await makeRoot('cpstore3-rejected-');
    // 'parked' is NOT a closed CheckpointStatus — save() takes unknown; the contract is the last gate before a write.
    const result = await store(root).save({ ...makeCheckpoint(), status: 'parked' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics.some((d) => d.code === 'status-invalid')).toBe(true);
    await expect(stat(fileAt(root))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('two tabs resuming with the same expectedVersion: exactly ONE wins (Promise.all)', async () => {
    const root = await makeRoot('cpstore3-double-');
    // Two TABS: two store instances on the same checkpoint file — the serialisation chain must be shared.
    const tabA = store(root);
    const tabB = store(root);
    await expect(tabA.save(makeCheckpoint())).resolves.toMatchObject({ ok: true });
    const [a, b] = await Promise.all([
      tabA.resume('cp-journey-1', resumeInput('rcpt-A', '2026-11-13T03:40:00.000Z', 'tab-A')),
      tabB.resume('cp-journey-1', resumeInput('rcpt-B', '2026-11-13T03:40:01.000Z', 'tab-B')),
    ]);
    expect([a, b].map((r) => (r.ok ? 'ok' : r.diagnostics[0]?.code)).sort()).toEqual(['ok', 'version_conflict']);
    const loser = a.ok ? b : a;
    // The pin: the loser is refused by the COMPARE-AND-SET itself (stored version no longer matches), not by a post-hoc status.
    if (!loser.ok) expect(loser.diagnostics[0]?.message).toContain('concurrency_version');
    // Not swallowed into load()'s null: the resumed document is still readable.
    const winner = a.ok ? a : b;
    const loaded = await tabA.load('cp-journey-1');
    expect(loaded).not.toBeNull();
    if (winner.ok) expect(loaded?.resume_receipt).toEqual(winner.checkpoint.resume_receipt);
  });

  it('after a resume: status is resumed, the receipt is present, and the version is incremented', async () => {
    const s = store(await makeRoot('cpstore3-after-'));
    await expect(s.save(makeCheckpoint())).resolves.toMatchObject({ ok: true });
    expect((await s.resume('cp-journey-1', resumeInput('rcpt-1', '2026-11-13T03:41:00.000Z', 'brad'))).ok).toBe(true);
    const loaded = await s.load('cp-journey-1');
    expect(loaded?.status).toBe('resumed');
    expect(loaded?.concurrency_version).toBe(2);
    expect(loaded?.resume_receipt).toEqual({
      receipt_id: 'rcpt-1', resumed_at: '2026-11-13T03:41:00.000Z', resumed_by: 'brad', outcome: 'returned-to-prompt',
    });
    // A second sequential resume with the stale version is refused, never swallowed.
    const again = await s.resume('cp-journey-1', resumeInput('rcpt-2', '2026-11-13T03:42:00.000Z', 'brad'));
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.diagnostics[0]?.code).toBe('version_conflict');
  });

  it('resume consults the origin-record revision check BEFORE writing: a changed origin record is refused origin-record-changed and the checkpoint is left untouched (u1refdrill)', async () => {
    const root = await makeRoot('cpstore3-refdrill-');
    let consulted = 0;
    const s = new PendingIntentStore({
      rootDir: root, userId: 'u1', endpoint: 'protocols', threadId: 'thread-A',
      originCheck: async () => {
        consulted += 1;
        return {
          restorable: false,
          code: 'origin-record-changed',
          recordId: 'rec-1',
          message: "origin record rec-1 changed since the checkpoint: declared revision '7' but the live envelope's contentSha is '9'",
        };
      },
    });
    // The parked checkpoint declares the origin record at revision '7'; the check reports rec-1 has since moved to '9'.
    await expect(s.save(makeCheckpoint({
      status: 'pending',
      origin: { surface: 'deck-surface', route: '/decks', active_tab: 'tab-1', record_revisions: [{ record_id: 'rec-1', revision: '7' }] },
    }))).resolves.toMatchObject({ ok: true });
    const result = await s.resume('cp-journey-1', resumeInput('rcpt-1', '2026-11-13T03:43:00.000Z', 'brad'));
    // The call is refused with the NAMED code (not a generic contract failure) and the check ran...
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.map((d) => d.code)).toEqual(['origin-record-changed']);
      expect(result.diagnostics[0]?.message).toContain('rec-1');
    }
    expect(consulted).toBe(1);
    // ...and BEFORE any write: the stored document re-reads status 'pending', the version is unchanged, and no resume_receipt was ever written.
    const reloaded = await s.load('cp-journey-1');
    expect(reloaded).not.toBeNull();
    if (reloaded !== null) {
      expect(reloaded.status).toBe('pending');
      expect(reloaded.concurrency_version).toBe(1);
      expect(reloaded.resume_receipt).toBeUndefined();
    }
  });

  it('a resume with all origin revisions still matching resumes exactly as today, and two concurrent resumes still produce exactly one winner even when the check is wired (u1refdrill)', async () => {
    const root = await makeRoot('cpstore3-refdrillmatch-');
    const originCheck = async () => ({ restorable: true, checked: ['rec-1'] });
    const make = () => new PendingIntentStore({
      rootDir: root, userId: 'u1', endpoint: 'protocols', threadId: 'thread-A', originCheck,
    });
    const tabA = make();
    const tabB = make();
    const cp = makeCheckpoint({
      origin: { surface: 'deck-surface', route: '/decks', active_tab: 'tab-1', record_revisions: [{ record_id: 'rec-1', revision: '7' }] },
    });
    await expect(tabA.save(cp)).resolves.toMatchObject({ ok: true });
    const [a, b] = await Promise.all([
      tabA.resume('cp-journey-1', resumeInput('rcpt-M', '2026-11-13T03:44:00.000Z', 'tab-A')),
      tabB.resume('cp-journey-1', resumeInput('rcpt-N', '2026-11-13T03:44:01.000Z', 'tab-B')),
    ]);
    // AC3: matching revisions do NOT change the resume — the existing CAS still gives exactly one winner.
    expect([a, b].map((r) => (r.ok ? 'ok' : r.diagnostics[0]?.code)).sort()).toEqual(['ok', 'version_conflict']);
    const winner = a.ok ? a : b;
    const loser = a.ok ? b : a;
    if (winner.ok) expect(winner.checkpoint.status).toBe('resumed');
    if (!loser.ok) expect(loser.diagnostics[0]?.message).toContain('concurrency_version');
  });

  it('a delta declaring request_revision is refused in injection mode; a plain delta passes the seam', async () => {
    const s = store(await makeRoot('cpstore3-delta-'));
    await expect(s.save(makeCheckpoint())).resolves.toMatchObject({ ok: true });
    const refused = await s.attachDelta(makeDelta({ request_revision: { changed_fields: ['quantity'], reason: 'the user changed the volume' } }), 'cp-journey-1');
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.diagnostics.some((d) => d.code === 'injection-refused')).toBe(true);
    await expect(s.attachDelta(makeDelta(), 'cp-journey-1')).resolves.toMatchObject({ ok: true });
  });

  it('a delta naming an id the stored document does not carry is refused checkpoint-not-found (d1bind)', async () => {
    const s = store(await makeRoot('cpstore3-deltabind-'));
    await expect(s.save(makeCheckpoint())).resolves.toMatchObject({ ok: true });
    // The document on this thread is cp-journey-1; a ghost id must not attach (this is the defect:
    // any parked checkpoint used to accept any id and the handler echoed the path back).
    const ghost = await s.attachDelta(makeDelta(), 'CP-GHOST');
    expect(ghost.ok).toBe(false);
    if (!ghost.ok) expect(ghost.diagnostics.map((d) => d.code)).toEqual(['checkpoint-not-found']);
    await expect(s.attachDelta(makeDelta(), 'cp-journey-1')).resolves.toMatchObject({ ok: true });
    // Absent thread still refuses (the pre-existing arm, now id-bound).
    await expect(store(await makeRoot('cpstore3-deltanone-')).attachDelta(makeDelta(), 'cp-journey-1')).resolves.toMatchObject({ ok: false });
  });

  it('a scope containing .. cannot escape rootDir', async () => {
    const root = await makeRoot('cpstore3-traversal-');
    expect(() => store(root, '../escape')).toThrow();
    await expect(stat(join(root, '..', 'escape', 'thread-A.checkpoint.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
