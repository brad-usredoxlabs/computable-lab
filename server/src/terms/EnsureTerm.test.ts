import { describe, expect, it } from 'vitest';
import { normalizeAlias, aliasesEquivalent } from './alias.js';
import { localTermIdForLabel } from '../materials/termId.js';
import type { RecordEnvelope, RecordStore, RecordFilter, StoreResult } from '../store/types.js';
import type { GetRecordOptions } from '../store/types.js';
import { ensureTermForLabel } from './EnsureTerm.js';

describe('alias normalization (the F-praus fix)', () => {
  it('normalizes case', () => {
    expect(normalizeAlias('FPRAUS')).toBe(normalizeAlias('fpraus'));
    expect(normalizeAlias('DMSO')).toBe(normalizeAlias('dmso'));
  });

  it('drops ALL separators so FPRAUS ~ F praus ~ F.praus ~ F-praus', () => {
    expect(normalizeAlias('F praus')).toBe(normalizeAlias('FPRAUS'));
    expect(normalizeAlias('F.praus')).toBe(normalizeAlias('FPRAUS'));
    expect(normalizeAlias('F-praus')).toBe(normalizeAlias('FPRAUS'));
    expect(aliasesEquivalent('F. praus', 'FPRAUS')).toBe(true);
    expect(aliasesEquivalent('F-praus', 'F praus')).toBe(true);
  });

  it('does NOT silently fix typos (f praaus vs F praus stay distinct)', () => {
    expect(aliasesEquivalent('f praaus', 'F praus')).toBe(false);
    expect(normalizeAlias('f praaus')).not.toBe(normalizeAlias('FPRAUS'));
  });

  it('treats genuinely different aliases as distinct', () => {
    expect(aliasesEquivalent('DMSO', 'Tris')).toBe(false);
    expect(aliasesEquivalent('F praus', 'F prausnitzii')).toBe(false);
  });

  it('returns empty for empty input and treats empties as equivalent', () => {
    expect(normalizeAlias('   ')).toBe('');
    expect(aliasesEquivalent('', '')).toBe(true);
  });
});

describe('localTermIdForLabel (deterministic canonical id)', () => {
  it('maps case-equivalent labels to the same id', () => {
    expect(localTermIdForLabel('F praus')).toBe(localTermIdForLabel('F PRAUS'));
    expect(localTermIdForLabel('ethanol')).toBe(localTermIdForLabel('ETHANOL'));
  });

  it('is distinct for distinct labels', () => {
    expect(localTermIdForLabel('96-well plate')).not.toBe(localTermIdForLabel('incubate'));
    expect(localTermIdForLabel('ethanol')).not.toBe(localTermIdForLabel('EtOH'));
  });

  it('produces a TERM-<slug>-<hash> id matching the schema pattern', () => {
    expect(localTermIdForLabel('Faecalibacterium prausnitzii')).toMatch(/^TERM-[A-Za-z0-9-]+-[0-9a-z]{4}$/);
  });
});

/** In-memory store minimal fake for EnsureTerm tests. */
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

describe('ensureTermForLabel (canonical term minting)', () => {
  it('reuses an existing term matched by a normalized alias (F praus collides with FPRAUS)', async () => {
    const store = new FakeStore();
    const first = await ensureTermForLabel(store, 'Faecalibacterium prausnitzii', 'organism', {
      aliases: ['F praus', 'FPRAUS'],
    });
    const again = await ensureTermForLabel(store, 'FPRAUS', 'organism', {
      aliases: ['f praaus'],
    });
    expect(again.recordId).toBe(first.recordId);
    expect(store.records.length).toBe(1);
  });

  it('mints a deterministic TERM- id and dedups by label within one call', async () => {
    const store = new FakeStore();
    const a = await ensureTermForLabel(store, 'ethanol', 'material');
    const b = await ensureTermForLabel(store, 'ethanol', 'material');
    expect(a.recordId).toBe(b.recordId);
    expect(a.payload?.kind).toBe('material');
    expect(a.payload?.preferredLabel).toBe('ethanol');
  });

  it('does not collapse distinct concepts', async () => {
    const store = new FakeStore();
    const eth = await ensureTermForLabel(store, 'ethanol', 'material');
    const tris = await ensureTermForLabel(store, 'Tris', 'material');
    expect(eth.recordId).not.toBe(tris.recordId);
    expect(store.records.length).toBe(2);
  });

  it('mints kind:labware and kind:instrument distinct from material', async () => {
    const store = new FakeStore();
    const plate = await ensureTermForLabel(store, '96-well plate', 'labware');
    const qs5 = await ensureTermForLabel(store, 'QuantStudio5', 'instrument');
    expect(plate.payload?.kind).toBe('labware');
    expect(qs5.payload?.kind).toBe('instrument');
  });
});