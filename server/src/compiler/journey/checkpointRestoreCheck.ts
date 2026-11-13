/**
 * L2-JOURNEY-CHECKPOINT-1 (unit cprestore): the restore verdict. A pure,
 * READ-ONLY check that compares a validated checkpoint's declared
 * `origin.record_revisions` ({record_id, revision} pairs) against the live
 * record store, one pair at a time. Any divergence blocks restoration with a
 * named reason that names the record and the field that diverged — the module
 * never redirects to a similar record, and the only ids it can ever name come
 * from the checkpoint argument. No route, no store write, no client: persisting
 * `status: blocked` is another unit's job.
 */
import type { PendingIntentCheckpoint } from './checkpointContract.js';
import type { RecordStore } from '../../store/types.js';

export type RestoreVerdict =
  | { restorable: true; checked: string[] }
  | { restorable: false; code: 'origin-record-changed' | 'origin-record-vanished'; message: string; recordId: string };

export async function restoreCheckpoint(checkpoint: PendingIntentCheckpoint, store: Pick<RecordStore, 'get'>): Promise<RestoreVerdict> {
  const pairs = checkpoint.origin.record_revisions;
  const checked: string[] = [];
  for (const pair of pairs) {
    const envelope = await store.get(pair.record_id);
    if (envelope === null) {
      return {
        restorable: false,
        code: 'origin-record-vanished',
        recordId: pair.record_id,
        message: `origin record ${pair.record_id} is no longer in the record store (checkpoint declared revision '${pair.revision}'); restoration is blocked, not redirected to a similar record`,
      };
    }
    const meta = envelope.meta;
    // meta.contentSha first, falling back to meta.gitCommit; the FIELD NAME
    // compared goes into the message so a reader can tell which token was stale.
    const token = meta?.contentSha ?? meta?.gitCommit;
    const field = meta?.contentSha !== undefined ? 'contentSha' : 'gitCommit';
    if (token === undefined) {
      return {
        restorable: false,
        code: 'origin-record-changed',
        recordId: pair.record_id,
        message: `origin record ${pair.record_id} changed since the checkpoint: its live envelope carries no revision token (meta.${field} absent), but the checkpoint declared revision '${pair.revision}'; not a silent pass`,
      };
    }
    if (token !== pair.revision) {
      return {
        restorable: false,
        code: 'origin-record-changed',
        recordId: pair.record_id,
        message: `origin record ${pair.record_id} changed since the checkpoint: declared revision '${pair.revision}' but the live envelope's ${field} is '${token}'`,
      };
    }
    checked.push(pair.record_id);
  }
  return { restorable: true, checked };
}
