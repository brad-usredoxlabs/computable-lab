import type { RecordStore, RecordEnvelope } from '../store/types.js';
import { contentHash, token } from './RecordRevisionService.js';
export function memoryStore() {
  const records = new Map<string, RecordEnvelope>();
  const put = (record: RecordEnvelope) => {
    const next = structuredClone({ ...record, meta: { contentSha: contentHash(record.payload) } });
    records.set(record.recordId, next); return next;
  };
  const store = {
    get: async (id: string) => structuredClone(records.get(id) ?? null),
    exists: async (id: string) => records.has(id),
    list: async (filter?: { kind?: string }) => [...records.values()].filter(r => !filter?.kind || (r.payload as any).kind === filter.kind).map(r => structuredClone(r)),
    create: async ({ envelope }: { envelope: RecordEnvelope }) => records.has(envelope.recordId) ? { success: false, error: 'Already exists' } : { success: true, envelope: put(envelope) },
    update: async ({ envelope, expectedSha }: { envelope: RecordEnvelope; expectedSha?: string }) => expectedSha && token(records.get(envelope.recordId)!) !== expectedSha ? { success: false, error: 'SHA mismatch' } : { success: true, envelope: put(envelope) },
  } as unknown as RecordStore;
  const protocol = put({ recordId: 'PRT-1', schemaId: 'protocol', payload: { kind: 'protocol', recordId: 'PRT-1', version: '0.1.1', state: 'draft', title: 'Soil extraction', steps: [{ description: 'Add 550 µl' }] } });
  return { store, records, put, protocol };
}
