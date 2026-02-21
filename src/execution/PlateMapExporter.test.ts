import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp } from '../server.js';
import type { AppContext } from '../server.js';
import { PlateMapExporter } from './PlateMapExporter.js';

const eventGraphSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml"
type: object
required: [id, events, labwares]
properties:
  id: { type: string }
  events:
    type: array
    items:
      type: object
      required: [eventId, event_type]
      properties:
        eventId: { type: string }
        event_type: { type: string }
        details: { type: object }
  labwares:
    type: array
    items: { type: object }
`;

describe('PlateMapExporter', () => {
  const testDir = resolve(process.cwd(), 'tmp/plate-map-exporter-test');
  let ctx: AppContext;

  beforeAll(async () => {
    await mkdir(resolve(testDir, 'schema'), { recursive: true });
    await mkdir(resolve(testDir, 'records'), { recursive: true });
    await writeFile(resolve(testDir, 'schema/event-graph.schema.yaml'), eventGraphSchema);

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
                source: {
                  labwareInstanceId: { kind: 'record', id: 'LWI-PLATE1', type: 'labware-instance' },
                  wells: ['A1'],
                },
                target: {
                  labwareInstanceId: { kind: 'record', id: 'LWI-PLATE2', type: 'labware-instance' },
                  wells: ['B1'],
                },
                volume_uL: 20,
              },
            },
          ],
          labwares: [],
        },
      },
      message: 'seed event graph',
      skipLint: true,
    });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('exports CSV with inferred target well state', async () => {
    const exporter = new PlateMapExporter(ctx);
    const csv = await exporter.export({ eventGraphId: 'EVG-000001', format: 'csv' });
    expect(csv).toContain('labwareId,well,eventId,eventType,material,volume_uL,note');
    expect(csv).toContain('LWI-PLATE2,B1,e2,transfer,MAT-BUFFER,20,from LWI-PLATE1:A1');
  });
});
