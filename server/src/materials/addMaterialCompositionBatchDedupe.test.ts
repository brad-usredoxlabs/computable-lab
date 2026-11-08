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

describe('normalizeEventGraphMaterialUsage — batch identity deduplication', () => {
  it('four events sharing one material+composition mint ONE material-spec', async () => {
    const store = new MemoryRecordStore();

    // Identical composition snapshot with >=2 entries: a solute (with concentration) + a solvent
    const compositionSnapshot = [
      {
        component_ref: { kind: 'ontology', id: 'CHEBI:28908', namespace: 'CHEBI', label: 'glucose' },
        role: 'solute',
        concentration: { value: 5, unit: 'mM' },
      },
      {
        component_ref: { kind: 'ontology', id: 'CHEBI:15377', namespace: 'CHEBI', label: 'ethanol' },
        role: 'solvent',
      },
    ];

    const graph = {
      kind: 'event-graph',
      id: 'EVG-BATCH-DEDUPE',
      events: [
        {
          eventId: 'evt-well-A1',
          event_type: 'add_material',
          details: {
            wells: ['A1'],
            material_ref: { kind: 'ontology', id: 'XCO:0000988', namespace: 'XCO', label: 'Media mix' },
            composition_snapshot: compositionSnapshot,
          },
        },
        {
          eventId: 'evt-well-B2',
          event_type: 'add_material',
          details: {
            wells: ['B2'],
            material_ref: { kind: 'ontology', id: 'XCO:0000988', namespace: 'XCO', label: 'Media mix' },
            composition_snapshot: compositionSnapshot,
          },
        },
        {
          eventId: 'evt-well-C3',
          event_type: 'add_material',
          details: {
            wells: ['C3'],
            material_ref: { kind: 'ontology', id: 'XCO:0000988', namespace: 'XCO', label: 'Media mix' },
            composition_snapshot: compositionSnapshot,
          },
        },
        {
          eventId: 'evt-well-D4',
          event_type: 'add_material',
          details: {
            wells: ['D4'],
            material_ref: { kind: 'ontology', id: 'XCO:0000988', namespace: 'XCO', label: 'Media mix' },
            composition_snapshot: compositionSnapshot,
          },
        },
      ],
    };

    const normalized = await normalizeEventGraphMaterialUsage(store, EVENT_GRAPH_SCHEMA_ID, graph);

    const createdSpecs = store.created.filter((e) => e.meta?.kind === 'material-spec');
    expect(createdSpecs.length).toBe(1);

    // Every normalized event must point at the same spec id
    const specIds = ((normalized as any).events as any[]).map(
      (ev) => (ev.details as any).material_spec_ref?.id,
    );

    const firstId = specIds[0];

    // Every event must bind the SAME id (all-equal pin) and the id must be a
    // single identity key, not a per-event-shaped draft id.
    specIds.forEach((id) => {
      expect(id).toBe(firstId);
    });
    expect(new Set(specIds).size).toBe(1);
    expect(typeof firstId).toBe('string');
    expect(firstId).toContain('EVT_WELL_A1');
    expect(firstId).not.toMatch(/EVT_WELL_(B2|C3|D4)/);
    expect(specIds.length).toBe(4);
  });

  it('permuted composition entry order across events still mints ONE material-spec', async () => {
    const store = new MemoryRecordStore();

    const glucose = {
      component_ref: { kind: 'ontology', id: 'CHEBI:28908', namespace: 'CHEBI', label: 'glucose' },
      role: 'solute',
      concentration: { value: 5, unit: 'mM' },
    };
    const ethanol = {
      component_ref: { kind: 'ontology', id: 'CHEBI:15377', namespace: 'CHEBI', label: 'ethanol' },
      role: 'solvent',
    };

    const graph = {
      kind: 'event-graph',
      id: 'EVG-PERM-ORDER',
      events: [
        {
          eventId: 'evt-perm-e1',
          event_type: 'add_material',
          details: {
            wells: ['A1'],
            material_ref: { kind: 'ontology', id: 'XCO:0000988', namespace: 'XCO', label: 'Media mix' },
            composition_snapshot: [glucose, ethanol],
          },
        },
        {
          eventId: 'evt-perm-e2',
          event_type: 'add_material',
          details: {
            wells: ['B2'],
            material_ref: { kind: 'ontology', id: 'XCO:0000988', namespace: 'XCO', label: 'Media mix' },
            // Same identity, entry order permuted: server FIND uses
            // compositionsEqual (order-insensitive), so the batch memo must too.
            composition_snapshot: [ethanol, glucose],
          },
        },
      ],
    };

    const normalized = await normalizeEventGraphMaterialUsage(store, EVENT_GRAPH_SCHEMA_ID, graph);

    const createdSpecs = store.created.filter((e) => e.meta?.kind === 'material-spec');
    expect(createdSpecs.length).toBe(1);

    const specIds = ((normalized as any).events as any[]).map(
      (ev) => (ev.details as any).material_spec_ref?.id,
    );
    expect(specIds.length).toBe(2);
    expect(new Set(specIds).size).toBe(1);
    expect(specIds[0]).toBe(specIds[1]);
  });

  it('distinct identities in one graph still mint distinct specs', async () => {
    const store = new MemoryRecordStore();

    const compositionSnapshot = [
      {
        component_ref: { kind: 'ontology', id: 'CHEBI:28908', namespace: 'CHEBI', label: 'glucose' },
        role: 'solute',
        concentration: { value: 5, unit: 'mM' },
      },
      {
        component_ref: { kind: 'ontology', id: 'CHEBI:15377', namespace: 'CHEBI', label: 'ethanol' },
        role: 'solvent',
      },
    ];

    // Two events with different material_ref ids but identical composition
    const graph = {
      kind: 'event-graph',
      id: 'EVG-DISTINCT-ID',
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
        {
          eventId: 'evt-second',
          event_type: 'add_material',
          details: {
            wells: ['B2'],
            material_ref: { kind: 'ontology', id: 'XCO:0001001', namespace: 'XCO', label: 'Other mix' },
            composition_snapshot: compositionSnapshot,
          },
        },
      ],
    };

    const normalized = await normalizeEventGraphMaterialUsage(store, EVENT_GRAPH_SCHEMA_ID, graph);

    const createdSpecs = store.created.filter((e) => e.meta?.kind === 'material-spec');
    expect(createdSpecs.length).toBe(2);

    // Two different spec ids
    const specIds = ((normalized as any).events as any[]).map(
      (ev) => (ev.details as any).material_spec_ref?.id,
    );
    expect(specIds[0]).not.toBe(specIds[1]);
  });

  it('same material, equal-length compositions with DIFFERENT concentration mint distinct specs', async () => {
    const store = new MemoryRecordStore();

    // Same components, same roles, same entry COUNT — only the solute's
    // concentration differs (1 mM vs 2 mM). These are chemically distinct
    // formulations and must not be merged into ONE material-spec.
    const glucoseAt = (value: number) => ({
      component_ref: { kind: 'ontology', id: 'CHEBI:28908', namespace: 'CHEBI', label: 'glucose' },
      role: 'solute',
      concentration: { value, unit: 'mM' },
    });
    const ethanol = {
      component_ref: { kind: 'ontology', id: 'CHEBI:15377', namespace: 'CHEBI', label: 'ethanol' },
      role: 'solvent',
    };

    const graph = {
      kind: 'event-graph',
      id: 'EVG-CONC-DIFF',
      events: [
        {
          eventId: 'evt-conc-1mm',
          event_type: 'add_material',
          details: {
            wells: ['A1'],
            material_ref: { kind: 'ontology', id: 'XCO:0000988', namespace: 'XCO', label: 'Media mix' },
            composition_snapshot: [glucoseAt(1), ethanol],
          },
        },
        {
          eventId: 'evt-conc-2mm',
          event_type: 'add_material',
          details: {
            wells: ['B2'],
            material_ref: { kind: 'ontology', id: 'XCO:0000988', namespace: 'XCO', label: 'Media mix' },
            composition_snapshot: [glucoseAt(2), ethanol],
          },
        },
      ],
    };

    const normalized = await normalizeEventGraphMaterialUsage(store, EVENT_GRAPH_SCHEMA_ID, graph);

    // Witnesses the compositionsEqual clause in the batch identity memo: an
    // id-only or length-only comparison would merge these into ONE spec.
    const createdSpecs = store.created.filter((e) => e.meta?.kind === 'material-spec');
    expect(createdSpecs.length).toBe(2);

    const specIds = ((normalized as any).events as any[]).map(
      (ev) => (ev.details as any).material_spec_ref?.id,
    );
    expect(specIds.length).toBe(2);
    expect(specIds[0]).not.toBe(specIds[1]);
  });
});
