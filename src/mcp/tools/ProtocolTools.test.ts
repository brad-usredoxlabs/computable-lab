import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { initializeApp, type AppContext } from '../../server.js';
import { ToolRegistry } from '../../ai/ToolRegistry.js';
import { registerProtocolTools } from './protocolTools.js';

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
    items:
      type: object
      required: [labwareId]
      properties:
        labwareId: { type: string }
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
  steps:
    type: array
    items:
      type: object
      required: [stepId, kind]
      properties:
        stepId: { type: string }
        kind: { type: string }
`;

describe('protocol MCP tools', () => {
  let ctx: AppContext;
  let registry: ToolRegistry;
  const testDir = resolve(process.cwd(), 'tmp/protocol-tools-test');

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
        recordId: 'EVG-000010',
        schemaId: 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml',
        payload: {
          id: 'EVG-000010',
          labwares: [{ labwareId: 'plate_a' }],
          events: [
            {
              eventId: 'e1',
              event_type: 'add_material',
              details: {
                labwareInstanceId: { kind: 'record', id: 'plate_a', type: 'labware' },
                wells: ['A1'],
                materialId: { kind: 'record', id: 'MAT-001', type: 'material' },
                volume_uL: 5,
              },
            },
          ],
        },
      },
      message: 'seed event graph',
      skipLint: true,
    });

    registry = new ToolRegistry();
    const mcp = new McpServer({ name: 'test', version: '0.0.0' });
    registerProtocolTools(mcp, ctx, registry);
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('protocol_save_from_event_graph creates a protocol through ToolRegistry handler', async () => {
    const tool = registry.get('protocol_save_from_event_graph');
    expect(tool).toBeDefined();
    const result = await tool!.handler({ eventGraphId: 'EVG-000010' });
    const text = result.content[0];
    expect(text.type).toBe('text');
    const body = JSON.parse(text.text);
    expect(body.success).toBe(true);
    expect(body.recordId).toBe('PRT-000001');
  });
});
