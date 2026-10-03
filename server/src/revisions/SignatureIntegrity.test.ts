import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { createRecordHandlers } from '../api/handlers/RecordHandlers.js';
import { LifecycleEngine } from '../lifecycle/LifecycleEngine.js';
import { loadLifecyclesFromDir } from '../lifecycle/LifecycleLoader.js';
import { RecordRevisionService, revisionRef, token } from './RecordRevisionService.js';
import { memoryStore } from './testStore.js';

async function world() {
  const { store, put } = memoryStore();
  const doc = put({ recordId: 'DOC-1', schemaId: 'doc', payload: { kind: 'controlled-document', recordId: 'DOC-1', title: 'SOP', body: 'Mix gently', lifecycleId: 'document-controlled-signing', state: 'in_review', createdBy: 'USR-AUTHOR' } });
  const revisions = new RecordRevisionService(store);
  const signed = await revisions.capture(doc, 'USR-REVIEWER', 'signature');
  put({ recordId: 'SIG-1', schemaId: 'sig', payload: { kind: 'signature', signedBy: 'USR-REVIEWER', action: 'approved', subject: { recordId: doc.recordId, revisionRef: revisionRef(signed.recordId), contentHash: signed.payload.contentHash } } });
  const engine = new LifecycleEngine();
  loadLifecyclesFromDir(fileURLToPath(new URL('../../../schema/core/lifecycles', import.meta.url)), engine);
  const handlers = createRecordHandlers(store, undefined, undefined, undefined, engine, undefined, { identityService: { resolveRequestUser: async () => ({ userId: 'USR-REVIEWER', isSystem: false }) } as any });
  const update = async (payload: unknown, signatureRefs = ['SIG-1']) => {
    let status = 200;
    const reply: any = { status(code: number) { status = code; return reply; }, code(code: number) { status = code; return reply; }, send(value: unknown) { return value; } };
    const result = await handlers.updateRecord({ params: { id: doc.recordId }, body: { payload, signatureRefs }, headers: {} } as any, reply);
    return { status, result };
  };
  return { store, put, doc, update, revisions };
}

describe('signed revision enforcement', () => {
  it('permits approval of the exact saved content and rejects reuse for the next transition', async () => {
    const { doc, update, store } = await world();
    const first = await update({ ...(doc.payload as any), state: 'approved' });
    expect(first.status).toBe(200);
    const saved = await store.get(doc.recordId);
    expect(token(saved!)).not.toBe(token(doc));
    const reused = await update({ ...(saved!.payload as any), state: 'effective' });
    expect(reused.status).toBe(409);
    expect((reused.result as any).error).toBe('STALE_SIGNATURE');
  });
  it('rejects stale signatures after editing and rejects edits in the approval request itself', async () => {
    const { doc, update, put } = await world();
    const mixed = await update({ ...(doc.payload as any), state: 'approved', body: 'Changed instructions' });
    expect((mixed.result as any).error).toBe('SIGNED_CONTENT_CHANGED');
    put({ ...doc, payload: { ...(doc.payload as any), body: 'Saved new instructions' } });
    const stale = await update({ ...(doc.payload as any), state: 'approved' });
    expect((stale.result as any).error).toBe('STALE_SIGNATURE');
  });
  it('keeps legacy signatures readable but refuses to use them for new approvals', async () => {
    const { put, update, doc } = await world();
    put({ recordId: 'SIG-OLD', schemaId: 'sig', payload: { kind: 'signature', signedBy: 'USR-REVIEWER', action: 'approved', subject: { recordId: doc.recordId, gitCommit: 'abc1234' } } });
    expect((await update({ ...(doc.payload as any), state: 'approved' }, ['SIG-OLD'])).result).toMatchObject({ error: 'SIGNATURE_REVISION_REQUIRED' });
  });
  it('locks approved content while allowing a freshly signed effective transition', async () => {
    const { doc, store, put, update, revisions } = await world();
    await update({ ...(doc.payload as any), state: 'approved' });
    const approved = (await store.get(doc.recordId))!;
    const edit = await update({ ...(approved.payload as any), body: 'Mutated' }, []);
    expect((edit.result as any).error).toBe('CONTROLLED_RECORD_LOCKED');
    const signed = await revisions.capture(approved, 'USR-REVIEWER', 'signature');
    put({ recordId: 'SIG-2', schemaId: 'sig', payload: { kind: 'signature', signedBy: 'USR-REVIEWER', action: 'approved', subject: { recordId: doc.recordId, revisionRef: revisionRef(signed.recordId), contentHash: signed.payload.contentHash } } });
    expect((await update({ ...(approved.payload as any), state: 'effective' }, ['SIG-2'])).status).toBe(200);
  });
});
