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
    expect((plannedAfterDirect?.payload as { state?: string }).state).toBe('completed');

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
    expect((plannedAfterCancel?.payload as { state?: string }).state).toBe('failed');
    const latestLog = await ctx.store.get('ILOG-000004');
    expect((latestLog?.payload as { status?: string }).status).toBe('aborted');

    delete process.env['LABOS_OPENTRONS_API_MODE'];
    delete process.env['LABOS_OPENTRONS_BASE_URL'];
  });
});
