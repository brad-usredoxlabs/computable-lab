/**
 * f3server — schema-driven payload-provenance injection.
 *
 * Replaces the hardcoded kind list (material-instance, aliquot, event-graph)
 * with a schema-driven check: createdAt/updatedAt/createdBy are only injected
 * when the target schema declares them as properties or allows additionalProperties.
 *
 * Labware-definition has additionalProperties:false and no createdAt/updatedAt/createdBy
 * — the old code injected them anyway, causing Ajv 422.
 */

import { describe, it, expect } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RecordStore, StoreResult } from '../../store/types.js';
import { createRecordHandlers } from './RecordHandlers.js';

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeStore() {
  const records = new Map<string, any>();
  const store: RecordStore = {
    async get(id: string) { return records.get(id) ?? null; },
    async list() { return []; },
    async create(opts: { envelope: any }): Promise<StoreResult> {
      records.set(opts.envelope.recordId, opts.envelope);
      return { success: true, envelope: opts.envelope };
    },
    async update() { return { success: true } as StoreResult; },
    async delete() { return { success: true } as StoreResult; },
    async validate() { return { valid: true }; },
    async lint() { return { valid: true }; },
    async exists() { return false; },
  };
  return { store, records };
}

function makeReply() {
  let statusValue = 200;
  const reply: any = {
    status: (code: number) => { statusValue = code; return reply; },
    code: (code: number) => { statusValue = code; return reply; },
    send: () => reply,
  };
  Object.defineProperty(reply, 'statusValue', { get: () => statusValue });
  return reply;
}

function makeRequest(body: Record<string, unknown>) {
  return { body, headers: {} } as unknown as FastifyRequest;
}

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

