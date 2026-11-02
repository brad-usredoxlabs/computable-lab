import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { FastifyReply } from 'fastify';
import type { RecordEnvelope, RecordStore, StoreResult, GetRecordOptions } from '../../store/types.js';
import type { ValidationResult, LintResult } from '../../types/common.js';
import { loadMaterialProfileRegistry } from '../../materials/MaterialProfileRegistry.js';
import { createMaterialProfileHandlers } from './MaterialProfileHandlers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = resolve(__dirname, '../../../../schema/lab/material-profile.registry.yaml');
const MATERIAL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material.schema.yaml';

class MemoryRecordStore implements RecordStore {
  readonly records = new Map<string, RecordEnvelope>();
  readonly created: RecordEnvelope[] = [];

  constructor(records: RecordEnvelope[] = []) {
    for (const record of records) this.records.set(record.recordId, structuredClone(record));
  }

  async get(recordId: string): Promise<RecordEnvelope | null> { return structuredClone(this.records.get(recordId) ?? null); }
  async getByPath(_path: string): Promise<RecordEnvelope | null> { throw new Error('not implemented'); }
  async getWithValidation(_options: GetRecordOptions): Promise<StoreResult> { throw new Error('not implemented'); }
  async list(): Promise<RecordEnvelope[]> { return structuredClone([...this.records.values()]); }
  async create(options: { envelope: RecordEnvelope }): Promise<StoreResult> {
    this.records.set(options.envelope.recordId, structuredClone(options.envelope));
    this.created.push(structuredClone(options.envelope));
    return { success: true, envelope: structuredClone(options.envelope) };
  }
  async update(options: { envelope: RecordEnvelope }): Promise<StoreResult> { this.records.set(options.envelope.recordId, structuredClone(options.envelope)); return { success: true, envelope: structuredClone(options.envelope) }; }
  async delete(options: { recordId: string }): Promise<StoreResult> { this.records.delete(options.recordId); return { success: true }; }
  async validate(_envelope: RecordEnvelope): Promise<ValidationResult> { return { valid: true, errors: [] }; }
  async lint(_envelope: RecordEnvelope): Promise<LintResult> { return { valid: true, violations: [] }; }
  async exists(recordId: string): Promise<boolean> { return this.records.has(recordId); }
}

function reply(): FastifyReply {
  return { code: () => reply() } as unknown as FastifyReply;
}

describe('MaterialProfileHandlers', () => {
  it('lists all v1 profiles', async () => {
    const handlers = createMaterialProfileHandlers(loadMaterialProfileRegistry(REGISTRY_PATH), new MemoryRecordStore());
    const response = await handlers.listProfiles({} as never, reply());
    expect(response.profiles.map((profile) => profile.id)).toEqual([
      'chemical',
      'cell_line',
      'media_composition',
      'single_active_formulation',
      'sample',
      'other',
    ]);
  });

  it('carries candidateRanking on listProfiles when the registry declares it (L2-CLARIFY-PICKER-1 OQ1)', async () => {
    const handlers = createMaterialProfileHandlers(loadMaterialProfileRegistry(REGISTRY_PATH), new MemoryRecordStore());
    const response = await handlers.listProfiles({} as never, reply());
    // The declared policy is present on the response (the client comparator's
    // one cached GET reads it). The composition pseudo-family is never-default.
    expect(response).toHaveProperty('candidateRanking');
    expect(response.candidateRanking?.families.composition).toEqual({ rank: 4, canBeDefault: false });
    expect(response.candidateRanking?.containsSectionLabel).toBe('contains "{label}" ({count})');
  });

  it('listProfiles is ABSENT (eOPT, never undefined) when the registry declares no candidate_ranking', async () => {
    const { loadMaterialProfileRegistry } = await import('../../materials/MaterialProfileRegistry.js');
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'material-profiles-'));
    const file = join(dir, 'registry.yaml');
    writeFileSync(file, `version: 1
profiles:
  chemical: { label: Chemical, applies_when: { domain: [chemical] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }
  cell_line: { label: Cell, applies_when: { domain: [cell_line] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }
  media_composition: { label: Media, applies_when: { domain: [media] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }
  single_active_formulation: { label: Single, applies_when: { formulation_kind: [single_active] }, layers: [formulation], fields: [{ path: name, layer: formulation, label: Name, widget: text, control: free-text }], quick_add: [name] }
  sample: { label: Sample, applies_when: { domain: [sample] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }
  other: { label: Other, applies_when: { domain: [other] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }
`);
    const handlers = createMaterialProfileHandlers(loadMaterialProfileRegistry(file), new MemoryRecordStore());
    const response = await handlers.listProfiles({} as never, reply());
    // eOPT: the key is ABSENT (not present-with-undefined) when undeclared.
    expect(response).not.toHaveProperty('candidateRanking');
    expect(response.candidateRanking).toBeUndefined();
  });

  it('grounds ontology refs by reusing existing material class refs', async () => {
    const store = new MemoryRecordStore([{
      recordId: 'MAT-HEPG2',
      schemaId: MATERIAL_SCHEMA_ID,
      payload: {
        kind: 'material',
        id: 'MAT-HEPG2',
        name: 'HepG2',
        domain: 'cell_line',
        class: [{ kind: 'ontology', id: 'EFO:0001187', namespace: 'EFO', label: 'HepG2' }],
      },
    }]);
    const handlers = createMaterialProfileHandlers(loadMaterialProfileRegistry(REGISTRY_PATH), store);
    const response = await handlers.groundOntology({
      body: { ontologyRef: { kind: 'ontology', id: 'EFO:0001187', namespace: 'EFO', label: 'HepG2' }, profileId: 'cell_line' },
    } as never, reply());

    expect(response).toMatchObject({ materialRef: { kind: 'record', id: 'MAT-HEPG2', type: 'material', label: 'HepG2' }, profileId: 'cell_line' });
    expect(store.created).toHaveLength(0);
  });

  it('creates proposed material when no local class match exists', async () => {
    const store = new MemoryRecordStore();
    const handlers = createMaterialProfileHandlers(loadMaterialProfileRegistry(REGISTRY_PATH), store);
    const response = await handlers.groundOntology({
      body: { ontologyRef: { kind: 'ontology', id: 'CHEBI:5001', namespace: 'CHEBI', label: 'fenofibrate' }, profileId: 'chemical' },
    } as never, reply());

    expect(response).toMatchObject({ materialRef: { kind: 'record', id: 'MAT-CHEBI-5001', type: 'material', label: 'fenofibrate' }, profileId: 'chemical' });
    expect(store.created[0]?.payload).toMatchObject({
      kind: 'material',
      id: 'MAT-CHEBI-5001',
      name: 'fenofibrate',
      domain: 'chemical',
      status: 'proposed',
      lifecycleId: 'lab-vocabulary-control',
      class: [{ kind: 'ontology', id: 'CHEBI:5001', namespace: 'CHEBI', label: 'fenofibrate' }],
    });
  });
});
