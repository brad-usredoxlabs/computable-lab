import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { RecordEnvelope, RecordStore } from '../store/types.js';

export const REVISION_SCHEMA = 'https://computable-lab.com/schema/computable-lab/record-revision.schema.yaml';
export interface RevisionRef { kind: 'record'; type: 'record-revision'; id: string }
export interface RevisionPayload {
  kind: 'record-revision'; recordId: string; sourceRecordId: string; sourceSchemaId: string;
  snapshot: Record<string, unknown>; contentHash: string; recipeHash: string;
  purpose: 'signature' | 'research-use' | 'derivation' | 'edit'; version?: string;
  sourceToken?: string; gitCommit?: string; createdBy: string; createdAt: string;
}
export class RevisionError extends Error {
  constructor(public code: string, message: string, public status = 409) { super(message); }
}
export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(v => canonical(v ?? null)).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).filter(k => (value as any)[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical((value as any)[k])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export function contentHash(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
const BOOKKEEPING = ['createdAt', 'updatedAt', 'version', 'authoring', 'latestRevisionRef', 'protocolRevisionRef'];
export function recipeHash(payload: unknown): string {
  const copy = { ...object(payload) };
  for (const key of BOOKKEEPING) delete copy[key];
  return contentHash(copy);
}
/** Signed transitions may change state, never the content being approved. */
export function controlledContent(payload: unknown): string {
  const copy = { ...object(payload) };
  for (const key of ['state', 'createdAt', 'createdBy', 'updatedAt']) delete copy[key];
  return canonical(copy);
}
export function revisionRef(recordId: string): RevisionRef { return { kind: 'record', type: 'record-revision', id: recordId }; }
export function token(record: RecordEnvelope): string | undefined { return record.meta?.contentSha ?? record.meta?.commitSha; }
const locks = new WeakMap<RecordStore, Map<string, Promise<unknown>>>();
/** FAME-3 W6: the record-edit onAccept hook applies its single governed
 *  store.update INSIDE accept's lockSources region over the same target —
 *  a re-acquire of the `write:<target>` key from the same async execution
 *  context. A plain promise queue is non-reentrant, so that re-acquire
 *  awaits the outer call that can only finish after the inner one → the
 *  accept hangs forever (no writes, no error). The ALS slot makes the lock
 *  REENTRANT for the same execution context: a nested same-key acquire runs
 *  the inner fn directly (the outer fn already owns the lock; the inner
 *  update is the work the outer is waiting for). DISTINCT contexts (concurrent
 *  accepts, a concurrent direct store.update) still serialize through the
 *  queue exactly as before — behavior-preserving for every existing caller,
 *  which never re-acquired its own key.
 *
 *  FAME-3 D4 (adv-review cycle-1): the reentrancy marker is keyed by the
 *  (store, id) PAIR, not id alone — the queue itself is (store, id) keyed
 *  (WeakMap<RecordStore, Map<id>>), so a nested same-id acquire on a
 *  DIFFERENT store must NOT short-circuit that store's queue as reentrant.
 *  Each held entry also carries a mutable `released` flag flipped in the
 *  outer finally: the ALS value is not invalidated when the outer critical
 *  section ends, so a continuation spawned inside fn that outlives it must
 *  not re-enter the lock-free path (it would otherwise run lock-free
 *  concurrently with a new holder). The flag forces such a continuation to
 *  acquire the queue lock instead. */
interface LockHeldEntry { released: boolean }
type LockHeldMap = Map<RecordStore, Map<string, LockHeldEntry>>;
const lockContext = new AsyncLocalStorage<LockHeldMap>();
export async function withRecordLock<T>(store: RecordStore, id: string, fn: () => Promise<T>): Promise<T> {
  const held = lockContext.getStore();
  const mine = held?.get(store)?.get(id);
  if (mine && !mine.released) {
    // Same (store, id) already owned by this live execution context: run the
    // work directly (the outer fn already owns the lock). A stale marker
    // (released) is NOT reentrant — it must re-acquire the queue lock.
    return await fn();
  }
  const next: LockHeldMap = held ? new Map(held) : new Map();
  // Deep-copy the per-store entry map we are about to touch so a nested
  // same-store acquire (e.g. lockSources over ids[0], ids[1]) never mutates
  // the outer context's marker map.
  let perStore = next.get(store);
  if (perStore) { perStore = new Map(perStore); next.set(store, perStore); }
  else { perStore = new Map(); next.set(store, perStore); }
  const entry: LockHeldEntry = { released: false };
  perStore.set(id, entry);
  return lockContext.run(next, async () => {
    let queue = locks.get(store);
    if (!queue) { queue = new Map(); locks.set(store, queue); }
    const previous = queue.get(id) ?? Promise.resolve();
    const nextLock = previous.catch(() => {}).then(fn);
    queue.set(id, nextLock);
    try { return await nextLock; }
    finally {
      if (queue.get(id) === nextLock) queue.delete(id);
      entry.released = true; // invalidate the marker for post-release continuations
    }
  });
}

export class RecordRevisionService {
  constructor(private store: RecordStore, private now: () => string = () => new Date().toISOString()) {}
  async list(sourceRecordId: string): Promise<Array<RecordEnvelope<RevisionPayload>>> {
    const records = await this.store.list({ kind: 'record-revision' });
    return records.filter(r => object(r.payload).sourceRecordId === sourceRecordId) as Array<RecordEnvelope<RevisionPayload>>;
  }
  async read(ref: RevisionRef | { id: string }, sourceRecordId?: string): Promise<RecordEnvelope<RevisionPayload>> {
    const record = await this.store.get(ref.id);
    const p = object(record?.payload);
    if (!record || p.kind !== 'record-revision' || (sourceRecordId && p.sourceRecordId !== sourceRecordId) || contentHash(p.snapshot) !== p.contentHash) {
      throw new RevisionError('INVALID_REVISION', 'The immutable source revision is missing or does not match.', 422);
    }
    return record as RecordEnvelope<RevisionPayload>;
  }
  async capture(source: RecordEnvelope, actor: string, purpose: RevisionPayload['purpose'], version?: string): Promise<RecordEnvelope<RevisionPayload>> {
    const snapshot = structuredClone(object(source.payload));
    const hash = contentHash(snapshot);
    const recordId = `REV-${contentHash({ source: source.recordId, hash, purpose, version }).slice(0, 32).toUpperCase()}`;
    const existing = await this.store.get(recordId);
    if (existing) return this.read({ id: recordId }, source.recordId);
    const gitCommit = await this.store.getVerifiedCommit?.(source.recordId, token(source));
    const payload: RevisionPayload = {
      kind: 'record-revision', recordId, sourceRecordId: source.recordId, sourceSchemaId: source.schemaId,
      snapshot, contentHash: hash, recipeHash: recipeHash(snapshot), purpose,
      ...(version ? { version } : {}), ...(token(source) ? { sourceToken: token(source)! } : {}),
      ...(gitCommit ? { gitCommit } : {}),
      createdBy: actor, createdAt: this.now(),
    };
    const result = await this.store.create({ envelope: { recordId, schemaId: REVISION_SCHEMA, payload }, message: `Snapshot ${source.recordId}${version ? ` v${version}` : ''}` });
    if (!result.success) {
      if (await this.store.exists(recordId)) return this.read({ id: recordId }, source.recordId);
      throw new RevisionError('REVISION_SAVE_FAILED', result.error ?? 'Could not preserve the source revision.', 422);
    }
    return (result.envelope ?? { recordId, schemaId: REVISION_SCHEMA, payload }) as RecordEnvelope<RevisionPayload>;
  }
  async freezeProtocol(id: string, actor: string, expectedToken?: string): Promise<RecordEnvelope<RevisionPayload>> {
    return withRecordLock(this.store, id, async () => {
      let source = await this.store.get(id);
      if (!source || object(source.payload).kind !== 'protocol') throw new RevisionError('PROTOCOL_NOT_FOUND', 'Protocol not found.', 404);
      if (object(source.payload).lifecycleId && object(source.payload).state !== 'effective') throw new RevisionError('CONTROLLED_PROTOCOL_NOT_EFFECTIVE', 'The controlled protocol must be effective before use.', 422);
      const allRevisions = await this.list(id);
      const sameInstructions = allRevisions.some(r => r.payload.sourceToken === expectedToken && r.payload.recipeHash === recipeHash(source!.payload));
      if (expectedToken && token(source) !== expectedToken && !sameInstructions) throw new RevisionError('STALE_PROTOCOL', 'The protocol changed. Regenerate the graph before accepting it.');
      const revisions = allRevisions.filter(r => r.payload.purpose === 'research-use');
      revisions.sort((a, b) => versionOrdinal(b.payload.version) - versionOrdinal(a.payload.version));
      const latest = revisions[0];
      if (latest?.payload.recipeHash === recipeHash(source.payload)) return latest;
      const version = object(source.payload).lifecycleId
        ? (typeof object(source.payload).version === 'string' ? String(object(source.payload).version) : undefined)
        : latest ? `1.${versionOrdinal(latest.payload.version) + 1}.0` : '1.0.0';
      // Preserve the draft used to generate the graph before assigning its public label.
      await this.capture(source, actor, 'derivation');
      if (!object(source.payload).lifecycleId && object(source.payload).version !== version) {
        const saved = await this.store.update({ envelope: { ...source, payload: { ...object(source.payload), version } }, ...(token(source) ? { expectedSha: token(source)! } : {}), actor, message: `Version ${id} as ${version}` });
        if (!saved.success) throw new RevisionError('STALE_PROTOCOL', saved.error ?? 'Protocol changed while freezing its version.');
        source = saved.envelope ?? (await this.store.get(id))!;
      }
      return this.capture(source, actor, 'research-use', version);
    });
  }
  async draftVersion(id: string, payload: unknown): Promise<string> {
    const versions = (await this.list(id)).filter(r => r.payload.purpose === 'research-use').sort((a, b) => versionOrdinal(b.payload.version) - versionOrdinal(a.payload.version));
    const latest = versions[0];
    return !latest ? '0.1.1' : latest.payload.recipeHash === recipeHash(payload) ? latest.payload.version! : `1.${versionOrdinal(latest.payload.version) + 1}.0-draft`;
  }
  async pinInheritance(envelope: RecordEnvelope, actor: string): Promise<RecordEnvelope> {
    const payload = object(envelope.payload);
    const parent = object(payload.inherits_from);
    if (payload.kind !== 'local-protocol' || typeof parent.id !== 'string' || parent.revisionRef) return envelope;
    const source = await this.store.get(parent.id);
    if (!source) throw new RevisionError('SOURCE_NOT_FOUND', `Protocol ${parent.id} was not found.`, 422);
    const revision = await this.capture(source, actor, 'derivation');
    const pinned = { ...envelope, payload: { ...payload, inherits_from: { ...parent, revisionRef: revisionRef(revision.recordId) } } };
    if (token(envelope)) {
      const result = await this.store.update({ envelope: pinned, expectedSha: token(envelope)!, actor, message: `Pin inheritance of ${envelope.recordId}` });
      if (!result.success) throw new RevisionError('INHERITANCE_PIN_FAILED', result.error ?? 'Could not pin protocol inheritance.');
      return result.envelope ?? (await this.store.get(envelope.recordId))!;
    }
    return pinned;
  }
  async resolve(ref: { id: string; revisionRef?: RevisionRef }): Promise<RecordEnvelope | null> {
    if (!ref.revisionRef) return this.store.get(ref.id);
    const revision = await this.read(ref.revisionRef, ref.id);
    return { recordId: ref.id, schemaId: revision.payload.sourceSchemaId, payload: revision.payload.snapshot, meta: { ...(revision.payload.sourceToken ? { contentSha: revision.payload.sourceToken } : {}), ...(revision.payload.gitCommit ? { gitCommit: revision.payload.gitCommit } : {}) } };
  }
}
function versionOrdinal(version: string | undefined): number { return Number(version?.split('.')[1] ?? 0); }
