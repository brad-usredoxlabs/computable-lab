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

  /**
   * Gate g2 D1: event details.material_ref names the SPEC (MSP-PR9-TEST-CLO-1MM)
   * but the canonical MSP payload.material_ref is MATERIAL-level (MAT-PR9-TEST-CLO).
   * The old level-exact check at :261 rejected every candidate because
   * MSP-PR9-TEST-CLO-1MM !== MAT-PR9-TEST-CLO.
   *
   * Fix: match when the event ref points at a spec whose payload composition
   * identity matches — regardless of whether the ref level is spec or material.
   */
  it('binds canonical spec when event material_ref is spec-level but payload material_ref is material-level (D1)', async () => {
    const composition = [
      {
        component_ref: { kind: 'record', id: 'MAT-PR9-TEST-CLO', type: 'material', label: 'Clo' },
        role: 'solute',
        concentration: { value: 1, unit: 'mM' },
      },
      {
        component_ref: { kind: 'record', id: 'MAT-PR9-TEST-DMSO', type: 'material', label: 'DMSO' },
        role: 'solvent',
      },
    ];

    // Canonical spec: payload.material_ref is material-level (MAT-PR9-TEST-CLO)
    const canonicalSpec = {
      recordId: 'MSP-PR9-TEST-CLO-1MM',
      schemaId: MATERIAL_SPEC_SCHEMA_ID,
      payload: {
        kind: 'material-spec',
        id: 'MSP-PR9-TEST-CLO-1MM',
        name: '1 mM Clo',
        material_ref: { kind: 'record', id: 'MAT-PR9-TEST-CLO', type: 'material', label: 'Clo' },
        formulation_kind: 'complex_composition',
        formulation: { composition },
        tags: [],
      },
    };

    const store = new MemoryRecordStore([canonicalSpec]);

    // Event: material_ref is spec-level (MSP-PR9-TEST-CLO-1MM) — same id as the
    // canonical spec's recordId. Composition snapshot matches canonical.
    const graph = {
      kind: 'event-graph',
      id: 'EVG-CORPUS2',
      events: [
        {
          eventId: 'evt-d1',
          event_type: 'add_material',
          details: {
            wells: ['A1'],
            material_ref: { kind: 'record', id: 'MSP-PR9-TEST-CLO-1MM', type: 'material-spec', label: '1 mM Clo' },
            composition_snapshot: composition,
          },
        },
      ],
    };

    const createdBefore = store.created.length;

    const normalized = await normalizeEventGraphMaterialUsage(store, EVENT_GRAPH_SCHEMA_ID, graph);
    const specRef = ((normalized as any).events[0] as any).details.material_spec_ref as Record<string, unknown>;

    // Must bind to the EXISTING canonical spec, not create a new MSP-DRAFT
    expect(specRef.id).toBe('MSP-PR9-TEST-CLO-1MM');
    // Zero new records created — we found the canonical spec by composition identity
    expect(store.created.length).toBe(createdBefore);
  });

  /**
   * Gate g2 D2: when multiple candidates match composition identity, prefer
   * the canonical (non-ai-draft) spec over a prior draft residue.
   */
  it('prefers canonical spec over ai-draft residue when multiple candidates match (D2)', async () => {
    const composition = [
      {
        component_ref: { kind: 'record', id: 'MAT-PR9-TEST-CLO', type: 'material', label: 'Clo' },
        role: 'solute',
        concentration: { value: 1, unit: 'mM' },
      },
      {
        component_ref: { kind: 'record', id: 'MAT-PR9-TEST-DMSO', type: 'material', label: 'DMSO' },
        role: 'solvent',
      },
    ];

    // A prior draft residue (has ai-draft tag)
    const draftResidue = {
      recordId: 'MSP-DRAFT-EVG_CORPUS2_EVT-33L5E2ZH',
      schemaId: MATERIAL_SPEC_SCHEMA_ID,
      payload: {
        kind: 'material-spec',
        id: 'MSP-DRAFT-EVG_CORPUS2_EVT-33L5E2ZH',
        name: 'Clo + DMSO',
        material_ref: { kind: 'record', id: 'MAT-PR9-TEST-CLO', type: 'material', label: 'Clo' },
        formulation_kind: 'complex_composition',
        formulation: { composition },
        tags: ['ai-draft', 'composition_snapshot'],
      },
    };

    // Canonical spec (no ai-draft tags)
    const canonicalSpec = {
      recordId: 'MSP-PR9-TEST-CLO-1MM',
      schemaId: MATERIAL_SPEC_SCHEMA_ID,
      payload: {
        kind: 'material-spec',
        id: 'MSP-PR9-TEST-CLO-1MM',
        name: '1 mM Clo',
        material_ref: { kind: 'record', id: 'MAT-PR9-TEST-CLO', type: 'material', label: 'Clo' },
        formulation_kind: 'complex_composition',
        formulation: { composition },
        tags: [],
      },
    };

    const store = new MemoryRecordStore([draftResidue, canonicalSpec]);

    const graph = {
      kind: 'event-graph',
      id: 'EVG-CORPUS2',
      events: [
        {
          eventId: 'evt-d2',
          event_type: 'add_material',
          details: {
            wells: ['A1'],
            material_ref: { kind: 'record', id: 'MAT-PR9-TEST-CLO', type: 'material', label: 'Clo' },
            composition_snapshot: composition,
          },
        },
      ],
    };

    const normalized = await normalizeEventGraphMaterialUsage(store, EVENT_GRAPH_SCHEMA_ID, graph);
    const specRef = ((normalized as any).events[0] as any).details.material_spec_ref as Record<string, unknown>;

    // Must pick the canonical spec, NOT the ai-draft residue
    expect(specRef.id).toBe('MSP-PR9-TEST-CLO-1MM');
  });
});
