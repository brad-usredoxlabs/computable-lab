import { describe, expect, it } from 'vitest';
import type { RecordEnvelope, RecordFilter, StoreResult } from '../store/types.js';
import {
  migrateConceptToTerms,
  repointRoleRefs,
  migrateRootsToTerms,
} from './MigrateTerms.js';

class FakeStore {
  records: Array<{ envelope: RecordEnvelope; updateCount: number }> = [];
  async list(filter?: RecordFilter): Promise<RecordEnvelope[]> {
    let out = this.records.map((r) => r.envelope);
    if (filter?.kind) out = out.filter((r) => (r.payload as Record<string, unknown>)?.kind === filter.kind);
    if (filter?.schemaId) out = out.filter((r) => r.schemaId === filter.schemaId);
    return out;
  }
  async get(recordId: string): Promise<RecordEnvelope | null> {
    return this.records.find((r) => r.envelope.recordId === recordId)?.envelope ?? null;
  }
  async getByPath(): Promise<RecordEnvelope | null> {
    return null;
  }
  async create(opts: { envelope: RecordEnvelope; message?: string }): Promise<StoreResult> {
    this.records.push({ envelope: opts.envelope, updateCount: 0 });
    return { success: true, envelope: opts.envelope };
  }
  async update(opts: { envelope: RecordEnvelope; message?: string }): Promise<StoreResult> {
    const idx = this.records.findIndex((r) => r.envelope.recordId === opts.envelope.recordId);
    if (idx >= 0) {
      this.records[idx]!.envelope = opts.envelope;
      this.records[idx]!.updateCount += 1;
    }
    return { success: true, envelope: opts.envelope };
  }
  async delete(): Promise<StoreResult> {
    return { success: true };
  }
  async exists(recordId: string): Promise<boolean> {
    return this.records.some((r) => r.envelope.recordId === recordId);
  }
  async validate(): { valid: true } {
    return { valid: true };
  }
}

