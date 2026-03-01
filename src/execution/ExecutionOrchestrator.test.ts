import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp } from '../server.js';
import type { AppContext } from '../server.js';
import { ExecutionOrchestrator } from './ExecutionOrchestrator.js';
import { ExecutionRunner } from './ExecutionRunner.js';
import { ExecutionControlService } from './ExecutionControlService.js';

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

const plannedRunSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml"
type: object
required: [kind, recordId, title, sourceType, sourceRef, state]
properties:
  kind: { const: "planned-run" }
  recordId: { type: string }
  title: { type: string }
  sourceType:
    type: string
    enum: [protocol, event-graph]
  sourceRef:
    type: object
    required: [kind, id]
    properties:
      kind: { type: string }
      id: { type: string }
      type: { type: string }
  protocolRef:
    type: object
  state:
    type: string
    enum: [draft, ready, executing, completed, failed]
  bindings:
    type: object
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
  deckSlots:
    type: array
    items: { type: object }
  pipettes:
    type: array
    items: { type: object }
  executionSteps:
    type: array
    items: { type: object }
  artifacts:
    type: array
    items:
      type: object
      required: [role, fileRef]
      properties:
        role: { type: string }
        fileRef:
          type: object
          required: [uri]
          properties:
            uri: { type: string }
            mimeType: { type: string }
            label: { type: string }
`;

const instrumentLogSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/instrument-log.schema.yaml"
type: object
required: [kind, id, logType, status]
properties:
  kind: { const: "instrument-log" }
  id: { type: string }
  logType:
    type: string
    enum: [robot_telemetry, instrument_readout, error_log, operator_notes]
  status:
    type: string
    enum: [completed, aborted, error]
  startedAt: { type: string }
  completedAt: { type: string }
  entries:
    type: array
    items: { type: object }
  artifacts:
    type: array
    items: { type: object }
`;

const executionRunSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/execution-run.schema.yaml"
type: object
required: [kind, recordId, robotPlanRef, status, mode, startedAt]
properties:
  kind: { const: "execution-run" }
  recordId: { type: string }
  robotPlanRef: { type: object }
  plannedRunRef: { type: object }
  status:
    type: string
    enum: [running, completed, failed, canceled]
  mode: { type: string }
  startedAt: { type: string }
  completedAt: { type: string }
  externalRunId: { type: string }
  externalProtocolId: { type: string }
  lastStatusRaw: { type: string }
  lastPolledAt: { type: string }
  cancellationRequestedAt: { type: string }
  cancelResponse: {}
  materializedEventGraphId: { type: string }
  notes: { type: string }
