/**
 * MATRES-SHELF — concept-keyed inventory shelf lookup (side lookup, campaign 2).
 *
 * Resolution law (NON-lexical-first): the term resolves to CONCEPT records
 * (material kind, via the tier-1 record provider's lexical law), then the
 * lookup joins DOWN to recorded material:
 *   - material-instance: material_ref ∈ concept ids, OR vendor_product_ref ->
 *     vendor-product whose material_ref ∈ concept ids.
 *   - material-lot: material_ref ∈ concept ids.
 *   - aliquot: parent_material_instance_ref (instance already surfaced) or
 *     source_lot_ref (lot already surfaced).
 * Instances/lots with NO resolvable concept join that matched the term only
 * lexically surface as joinedVia 'unknown-provenance' — never silently absent.
 *
 * NAMING LAW (P7): every report line is RECORDED MATERIAL. The words
 * available/availability/reserved/sufficient appear NOWHERE in the serialized
 * response (pinned by test C). Read-only: store.list ONLY (pinned by test D).
 */

import { describe, expect, it } from 'vitest';
import type { RecordEnvelope, RecordStore } from '../store/types.js';
import type { StoreResult, GetRecordOptions } from '../store/types.js';
import type { ValidationResult, LintResult } from '../types/common.js';
import { createShelfLookup } from './shelfLookup.js';

const SCHEMA = (name: string): string =>
  `https://computable-lab.com/schema/computable-lab/${name}.schema.yaml`;

/** In-memory store over seeded envelopes. list() honors {kind} filters. */
class ShelfFixtureStore implements RecordStore {
  readonly records: RecordEnvelope[];
  /** Write-spy counters (acceptance D): every mutation method records a hit. */
  readonly mutationCalls: string[] = [];
  readonly listCalls: string[] = [];

  constructor(records: RecordEnvelope[]) {
    this.records = records;
  }

  async get(recordId: string): Promise<RecordEnvelope | null> {
    return this.records.find((r) => r.recordId === recordId) ?? null;
  }
  async getByPath(_path: string): Promise<RecordEnvelope | null> {
    return null;
  }
  async getWithValidation(_options: GetRecordOptions): Promise<StoreResult> {
    throw new Error('not used by shelf lookup');
  }
  async list(filter?: { kind?: string }): Promise<RecordEnvelope[]> {
    this.listCalls.push(filter?.kind ?? '*');
    if (filter?.kind) return this.records.filter((r) => r.payload.kind === filter.kind);
    return [...this.records];
  }
  async create(options: { envelope: RecordEnvelope; message?: string }): Promise<StoreResult> {
    this.mutationCalls.push(`create:${options.envelope.recordId}`);
    return { success: true };
  }
  async update(options: { envelope: RecordEnvelope; message?: string }): Promise<StoreResult> {
    this.mutationCalls.push(`update:${options.envelope.recordId}`);
    return { success: true };
  }
  async delete(options: { recordId: string }): Promise<StoreResult> {
    this.mutationCalls.push(`delete:${options.recordId}`);
    return { success: true };
  }
  async validate(_envelope: RecordEnvelope): Promise<ValidationResult> {
    return { valid: true, errors: [] };
  }
  async lint(_envelope: RecordEnvelope): Promise<LintResult> {
    return { valid: true, violations: [] };
  }
  async exists(recordId: string): Promise<boolean> {
    return this.records.some((r) => r.recordId === recordId);
  }
}

/**
 * Canonical fixture (spec §2): the DMSO concept exists as a material record;
 * the bottle is filed as "Sigma D8642" with NO 'DMSO' anywhere in its own
 * payload — it joins to the concept ONLY through its vendor-product's
 * material_ref. Schemas mirror schema/lab/*.schema.yaml ref shapes.
 */
