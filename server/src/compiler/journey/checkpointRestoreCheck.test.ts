// @vitest-environment node
/**
 * L2-JOURNEY-CHECKPOINT-1 (unit cprestore): the restore verdict, graded against
 * a hand-built checkpoint object and a fake RecordStore — a literal
 * `{ get: async (id) => ... }` that serves hand-built envelopes and records
 * every lookup. The real store is never touched.
 */
import { describe, expect, it } from 'vitest';
import type { PendingIntentCheckpoint, RevisionPair } from './checkpointContract.js';
import type { RecordEnvelope } from '../../types/RecordEnvelope.js';
import { restoreCheckpoint } from './checkpointRestoreCheck.js';

const cp = (record_revisions: RevisionPair[]): PendingIntentCheckpoint => ({
  checkpoint_id: 'cp-1', journey_ref: 'jn-1', revision: 'r1', thread_ref: 'thr-1',
  request_anchor: { message_id: 'msg-1', verbatim_text: 'sequence the ROS panel on plate 3' },
  pending_intent: { intent_id: 'intent-1', intent_revision: 'r2' },
  unresolved_slots: [{ name: 'material', semantic_type: 'MaterialReference' }],
  origin: { surface: 'workbench', route: '/workbench', active_tab: 'plates', record_revisions },
  restoration_state: {},
  expected_return_type: 'CommittedRecordReference', status: 'pending', concurrency_version: 1,
});

const env = (recordId: string, meta?: RecordEnvelope['meta']): RecordEnvelope =>
  ({ recordId, schemaId: 'https://computable-lab.com/schema/computable-lab/study.schema.yaml', payload: {}, meta });

/** Fake RecordStore: a literal { get }, serving hand-built envelopes, recording every lookup. */
function fakeStore(live: Record<string, RecordEnvelope>) {
  const calls: string[] = [];
  const store = { get: async (id: string) => { calls.push(id); return live[id] ?? null; } };
  return { store, calls };
}

describe('checkpointRestoreCheck', () => {
  it("every origin.record_revisions pair matches the live envelope's revision token → verdict restorable, with the checked record ids listed", async () => {
    const { store } = fakeStore({
      'rec-1': env('rec-1', { contentSha: '7' }),
      'rec-2': env('rec-2', { gitCommit: 'a1b2' }),
    });
    const r = await restoreCheckpoint(cp([
      { record_id: 'rec-1', revision: '7' },
      { record_id: 'rec-2', revision: 'a1b2' },
    ]), store);
    expect(r).toEqual({ restorable: true, checked: ['rec-1', 'rec-2'] });
  });
  it("one record's live revision differs → verdict blocked, reason code origin-record-changed, and the diagnostic NAMES the record id and both revisions", async () => {
    const { store } = fakeStore({
      'rec-1': env('rec-1', { contentSha: '7' }),
      'rec-2': env('rec-2', { contentSha: '9b' }),
    });
    const r = await restoreCheckpoint(cp([
      { record_id: 'rec-1', revision: '7' },
      { record_id: 'rec-2', revision: '9' },
    ]), store);
    expect(r).toEqual({
      restorable: false,
      code: 'origin-record-changed',
      recordId: 'rec-2',
      message: "origin record rec-2 changed since the checkpoint: declared revision '9' but the live envelope's contentSha is '9b'",
    });
  });
  it('one record id returns null → verdict blocked, reason code origin-record-vanished, naming the record id — and the result must NOT name any other record id (no substitution, no "nearest match")', async () => {
    const { store, calls } = fakeStore({ 'rec-1': env('rec-1', { contentSha: '7' }) });
    const r = await restoreCheckpoint(cp([
      { record_id: 'rec-1', revision: '7' },
      { record_id: 'rec-2', revision: '9' },
    ]), store);
    // AC2: the assertion is on the FULL returned object — this fails if the
    // verdict is restorable, if the code is anything but origin-record-vanished,
    // or if any record id other than the vanished one appears in the message.
    expect(r).toEqual({
      restorable: false,
      code: 'origin-record-vanished',
      recordId: 'rec-2',
      message: "origin record rec-2 is no longer in the record store (checkpoint declared revision '9'); restoration is blocked, not redirected to a similar record",
    });
    expect(r.restorable).toBe(false);
    expect(calls).toEqual(['rec-1', 'rec-2']); // only the declared ids were ever read — no probing for a "nearest match"
  });
  it('a checkpoint with an empty record_revisions array → restorable', async () => {
    const { store } = fakeStore({});
    const r = await restoreCheckpoint(cp([]), store);
    expect(r).toEqual({ restorable: true, checked: [] });
  });
});
