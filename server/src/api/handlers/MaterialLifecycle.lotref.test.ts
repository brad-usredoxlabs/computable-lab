// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createMaterialLifecycleHandlers, SCHEMA_IDS } from './MaterialLifecycleHandlers.js';
import type { RecordStore, RecordEnvelope } from '../../store/types.js';

function makeMockStore(): RecordStore {
  const records = new Map<string, RecordEnvelope>();
  return {
    get: async (id: string) => records.get(id) ?? null,
    exists: async (id: string) => records.has(id),
    list: async (filter?: { kind?: string; schemaId?: string }) => {
      let result = [...records.values()];
      if (filter?.schemaId) result = result.filter((r) => r.schemaId === filter.schemaId);
      if (filter?.kind) result = result.filter((r) => (r.payload as Record<string, unknown>).kind === filter.kind);
      return result;
    },
    create: async ({ envelope }: { envelope: RecordEnvelope; message?: string }) => {
      if (records.has(envelope.recordId)) return { success: false, error: 'Already exists' };
      records.set(envelope.recordId, envelope);
      return { success: true, envelope };
    },
  } as unknown as RecordStore;
}

function makeMockReply() {
  let _status: number | undefined;
  let _body: unknown;
  const self: any = {
    status: (code: number) => { _status = code; return self; },
    send: (body: unknown) => { _body = body; return self; },
    statusCode: () => _status,
    getBody: () => _body,
  };
  return self;
}

function makeRequest(body: Record<string, unknown>) {
  return { body } as any;
}

describe('createMaterialInstance — lot without source ref', () => {
  it('refuses lot without vendorProductRef / materialSpecRef / materialRef (400 LOT_WITHOUT_SOURCE)', async () => {
    const store = makeMockStore();
    const handlers = createMaterialLifecycleHandlers(store);
    const mockReply = makeMockReply();
    const result = await handlers.createMaterialInstance(
      makeRequest({ name: 'DMEM', lot: { lot_number: 'L23' } }),
      mockReply,
    );
    expect(mockReply.statusCode()).toBe(400);
    expect(result).toHaveProperty('error', 'LOT_WITHOUT_SOURCE');
    expect(result).toHaveProperty('message');
    expect((result as any).message).toMatch(/vendorProductRef|materialSpecRef|materialRef/);
  });

  it('writes zero records when lot has no source ref', async () => {
    const store = makeMockStore();
    const beforeCount = (await store.list({ schemaId: SCHEMA_IDS.materialInstance })).length;
    const handlers = createMaterialLifecycleHandlers(store);
    const mockReply = makeMockReply();
    await handlers.createMaterialInstance(
      makeRequest({ name: 'DMEM', lot: { lot_number: 'L23' } }),
      mockReply,
    );
    const afterList = await store.list({ schemaId: SCHEMA_IDS.materialInstance });
    expect(afterList.length).toBe(beforeCount);
  });

  it('accepts lot with vendorProductRef (201, one record stored)', async () => {
    const store = makeMockStore();
    const handlers = createMaterialLifecycleHandlers(store);
    const mockReply = makeMockReply();
    const result = await handlers.createMaterialInstance(
      makeRequest({
        name: 'DMEM',
        lot: { lot_number: 'L23' },
        vendorProductRef: { kind: 'record', id: 'VPR-1', type: 'vendor-product' },
      }),
      mockReply,
    );
    expect(mockReply.statusCode()).toBe(201);
    expect(result).toHaveProperty('success', true);
    expect(result).toHaveProperty('materialInstanceId');
    const instances = await store.list({ schemaId: SCHEMA_IDS.materialInstance });
    expect(instances.length).toBe(1);
    const payload = instances[0].payload as Record<string, unknown>;
    expect(payload.lot).toEqual({ lot_number: 'L23' });
    expect(payload.vendor_product_ref).toEqual({ kind: 'record', id: 'VPR-1', type: 'vendor-product' });
  });
});
