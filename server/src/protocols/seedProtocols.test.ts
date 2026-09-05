/**
 * SeedProtocols — Phase F reusable seeded protocols are materialized into the lab
 * store (not auto-merged from the plural seed dir), idempotently.
 */
import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RecordEnvelope, RecordStore, RecordFilter, StoreResult } from '../store/types.js';
import { ensureSeedProtocols } from './seedProtocols.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PROTOCOLS_DIR = resolve(__dirname, '../../../records/seed/protocols');
const SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml';

class FakeStore implements RecordStore {
  records: RecordEnvelope[] = [];
  update: never;
  getWithValidation: never;
  waitAll?: never;
  validate: never;
  lint: never;
  async get(recordId: string): Promise<RecordEnvelope | null> {
    return this.records.find((r) => r.recordId === recordId) ?? null;
  }
  async getByPath(): Promise<RecordEnvelope | null> {
    return null;
  }
  async list(filter?: RecordFilter): Promise<RecordEnvelope[]> {
    let out = this.records;
    if (filter?.kind) out = out.filter((r) => (r.payload as Record<string, unknown>)?.kind === filter.kind);
    if (filter?.schemaId) out = out.filter((r) => r.schemaId === filter.schemaId);
    return out;
  }
  async create(opts: { envelope: RecordEnvelope }): Promise<StoreResult> {
    this.records.push(opts.envelope);
    return { success: true, envelope: opts.envelope };
  }
  async delete(): Promise<StoreResult> {
    return { success: true };
  }
  async exists(recordId: string): Promise<boolean> {
    return this.records.some((r) => r.recordId === recordId);
  }
  async validate(): never {
    throw new Error('not used');
  }
}

describe('ensureSeedProtocols (Phase F)', () => {
  it('materializes the reusable Biological Material Transfer protocol from YAML', async () => {
    const store = new FakeStore();
    const res = await ensureSeedProtocols(store, SEED_PROTOCOLS_DIR);
    expect(res.created).toContain('prt-seed-biological-transfer');

    const record = await store.get('prt-seed-biological-transfer');
    expect(record?.schemaId).toBe(SCHEMA_ID);
    const payload = record!.payload as Record<string, unknown>;
    expect(payload.kind).toBe('protocol');
    expect((payload.tags as string[])).toEqual(expect.arrayContaining(['biological', 'count-first']));
    // top-level steps (seed protocol shape) with the count-per-volume plate step
    const steps = payload.steps as Array<Record<string, unknown>>;
    expect(steps).toBeDefined();
    expect(steps.length).toBe(4);
    const plateStep = steps.find((s) => /50,000/.test(String(s.label)))!;
    expect(plateStep.working_concentration).toMatchObject({ value: 50000, unit: 'cells/mL', basis: 'count_per_volume' });
  });

  it('is idempotent — re-running reuses the same protocol', async () => {
    const store = new FakeStore();
    await ensureSeedProtocols(store, SEED_PROTOCOLS_DIR);
    const res = await ensureSeedProtocols(store, SEED_PROTOCOLS_DIR);
    expect(res.created).toEqual([]);
    expect(res.reused).toContain('prt-seed-biological-transfer');
    expect(store.records.length).toBe(1);
  });
});