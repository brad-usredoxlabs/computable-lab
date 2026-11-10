// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { RecordStore, RecordEnvelope, StoreResult, CreateRecordOptions, UpdateRecordOptions, DeleteRecordOptions, GetRecordOptions, RecordFilter } from '../store/types.js';
import { createPlannedRunHandlers } from './PlannedRunHandlers.js';
import type { AppContext } from '../../server.js';

class TestStore implements RecordStore {
  records = new Map<string, RecordEnvelope>();
  writeLog: Array<'create' | 'update'> = [];
  constructor(records: RecordEnvelope[] = []) {
    for (const r of records) this.records.set(r.recordId, r);
  }
  async get(id: string): Promise<RecordEnvelope | null> { return this.records.get(id) ?? null; }
  async getByPath(): Promise<RecordEnvelope | null> { return null; }
  async getWithValidation(o: GetRecordOptions): Promise<StoreResult> {
    const e = this.records.get(o.recordId);
    return e ? { success: true, envelope: e } : { success: false, error: 'not found' };
  }
  async list(f?: RecordFilter): Promise<RecordEnvelope[]> {
    const all = Array.from(this.records.values());
    return f?.kind ? all.filter((r) => (r.payload as Record<string, unknown>).kind === f.kind) : all;
  }
  async create(o: CreateRecordOptions): Promise<StoreResult> {
    this.records.set(o.envelope.recordId, o.envelope); this.writeLog.push('create');
    return { success: true, envelope: o.envelope };
  }
  async update(o: UpdateRecordOptions): Promise<StoreResult> {
    this.records.set(o.envelope.recordId, o.envelope); this.writeLog.push('update');
    return { success: true, envelope: o.envelope };
  }
  async delete(_o: DeleteRecordOptions): Promise<StoreResult> { return { success: true }; }
  async validate(): Promise<{ valid: boolean; errors: string[] }> { return { valid: true, errors: [] }; }
  async lint(): Promise<{ valid: boolean; errors: string[] }> { return { valid: true, errors: [] }; }
  async exists(id: string): Promise<boolean> { return this.records.has(id); }
}

const EG_SCHEMA = 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml';
const RUN_SCHEMA = 'https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml';

function makeSchemaRegistry() {
  return {
    getById(id: string) {
      if (id === EG_SCHEMA) return {
        id: EG_SCHEMA, path: 'workflow/event-graph.schema.yaml', dependencies: [],
        schema: { $defs: { PlateEvent: { properties: { event_type: { type: 'string', enum: ['add_material', 'transfer', 'mix', 'other'] } } } } },
      };
      if (id === RUN_SCHEMA) return {
        id: RUN_SCHEMA, path: 'workflow/planned-run.schema.yaml', dependencies: [], schema: {},
      };
      return undefined;
    },
  };
}

function makeSchemaRegistryNoEnum() {
  return {
    getById(id: string) {
      if (id === EG_SCHEMA) return {
        id: EG_SCHEMA, path: 'workflow/event-graph.schema.yaml', dependencies: [],
        schema: { $defs: { PlateEvent: { properties: {} } } }, // missing event_type enum
      };
      if (id === RUN_SCHEMA) return {
        id: RUN_SCHEMA, path: 'workflow/planned-run.schema.yaml', dependencies: [], schema: {},
      };
      return undefined;
    },
  };
}

function makeSchemaRegistryEnumMismatch() {
  return {
    getById(id: string) {
      if (id === EG_SCHEMA) return {
        id: EG_SCHEMA, path: 'workflow/event-graph.schema.yaml', dependencies: [],
        schema: { $defs: { PlateEvent: { properties: { event_type: { type: 'string', enum: ['other'] } } } } },
      };
      if (id === RUN_SCHEMA) return {
        id: RUN_SCHEMA, path: 'workflow/planned-run.schema.yaml', dependencies: [], schema: {},
      };
      return undefined;
    },
  };
}

