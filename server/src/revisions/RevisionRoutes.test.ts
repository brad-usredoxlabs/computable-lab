import { describe, it, expect } from 'vitest';
import { createRecordHandlers } from '../api/handlers/RecordHandlers.js';
import { RecordRevisionService, token } from './RecordRevisionService.js';
import { memoryStore } from './testStore.js';

function reply() {
  const r: any = { statusCode: 200, status(n: number) { r.statusCode = n; return r; }, code(n: number) { r.statusCode = n; return r; }, send(body: unknown) { return body; } };
  return r;
}
function handlers(store: ReturnType<typeof memoryStore>['store'], readAllowed = true) {
  return createRecordHandlers(store, undefined, undefined, undefined, undefined, undefined, {
    identityService: { resolveRequestUser: async () => ({ userId: 'USR-SESSION', isSystem: false }) } as any,
    authorizationService: { canAccess: async () => readAllowed, ensureOwnerPolicy: async () => {} } as any,
  });
}
describe('protocol save and revision HTTP contracts', () => {
  it('stamps new projects with session provenance instead of draft display values', async () => {
    const { store } = memoryStore();
    const result = await handlers(store).createRecord({ body: { schemaId: 'study', payload: {
      kind: 'study', recordId: 'STU-NEW', title: 'New project', shortSlug: 'new-project', state: 'draft',
      createdBy: 'Display name', createdAt: '2000-01-01T00:00:00.000Z', updatedAt: '2000-01-01T00:00:00.000Z',
    } } } as any, reply());
    expect(result).toMatchObject({ success: true, record: { payload: { state: 'draft', createdBy: 'USR-SESSION' } } });
    const saved = (await store.get('STU-NEW'))!.payload as Record<string, unknown>;
    expect(saved.createdAt).not.toBe('2000-01-01T00:00:00.000Z');
    expect(saved.updatedAt).toBe(saved.createdAt);
  });

  it('repairs a null version, stamps the session author, and never approves on Save', async () => {
    const { store } = memoryStore();
    const h = handlers(store);
    const result = await h.createRecord({ body: { schemaId: 'protocol', payload: { kind: 'protocol', recordId: 'PRT-NEW', title: 'Soil', version: null, state: 'approved', createdBy: 'USR-SPOOF', steps: [] } } } as any, reply());
    expect(result).toMatchObject({ success: true, record: { payload: { version: '0.1.1', state: 'draft', createdBy: 'USR-SESSION' } } });
    const created = (await store.get('PRT-NEW'))!;
    const updated = await h.updateRecord({ params: { id: created.recordId }, body: { payload: { ...(created.payload as any), createdBy: 'USR-SPOOF', title: 'Edited' }, expectedSha: token(created) } } as any, reply());
    expect(updated).toMatchObject({ success: true, record: { payload: { createdBy: 'USR-SESSION' } } });
  });
  it('creates a fresh draft copy with immutable lineage and the current author', async () => {
    const { store, put } = memoryStore();
    const source = put({ recordId: 'DOC-1', schemaId: 'controlled-document', payload: { kind: 'controlled-document', id: 'DOC-1', state: 'effective', lifecycleId: 'document-controlled-signing', body: 'Original', createdBy: 'USR-OLD', reviewerRef: { id: 'USR-REVIEWER' } } });
    const result = await handlers(store).draftCopy({ params: { id: source.recordId }, body: { recordId: 'DOC-2', expectedSha: token(source), payload: { body: 'New draft' } } } as any, reply());
    expect(result).toMatchObject({ success: true, record: { recordId: 'DOC-2', payload: { id: 'DOC-2', state: 'draft', createdBy: 'USR-SESSION', body: 'New draft', derivedFromRevisionRef: { type: 'record-revision' } } } });
    const draft = (await store.get('DOC-2'))!.payload as any;
    expect(draft).not.toHaveProperty('recordId');
    expect(draft).not.toHaveProperty('reviewerRef');
    const revision = await new RecordRevisionService(store).read(draft.derivedFromRevisionRef);
    expect(revision.payload.snapshot.body).toBe('Original');
    expect((await store.get('DOC-1'))!.payload).toEqual(source.payload);
  });
  it('does not expose snapshots when source access is denied', async () => {
    const { store, protocol } = memoryStore();
    const revision = await new RecordRevisionService(store).capture(protocol, 'USR-SESSION', 'derivation');
    const denied = reply();
    const result = await handlers(store, false).getRecord({ params: { id: revision.recordId }, query: {} } as any, denied);
    expect(denied.statusCode).toBe(404);
    expect(result).toMatchObject({ error: 'NOT_FOUND' });
  });
  it('prevents generic CRUD from inventing immutable evidence', async () => {
    const { store } = memoryStore();
    const denied = reply();
    await handlers(store).createRecord({ body: { schemaId: 'revision', payload: { kind: 'record-revision', recordId: 'REV-FAKE' } } } as any, denied);
    expect(denied.statusCode).toBe(403);
  });
});
