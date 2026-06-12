import { describe, expect, it } from 'vitest';
import type { RecordEnvelope, RecordStore, StoreResult, GetRecordOptions } from '../store/types.js';
import type { ValidationResult, LintResult } from '../types/common.js';
import { normalizeEventGraphMaterialUsage } from './AddMaterialSupport.js';

const EVENT_GRAPH_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml';
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

function materialSpec(): RecordEnvelope {
  return {
    recordId: 'MSP-FEN-1MM',
    schemaId: MATERIAL_SPEC_SCHEMA_ID,
    payload: {
      kind: 'material-spec',
      id: 'MSP-FEN-1MM',
      name: '1 mM Fenofibrate',
      material_ref: { kind: 'record', id: 'MAT-FEN', type: 'material', label: 'Fenofibrate' },
      formulation_kind: 'single_active',
    },
  };
}

function eventGraph(details: Record<string, unknown>): Record<string, unknown> {
  return {
    kind: 'event-graph',
    id: 'EVG-TEST',
    events: [
      {
        eventId: 'evt-1',
        event_type: 'add_material',
        details: {
          wells: ['A1'],
          material_spec_ref: { kind: 'record', id: 'MSP-FEN-1MM', type: 'material-spec', label: '1 mM Fenofibrate' },
          ...details,
        },
      },
    ],
  };
}

describe('normalizeEventGraphMaterialUsage', () => {
  it('keeps spec-backed draft usage as an unresolved source requirement when no lot is supplied', async () => {
    const store = new MemoryRecordStore([materialSpec()]);

    const normalized = await normalizeEventGraphMaterialUsage(store, EVENT_GRAPH_SCHEMA_ID, eventGraph({}));
    const event = (normalized as { events: Array<{ details: Record<string, unknown> }> }).events[0]!;

    expect(event.details.aliquot_ref).toBeUndefined();
    expect(event.details.material_source_requirement).toMatchObject({
      status: 'unresolved',
      material_spec_ref: { id: 'MSP-FEN-1MM' },
    });
    expect(store.created).toHaveLength(0);
  });

  it('materializes an implicit aliquot when explicit lot details are supplied', async () => {
    const store = new MemoryRecordStore([materialSpec()]);

    const normalized = await normalizeEventGraphMaterialUsage(store, EVENT_GRAPH_SCHEMA_ID, eventGraph({
      instance_lot: { vendor: 'Sigma', lot_number: 'L123' },
    }));
    const event = (normalized as { events: Array<{ details: Record<string, unknown> }> }).events[0]!;

    expect(event.details.aliquot_ref).toMatchObject({ kind: 'record', type: 'aliquot' });
    expect(store.created.some((record) => record.recordId.startsWith('ALQ-IMPLICIT-'))).toBe(true);
  });


  it('creates a proposed material spec from a grounded composition snapshot on accept', async () => {
    const store = new MemoryRecordStore();
    const graph = {
      kind: 'event-graph',
      id: 'EVG-COMP',
      events: [
        {
          eventId: 'evt-media',
          event_type: 'add_material',
          details: {
            wells: ['A4', 'B4'],
            labwareId: 'lbw-seed-plate-96-flat',
            material_ref: { kind: 'ontology', id: 'XCO:0000988', namespace: 'XCO', label: "Dulbecco's Modified Eagle's Medium" },
            volume: { value: 200, unit: 'uL' },
            formulation_kind: 'complex_composition',
            composition_snapshot: [
              {
                component_ref: { kind: 'ontology', id: 'XCO:0000988', namespace: 'XCO', label: "Dulbecco's Modified Eagle's Medium" },
                role: 'buffer_component',
              },
              {
                component_ref: { kind: 'ontology', id: 'MSIO:0000017', namespace: 'MSIO', label: 'fetal bovine serum' },
                role: 'additive',
                concentration: { value: 10, unit: '% v/v', basis: 'volume_fraction' },
              },
            ],
          },
        },
      ],
    };

    const normalized = await normalizeEventGraphMaterialUsage(store, EVENT_GRAPH_SCHEMA_ID, graph);
    const event = (normalized as { events: Array<{ details: Record<string, unknown> }> }).events[0]!;
    const specRef = event.details.material_spec_ref as Record<string, unknown>;

    expect(specRef).toMatchObject({ kind: 'record', type: 'material-spec' });
    expect(event.details.material_source_requirement).toMatchObject({
      status: 'unresolved',
      material_spec_ref: { id: specRef.id },
    });
    const createdSpec = store.created.find((record) => record.recordId === specRef.id)!;
    expect(createdSpec.schemaId).toBe(MATERIAL_SPEC_SCHEMA_ID);
    expect(createdSpec.payload).toMatchObject({
      kind: 'material-spec',
      status: 'proposed',
      lifecycleId: 'lab-vocabulary-control',
      provenance: {
        source: 'compiler',
        sourceLabel: "Dulbecco's Modified Eagle's Medium + fetal bovine serum",
        createdBy: 'add-material-normalizer',
      },
      formulation_kind: 'complex_composition',
      material_ref: { id: 'XCO:0000988' },
      formulation: {
        composition: [
          { component_ref: { id: 'XCO:0000988' }, role: 'buffer_component' },
          { component_ref: { id: 'MSIO:0000017' }, role: 'additive', concentration: { value: 10, unit: '% v/v', basis: 'volume_fraction' } },
        ],
      },
    });
    expect((createdSpec.payload as Record<string, unknown>).provenance).not.toHaveProperty('eventGraphId');
    expect((createdSpec.payload as Record<string, unknown>).provenance).not.toHaveProperty('eventId');
  });
});
