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


  it('grounds concept-only ontology material refs to proposed local materials on accept', async () => {
    const store = new MemoryRecordStore();
    const graph = {
      kind: 'event-graph',
      id: 'EVG-CELLS',
      events: [
        {
          eventId: 'evt-cells',
          event_type: 'add_material',
          details: {
            wells: ['A1'],
            material_ref: { kind: 'ontology', id: 'EFO:0001187', namespace: 'EFO', label: 'HepG2' },
            count: 10000,
          },
        },
      ],
    };

    const normalized = await normalizeEventGraphMaterialUsage(store, EVENT_GRAPH_SCHEMA_ID, graph);
    const event = (normalized as { events: Array<{ details: Record<string, unknown> }> }).events[0]!;

    expect(event.details.material_ref).toMatchObject({
      kind: 'record',
      id: 'MAT-EFO-0001187',
      type: 'material',
      label: 'HepG2',
    });
    expect(store.created.find((record) => record.recordId === 'MAT-EFO-0001187')?.payload).toMatchObject({
      kind: 'material',
      id: 'MAT-EFO-0001187',
      name: 'HepG2',
      status: 'proposed',
      lifecycleId: 'lab-vocabulary-control',
      class: [{ kind: 'ontology', id: 'EFO:0001187', namespace: 'EFO', label: 'HepG2' }],
    });
  });

  it('grounds a free-text draft/mint material ref to a proposed local material on accept', async () => {
    const store = new MemoryRecordStore();
    // The exact shape the deterministic/AI parser emits for "add 10uL of 1uM
    // fenofibrate to A3": a draft ref with a mint: id and no ontology CURIE.
    const graph = {
      kind: 'event-graph',
      id: 'EVG-DRAFT',
      events: [
        {
          eventId: 'evt-feno',
          event_type: 'add_material',
          details: {
            labwareId: 'lw-1781391596458-azjp4a',
            wells: ['A3'],
            volume: { value: 10, unit: 'uL' },
            concentration: { value: 1, unit: 'uM' },
            material_ref_domain: 'chemical',
            material_ref: { kind: 'draft', id: 'mint:fenofibrate', label: 'fenofibrate' },
          },
        },
      ],
    };

    const normalized = await normalizeEventGraphMaterialUsage(store, EVENT_GRAPH_SCHEMA_ID, graph);
    const event = (normalized as { events: Array<{ details: Record<string, unknown> }> }).events[0]!;

    // The draft ref is replaced with a real local record ref (lab namespace).
    const groundedRef = event.details.material_ref as Record<string, unknown>;
    expect(groundedRef.kind).toBe('record');
    expect(groundedRef.type).toBe('material');
    expect(groundedRef.label).toBe('fenofibrate');
    expect(String(groundedRef.id)).toMatch(/^MAT-fenofibrate-[a-z0-9]{4}$/);
    // No bare draft/mint ref survives into the accepted graph.
    expect(groundedRef.id).not.toContain('mint:');

    const minted = store.created.find((record) => record.recordId === groundedRef.id);
    expect(minted?.payload).toMatchObject({
      kind: 'material',
      name: 'fenofibrate',
      domain: 'chemical',
      status: 'proposed',
    });
    // A free-text mint carries no ontology class.
    expect((minted?.payload as Record<string, unknown>).class).toBeUndefined();
  });

  it('reuses an existing local material when a draft ref names one that already exists', async () => {
    const existing: RecordEnvelope = {
      recordId: 'MAT-FENO-EXISTING',
      schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
      payload: { kind: 'material', id: 'MAT-FENO-EXISTING', name: 'Fenofibrate', domain: 'chemical', status: 'active' },
    };
    const store = new MemoryRecordStore([existing]);
    const graph = {
      kind: 'event-graph',
      id: 'EVG-DRAFT-DEDUP',
      events: [
        {
          eventId: 'evt-feno',
          event_type: 'add_material',
          details: {
            wells: ['A3'],
            // Different case than the stored name — dedup is case-insensitive.
            material_ref: { kind: 'draft', id: 'mint:fenofibrate', label: 'fenofibrate' },
          },
        },
      ],
    };

    const normalized = await normalizeEventGraphMaterialUsage(store, EVENT_GRAPH_SCHEMA_ID, graph);
    const event = (normalized as { events: Array<{ details: Record<string, unknown> }> }).events[0]!;

    expect(event.details.material_ref).toMatchObject({ kind: 'record', id: 'MAT-FENO-EXISTING' });
    // Reused, not re-minted.
    expect(store.created.some((record) => record.recordId.startsWith('MAT-fenofibrate-'))).toBe(false);
  });

  it('is idempotent for a draft ref — re-normalizing reuses the minted record', async () => {
    const store = new MemoryRecordStore();
    const makeGraph = () => ({
      kind: 'event-graph',
      id: 'EVG-DRAFT-IDEM',
      events: [
        {
          eventId: 'evt-feno',
          event_type: 'add_material',
          details: {
            wells: ['A3'],
            material_ref_domain: 'chemical',
            material_ref: { kind: 'draft', id: 'mint:fenofibrate', label: 'fenofibrate' },
          },
        },
      ],
    });

    const first = await normalizeEventGraphMaterialUsage(store, EVENT_GRAPH_SCHEMA_ID, makeGraph());
    const firstId = ((first as { events: Array<{ details: Record<string, unknown> }> }).events[0]!
      .details.material_ref as Record<string, unknown>).id;
    const mintedAfterFirst = store.created.length;

    const second = await normalizeEventGraphMaterialUsage(store, EVENT_GRAPH_SCHEMA_ID, makeGraph());
    const secondId = ((second as { events: Array<{ details: Record<string, unknown> }> }).events[0]!
      .details.material_ref as Record<string, unknown>).id;

    expect(secondId).toBe(firstId);
    // No second mint: the deterministic id resolves to the same existing record.
    expect(store.created.length).toBe(mintedAfterFirst);
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
      material_ref: { kind: 'record', id: 'MAT-XCO-0000988', type: 'material' },
      formulation: {
        composition: [
          { component_ref: { kind: 'record', id: 'MAT-XCO-0000988', type: 'material' }, role: 'buffer_component' },
          { component_ref: { kind: 'record', id: 'MAT-MSIO-0000017', type: 'material' }, role: 'additive', concentration: { value: 10, unit: '% v/v', basis: 'volume_fraction' } },
        ],
      },
    });
    expect(store.created.find((record) => record.recordId === 'MAT-XCO-0000988')?.payload).toMatchObject({
      kind: 'material',
      status: 'proposed',
      class: [{ kind: 'ontology', id: 'XCO:0000988' }],
    });
    expect(store.created.find((record) => record.recordId === 'MAT-MSIO-0000017')?.payload).toMatchObject({
      kind: 'material',
      status: 'proposed',
      class: [{ kind: 'ontology', id: 'MSIO:0000017' }],
    });
    expect((createdSpec.payload as Record<string, unknown>).provenance).not.toHaveProperty('eventGraphId');
    expect((createdSpec.payload as Record<string, unknown>).provenance).not.toHaveProperty('eventId');
  });
});