`;

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

describe('ExecutionOrchestrator', () => {
  const testDir = resolve(process.cwd(), 'tmp/execution-orchestrator-test');
  let ctx: AppContext;

  beforeAll(async () => {
    await mkdir(resolve(testDir, 'schema'), { recursive: true });
    await mkdir(resolve(testDir, 'records'), { recursive: true });
    await writeFile(resolve(testDir, 'schema/protocol.schema.yaml'), protocolSchema);
    await writeFile(resolve(testDir, 'schema/planned-run.schema.yaml'), plannedRunSchema);
    await writeFile(resolve(testDir, 'schema/robot-plan.schema.yaml'), robotPlanSchema);
    await writeFile(resolve(testDir, 'schema/instrument-log.schema.yaml'), instrumentLogSchema);
    await writeFile(resolve(testDir, 'schema/execution-run.schema.yaml'), executionRunSchema);
    await writeFile(resolve(testDir, 'schema/event-graph.schema.yaml'), eventGraphSchema);
    await writeFile(resolve(testDir, 'schema/execution-environment.schema.yaml'), executionEnvironmentSchema);
    await writeFile(resolve(testDir, 'schema/execution-plan.schema.yaml'), executionPlanSchema);

    ctx = await initializeApp(testDir, {
      schemaDir: 'schema',
      recordsDir: 'records',
      logLevel: 'silent',
    });

    await ctx.store.create({
      envelope: {
        recordId: 'PRO-000001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml',
        payload: {
          kind: 'protocol',
          recordId: 'PRO-000001',
          title: 'Assist Plus Transfer',
          steps: [
            { stepId: 's1', kind: 'transfer' },
            { stepId: 's2', kind: 'mix' },
          ],
        },
      },
      message: 'Seed protocol',
      skipLint: true,
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
              details: {
                volume_uL: 50,
                sourceWell: 'A1',
                targetWell: 'B1',
                channels: 8,
              },
            },
          ],
          labwares: [
            { labwareId: 'PLATE_SRC', labwareType: 'plate_96' },
            { labwareId: 'PLATE_DST', labwareType: 'plate_96' },
          ],
        },
      },
      message: 'Seed event graph',
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
      message: 'Seed execution environment',
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
      message: 'Seed execution plan',
      skipLint: true,
    });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('creates and compiles a planned run for Assist Plus', async () => {
    const orchestrator = new ExecutionOrchestrator(ctx);

    const planned = await orchestrator.createPlannedRun({
      title: 'Run 1',
      sourceType: 'protocol',
      sourceRef: { kind: 'record', id: 'PRO-000001', type: 'protocol' },
      bindings: {
        labware: [{ roleId: 'plate' }],
      },
    });
    expect(planned.recordId).toBe('PLR-000001');

    const compiled = await orchestrator.compilePlannedRun({
      plannedRunId: planned.recordId,
      targetPlatform: 'integra_assist',
    });
    expect(compiled.robotPlanId).toBe('RP-000001');

    const artifact = await orchestrator.getRobotPlanArtifact(compiled.robotPlanId, 'integra_vialab_xml');
    expect(artifact.filename.endsWith('.xml')).toBe(true);
    expect(artifact.content).toContain('<VialabProtocol');

    const runner = new ExecutionRunner(ctx);
    const runResult = await runner.executeRobotPlan(compiled.robotPlanId);
    expect(runResult.logId).toBe('ILOG-000001');
    expect(['completed', 'error']).toContain(runResult.status);

    process.env['LABOS_SIMULATE_ASSIST_PLUS'] = '1';
    const simRun = await runner.executeRobotPlan(compiled.robotPlanId, {
      parameters: {
        simulate: true,
        vialLayout: '3x5',
      },
    });
    expect(simRun.logId).toBe('ILOG-000002');
    const simFixture = await ctx.repoAdapter.getFile('records/simulator/assist-plus/RP-000001.json');
    expect(simFixture?.content).toContain('"simulator": "assist_plus"');
    delete process.env['LABOS_SIMULATE_ASSIST_PLUS'];
    await expect(runner.executeRobotPlan(compiled.robotPlanId, {
      parameters: { unknownKey: true },
    })).rejects.toThrow(/Invalid execute parameters/);

    const compiledOt2 = await orchestrator.compilePlannedRun({
      plannedRunId: planned.recordId,
      targetPlatform: 'opentrons_ot2',
    });
    expect(compiledOt2.robotPlanId).toBe('RP-000002');
    const ot2Artifact = await orchestrator.getRobotPlanArtifact(compiledOt2.robotPlanId, 'opentrons_python');
    expect(ot2Artifact.filename.endsWith('.py')).toBe(true);
    expect(ot2Artifact.content).toContain('def run(protocol):');

    process.env['LABOS_OPENTRONS_SUBMIT_URL'] = 'http://localhost:31950/opentrons/submit';
    const fakeFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => '{"submissionId":"SUB-001"}',
    });
    const apiRunner = new ExecutionRunner(ctx, undefined, fakeFetch);
    const apiRun = await apiRunner.executeRobotPlan(compiledOt2.robotPlanId);
    expect(apiRun.logId).toBe('ILOG-000003');
    expect(apiRun.status).toBe('completed');
    delete process.env['LABOS_OPENTRONS_SUBMIT_URL'];

    const plannedAfterDirect = await ctx.store.get(planned.recordId);
    expect(['ready', 'completed']).toContain((plannedAfterDirect?.payload as { state?: string }).state);

    const compiledFlex = await orchestrator.compilePlannedRun({
      plannedRunId: planned.recordId,
      targetPlatform: 'opentrons_flex',
    });
    process.env['LABOS_OPENTRONS_API_MODE'] = 'two_step';
    process.env['LABOS_OPENTRONS_BASE_URL'] = 'http://localhost:31950';
    const twoStepFetch = async (url: string) => {
      if (url.endsWith('/protocols')) {
        return {
          ok: true,
          status: 200,
          text: async () => '{"data":{"id":"prot-123"}}',
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => '{"data":{"id":"run-456"}}',
      };
    };
    const twoStepRunner = new ExecutionRunner(ctx, undefined, twoStepFetch);
    const twoStepRun = await twoStepRunner.executeRobotPlan(compiledFlex.robotPlanId);
    expect(twoStepRun.logId).toBe('ILOG-000004');
    expect(twoStepRun.status).toBe('completed');

    const controlFetch = async (url: string, init?: { method?: string }) => {
      if ((init?.method ?? 'GET') === 'GET') {
        return {
          ok: true,
          status: 200,
          text: async () => '{"data":{"status":"running"}}',
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => '{"data":{"id":"action-1","actionType":"stop"}}',
      };
    };
    const controlService = new ExecutionControlService(ctx, controlFetch);
    const runtime = await controlService.getRobotPlanStatus(compiledFlex.robotPlanId);
    expect(runtime['normalizedStatus']).toBe('executing');
    const logs = await controlService.listRobotPlanLogs(compiledFlex.robotPlanId);
    expect(logs.length).toBeGreaterThan(0);
    const cancel = await controlService.cancelRobotPlan(compiledFlex.robotPlanId);
    expect(cancel['cancelRequested']).toBe(true);
    const canceledRun = await ctx.store.get('EXR-000004');
    expect((canceledRun?.payload as { status?: string }).status).toBe('canceled');
    const plannedAfterCancel = await ctx.store.get(planned.recordId);
    expect(['ready', 'failed']).toContain((plannedAfterCancel?.payload as { state?: string }).state);
    const latestLog = await ctx.store.get('ILOG-000004');
    expect((latestLog?.payload as { status?: string }).status).toBe('aborted');

    delete process.env['LABOS_OPENTRONS_API_MODE'];
    delete process.env['LABOS_OPENTRONS_BASE_URL'];
  });

  it('validates and emits execution plans with artifact hashes', async () => {
    const orchestrator = new ExecutionOrchestrator(ctx);

    const validation = await orchestrator.validateExecutionPlan({
      executionPlanId: 'EPL-000001',
    });
    expect(validation.validation.valid).toBe(true);

    const emitted = await orchestrator.emitExecutionPlan({
      executionPlanId: 'EPL-000001',
      targetPlatform: 'opentrons_ot2',
    });
    expect(emitted.robotPlanId).toMatch(/^RP-\d{6}$/);
    expect(emitted.artifacts.length).toBeGreaterThan(0);
    expect(emitted.artifacts[0]?.sha256.length).toBe(64);

    const updatedPlan = await ctx.store.get('EPL-000001');
    const payload = updatedPlan?.payload as { derived_artifacts?: Array<{ sha256?: string; target?: string }> };
    expect(Array.isArray(payload.derived_artifacts)).toBe(true);
    expect(payload.derived_artifacts?.[0]?.target).toBe('opentrons_api');
    expect(payload.derived_artifacts?.[0]?.sha256?.length).toBe(64);
  });

  it('supports planned-run compatibility via executionPlanRef binding', async () => {
    const orchestrator = new ExecutionOrchestrator(ctx);

    const planned = await orchestrator.createPlannedRun({
      title: 'Compatibility Run',
      sourceType: 'protocol',
      sourceRef: { kind: 'record', id: 'PRO-000001', type: 'protocol' },
      bindings: {
        executionPlanRef: { kind: 'record', id: 'EPL-000001', type: 'execution-plan' },
      },
    });

    const compiled = await orchestrator.compilePlannedRun({
      plannedRunId: planned.recordId,
      targetPlatform: 'opentrons_ot2',
    });

    expect(compiled.robotPlanId).toMatch(/^RP-\d{6}$/);
    const plan = await ctx.store.get('EPL-000001');
    const payload = plan?.payload as { derived_artifacts?: Array<{ target?: string; sha256?: string }> };
    expect(payload.derived_artifacts?.some((entry) => entry.target === 'opentrons_api' && (entry.sha256?.length ?? 0) === 64)).toBe(true);
  });
});
