/**
 * Plate map export handler test.
 *
 * Confirms POST /plate-maps/export returns the vendor-importable CSV derived
 * from an event graph's add-material / transfer events. The plate-map exporter
 * runs against the store; we stub the store with an event-graph envelope so
 * the assertion is deterministic (no heavy app init).
 */
import { describe, expect, it } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../../server.js';
import { createMeasurementHandlers } from './MeasurementHandlers.js';

function makeReply() {
  let statusCode = 200;
  let body: unknown = undefined;
  const headers: Record<string, string> = {};
  const reply = {
    status(code: number) {
      statusCode = code;
      return reply;
    },
    header(name: string, value: string) {
      headers[name.toLowerCase()] = value;
      return reply;
    },
    send(payload: unknown) {
      body = payload;
      return reply;
    },
  } as unknown as FastifyReply;
  return { reply, get statusCode() { return statusCode; }, get body() { return body; }, get headers() { return headers; } };
}

function makeCtx(store: unknown): AppContext {
  return { store } as unknown as AppContext;
}

const EVENT_GRAPH_SCHEMA = 'event-graph';

/** Minimal event graph: add material to A1, transfer to B1. */
function eventGraphEnvelope() {
  return {
    recordId: 'EVG-000001',
    schemaId: EVENT_GRAPH_SCHEMA,
    payload: {
      kind: 'event-graph',
      events: [
        {
          eventId: 'e1',
          event_type: 'add_material',
          details: {
            labwareInstanceId: { kind: 'record', id: 'LWI-PLATE1', type: 'labware-instance' },
            wells: ['A1'],
            materialId: { kind: 'record', id: 'MAT-BUFFER', type: 'material' },
            volume_uL: 100,
          },
        },
        {
          eventId: 'e2',
          event_type: 'transfer',
          details: {
            source: { labwareInstanceId: { kind: 'record', id: 'LWI-PLATE1', type: 'labware-instance' }, wells: ['A1'] },
            target: { labwareInstanceId: { kind: 'record', id: 'LWI-PLATE2', type: 'labware-instance' }, wells: ['B1'] },
            volume_uL: 20,
          },
        },
      ],
      labwares: [],
    },
  };
}

describe('MeasurementHandlers.exportPlateMap', () => {
  it('returns CSV content with the vendor-importable header + wells', async () => {
    const store = {
      async get(id: string) {
        return id === 'EVG-000001' ? eventGraphEnvelope() : null;
      },
    };
    const handlers = createMeasurementHandlers(makeCtx(store));
    const reply = makeReply();
    const result = await handlers.exportPlateMap(
      { body: { eventGraphId: 'EVG-000001', format: 'csv' } } as unknown as FastifyRequest<{ Body: { eventGraphId: string; format?: 'csv' | 'tsv' } }>,
      reply.reply,
    ) as { content?: string; format?: string; error?: string };
    expect(reply.statusCode).toBe(200);
    expect(reply.headers['content-type']).toContain('text/csv');
    expect(result.content).toContain('labwareId,well,eventId,eventType,material,volume_uL,note');
    expect(result.content).toContain('LWI-PLATE1,A1,e1,add_material,MAT-BUFFER,100,');
    expect(result.content).toContain('LWI-PLATE2,B1,e2,transfer,MAT-BUFFER,20,from LWI-PLATE1:A1');
  });

  it('returns 404 when the event graph does not exist', async () => {
    const store = { async get() { return null; } };
    const handlers = createMeasurementHandlers(makeCtx(store));
    const reply = makeReply();
    const result = await handlers.exportPlateMap(
      { body: { eventGraphId: 'EVG-MISSING' } } as unknown as FastifyRequest<{ Body: { eventGraphId: string } }>,
      reply.reply,
    ) as { error?: string };
    expect(reply.statusCode).toBe(404);
    expect(result.error).toBe('NOT_FOUND');
  });
});