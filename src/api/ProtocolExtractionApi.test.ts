import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { initializeApp, createServer } from '../server.js';
import type { AppContext } from '../server.js';

const eventGraphSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml"
type: object
required: [id, events, labwares]
properties:
  id: { type: string }
  name: { type: string }
  description: { type: string }
  tags:
    type: array
    items: { type: string }
  events:
    type: array
    items:
      type: object
      required: [eventId, event_type]
      properties:
        eventId: { type: string }
        event_type: { type: string }
        t_offset: { type: string }
        details: { type: object }
        notes: { type: string }
  labwares:
    type: array
    items:
      type: object
      required: [labwareId]
      properties:
        labwareId: { type: string }
        labwareType: { type: string }
`;

const protocolSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/protocol.schema.yaml"
type: object
required: [kind, recordId, title, steps]
properties:
  kind: { const: "protocol" }
  recordId: { type: string }
  title: { type: string }
  description: { type: string }
  state: { type: string }
  tags:
    type: array
    items: { type: string }
  roles: { type: object }
  steps:
    type: array
    items:
      type: object
      required: [stepId, kind]
      properties:
        stepId: { type: string }
        kind: { type: string }
`;

describe('Protocol Extraction API', () => {
  let app: FastifyInstance;
  let ctx: AppContext;
  const testDir = resolve(process.cwd(), 'tmp/protocol-extraction-api-test');

  beforeAll(async () => {
    await mkdir(resolve(testDir, 'schema'), { recursive: true });
    await mkdir(resolve(testDir, 'records'), { recursive: true });
    await writeFile(resolve(testDir, 'schema/event-graph.schema.yaml'), eventGraphSchema);
    await writeFile(resolve(testDir, 'schema/protocol.schema.yaml'), protocolSchema);

    ctx = await initializeApp(testDir, {
      schemaDir: 'schema',
      recordsDir: 'records',
      logLevel: 'silent',
    });

    await ctx.store.create({
      envelope: {
        recordId: 'EVG-000001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml',
        payload: {
          id: 'EVG-000001',
          name: 'Transfer and Read',
          description: 'Seed event graph for protocol extraction',
          tags: ['seed'],
          labwares: [
            { labwareId: 'plate_source', labwareType: 'plate_96' },
            { labwareId: 'plate_target', labwareType: 'plate_96' },
          ],
          events: [
            {
              eventId: 'e1',
              event_type: 'add_material',
              details: {
                labwareInstanceId: { kind: 'record', id: 'plate_source', type: 'labware' },
                wells: ['A1'],
                materialId: { kind: 'record', id: 'MAT-DYE', type: 'material' },
                volume_uL: 25,
              },
            },
            {
              eventId: 'e2',
              event_type: 'transfer',
              details: {
                source: {
                  labwareInstanceId: { kind: 'record', id: 'plate_source', type: 'labware' },
                  wells: ['A1'],
                },
                target: {
                  labwareInstanceId: { kind: 'record', id: 'plate_target', type: 'labware' },
                  wells: ['B1'],
                },
                volume_uL: 10,
              },
            },
            {
              eventId: 'e3',
              event_type: 'read',
              details: {
                labwareInstanceId: { kind: 'record', id: 'plate_target', type: 'labware' },
                modality: 'absorbance',
                channels: ['A450'],
              },
            },
          ],
        },
      },
      message: 'seed event graph',
      skipLint: true,
    });

    app = await createServer(ctx, { logLevel: 'silent' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it('creates a protocol from an event graph', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/protocols/from-event-graph',
      payload: {
        eventGraphId: 'EVG-000001',
        tags: ['generated'],
      },
    });
    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.recordId).toBe('PRT-000001');

    const protocol = await ctx.store.get('PRT-000001');
    expect(protocol).not.toBeNull();
    const payload = protocol!.payload as Record<string, unknown>;
    expect(payload['kind']).toBe('protocol');
    expect(payload['title']).toBe('Transfer and Read Protocol');
    expect(Array.isArray(payload['steps'])).toBe(true);
    expect((payload['steps'] as Array<Record<string, unknown>>).map((s) => s['kind'])).toEqual([
      'add_material',
      'transfer',
      'read',
    ]);
    const roles = payload['roles'] as Record<string, unknown>;
    expect(Array.isArray(roles['labwareRoles'])).toBe(true);
    expect(Array.isArray(roles['materialRoles'])).toBe(true);
    expect(Array.isArray(roles['instrumentRoles'])).toBe(true);
  });

  it('returns 404 when source event graph does not exist', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/protocols/from-event-graph',
      payload: { eventGraphId: 'EVG-404' },
    });
    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.payload);
    expect(body.error).toBe('NOT_FOUND');
  });
});
