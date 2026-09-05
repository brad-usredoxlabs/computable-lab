/**
 * GraphQueryService tests — verifies the service builds the graph index from
 * real record payloads (regression: event-graph `labwares` must be passed into
 * the projector so projected nodes carry labwareType).
 */
import { describe, it, expect } from 'vitest';
import { createGraphQueryService, type GraphQueryContext } from './service.js';

function makeCtx(records: Array<{ recordId: string; payload: Record<string, unknown>; kind?: string }>): GraphQueryContext {
  const store = {
    list: async () =>
      records.map((r) => ({
        recordId: r.recordId,
        schemaId: 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml',
        payload: r.payload,
        meta: { kind: r.kind ?? (r.payload.kind as string) },
      })),
    get: async (id: string) => records.find((r) => r.recordId === id) ?? null,
    exists: async (id: string) => records.some((r) => r.recordId === id),
  };
  const jsonLdIndex = {
    getRefs: (_ids: string[]) => new Map<string, Array<{ recordId: string; kind?: string }>>(),
  };
  return { store, jsonLdIndex };
}

describe('createGraphQueryService', () => {
  it('carries event-graph labwares into projected nodes (regression)', async () => {
    const ctx = makeCtx([
      {
        recordId: 'EVG-ros',
        kind: 'event-graph',
        payload: {
          kind: 'event-graph',
          id: 'EVG-ros',
          labwares: [{ labwareId: 'p1', labwareType: 'plate_96', name: 'Plate' }],
          events: [
            { eventId: 'e1', event_type: 'add_material', details: { labwareId: 'p1', wells: ['A1'], material_ref: 'MAT-x' } },
          ],
        },
      },
    ]);
    const svc = await createGraphQueryService(ctx);
    const res = await svc.engine.execute({ op: 'find', type: 'well' });
    expect(res.summary.count).toBe(1);
    const well = res.objects[0]!;
    expect(well.properties?.labwareType).toBe('plate_96');
    expect(well.properties?.labwareId).toBe('p1');
  });

  it('omits labwareType when the event-graph has no labwares (no throw)', async () => {
    const ctx = makeCtx([
      {
        recordId: 'EVG-old',
        kind: 'event-graph',
        payload: {
          kind: 'event-graph',
          id: 'EVG-old',
          events: [
            { eventId: 'e1', event_type: 'add_material', details: { labwareId: 'p1', wells: ['A1'], material_ref: 'MAT-x' } },
          ],
        },
      },
    ]);
    const svc = await createGraphQueryService(ctx);
    const res = await svc.engine.execute({ op: 'find', type: 'well' });
    expect(res.summary.count).toBe(1);
    expect(res.objects[0]?.properties?.labwareType).toBeUndefined();
  });
});