function fixtureRecords(): RecordEnvelope[] {
  return [
    {
      recordId: 'mat-seed-dmso-anhydrous',
      schemaId: SCHEMA('material'),
      payload: {
        kind: 'material',
        id: 'mat-seed-dmso-anhydrous',
        name: 'Dimethyl sulfoxide (DMSO), anhydrous',
        domain: 'chemical',
        synonyms: ['DMSO', 'dimethyl sulfoxide'],
      },
    },
    {
      recordId: 'VPR-SIGMA-D8642',
      schemaId: SCHEMA('vendor-product'),
      payload: {
        kind: 'vendor-product',
        id: 'VPR-SIGMA-D8642',
        name: 'Sigma D8642',
        vendor: 'Sigma-Aldrich',
        catalog_number: 'D8642',
        material_ref: { kind: 'record', type: 'material', id: 'mat-seed-dmso-anhydrous' },
      },
    },
    {
      // The point of the task: no 'DMSO' in this payload at all.
      recordId: 'MINST-SIGMA-D8642',
      schemaId: SCHEMA('material-instance'),
      payload: {
        kind: 'material-instance',
        id: 'MINST-SIGMA-D8642',
        name: 'Sigma D8642',
        vendor_product_ref: { kind: 'record', type: 'vendor-product', id: 'VPR-SIGMA-D8642' },
      },
    },
    {
      // Lot joined directly via material_ref.
      recordId: 'LOT-DMSO-20260217',
      schemaId: SCHEMA('material-lot'),
      payload: {
        kind: 'material-lot',
        id: 'LOT-DMSO-20260217',
        material_ref: { kind: 'record', type: 'material', id: 'mat-seed-dmso-anhydrous' },
        lot_number: 'LOT-20260217-01',
        supplier: { name: 'Sigma-Aldrich', catalog_number: 'D8642', vendor_lot: 'SLCM4455' },
      },
    },
    {
      // Aliquot via a surfaced instance.
      recordId: 'ALQ-000001',
      schemaId: SCHEMA('aliquot'),
      payload: {
        kind: 'aliquot',
        id: 'ALQ-000001',
        name: 'D8642 aliquot 1',
        parent_material_instance_ref: { kind: 'record', type: 'material-instance', id: 'MINST-SIGMA-D8642' },
      },
    },
    {
      // Aliquot via a surfaced lot.
      recordId: 'ALQ-000002',
      schemaId: SCHEMA('aliquot'),
      payload: {
        kind: 'aliquot',
        id: 'ALQ-000002',
        name: 'Lot aliquot 1',
        source_lot_ref: { kind: 'record', type: 'material-lot', id: 'LOT-DMSO-20260217' },
      },
    },
    {
      // Acceptance B: lexically matches 'DMSO' but its only ref points at an
      // UNRELATED concept — must surface as unknown-provenance, never absent.
      recordId: 'MINST-UNJOINED-DMSO',
      schemaId: SCHEMA('material-instance'),
      payload: {
        kind: 'material-instance',
        id: 'MINST-UNJOINED-DMSO',
        name: 'DMSO stop solution (unfiled provenance)',
        material_ref: { kind: 'record', type: 'material', id: 'MAT-SOMETHING-ELSE' },
      },
    },
    {
      recordId: 'MAT-SOMETHING-ELSE',
      schemaId: SCHEMA('material'),
      payload: {
        kind: 'material',
        id: 'MAT-SOMETHING-ELSE',
        name: 'Unrelated compound',
        domain: 'chemical',
      },
    },
    {
      // Noise: an unrelated bottle that must NOT surface for 'DMSO'.
      recordId: 'MINST-UNRELATED',
      schemaId: SCHEMA('material-instance'),
      payload: {
        kind: 'material-instance',
        id: 'MINST-UNRELATED',
        name: 'Thermo Fisher trypsin bottle',
        vendor_product_ref: { kind: 'record', type: 'vendor-product', id: 'VPR-THERMO-TRYPSIN' },
      },
    },
    {
      recordId: 'VPR-THERMO-TRYPSIN',
      schemaId: SCHEMA('vendor-product'),
      payload: {
        kind: 'vendor-product',
        id: 'VPR-THERMO-TRYPSIN',
        name: 'Trypsin, TPCK-treated',
        vendor: 'Thermo Fisher',
        catalog_number: '27290013',
        material_ref: { kind: 'record', type: 'material', id: 'MAT-SOMETHING-ELSE' },
      },
    },
  ];
}

function entryOf(report: { groups: { entries: { recordId: string }[] }[] }, recordId: string) {
  for (const group of report.groups) {
    for (const entry of group.entries) {
      if (entry.recordId === recordId) return entry;
    }
  }
  return undefined;
}