function makeSchemaRegistryNoEnumKey() {
  return {
    getById(id: string) {
      if (id === EG_SCHEMA) return {
        id: EG_SCHEMA, path: 'workflow/event-graph.schema.yaml', dependencies: [],
        schema: { $defs: { PlateEvent: { properties: { event_type: { type: 'string' } } } } },
      };
      if (id === RUN_SCHEMA) return {
        id: RUN_SCHEMA, path: 'workflow/planned-run.schema.yaml', dependencies: [], schema: {},
      };
      return undefined;
    },
  };
}

const protoPayload = {
  kind: 'local-protocol' as const, recordId: 'LP-1',
  roles: { labware: [{ roleId: 'targetPlate' }] },
  steps: [{ stepId: 'step-1', kind: 'add_material', targetPlateRole: 'targetPlate' }],
};

function makeRunPayload(bindings?: Record<string, unknown>) {
  return {
    kind: 'planned-run' as const, recordId: 'RUN-1',
    localProtocolRefs: [{ kind: 'record', id: 'LP-1', type: 'local-protocol' }],
    bindings: bindings ?? { labware: [{ roleId: 'targetPlate', labwareInstanceRef: { kind: 'record', id: 'LAB-1' } }] },
  };
}

function makeCtx(store: TestStore, runPayload?: Record<string, unknown>, schemaReg?: ReturnType<typeof makeSchemaRegistry>) {
  const store2 = store.records.has('RUN-1') ? store : new TestStore([
    { recordId: 'RUN-1', schemaId: RUN_SCHEMA, payload: runPayload ?? makeRunPayload() },
  ]);
  if (!store2.records.has('LP-1')) {
    store2.records.set('LP-1', {
      recordId: 'LP-1', schemaId: 'https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml', payload: protoPayload,
    });
  }
  return { store: store2, schemaRegistry: schemaReg ?? makeSchemaRegistry() } as AppContext;
}

