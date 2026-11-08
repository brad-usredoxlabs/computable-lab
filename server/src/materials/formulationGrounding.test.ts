import { describe, expect, it, vi } from 'vitest';
import type { RecordEnvelope, RecordStore, StoreResult, GetRecordOptions } from '../store/types.js';
import type { ValidationResult, LintResult } from '../types/common.js';
import { findOrAuthorFormulation } from './formulationGrounding.js';

const MATERIAL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material.schema.yaml';
const MATERIAL_SPEC_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml';

class MemoryRecordStore implements RecordStore {
  readonly records = new Map<string, RecordEnvelope>();
  readonly created: RecordEnvelope[] = [];

  constructor(records: RecordEnvelope[] = []) {
    for (const record of records) this.records.set(record.recordId, structuredClone(record));
  }

  async get(recordId: string): Promise<RecordEnvelope | null> {
    return structuredClone(this.records.get(recordId) ?? null);
  }

  async getByPath(_path: string): Promise<RecordEnvelope | null> {
    throw new Error('not implemented');
  }

  async getWithValidation(_options: GetRecordOptions): Promise<StoreResult> {
    throw new Error('not implemented');
  }

  async list(filter?: { kind?: string; schemaId?: string; limit?: number }): Promise<RecordEnvelope[]> {
    let records = [...this.records.values()];
    if (filter?.kind) {
      records = records.filter((r) => (r.payload as Record<string, unknown>)?.kind === filter.kind);
    }
    if (filter?.schemaId) {
      records = records.filter((r) => r.schemaId === filter.schemaId);
    }
    const result = structuredClone(records);
    if (filter?.limit) return result.slice(0, filter.limit);
    return result;
  }

  async create(options: { envelope: RecordEnvelope }): Promise<StoreResult> {
    this.records.set(options.envelope.recordId, structuredClone(options.envelope));
    this.created.push(structuredClone(options.envelope));
    return { success: true, envelope: structuredClone(options.envelope) };
  }

  async update(options: { envelope: RecordEnvelope }): Promise<StoreResult> {
    this.records.set(options.envelope.recordId, structuredClone(options.envelope));
    return { success: true, envelope: structuredClone(options.envelope) };
  }

  async delete(options: { recordId: string }): Promise<StoreResult> {
    this.records.delete(options.recordId);
    return { success: true };
  }

  async validate(_envelope: RecordEnvelope): Promise<ValidationResult> {
    return { valid: true, errors: [] };
  }

  async lint(_envelope: RecordEnvelope): Promise<LintResult> {
    return { valid: true, violations: [] };
  }

  async exists(recordId: string): Promise<boolean> {
    return this.records.has(recordId);
  }
}

const DMSO_ENV: RecordEnvelope = {
  recordId: 'mat-seed-dmso-anhydrous',
  schemaId: MATERIAL_SCHEMA_ID,
  payload: {
    kind: 'material',
    id: 'mat-seed-dmso-anhydrous',
    name: 'Dimethyl sulfoxide (DMSO), anhydrous (seed)',
    synonyms: ['DMSO', 'dimethyl sulfoxide'],
    domain: 'chemical',
  },
};

function makeMaterialSpecEnv(
  specId: string,
  materialRef: Record<string, unknown>,
  concentration: { value: number; unit: string },
  solventRef: Record<string, unknown>,
) {
  return {
    recordId: specId,
    schemaId: MATERIAL_SPEC_SCHEMA_ID,
    payload: {
      kind: 'material-spec',
      id: specId,
      name: `${concentration.value} ${concentration.unit} clofibrate`,
      material_ref: materialRef,
      formulation_kind: 'single_active',
      formulation: {
        concentration,
        solvent_ref: solventRef,
        composition: [
          { component_ref: materialRef, role: 'solute', concentration },
          { component_ref: solventRef, role: 'solvent' },
        ],
      },
    },
  };
}

const stubSearchOntology = vi.fn(async (term: string) => {
  if (term.toLowerCase().includes('clofibrate')) {
    return [
      {
        curie: 'CHEBI:3750',
        label: 'clofibrate',
        namespace: 'CHEBI',
        level: 'concept',
      },
    ];
  }
  if (term.toLowerCase().includes('dmso')) {
    return [
      {
        curie: 'CHEBI:3029',
        label: 'dimethyl sulfoxide',
        namespace: 'CHEBI',
        level: 'concept',
      },
    ];
  }
  return [];
});

