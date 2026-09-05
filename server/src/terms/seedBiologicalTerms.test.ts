/**
 * SeedBiologicalTerms — inclusive identity spine for biological types & culture
 * systems (Phase A1). Idempotently ensures canonical `term` records for the
 * named organisms (species + strains via strain_of), cell lines, and culture
 * conditions (kind: condition). Each resolves as its own TERM in the tier-0
 * term provider of the resolve spine.
 */
import { describe, expect, it } from 'vitest';
import type { RecordEnvelope, RecordStore, RecordFilter, StoreResult } from '../store/types.js';
import { seedBiologicalTerms } from './seedBiologicalTerms.js';
import { TERM_SCHEMA_ID } from './EnsureTerm.js';
import { createTermProvider } from '../resolve/providers/terms.js';

/** In-memory store minimal fake (mirrors EnsureTerm.test). */
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

const TERMS = {
  cElegans: 'Caenorhabditis elegans',
  cElegansAlias: 'C. elegans',
  mouse: 'Mus musculus',
  yeast: 'Saccharomyces cerevisiae',
  eColi: 'Escherichia coli',
  heparg: 'HepaRG',
  n2: 'C. elegans N2',
  c57: 'C57BL/6J',
  anoxic: 'anoxic',
  chip: 'organ-on-a-chip',
} as const;

describe('seedBiologicalTerms (inclusive identity spine)', () => {
  it('seeds species, strains, cell lines, and conditions', async () => {
    const store = new FakeStore();
    const res = await seedBiologicalTerms(store);

    expect(res.terms).toBeGreaterThanOrEqual(5);
    expect(res.strains).toBeGreaterThanOrEqual(3);
    expect(res.conditions).toBeGreaterThanOrEqual(10);

    const all = await store.list({ schemaId: TERM_SCHEMA_ID });
    const byLabel = new Map(all.map((r) => [String((r.payload as Record<string, unknown>).preferredLabel), r.payload as Record<string, unknown>]));
    expect(byLabel.has(TERMS.cElegans)).toBe(true);
    expect(byLabel.has(TERMS.heparg)).toBe(true);
    expect(byLabel.has(TERMS.anoxic)).toBe(true);
    expect(byLabel.get(TERMS.anoxic)!.kind).toBe('condition');

    // Strains link back to their species via strain_of.
    const n2 = byLabel.get(TERMS.n2)!;
    expect(n2.kind).toBe('organism');
    expect(n2.strain).toBe('N2');
    const strainOf = n2.strain_of as { id?: string } | undefined;
    expect(strainOf?.id).toBe(byLabel.get(TERMS.cElegans)!.id);

    const c57 = byLabel.get(TERMS.c57)!;
    expect((c57.strain_of as { id?: string }).id).toBe(byLabel.get(TERMS.mouse)!.id);

    // HepaRG is a cell line domain organism term.
    expect(byLabel.get(TERMS.heparg)!.domain).toBe('cell_line');
  });

  it('is idempotent — re-running reuses the same terms', async () => {
    const store = new FakeStore();
    await seedBiologicalTerms(store);
    const before = await store.list({ schemaId: TERM_SCHEMA_ID });
    const beforeIds = before.map((r) => r.recordId).sort();

    await seedBiologicalTerms(store);
    const after = await store.list({ schemaId: TERM_SCHEMA_ID });
    const afterIds = after.map((r) => r.recordId).sort();

    expect(afterIds).toEqual(beforeIds);
  });

  it('each organism/condition resolves through the tier-0 term provider', async () => {
    const store = new FakeStore();
    await seedBiologicalTerms(store);
    const provider = createTermProvider(store);

    const check = async (q: string) => {
      const hits = await provider(q, 3);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].curie.startsWith('local:TERM-')).toBe(true);
      return hits[0];
    };

    await check(TERMS.cElegansAlias);
    await check('yeast');
    await check('E. coli');
    await check('HepaRG');
    await check('anoxic');
    const chip = await check('organ-on-a-chip');
    expect(chip.label).toBe(TERMS.chip);
  });
});