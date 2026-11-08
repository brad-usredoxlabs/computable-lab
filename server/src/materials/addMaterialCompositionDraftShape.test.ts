// @vitest-environment node
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

describe('draft author carries concentration + solvent_ref on formulation (u5fix2)', () => {
  it('Case A: solute concentration and solvent_ref appear at top-level formulation', async () => {
    const store = new MemoryRecordStore();

    const graph = {
      kind: 'event-graph',
      id: 'EVG-DRAFT-A',
      events: [
        {
          eventId: 'evt-draft-a',
          event_type: 'add_material',
          details: {
            wells: ['A1'],
            material_ref: { kind: 'record', id: 'MAT-TEST-CLO', type: 'material' },
            composition_snapshot: [
              {
                component_ref: { kind: 'record', id: 'MAT-CLO', type: 'material', label: 'Closetam' },
                role: 'solute',
                concentration: { value: 1, unit: 'mM' },
              },
              {
                component_ref: { kind: 'record', id: 'MAT-DMSO', type: 'material', label: 'DMSO' },
                role: 'solvent',
              },
            ],
          },
        },
      ],
    };

    await normalizeEventGraphMaterialUsage(store, EVENT_GRAPH_SCHEMA_ID, graph);
    expect(store.created.length).toBe(1);
    const formulation = store.created[0]!.payload.formulation as Record<string, unknown>;

    // Top-level concentration from the solute entry
    expect(formulation.concentration).toEqual({ value: 1, unit: 'mM' });
    // Top-level solvent_ref from the solvent entry
    expect((formulation.solvent_ref as Record<string, unknown>).id).toBe('MAT-DMSO');
    // Composition still has both entries with roles intact
    const comp = formulation.composition as Array<Record<string, unknown>>;
    expect(comp).toHaveLength(2);
    expect(comp[0]!.role).toBe('solute');
    expect(comp[1]!.role).toBe('solvent');
  });

  it('Case B: no solvent entry => solvent_ref absent (not undefined)', async () => {
    const store = new MemoryRecordStore();

    const graph = {
      kind: 'event-graph',
      id: 'EVG-DRAFT-B',
      events: [
        {
          eventId: 'evt-draft-b',
          event_type: 'add_material',
          details: {
            wells: ['A1'],
            material_ref: { kind: 'record', id: 'MAT-NO-SOLVENT', type: 'material' },
            composition_snapshot: [
              {
                component_ref: { kind: 'record', id: 'MAT-ASPIRIN', type: 'material', label: 'Aspirin' },
                role: 'solute',
                concentration: { value: 10, unit: 'uM' },
              },
              {
                component_ref: { kind: 'record', id: 'MAT-GLYCEROL', type: 'material', label: 'Glycerol' },
                role: 'additive',
              },
            ],
          },
        },
      ],
    };

    await normalizeEventGraphMaterialUsage(store, EVENT_GRAPH_SCHEMA_ID, graph);
    expect(store.created.length).toBe(1);
    const formulation = store.created[0]!.payload.formulation as Record<string, unknown>;

    // No solvent entry => solvent_ref must be ABSENT (not undefined)
    expect(Object.prototype.hasOwnProperty.call(formulation, 'solvent_ref')).toBe(false);
    // Single solute => concentration should be present
    expect(formulation.concentration).toEqual({ value: 10, unit: 'uM' });
  });

  it('Case C: two solutes with different concentrations omit top-level concentration', async () => {
    const store = new MemoryRecordStore();

    const graph = {
      kind: 'event-graph',
      id: 'EVG-DRAFT-C',
      events: [
        {
          eventId: 'evt-draft-c',
          event_type: 'add_material',
          details: {
            wells: ['A1'],
            material_ref: { kind: 'record', id: 'MAT-MIX', type: 'material' },
            composition_snapshot: [
              {
                component_ref: { kind: 'record', id: 'MAT-GLUCOSE', type: 'material', label: 'Glucose' },
                role: 'solute',
                concentration: { value: 5, unit: 'mM' },
              },
              {
                component_ref: { kind: 'record', id: 'MAT-UREA', type: 'material', label: 'Urea' },
                role: 'solute',
                concentration: { value: 2, unit: 'mM' },
              },
              {
                component_ref: { kind: 'record', id: 'MAT-WATER', type: 'material', label: 'Water' },
                role: 'solvent',
              },
            ],
          },
        },
      ],
    };

    await normalizeEventGraphMaterialUsage(store, EVENT_GRAPH_SCHEMA_ID, graph);
    expect(store.created.length).toBe(1);
    const formulation = store.created[0]!.payload.formulation as Record<string, unknown>;

    // Two solutes => concentration must be ABSENT (never guess)
    expect(Object.prototype.hasOwnProperty.call(formulation, 'concentration')).toBe(false);
    // Single solvent => solvent_ref still present
    expect((formulation.solvent_ref as Record<string, unknown>).id).toBe('MAT-WATER');
    // Composition has all three entries intact
    const comp = formulation.composition as Array<Record<string, unknown>>;
    expect(comp).toHaveLength(3);
  });
});
