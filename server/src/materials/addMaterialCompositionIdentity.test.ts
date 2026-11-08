import { describe, expect, it } from 'vitest';
import type { RecordEnvelope, RecordStore, StoreResult, GetRecordOptions } from '../store/types.js';
import type { ValidationResult, LintResult } from '../types/common.js';
import { normalizeEventGraphMaterialUsage } from './AddMaterialSupport.js';

const EVENT_GRAPH_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml';

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
    throw new Error('not implemented in test store');
  }

  async getWithValidation(_options: GetRecordOptions): Promise<StoreResult> {
    throw new Error('not implemented in test store');
  }

  async list(): Promise<RecordEnvelope[]> {
    return structuredClone([...this.records.values()]);
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

describe('upsertProposedMaterialSpecFromComposition — composition identity lookup', () => {
  it('second identical composition snapshot binds the existing spec (zero writes, same id)', async () => {
    const store = new MemoryRecordStore();

    const compositionSnapshot = [
      {
        component_ref: { kind: 'ontology', id: 'CHEBI:28908', namespace: 'CHEBI', label: 'glucose' },
        role: 'active',
        concentration: { value: 5, unit: 'mM' },
      },
      {
        component_ref: { kind: 'ontology', id: 'CHEBI:15377', namespace: 'CHEBI', label: 'ethanol' },
        role: 'solvent',
      },
    ];

    const graph1 = {
      kind: 'event-graph',
      id: 'EVG-TEST',
      events: [
        {
          eventId: 'evt-first',
          event_type: 'add_material',
          details: {
            wells: ['A1'],
            material_ref: { kind: 'ontology', id: 'XCO:0000988', namespace: 'XCO', label: 'Media mix' },
            composition_snapshot: compositionSnapshot,
          },
        },
      ],
    };

    const graph2 = {
      kind: 'event-graph',
      id: 'EVG-TEST',
      events: [
        {
          eventId: 'evt-second',
          event_type: 'add_material',
          details: {
            wells: ['A1'],
            material_ref: { kind: 'ontology', id: 'XCO:0000988', namespace: 'XCO', label: 'Media mix' },
            composition_snapshot: compositionSnapshot,
          },
        },
      ],
    };

    const normalized1 = await normalizeEventGraphMaterialUsage(store, EVENT_GRAPH_SCHEMA_ID, graph1);
    const specRef1 = ((normalized1 as any).events[0] as any).details.material_spec_ref as Record<string, unknown>;
    const createdAfterFirst = store.created.length;
    expect(createdAfterFirst).toBeGreaterThan(0);

    const normalized2 = await normalizeEventGraphMaterialUsage(store, EVENT_GRAPH_SCHEMA_ID, graph2);
    const specRef2 = ((normalized2 as any).events[0] as any).details.material_spec_ref as Record<string, unknown>;

    // The second call must NOT create a new material-spec for the same composition identity.
    expect(store.created.length).toBe(createdAfterFirst);
    // Both runs must return the same spec id.
    expect(specRef2.id).toBe(specRef1.id);
  });
});