describe('migrateConceptToTerms (root-anchor identity migration)', () => {
  it('converts a material concept → term, folding synonyms→aliases and class CURIEs→linkouts', async () => {
    const store = new FakeStore();
    await store.create({
      envelope: {
        recordId: 'MAT-ETH-01',
        schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
        payload: {
          kind: 'material',
          id: 'MAT-ETH-01',
          name: 'ethanol',
          domain: 'chemical',
          synonyms: ['EtOH', 'ethyl alcohol'],
          class: [
            { kind: 'ontology', id: 'CHEBI:16236', namespace: 'CHEBI', label: 'ethanol' },
            { kind: 'ontology', id: 'NCIT:8765', namespace: 'NCIT', label: 'ethanol (NCIT)' },
          ],
        },
        meta: { kind: 'material' },
      },
      message: 'seed',
    });

    const { mapping, result } = await migrateConceptToTerms(store);
    expect(result.termsMinted).toBe(1);
    expect(result.skipped).toEqual([]);

    const termId = mapping.get('MAT-ETH-01')?.termId;
    expect(termId).toBeDefined();
    expect(termId!).toMatch(/^TERM-.+/);

    const terms = await store.list({ schemaId: 'https://computable-lab.com/schema/computable-lab/term.schema.yaml' });
    expect(terms.length).toBe(1);
    const term = terms[0]!.payload as Record<string, unknown>;
    expect(term.preferredLabel).toBe('ethanol');
    expect(term.kind).toBe('material');
    expect(term.domain).toBe('chemical');
    expect(term.aliases).toEqual(expect.arrayContaining(['EtOH', 'ethyl alcohol']));
    expect(term.linkouts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'ontology', curie: 'CHEBI:16236' }),
      expect.objectContaining({ kind: 'ontology', curie: 'NCIT:8765' }),
    ]));
  });

  it('folds vendor-product → term(kind:vendor) with a vendor linkout', async () => {
    const store = new FakeStore();
    await store.create({
      envelope: {
        recordId: 'VPR-THERMO-13579',
        schemaId: 'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml',
        payload: {
          kind: 'vendor-product',
          id: 'VPR-THERMO-13579',
          name: 'Thermo HPLC-grade ethanol',
          vendor: 'Thermo',
          catalog_number: '13579',
          grade: 'HPLC-grade',
          package_size: '500 mL',
        },
        meta: { kind: 'vendor-product' },
      },
      message: 'seed',
    });

    const { mapping } = await migrateConceptToTerms(store);
    const termId = mapping.get('VPR-THERMO-13579')?.termId;
    expect(termId).toBeDefined();

    const terms = await store.list({ schemaId: 'https://computable-lab.com/schema/computable-lab/term.schema.yaml' });
    const term = terms[0]!.payload as Record<string, unknown>;
    expect(term.kind).toBe('vendor');
    expect(term.linkouts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'vendor', vendor: 'Thermo', catalog_number: '13579' }),
    ]));
  });

  it('collapses two concepts with the same normalized identity onto ONE term (the F-praus fix)', async () => {
    const store = new FakeStore();
    await store.create({
      envelope: {
        recordId: 'MAT-FPRAUS-A',
        schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
        payload: { kind: 'material', id: 'MAT-FPRAUS-A', name: 'Faecalibacterium prausnitzii', domain: 'other', synonyms: ['F praus', 'FPRAUS'] },
        meta: { kind: 'material' },
      },
      message: 'seed-a',
    });
    await store.create({
      envelope: {
        recordId: 'MAT-FPRAUS-B',
        schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
        payload: { kind: 'material', id: 'MAT-FPRAUS-B', name: 'F. prausnitzii', domain: 'other', synonyms: ['FPRAUS'] },
        meta: { kind: 'material' },
      },
      message: 'seed-b',
    });

    const { mapping, result } = await migrateConceptToTerms(store);
    const termA = mapping.get('MAT-FPRAUS-A')?.termId;
    const termB = mapping.get('MAT-FPRAUS-B')?.termId;
    expect(termA).toBe(termB); // both concepts share ONE canonical term
    expect(result.termsMinted).toBe(1); // first minted
    expect(result.termsReused).toBe(1); // second reused (same normalized identity)
  });

  it('re-points a material-instance root ref from MAT-… to the term', async () => {
    const store = new FakeStore();
    await store.create({
      envelope: {
        recordId: 'MAT-ETH-01',
        schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
        payload: { kind: 'material', id: 'MAT-ETH-01', name: 'ethanol', domain: 'chemical' },
        meta: { kind: 'material' },
      },
      message: 'seed-material',
    });
    await store.create({
      envelope: {
        recordId: 'MINST-0001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/material-instance.schema.yaml',
        payload: {
          kind: 'material-instance',
          id: 'MINST-0001',
          name: 'ethanol stock bottle',
          material_ref: { kind: 'record', type: 'material', id: 'MAT-ETH-01' },
        },
        meta: { kind: 'material-instance' },
      },
      message: 'seed-instance',
    });

    const { mapping, result } = await migrateRootsToTerms(store);
    expect(mapping.has('MAT-ETH-01')).toBe(true);
    expect(result.repointed).toBe(1);

    const instance = (await store.get('MINST-0001'))!.payload as Record<string, unknown>;
    const termId = mapping.get('MAT-ETH-01')!.termId;
    expect(instance.material_ref).toEqual({ kind: 'record', type: 'term', id: termId });
  });

  it('is idempotent (second run reuses existing terms, no new mint)', async () => {
    const store = new FakeStore();
    await store.create({
      envelope: {
        recordId: 'MAT-ETH-01',
        schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
        payload: { kind: 'material', id: 'MAT-ETH-01', name: 'ethanol', domain: 'chemical' },
        meta: { kind: 'material' },
      },
      message: 'seed-material',
    });
    await store.create({
      envelope: {
        recordId: 'MINST-0001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/material-instance.schema.yaml',
        payload: {
          kind: 'material-instance',
          id: 'MINST-0001',
          name: 'ethanol stock bottle',
          material_ref: { kind: 'record', type: 'material', id: 'MAT-ETH-01' },
        },
        meta: { kind: 'material-instance' },
      },
      message: 'seed-instance',
    });

    const first = await migrateRootsToTerms(store);
    // Second run: the material's synonyms still map to the SAME term; repoint runs again,
    // but the instance ref now points at a term (not in mapping), so repointed is 0 or idempotent.
    const second = await migrateRootsToTerms(store);
    expect(second.mapping.get('MAT-ETH-01')!.termId).toBe(first.mapping.get('MAT-ETH-01')!.termId);
    const terms = await store.list({ schemaId: 'https://computable-lab.com/schema/computable-lab/term.schema.yaml' });
    expect(terms.length).toBe(1);
  });
});