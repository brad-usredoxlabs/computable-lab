import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { initializeApp, createServer } from '../server.js';
import type { AppContext } from '../server.js';

const graphComponentSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/graph-component.schema.yaml"
type: object
required: [kind, recordId, title, state, template]
properties:
  kind: { const: "graph-component" }
  recordId: { type: string }
  title: { type: string }
  state: { type: string }
  template: { type: object }
  latestVersionRef: { type: object }
`;

const graphComponentVersionSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/graph-component-version.schema.yaml"
type: object
required: [kind, recordId, componentRef, version, publishedAt, snapshot]
properties:
  kind: { const: "graph-component-version" }
  recordId: { type: string }
  componentRef: { type: object }
  version: { type: string }
  publishedAt: { type: string }
  snapshot: { type: object }
`;

const graphComponentInstanceSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/graph-component-instance.schema.yaml"
type: object
required: [kind, recordId, componentRef, componentVersionRef, status]
properties:
  kind: { const: "graph-component-instance" }
  recordId: { type: string }
  componentRef: { type: object }
  componentVersionRef: { type: object }
  sourceRef: { type: object }
  status: { type: string }
  render: { type: object }
`;

describe('Component API', () => {
  let app: FastifyInstance;
  let _ctx: AppContext;
  const testDir = resolve(process.cwd(), 'tmp/component-api-test');

  beforeAll(async () => {
    await mkdir(resolve(testDir, 'schema'), { recursive: true });
    await mkdir(resolve(testDir, 'records'), { recursive: true });
    await writeFile(resolve(testDir, 'schema/graph-component.schema.yaml'), graphComponentSchema);
    await writeFile(resolve(testDir, 'schema/graph-component-version.schema.yaml'), graphComponentVersionSchema);
    await writeFile(resolve(testDir, 'schema/graph-component-instance.schema.yaml'), graphComponentInstanceSchema);

    _ctx = await initializeApp(testDir, {
      schemaDir: 'schema',
      recordsDir: 'records',
      logLevel: 'silent',
    });
    app = await createServer(_ctx, { logLevel: 'silent' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it('creates, lists, publishes, and instantiates graph-components', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/components',
      payload: {
        title: 'Component A',
        template: { source: { kind: 'inline' } },
      },
    });
    expect(create.statusCode).toBe(201);
    const created = JSON.parse(create.payload);
    expect(created.success).toBe(true);
    expect(created.component.recordId).toBe('GCP-000001');

    const list = await app.inject({ method: 'GET', url: '/api/components' });
    expect(list.statusCode).toBe(200);
    const listed = JSON.parse(list.payload);
    expect(listed.total).toBe(1);

    const publish = await app.inject({
      method: 'POST',
      url: '/api/components/GCP-000001/publish',
      payload: {},
    });
    expect(publish.statusCode).toBe(200);
    const pub = JSON.parse(publish.payload);
    expect(pub.success).toBe(true);
    expect(pub.version.recordId).toBe('GCV-000001');

    const instantiate = await app.inject({
      method: 'POST',
      url: '/api/components/GCP-000001/instantiate',
      payload: {
        sourceRef: { kind: 'record', id: 'EVG-000001', type: 'event_graph' },
      },
    });
    expect(instantiate.statusCode).toBe(201);
    const ins = JSON.parse(instantiate.payload);
    expect(ins.success).toBe(true);
    expect(ins.instance.recordId).toBe('GCI-000001');

    const status = await app.inject({
      method: 'GET',
      url: '/api/components/instances/GCI-000001/status',
    });
    expect(status.statusCode).toBe(200);
    const st = JSON.parse(status.payload);
    expect(st.status.stale).toBe(false);

    const publish2 = await app.inject({
      method: 'POST',
      url: '/api/components/GCP-000001/publish',
      payload: {},
    });
    expect(publish2.statusCode).toBe(200);

    const status2 = await app.inject({
      method: 'GET',
      url: '/api/components/instances/GCI-000001/status',
    });
    expect(status2.statusCode).toBe(200);
    const st2 = JSON.parse(status2.payload);
    expect(st2.status.stale).toBe(true);

    const upgrade = await app.inject({
      method: 'POST',
      url: '/api/components/instances/GCI-000001/upgrade',
      payload: {},
    });
    expect(upgrade.statusCode).toBe(200);
    const up = JSON.parse(upgrade.payload);
    expect(up.success).toBe(true);

    await _ctx.store.create({
      envelope: {
        recordId: 'EVG-000001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml',
        payload: {
          id: 'EVG-000001',
          events: [
            { eventId: 'e1', event_type: 'incubate', details: { labwareId: 'plate1' } },
            { eventId: 'e2', event_type: 'incubate', details: { labwareId: 'plate1' } },
            { eventId: 'e3', event_type: 'read', details: { labwareId: 'plate1' } },
          ],
          labwares: [{ labwareId: 'plate1' }],
        },
      },
      message: 'seed event graph for suggestions',
      skipValidation: true,
      skipLint: true,
    });
    const suggest = await app.inject({
      method: 'POST',
      url: '/api/components/suggest-from-event-graph',
      payload: {
        eventGraphId: 'EVG-000001',
        minOccurrences: 2,
      },
    });
    expect(suggest.statusCode).toBe(200);
    const sg = JSON.parse(suggest.payload);
    expect(Array.isArray(sg.suggestions.suggestions)).toBe(true);
  });
});