describe('findOrAuthorFormulation', () => {
  it('authors concept + formulation when absent, with solvent_ref and ontology sourceCurie', async () => {
    const store = new MemoryRecordStore([DMSO_ENV]);
    const createdBefore = store.created.length;

    const result = await findOrAuthorFormulation(
      { store, searchOntology: stubSearchOntology },
      { kind: 'ontology', id: 'CHEBI:3750', label: 'clofibrate' },
      { value: 1, unit: 'mM' },
      'DMSO',
    );

    // Should have created exactly 2 records: 1 material (concept) + 1 material-spec
    expect(store.created.length - createdBefore).toBe(2);

    // Verify concept was created with sourceCurie
    const conceptEnv = store.created.find(
      (e) => (e.payload as Record<string, unknown>)?.kind === 'material',
    );
    expect(conceptEnv).not.toBeUndefined();
    const conceptPayload = conceptEnv!.payload as Record<string, unknown>;
    expect(conceptPayload.provenance).toBeDefined();
    expect((conceptPayload.provenance as Record<string, unknown>).sourceCurie).toBe('CHEBI:3750');

    // Verify spec was created with solvent_ref and composition roles
    const specEnv = store.created.find(
      (e) => (e.payload as Record<string, unknown>)?.kind === 'material-spec',
    );
    expect(specEnv).not.toBeUndefined();
    const specPayload = specEnv!.payload as Record<string, unknown>;
    const formulation = specPayload.formulation as Record<string, unknown>;
    expect(formulation).not.toBeUndefined();
    expect(formulation.solvent_ref).not.toBeUndefined();
    expect(formulation.concentration).not.toBeUndefined();
    const composition = formulation.composition as Array<Record<string, unknown>>;
    const roles = composition.map((c) => c.role);
    expect(roles).toContain('solute');
    expect(roles).toContain('solvent');

    // Result should be a record ref
    expect(result.kind).toBe('record');
    expect(result.type).toBe('material-spec');
  });

  it('is idempotent — second call returns same ids with zero new creates', async () => {
    const store = new MemoryRecordStore([DMSO_ENV]);
    stubSearchOntology.mockClear();

    const first = await findOrAuthorFormulation(
      { store, searchOntology: stubSearchOntology },
      { kind: 'ontology', id: 'CHEBI:3750', label: 'clofibrate' },
      { value: 1, unit: 'mM' },
      'DMSO',
    );
    const createdAfterFirst = store.created.length;

    const second = await findOrAuthorFormulation(
      { store, searchOntology: stubSearchOntology },
      { kind: 'ontology', id: 'CHEBI:3750', label: 'clofibrate' },
      { value: 1, unit: 'mM' },
      'DMSO',
    );

    // Same spec id returned
    expect(second.id).toBe(first.id);

    // Zero new creates on the second call
    expect(store.created.length).toBe(createdAfterFirst);
  });

  it('reuses a pre-seeded matching spec on second call', async () => {
    // This mutation pin verifies: a finder that does not detect an already-
    // stored spec would author a duplicate. We test by putting a matching spec
    // in the store and confirming the finder reuses it instead of creating a new one.
    const conceptEnv: RecordEnvelope = {
      recordId: 'MAT-CHEBI-3750',
      schemaId: MATERIAL_SCHEMA_ID,
      payload: {
        kind: 'material',
        id: 'MAT-CHEBI-3750',
        name: 'clofibrate',
        class: [{ kind: 'ontology', id: 'CHEBI:3750' }],
      },
    };
    const existingSpec = makeMaterialSpecEnv(
      'MSP-EXISTING',
      { kind: 'record', id: 'MAT-CHEBI-3750', type: 'material' },
      { value: 1, unit: 'mM' },
      { kind: 'record', id: 'mat-seed-dmso-anhydrous', type: 'material' },
    );
    const store = new MemoryRecordStore([DMSO_ENV, conceptEnv, existingSpec]);
    const createdBefore = store.created.length;

    const result = await findOrAuthorFormulation(
      { store, searchOntology: stubSearchOntology },
      { kind: 'ontology', id: 'CHEBI:3750', label: 'clofibrate' },
      { value: 1, unit: 'mM' },
      'DMSO',
    );

    // Must reuse the existing spec
    expect(result.id).toBe('MSP-EXISTING');
    // Must NOT create anything new
    expect(store.created.length).toBe(createdBefore);
  });

  it('authors a different spec when solvent differs (DMSO vs ethanol), not reusing ethanol spec', async () => {
    // Seed: an ethanol solvent material
    const ethanolEnv: RecordEnvelope = {
      recordId: 'mat-ethanol',
      schemaId: MATERIAL_SCHEMA_ID,
      payload: {
        kind: 'material',
        id: 'mat-ethanol',
        name: 'Ethanol',
        synonyms: ['ethanol', 'ethyl alcohol'],
        domain: 'chemical',
      },
    };
    // Seed: a concept for clofibrate
    const conceptEnv: RecordEnvelope = {
      recordId: 'MAT-CHEBI-3750',
      schemaId: MATERIAL_SCHEMA_ID,
      payload: {
        kind: 'material',
        id: 'MAT-CHEBI-3750',
        name: 'clofibrate',
        class: [{ kind: 'ontology', id: 'CHEBI:3750' }],
      },
    };
    // Seed: an ethanol spec for 1mM clofibrate
    const ethanolSpec = makeMaterialSpecEnv(
      'MSP-ETHANOL',
      { kind: 'record', id: 'MAT-CHEBI-3750', type: 'material' },
      { value: 1, unit: 'mM' },
      { kind: 'record', id: 'mat-ethanol', type: 'material' },
    );
    const store = new MemoryRecordStore([DMSO_ENV, ethanolEnv, conceptEnv, ethanolSpec]);
    const createdBefore = store.created.length;

    // Request 1mM clofibrate in DMSO — should NOT return the ethanol spec
    const result = await findOrAuthorFormulation(
      { store, searchOntology: stubSearchOntology },
      { kind: 'ontology', id: 'CHEBI:3750', label: 'clofibrate' },
      { value: 1, unit: 'mM' },
      'DMSO',
    );

    // Must NOT reuse the ethanol spec
    expect(result.id).not.toBe('MSP-ETHANOL');
    // Must have authored a new spec
    expect(store.created.length).toBeGreaterThan(createdBefore);
    // New spec id should include DMSO solvent
    expect(result.id).toContain('MAT-SEED-DM');
  });
});
