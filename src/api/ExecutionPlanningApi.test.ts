import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createServer, initializeApp } from '../server.js';
import type { AppContext } from '../server.js';

const eventGraphSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml"
type: object
required: [id, events, labwares]
properties:
  id: { type: string }
  events: { type: array, items: { type: object } }
  labwares: { type: array, items: { type: object } }
`;

const executionEnvironmentSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/execution-environment.schema.yaml"
type: object
required: [kind, recordId, type, id, version, robot, deck, tools, labware_registry]
properties:
  kind: { const: "execution-environment" }
  recordId: { type: string }
  type: { const: "execution_environment" }
  id: { type: string }
  version: { type: string }
  robot: { type: object }
  deck: { type: object }
  tools: { type: array, items: { type: object } }
  labware_registry: { type: object }
  constraints: { type: object }
`;

const executionPlanSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/execution-plan.schema.yaml"
type: object
required: [kind, recordId, type, id, version, event_graph_ref, execution_environment_ref, placements, tool_bindings, strategy]
properties:
  kind: { const: "execution-plan" }
  recordId: { type: string }
  type: { const: "execution_plan" }
  id: { type: string }
  version: { type: string }
  event_graph_ref: { type: string }
  execution_environment_ref: { type: string }
  placements: { type: object }
  tool_bindings: { type: object }
  strategy: { type: object }
  derived_artifacts: { type: array, items: { type: object } }
`;

const robotPlanSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/robot-plan.schema.yaml"
type: object
required: [kind, id, plannedRunRef, targetPlatform, status]
properties:
  kind: { const: "robot-plan" }
  id: { type: string }
  plannedRunRef: { type: object }
  targetPlatform:
    type: string
    enum: [opentrons_ot2, opentrons_flex, integra_assist]
  status:
    type: string
    enum: [compiled, validated, error]
  generatedAt: { type: string }
  generatorVersion: { type: string }
  deckSlots: { type: array, items: { type: object } }
  pipettes: { type: array, items: { type: object } }
  executionSteps: { type: array, items: { type: object } }
  artifacts: { type: array, items: { type: object } }
`;

describe('Execution Planning API', () => {
  const testDir = resolve(process.cwd(), 'tmp/execution-planning-api-test');
  let ctx: AppContext;
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env['CL_FEATURE_EXECUTION_PLANNING'] = '1';
    await mkdir(resolve(testDir, 'schema'), { recursive: true });
    await mkdir(resolve(testDir, 'records'), { recursive: true });
    await writeFile(resolve(testDir, 'schema/event-graph.schema.yaml'), eventGraphSchema);
    await writeFile(resolve(testDir, 'schema/execution-environment.schema.yaml'), executionEnvironmentSchema);
    await writeFile(resolve(testDir, 'schema/execution-plan.schema.yaml'), executionPlanSchema);
    await writeFile(resolve(testDir, 'schema/robot-plan.schema.yaml'), robotPlanSchema);

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
              eventId: 'EV-1',
              event_type: 'transfer',
              details: { volume_uL: 50, sourceWell: 'A1', targetWell: 'B1', channels: 8 },
            },
          ],
          labwares: [
            { labwareId: 'PLATE_SRC', labwareType: 'plate_96' },
            { labwareId: 'PLATE_DST', labwareType: 'plate_96' },
          ],
        },
      },
      message: 'seed event graph',
      skipLint: true,
    });

    await ctx.store.create({
      envelope: {
        recordId: 'ENV-000001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/execution-environment.schema.yaml',
        payload: {
          kind: 'execution-environment',
          recordId: 'ENV-000001',
          type: 'execution_environment',
          id: 'ENV-OT2-ALPHA',
          version: '1.0.0',
          robot: { family: 'opentrons_ot2', model: 'OT-2' },
          deck: {
            deck_id: 'ot2_standard_v5',
            slots: [
              { slot_id: '1', slot_type: 'standard', compatible_footprints: ['sbs_plate'] },
              { slot_id: '2', slot_type: 'standard', compatible_footprints: ['sbs_plate'] },
              { slot_id: '3', slot_type: 'standard', compatible_footprints: ['tiprack_300'] },
              { slot_id: '12', slot_type: 'trash', compatible_footprints: ['trash'] },
            ],
          },
          tools: [
            {
              tool_id: 'p300_multi',
              channels: 8,
              mount: 'left',
              volume_min_ul: 20,
              volume_max_ul: 300,
              tip_types: ['opentrons_300'],
            },
          ],
          labware_registry: {
            definitions: [
              { labware_id: 'nest_96_wellplate_200ul_flat', footprint: 'sbs_plate' },
              { labware_id: 'opentrons_96_tiprack_300ul', footprint: 'tiprack_300' },
            ],
          },
          constraints: {
            max_labware_items: 4,
            max_tipracks: 3,
            requires_trash_slot: true,
          },
        },
      },
      message: 'seed environment',
      skipLint: true,
    });

    await ctx.store.create({
      envelope: {
        recordId: 'EPL-000001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/execution-plan.schema.yaml',
        payload: {
          kind: 'execution-plan',
          recordId: 'EPL-000001',
          type: 'execution_plan',
          id: 'PLAN-OT2-0001',
          version: '1.0.0',
          event_graph_ref: 'EVG-000001',
          execution_environment_ref: 'ENV-000001',
          placements: {
            labware: [
              { labware_ref: 'PLATE_SRC', labware_id: 'nest_96_wellplate_200ul_flat', slot_id: '1' },
              { labware_ref: 'PLATE_DST', labware_id: 'nest_96_wellplate_200ul_flat', slot_id: '2' },
            ],
            tipracks: [{ tiprack_id: 'TIP_1', slot_id: '3', tip_type: 'opentrons_300' }],
            waste: { slot_id: '12', labware_id: 'trash' },
          },
          tool_bindings: {
            primary_liquid_handler: { tool_id: 'p300_multi', mount: 'left', default_tip_type: 'opentrons_300' },
          },
          strategy: {
            tip_policy: 'new_tip_each_source',
            channelization: 'multi_channel_prefer',
            batching: 'group_by_source',
          },
        },
      },
      message: 'seed execution plan',
      skipLint: true,
    });

    app = await createServer(ctx, { logLevel: 'silent' });
    await app.ready();
  });

  afterAll(async () => {
    delete process.env['CL_FEATURE_EXECUTION_PLANNING'];
    await app.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it('validates and emits execution plans via API', async () => {
    const validate = await app.inject({
      method: 'POST',
      url: '/api/execution-plans/validate',
      payload: { executionPlanId: 'EPL-000001' },
    });
    expect(validate.statusCode).toBe(200);
    const validateBody = JSON.parse(validate.payload) as { success: boolean; validation?: { valid: boolean } };
    expect(validateBody.success).toBe(true);
    expect(validateBody.validation?.valid).toBe(true);

    const emit = await app.inject({
      method: 'POST',
      url: '/api/execution-plans/EPL-000001/emit',
      payload: { targetPlatform: 'opentrons_ot2' },
    });
    expect(emit.statusCode).toBe(200);
    const emitBody = JSON.parse(emit.payload) as {
      success: boolean;
      robotPlanId?: string;
      artifacts?: Array<{ sha256?: string; target?: string }>;
    };
    expect(emitBody.success).toBe(true);
    expect(emitBody.robotPlanId).toMatch(/^RP-\d{6}$/);
    expect(emitBody.artifacts?.[0]?.sha256?.length).toBe(64);
    expect(emitBody.artifacts?.[0]?.target).toBe('opentrons_api');
  });
});
