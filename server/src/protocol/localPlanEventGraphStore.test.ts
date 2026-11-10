// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { persistLocalPlanEventGraph } from './localPlanEventGraphStore.js';
import type { RecordStore, CreateRecordOptions, UpdateRecordOptions, RecordEnvelope, StoreResult, DeleteRecordOptions, GetRecordOptions, RecordFilter } from '../store/types.js';
import type { LocalPlanEventGraphDocumentResult } from './localPlanEventGraph.js';

const EVENT_GRAPH_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml';
const RUN_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/run.schema.yaml';

class MemoryRecordStore implements RecordStore {
  records = new Map<string, RecordEnvelope>();

  constructor(records: RecordEnvelope[] = []) {
    for (const record of records) this.records.set(record.recordId, record);
  }

  async get(recordId: string): Promise<RecordEnvelope | null> {
    return this.records.get(recordId) ?? null;
  }

  async getByPath(): Promise<RecordEnvelope | null> {
    return null;
  }

  async getWithValidation(options: GetRecordOptions): Promise<StoreResult> {
    const envelope = this.records.get(options.recordId);
    return envelope ? { success: true, envelope } : { success: false, error: 'not found' };
  }

  async list(filter?: RecordFilter): Promise<RecordEnvelope[]> {
    const records = Array.from(this.records.values());
    if (!filter?.kind) return records;
    return records.filter((record) => (record.payload as Record<string, unknown>).kind === filter.kind);
  }

  async create(options: CreateRecordOptions): Promise<StoreResult> {
    this.records.set(options.envelope.recordId, options.envelope);
    return { success: true, envelope: options.envelope };
  }

  async update(options: UpdateRecordOptions): Promise<StoreResult> {
    this.records.set(options.envelope.recordId, options.envelope);
    return { success: true, envelope: options.envelope };
  }

  async delete(options: DeleteRecordOptions): Promise<StoreResult> {
    this.records.delete(options.recordId);
    return { success: true };
  }

  async validate() {
    return { valid: true, errors: [] };
  }

  async lint() {
    return { valid: true, errors: [] };
  }

  async exists(recordId: string): Promise<boolean> {
    return this.records.has(recordId);
  }
}

describe('persistLocalPlanEventGraph', () => {
  it('creates one event-graph record and links the graph id to the run', async () => {
    const store = new MemoryRecordStore([
      { recordId: 'RUN-1', schemaId: RUN_SCHEMA_ID, payload: { kind: 'run', recordId: 'RUN-1', title: 'Test run', status: 'planned' } },
    ]);

    const documentResult: LocalPlanEventGraphDocumentResult = {
      ok: true,
      document: {
        kind: 'event-graph',
        id: 'EVG-test',
        events: [
          { eventId: 'EVT-1', stepId: 'step-1', event_type: 'add_material', details: {} },
        ],
        labwares: [],
      },
    };

    const result = await persistLocalPlanEventGraph({
      store,
      runId: 'RUN-1',
      runPayload: { kind: 'run', recordId: 'RUN-1', title: 'Test run', status: 'planned' },
      documentResult,
      eventGraphSchemaId: EVENT_GRAPH_SCHEMA_ID,
      runSchemaId: RUN_SCHEMA_ID,
    });

    // (a) Success with the graph id.
    expect(result).toEqual({ ok: true, graphId: 'EVG-test' });

    // (b) Exactly ONE event-graph record exists.
    const eventGraphs = await store.list({ kind: 'event-graph' });
    expect(eventGraphs).toHaveLength(1);
    expect(eventGraphs[0].payload).toMatchObject({
      kind: 'event-graph',
      id: 'EVG-test',
      events: [{ eventId: 'EVT-1', stepId: 'step-1', event_type: 'add_material', details: {} }],
      labwares: [],
    });
    // No measured values — the document only carries eventId/stepId/event_type/details.
    for (const event of eventGraphs[0].payload.events as Array<Record<string, unknown>>) {
      expect(event).not.toHaveProperty('cellCount');
      expect(event).not.toHaveProperty('density');
    }

    // (c) The run payload carries the new graph id in methodEventGraphId.
    const runEnvelope = await store.get('RUN-1');
    expect(runEnvelope).not.toBeNull();
    expect((runEnvelope?.payload as Record<string, unknown>).methodEventGraphId).toBe('EVG-test');
  });

  it('refuses projection error without creating any record', async () => {
    const store = new MemoryRecordStore([]);

    const documentResult: LocalPlanEventGraphDocumentResult = {
      ok: false,
      code: 'UNSUPPORTED_EVENT_TYPE',
      eventType: 'centrifuge',
      stepId: 'spin-plate',
    };

    const result = await persistLocalPlanEventGraph({
      store,
      runId: 'RUN-1',
      runPayload: { kind: 'run', recordId: 'RUN-1', title: 'Test run' },
      documentResult,
      eventGraphSchemaId: EVENT_GRAPH_SCHEMA_ID,
      runSchemaId: RUN_SCHEMA_ID,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('should not reach');
    expect(result.code).toBe('UNSUPPORTED_EVENT_TYPE');
    expect(result.eventType).toBe('centrifuge');
    expect(result.stepId).toBe('spin-plate');

    // Nothing was created.
    const allRecords = await store.list();
    expect(allRecords).toHaveLength(0);
  });
});