describe('shelfLookup — concept-keyed inventory (MATRES-SHELF)', () => {
  it('A: DMSO query surfaces the vendor-product-joined bottle and groups by vendor/lot', async () => {
    const store = new ShelfFixtureStore(fixtureRecords());
    const lookup = createShelfLookup(store);
    const report = await lookup.queryShelf('DMSO');

    // Concept resolution happened (term -> material records, tier-1 lexical law).
    expect(report.concepts.map((c) => c.recordId)).toContain('mat-seed-dmso-anhydrous');

    // The bottle with NO 'DMSO' in its own payload surfaces via the join.
    const bottle = entryOf(report, 'MINST-SIGMA-D8642');
    expect(bottle).toBeDefined();
    expect(bottle!.joinedVia).toBe('vendor-product');
    expect(bottle!.level).toBe('instance');
    expect(bottle!.vendor).toBe('Sigma-Aldrich');

    // Lot surfaces via direct material_ref with its lot strings.
    const lot = entryOf(report, 'LOT-DMSO-20260217');
    expect(lot).toBeDefined();
    expect(lot!.joinedVia).toBe('direct-material-ref');
    expect(lot!.level).toBe('lot');
    expect(lot!.vendor).toBe('Sigma-Aldrich');
    expect(lot!.lot).toBe('SLCM4455');

    // Aliquots surface via already-surfaced parents.
    expect(entryOf(report, 'ALQ-000001')?.joinedVia).toBe('parent-instance');
    expect(entryOf(report, 'ALQ-000002')?.joinedVia).toBe('source-lot');

    // Noise stays out.
    expect(entryOf(report, 'MINST-UNRELATED')).toBeUndefined();
    expect(entryOf(report, 'MAT-SOMETHING-ELSE')).toBeUndefined();

    // Grouped by vendor/lot: every group carries vendor and/or lot keys and
    // the Sigma bottle sits in a Sigma-Aldrich group.
    expect(report.groups.length).toBeGreaterThan(0);
    for (const group of report.groups) {
      expect(group.entries.length).toBeGreaterThan(0);
    }
    const sigmaGroup = report.groups.find((g) => g.vendor === 'Sigma-Aldrich');
    expect(sigmaGroup).toBeDefined();
    expect(sigmaGroup!.entries.map((e) => e.recordId)).toContain('MINST-SIGMA-D8642');
  });

  it('B: unjoined-but-lexical instance surfaces as unknown-provenance, never silently absent', async () => {
    const store = new ShelfFixtureStore(fixtureRecords());
    const report = await createShelfLookup(store).queryShelf('DMSO');
    const stray = entryOf(report, 'MINST-UNJOINED-DMSO');
    expect(stray).toBeDefined();
    expect(stray!.joinedVia).toBe('unknown-provenance');
    // No provenance claim attached: no vendor/lot invented for it.
    expect(stray!.vendor).toBeUndefined();
    expect(stray!.lot).toBeUndefined();
  });

  it('C: serialized report contains none of the banned words (P7 recorded-material law)', async () => {
    const store = new ShelfFixtureStore(fixtureRecords());
    const report = await createShelfLookup(store).queryShelf('DMSO');
    const serialized = JSON.stringify(report);
    for (const banned of ['available', 'availability', 'reserved', 'sufficient']) {
      expect(serialized.toLowerCase()).not.toContain(banned);
    }
  });

  it('D: write-spy proves zero mutations across a query (read-only, store.list only)', async () => {
    const store = new ShelfFixtureStore(fixtureRecords());
    await createShelfLookup(store).queryShelf('DMSO');
    expect(store.mutationCalls).toEqual([]);
    expect(store.listCalls.length).toBeGreaterThan(0);
  });

  it('no-match term returns an empty-but-shaped report', async () => {
    const store = new ShelfFixtureStore(fixtureRecords());
    const report = await createShelfLookup(store).queryShelf('zzz-no-such-thing');
    expect(report.term).toBe('zzz-no-such-thing');
    expect(report.concepts).toEqual([]);
    expect(report.groups).toEqual([]);
  });
});