describe('buildPlanGraph', () => {
  it('happy path: creates event-graph and links from run', async () => {
    const store = new TestStore([
      { recordId: 'RUN-1', schemaId: RUN_SCHEMA, payload: makeRunPayload() },
      { recordId: 'LP-1', schemaId: 'https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml', payload: protoPayload },
    ]);
    const ctx = makeCtx(store);
    const handlers = createPlannedRunHandlers(ctx);

    const result = await handlers.buildPlanGraph(
      { params: { id: 'RUN-1' } } as any,
      { status: (code: number) => ({ code }) } as any,
    );
    expect(result).toMatchObject({ success: true });
    expect(result).toHaveProperty('graphId');
    expect(result.graphId).toMatch(/^EVG-/);

    const eg = await store.list({ kind: 'event-graph' });
    expect(eg).toHaveLength(1);
    expect(eg[0].payload).toMatchObject({ kind: 'event-graph' });

    const run = await store.get('RUN-1');
    expect(run).not.toBeNull();
    expect((run!.payload as Record<string, unknown>).methodEventGraphId).toBe(result.graphId);

    const events = (eg[0].payload as Record<string, unknown>).events as Record<string, unknown>[];
    for (const ev of events) {
      const d = ev.details as Record<string, unknown>;
      expect(d.targetPlateRole).not.toBe('targetPlate');
      expect(d.targetPlateRole).toMatchObject({ kind: 'record', id: 'LAB-1' });
    }
  });

  it('returns 409 UNBOUND_ROLE when binding is missing — no partial write', async () => {
    let capturedStatus: number | undefined;
    const store = new TestStore([
      { recordId: 'RUN-1', schemaId: RUN_SCHEMA, payload: makeRunPayload({}) },
      { recordId: 'LP-1', schemaId: 'https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml', payload: protoPayload },
    ]);
    const handlers = createPlannedRunHandlers(makeCtx(store));
    const result = await handlers.buildPlanGraph(
      { params: { id: 'RUN-1' } } as any,
      { status: (c: number) => { capturedStatus = c; return { code: c }; } } as any,
    );
    expect(result).toMatchObject({ error: 'UNBOUND_ROLE', details: { roleId: 'targetPlate', stepId: 'step-1' } });
    expect(capturedStatus).toBe(409);
    expect(await store.list({ kind: 'event-graph' })).toHaveLength(0);
    expect(store.writeLog).toEqual([]);
  });

  it('returns 400 NO_PROTOCOL_ATTACHED when run has no protocol', async () => {
    let capturedStatus: number | undefined;
    const store = new TestStore([
      { recordId: 'RUN-1', schemaId: RUN_SCHEMA,
        payload: { kind: 'planned-run' as const, recordId: 'RUN-1' },
      },
    ]);
    const handlers = createPlannedRunHandlers(makeCtx(store));
    const result = await handlers.buildPlanGraph(
      { params: { id: 'RUN-1' } } as any,
      { status: (c: number) => { capturedStatus = c; return { code: c }; } } as any,
    );
    expect(result).toMatchObject({ error: 'NO_PROTOCOL_ATTACHED' });
    expect(capturedStatus).toBe(400);
  });

  it('returns 500 SCHEMA_ENUM_MISSING when schema enum is absent', async () => {
    let capturedStatus: number | undefined;
    const store = new TestStore([
      { recordId: 'RUN-1', schemaId: RUN_SCHEMA, payload: makeRunPayload() },
      { recordId: 'LP-1', schemaId: 'https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml', payload: protoPayload },
    ]);
    const handlers = createPlannedRunHandlers(makeCtx(store, undefined, makeSchemaRegistryNoEnum() as any));
    const result = await handlers.buildPlanGraph(
      { params: { id: 'RUN-1' } } as any,
      { status: (c: number) => { capturedStatus = c; return { code: c }; } } as any,
    );
    expect(result).toMatchObject({ error: 'SCHEMA_ENUM_MISSING' });
    expect(capturedStatus).toBe(500);
  });

  it('returns 409 UNSUPPORTED_EVENT_TYPE when schema enum does not include protocol verb', async () => {
    let capturedStatus: number | undefined;
    const store = new TestStore([
      { recordId: 'RUN-1', schemaId: RUN_SCHEMA, payload: makeRunPayload() },
      { recordId: 'LP-1', schemaId: 'https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml', payload: protoPayload },
    ]);
    const handlers = createPlannedRunHandlers(makeCtx(store, undefined, makeSchemaRegistryEnumMismatch() as any));
    const result = await handlers.buildPlanGraph(
      { params: { id: 'RUN-1' } } as any,
      { status: (c: number) => { capturedStatus = c; return { code: c }; } } as any,
    );
    expect(result).toMatchObject({ error: 'UNSUPPORTED_EVENT_TYPE' });
    expect(capturedStatus).toBe(409);
  });

  it('returns 500 SCHEMA_ENUM_MISSING when event_type has no enum key', async () => {
    let capturedStatus: number | undefined;
    const store = new TestStore([
      { recordId: 'RUN-1', schemaId: RUN_SCHEMA, payload: makeRunPayload() },
      { recordId: 'LP-1', schemaId: 'https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml', payload: protoPayload },
    ]);
    const handlers = createPlannedRunHandlers(makeCtx(store, undefined, makeSchemaRegistryNoEnumKey() as any));
    const result = await handlers.buildPlanGraph(
      { params: { id: 'RUN-1' } } as any,
      { status: (c: number) => { capturedStatus = c; return { code: c }; } } as any,
    );
    expect(result).toMatchObject({ error: 'SCHEMA_ENUM_MISSING' });
    expect(capturedStatus).toBe(500);
  });

  it('idempotency: second call returns reused:true with no writes', async () => {
    const store = new TestStore([
      { recordId: 'RUN-1', schemaId: RUN_SCHEMA, payload: makeRunPayload() },
      { recordId: 'LP-1', schemaId: 'https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml', payload: protoPayload },
    ]);
    const handlers = createPlannedRunHandlers(makeCtx(store));

    const first = await handlers.buildPlanGraph(
      { params: { id: 'RUN-1' } } as any, { status: (c: number) => ({ code: c }) } as any,
    );
    expect(first).toMatchObject({ success: true });
    expect(first).toHaveProperty('graphId');
    const graphId = first.graphId;

    store.writeLog = [];
    const second = await handlers.buildPlanGraph(
      { params: { id: 'RUN-1' } } as any, { status: (c: number) => ({ code: c }) } as any,
    );
    expect(second).toMatchObject({ success: true, reused: true, graphId });
    expect(store.writeLog).toEqual([]);
  });
});
