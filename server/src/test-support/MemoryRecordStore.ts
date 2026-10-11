import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import type {
  CreateRecordOptions,
  DeleteRecordOptions,
  GetRecordOptions,
  RecordFilter,
  RecordStore,
  StoreResult,
  UpdateRecordOptions,
} from '../store/types.js';

export class MemoryRecordStore implements RecordStore {
  records = new Map<string, RecordEnvelope>();

  constructor(records: RecordEnvelope[] = []) {
    for (const record of records) this.records.set(record.recordId, record);
  }

  async get(recordId: string): Promise<RecordEnvelope | null> {
    return this.records.get(recordId) ?? null;
  }

  async getByPath(_path: string): Promise<RecordEnvelope | null> {
    return null;
  }

  async getWithValidation(options: GetRecordOptions): Promise<StoreResult> {
    const envelope = await this.get(options.recordId);
    return envelope ? { success: true, envelope } : { success: false, error: 'not found' };
  }

  async list(filter?: RecordFilter): Promise<RecordEnvelope[]> {
    let records = [...this.records.values()];
    if (filter?.kind) {
      records = records.filter((record) => (record.payload as Record<string, unknown>).kind === filter.kind);
    }
    if (filter?.schemaId) records = records.filter((record) => record.schemaId === filter.schemaId);
    const idPrefix = filter?.idPrefix;
    if (idPrefix) records = records.filter((record) => record.recordId.startsWith(idPrefix));
    if (filter?.offset) records = records.slice(filter.offset);
    if (filter?.limit) records = records.slice(0, filter.limit);
    return records;
  }

  async create(options: CreateRecordOptions): Promise<StoreResult> {
    if (this.records.has(options.envelope.recordId)) return { success: false, error: 'already exists' };
    this.records.set(options.envelope.recordId, options.envelope);
    return { success: true, envelope: options.envelope };
  }

  async update(options: UpdateRecordOptions): Promise<StoreResult> {
    if (!this.records.has(options.envelope.recordId)) return { success: false, error: 'not found' };
    this.records.set(options.envelope.recordId, options.envelope);
    return { success: true, envelope: options.envelope };
  }

  async delete(options: DeleteRecordOptions): Promise<StoreResult> {
    if (!this.records.delete(options.recordId)) return { success: false, error: 'not found' };
    return { success: true };
  }

  async validate() {
    return { valid: true, errors: [] };
  }

  async lint() {
    return { valid: true, violations: [] };
  }

  async exists(recordId: string): Promise<boolean> {
    return this.records.has(recordId);
  }
}
