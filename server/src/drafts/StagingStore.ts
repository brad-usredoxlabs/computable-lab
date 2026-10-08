import type { RecordStore, RecordEnvelope } from '../store/types.js';
import { contentHash, object } from '../revisions/RecordRevisionService.js';

/** A capability boundary: no mutation reaches the backing store during compilation. */
export function stagingStore(backing: RecordStore, hidden: Set<string> = new Set()) {
  const writes = new Map<string, RecordEnvelope>();
  const reads = new Map<string, string>();
  const get = async (id: string) => {
    if (writes.has(id)) return structuredClone(writes.get(id)!);
    if (hidden.has(id)) return null;
    const record = await backing.get(id);
    if (record) reads.set(id, contentHash(record.payload));
    return record;
  };
  const prohibited = async (): Promise<never> => { throw new Error('This operation is unavailable during draft compilation.'); };
  const store: RecordStore = {
    get, exists: async id => !!await get(id),
    getByPath: prohibited, getWithValidation: prohibited, list: prohibited,
    getVerifiedCommit: async (id, sha) => writes.has(id) ? undefined : backing.getVerifiedCommit?.(id, sha),
    validate: envelope => backing.validate(envelope), lint: envelope => backing.lint(envelope),
    update: prohibited, delete: prohibited,
    create: async ({ envelope }) => {
      if (await get(envelope.recordId)) return { success: false, error: 'Record already exists.' };
      const validation = await backing.validate(envelope);
      if (!validation.valid) return { success: false, validation, error: 'Validation failed' };
      const lint = await backing.lint(envelope);
      if (!lint.valid) return { success: false, lint, error: `Lint failed: ${JSON.stringify(lint)}` };
      writes.set(envelope.recordId, structuredClone(envelope));
      return { success: true, envelope: structuredClone(envelope) };
    },
  };
  return { store, writes, reads, owns: (record: RecordEnvelope) => writes.has(record.recordId) && !!object(record.payload) };
}
