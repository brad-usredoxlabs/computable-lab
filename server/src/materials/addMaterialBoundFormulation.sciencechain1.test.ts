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

/**
 * Build a material-spec record with a complex_composition formulation
 * carrying a multi-entry composition array.
 */
function complexFormulationSpec(): RecordEnvelope {
  return {
    recordId: 'MSP-DMEM-FBS',
    schemaId: MATERIAL_SPEC_SCHEMA_ID,
    payload: {
      kind: 'material-spec',
      id: 'MSP-DMEM-FBS',
      name: 'DMEM + 10% FBS',
      material_ref: { kind: 'record', id: 'MAT-DMEM', type: 'material', label: "Dulbecco's Modified Eagle's Medium" },
      formulation_kind: 'complex_composition',
      formulation: {
        composition: [
          {
            component_ref: { kind: 'record', id: 'MAT-DMEM', type: 'material', label: "Dulbecco's Modified Eagle's Medium" },
            role: 'buffer_component',
          },
          {
            component_ref: { kind: 'record', id: 'MAT-FBS', type: 'material', label: 'Fetal Bovine Serum' },
            role: 'additive',
            concentration: { value: 10, unit: '% v/v', basis: 'volume_fraction' },
          },
        ],
      },
    },
  };
}

describe('bound formulation expansion on add_material (L2-PROMPT2-SCIENCE-CHAIN-1 u3)', () => {
  it('expands composition_snapshot from a bound material-spec when no lot is supplied', async () => {
    const store = new MemoryRecordStore([complexFormulationSpec()]);

    // add_material binds to an existing material-spec via material_ref
    const graph = {
      kind: 'event-graph',
      id: 'EVG-BOUND-SPEC',
      events: [
        {
          eventId: 'evt-bound',
          event_type: 'add_material',
          details: {
            wells: ['A1'],
            material_ref: { kind: 'record', id: 'MSP-DMEM-FBS', type: 'material-spec', label: 'DMEM + 10% FBS' },
            volume: { value: 100, unit: 'uL' },
          },
        },
      ],
    };

    const normalized = await normalizeEventGraphMaterialUsage(store, EVENT_GRAPH_SCHEMA_ID, graph);
    const event = (normalized as { events: Array<{ details: Record<string, unknown> }> }).events[0]!;
    const details = event.details as Record<string, unknown>;

    // The event should carry material_spec_ref pointing to the bound spec
    expect(details.material_spec_ref).toMatchObject({ kind: 'record', id: 'MSP-DMEM-FBS', type: 'material-spec' });

    // CRITICAL: composition_snapshot must be expanded from the spec's formulation.composition
    // so downstream concentration/fraction math is statable.
    const compositionSnapshot = details.composition_snapshot;
    expect(Array.isArray(compositionSnapshot)).toBe(true);
    expect(compositionSnapshot).toHaveLength(2);

    const comp0 = compositionSnapshot[0] as Record<string, unknown>;
    const comp1 = compositionSnapshot[1] as Record<string, unknown>;

    expect(comp0).toMatchObject({
      component_ref: { kind: 'record', id: 'MAT-DMEM', type: 'material' },
      role: 'buffer_component',
    });
    expect(comp1).toMatchObject({
      component_ref: { kind: 'record', id: 'MAT-FBS', type: 'material' },
      role: 'additive',
      concentration: { value: 10, unit: '% v/v', basis: 'volume_fraction' },
    });

    // No new records should be created — the spec already exists.
    expect(store.created).toHaveLength(0);
  });

  it('expands composition_snapshot from a bound material-spec when lot is supplied (aliquot path)', async () => {
    const store = new MemoryRecordStore([complexFormulationSpec()]);

    const graph = {
      kind: 'event-graph',
      id: 'EVG-BOUND-SPEC-LOT',
      events: [
        {
          eventId: 'evt-bound-lot',
          event_type: 'add_material',
          details: {
            wells: ['A1'],
            material_ref: { kind: 'record', id: 'MSP-DMEM-FBS', type: 'material-spec', label: 'DMEM + 10% FBS' },
            instance_lot: { vendor: 'Sigma', lot_number: 'LOT-456' },
          },
        },
      ],
    };

    const normalized = await normalizeEventGraphMaterialUsage(store, EVENT_GRAPH_SCHEMA_ID, graph);
    const event = (normalized as { events: Array<{ details: Record<string, unknown> }> }).events[0]!;
    const details = event.details as Record<string, unknown>;

    // Should have an aliquot (lot path)
    expect(details.aliquot_ref).toMatchObject({ kind: 'record', type: 'aliquot' });

    // composition_snapshot must also be expanded here
    const compositionSnapshot = details.composition_snapshot;
    expect(Array.isArray(compositionSnapshot)).toBe(true);
    expect(compositionSnapshot).toHaveLength(2);
  });

  it('does NOT expand when the material-spec has no formulation.composition', async () => {
    const store = new MemoryRecordStore();
    const specWithoutComposition: RecordEnvelope = {
      recordId: 'MSP-SIMPLE',
      schemaId: MATERIAL_SPEC_SCHEMA_ID,
      payload: {
        kind: 'material-spec',
        id: 'MSP-SIMPLE',
        name: 'Simple Spec',
        formulation_kind: 'single_active',
        formulation: {
          concentration: { value: 1, unit: 'mM' },
        },
      },
    };
    store.records.set('MSP-SIMPLE', specWithoutComposition);

    const graph = {
      kind: 'event-graph',
      id: 'EVG-BOUND-SIMPLE',
      events: [
        {
          eventId: 'evt-simple',
          event_type: 'add_material',
          details: {
            wells: ['A1'],
            material_ref: { kind: 'record', id: 'MSP-SIMPLE', type: 'material-spec', label: 'Simple Spec' },
          },
        },
      ],
    };

    const normalized = await normalizeEventGraphMaterialUsage(store, EVENT_GRAPH_SCHEMA_ID, graph);
    const event = (normalized as { events: Array<{ details: Record<string, unknown> }> }).events[0]!;
    const details = event.details as Record<string, unknown>;

    // The spec ref should still be set
    expect(details.material_spec_ref).toMatchObject({ kind: 'record', id: 'MSP-SIMPLE' });

    // composition_snapshot should NOT be present (spec has no composition)
    expect(details.composition_snapshot).toBeUndefined();
  });
});