describe('createRecord — schema-driven payload provenance injection', () => {
  it('labware-definition (additionalProperties:false, no createdAt/updatedAt/createdBy): skips all provenance', async () => {
    const { store, records } = makeStore();
    const handlers = createRecordHandlers(store, undefined, undefined, undefined, undefined, undefined, {
      getSchemaProperties: () => ({
        hasCreatedAt: false,
        hasUpdatedAt: false,
        hasCreatedBy: false,
        allowsAny: false,
      }),
    });

    const payload = {
      kind: 'labware-definition',
      id: 'LBW-96wellSBS',
      display_name: '96-well SBS plate',
      type: 'labware_definition',
      recordId: 'LBW-96wellSBS',
      topology: { addressing: 'rectangular', rows: '8', columns: '12' },
      capacity: { wells: [{ row: 'A', column: '1', volume_ul: 200 }] },
      source: { kind: 'curated', url: 'https://example.com/labware/96well' },
    };

    const reply = makeReply();
    const result = await handlers.createRecord(
      makeRequest({ schemaId: 'labware-definition', payload }),
      reply as unknown as FastifyReply,
    );

    expect(reply.statusValue).toBe(201);
    expect((result as any).success).toBe(true);
    const stored = records.get((result as any).record?.recordId);
    const storedPayload = stored!.payload as Record<string, unknown>;
    expect(storedPayload.createdAt).toBeUndefined();
    expect(storedPayload.updatedAt).toBeUndefined();
    expect(storedPayload.createdBy).toBeUndefined();
    expect((storedPayload.source as any).kind).toBe('curated');
    expect((storedPayload.source as any).url).toBe('https://example.com/labware/96well');
  });

  it('material-instance (unevaluatedProperties:false): skips provenance', async () => {
    const { store, records } = makeStore();
    const handlers = createRecordHandlers(store, undefined, undefined, undefined, undefined, undefined, {
      getSchemaProperties: () => ({
        hasCreatedAt: false,
        hasUpdatedAt: false,
        hasCreatedBy: false,
        allowsAny: false,
      }),
    });

    const payload = {
      kind: 'material-instance',
      id: 'MAT-test-001',
      name: 'Test Material',
      type: 'material',
      container: { type: 'tube', volume_ml: 1500 },
      quantity: { value: 1, unit: 'mg' },
      storage_conditions: { temperature_celsius: -80, location: 'freezer' },
    };

    const reply = makeReply();
    const result = await handlers.createRecord(
      makeRequest({ schemaId: 'material-instance', payload }),
      reply as unknown as FastifyReply,
    );

    expect(reply.statusValue).toBe(201);
    const stored = records.get((result as any).record?.recordId);
    const storedPayload = stored!.payload as Record<string, unknown>;
    expect(storedPayload.createdAt).toBeUndefined();
    expect(storedPayload.updatedAt).toBeUndefined();
    expect(storedPayload.createdBy).toBeUndefined();
  });

  it('aliquot (unevaluatedProperties:false): skips provenance', async () => {
    const { store, records } = makeStore();
    const handlers = createRecordHandlers(store, undefined, undefined, undefined, undefined, undefined, {
      getSchemaProperties: () => ({
        hasCreatedAt: false,
        hasUpdatedAt: false,
        hasCreatedBy: false,
        allowsAny: false,
      }),
    });

    const payload = {
      kind: 'aliquot',
      id: 'ALI-test-001',
      name: 'Test Aliquot',
      type: 'aliquot',
      parentMaterialId: 'MAT-parent',
      volume: { value: 100, unit: 'ul' },
      container: { type: 'tube', volume_ml: 1500 },
      storage_conditions: { temperature_celsius: -20, location: 'freezer' },
      barcode: 'ALI-2026-001',
    };

    const reply = makeReply();
    const result = await handlers.createRecord(
      makeRequest({ schemaId: 'aliquot', payload }),
      reply as unknown as FastifyReply,
    );

    expect(reply.statusValue).toBe(201);
    const stored = records.get((result as any).record?.recordId);
    const storedPayload = stored!.payload as Record<string, unknown>;
    expect(storedPayload.createdAt).toBeUndefined();
    expect(storedPayload.updatedAt).toBeUndefined();
    expect(storedPayload.createdBy).toBeUndefined();
  });

  it('event-graph (declares createdAt/updatedAt, not createdBy): partial injection', async () => {
    const { store, records } = makeStore();
    const handlers = createRecordHandlers(store, undefined, undefined, undefined, undefined, undefined, {
      getSchemaProperties: () => ({
        hasCreatedAt: true,
        hasUpdatedAt: true,
        hasCreatedBy: false,
        allowsAny: false,
      }),
    });

    const payload = {
      kind: 'event-graph',
      recordId: 'EG-test-001',
      version: 1,
      events: [{ eventId: 'evt-1', event_type: 'other', details: {} }],
      labwares: [{ labwareId: 'LW-1', labwareType: 'plate_96' }],
    };

    const reply = makeReply();
    const result = await handlers.createRecord(
      makeRequest({ schemaId: 'event-graph', payload }),
      reply as unknown as FastifyReply,
    );

    expect(reply.statusValue).toBe(201);
    const stored = records.get((result as any).record?.recordId);
    const storedPayload = stored!.payload as Record<string, unknown>;
    expect(storedPayload.createdAt).toBeDefined();
    expect(storedPayload.updatedAt).toBeDefined();
    expect(storedPayload.createdBy).toBeUndefined();
  });

  it('protocol (additionalProperties:true): full injection', async () => {
    const { store, records } = makeStore();
    const handlers = createRecordHandlers(store, undefined, undefined, undefined, undefined, undefined, {
      getSchemaProperties: () => ({
        hasCreatedAt: true,
        hasUpdatedAt: true,
        hasCreatedBy: true,
        allowsAny: true,
      }),
    });

    const payload = {
      kind: 'protocol',
      id: 'PRT-test-001',
      title: 'Test Protocol',
      version: '0.1.1',
    };

    const reply = makeReply();
    const result = await handlers.createRecord(
      makeRequest({ schemaId: 'protocol', payload }),
      reply as unknown as FastifyReply,
    );

    expect(reply.statusValue).toBe(201);
    const stored = records.get((result as any).record?.recordId);
    const storedPayload = stored!.payload as Record<string, unknown>;
    expect(storedPayload.createdAt).toBeDefined();
    expect(storedPayload.updatedAt).toBeDefined();
    expect(storedPayload.createdBy).toBeDefined();
  });

  it('undefined getSchemaProperties falls back to kind-based logic', async () => {
    // When server.ts cannot find the schema in the registry,
    // getSchemaProperties returns undefined → fallback uses kind names.
    // The fallback injects createdAt/updatedAt for non-excluded kinds.
    const { store, records } = makeStore();
    const handlers = createRecordHandlers(store, undefined, undefined, undefined, undefined, undefined, {
      // Return undefined to force the fallback path
      getSchemaProperties: () => undefined,
    });

    const payload = {
      kind: 'protocol',
      id: 'PRT-fallback-001',
      title: 'Fallback Protocol',
    };

    const reply = makeReply();
    const result = await handlers.createRecord(
      makeRequest({ schemaId: 'unknown-schema', payload }),
      reply as unknown as FastifyReply,
    );

    expect(reply.statusValue).toBe(201);
    const stored = records.get((result as any).record?.recordId);
    const storedPayload = stored!.payload as Record<string, unknown>;
    // Fallback: 'protocol' is not in the exclusion list → full injection
    expect(storedPayload.createdAt).toBeDefined();
    expect(storedPayload.updatedAt).toBeDefined();
    expect(storedPayload.createdBy).toBeDefined();
  });

  // f3fix2: allowsAny decides injection when no provenance properties are declared
  it('allowsAny:true with no declared provenance properties → injects all three', async () => {
    const { store, records } = makeStore();
    const handlers = createRecordHandlers(store, undefined, undefined, undefined, undefined, undefined, {
      getSchemaProperties: () => ({
        hasCreatedAt: false,
        hasUpdatedAt: false,
        hasCreatedBy: false,
        allowsAny: true,
      }),
    });

    const payload = { kind: 'composed-schema', id: 'CS-001', data: {} };
    const reply = makeReply();
    const result = await handlers.createRecord(
      makeRequest({ schemaId: 'composed', payload }),
      reply as unknown as FastifyReply,
    );

    expect(reply.statusValue).toBe(201);
    const stored = records.get((result as any).record?.recordId);
    const storedPayload = stored!.payload as Record<string, unknown>;
    expect(storedPayload.createdAt).toBeDefined();
    expect(storedPayload.updatedAt).toBeDefined();
    expect(storedPayload.createdBy).toBeDefined();
  });

  it('allowsAny:false with no declared provenance properties → injects none', async () => {
    const { store, records } = makeStore();
    const handlers = createRecordHandlers(store, undefined, undefined, undefined, undefined, undefined, {
      getSchemaProperties: () => ({
        hasCreatedAt: false,
        hasUpdatedAt: false,
        hasCreatedBy: false,
        allowsAny: false,
      }),
    });

    const payload = { kind: 'strict-schema', id: 'ST-001', data: {} };
    const reply = makeReply();
    const result = await handlers.createRecord(
      makeRequest({ schemaId: 'strict', payload }),
      reply as unknown as FastifyReply,
    );

    expect(reply.statusValue).toBe(201);
    const stored = records.get((result as any).record?.recordId);
    const storedPayload = stored!.payload as Record<string, unknown>;
    expect(storedPayload.createdAt).toBeUndefined();
    expect(storedPayload.updatedAt).toBeUndefined();
    expect(storedPayload.createdBy).toBeUndefined();
  });
});
