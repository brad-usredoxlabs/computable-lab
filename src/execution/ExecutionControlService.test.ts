import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp } from '../server.js';
import type { AppContext } from '../server.js';
import { ExecutionControlService } from './ExecutionControlService.js';
import { LABOS_BRIDGE_CONTRACT_VERSION } from './sidecar/BridgeContracts.js';

const plannedRunSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml"
type: object
required: [kind, recordId, title, sourceType, sourceRef, state]
properties:
  kind: { const: "planned-run" }
  recordId: { type: string }
  title: { type: string }
  sourceType: { type: string }
  sourceRef: { type: object }
  state:
    type: string
    enum: [draft, ready, executing, completed, failed]
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
  cancellationRequestedAt: { type: string }
  cancelResponse: {}
`;

describe('ExecutionControlService', () => {
  const testDir = resolve(process.cwd(), 'tmp/execution-control-service-test');
  let ctx: AppContext;

  beforeAll(async () => {
    await mkdir(resolve(testDir, 'schema'), { recursive: true });
    await mkdir(resolve(testDir, 'records'), { recursive: true });
    await writeFile(resolve(testDir, 'schema/planned-run.schema.yaml'), plannedRunSchema);
    await writeFile(resolve(testDir, 'schema/execution-run.schema.yaml'), executionRunSchema);
    ctx = await initializeApp(testDir, {
      schemaDir: 'schema',
      recordsDir: 'records',
      logLevel: 'silent',
    });

    await ctx.store.create({
      envelope: {
        recordId: 'PLR-000001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml',
        payload: {
          kind: 'planned-run',
          recordId: 'PLR-000001',
          title: 'assist run',
          sourceType: 'protocol',
          sourceRef: { kind: 'record', id: 'PRO-1', type: 'protocol' },
          state: 'executing',
        },
      },
      message: 'seed planned run',
      skipValidation: true,
      skipLint: true,
    });
    await ctx.store.create({
      envelope: {
        recordId: 'RP-000001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/robot-plan.schema.yaml',
        payload: {
          kind: 'robot-plan',
          id: 'RP-000001',
          targetPlatform: 'integra_assist',
          plannedRunRef: { kind: 'record', id: 'PLR-000001', type: 'planned-run' },
          status: 'compiled',
        },
      },
      message: 'seed robot plan',
      skipValidation: true,
      skipLint: true,
    });
    await ctx.store.create({
      envelope: {
        recordId: 'EXR-000001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/execution-run.schema.yaml',
        payload: {
          kind: 'execution-run',
          recordId: 'EXR-000001',
          robotPlanRef: { kind: 'record', id: 'RP-000001', type: 'robot-plan' },
          plannedRunRef: { kind: 'record', id: 'PLR-000001', type: 'planned-run' },
          status: 'running',
          mode: 'sidecar_process',
          startedAt: new Date().toISOString(),
        },
      },
      message: 'seed execution run',
      skipValidation: true,
      skipLint: true,
    });
    await ctx.store.create({
      envelope: {
        recordId: 'ILOG-000001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/instrument-log.schema.yaml',
        payload: {
          kind: 'instrument-log',
          id: 'ILOG-000001',
          logType: 'robot_telemetry',
          status: 'completed',
          plannedRunRef: { kind: 'record', id: 'PLR-000001', type: 'planned-run' },
          entries: [
            {
              entryType: 'info',
              message: 'seed',
              data: {
                robotPlanId: 'RP-000001',
                executionMode: 'sidecar_process',
              },
            },
          ],
        },
      },
      message: 'seed instrument log',
      skipValidation: true,
      skipLint: true,
    });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('cancels non-opentrons runs via sidecar command fallback', async () => {
    const fakeFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => '{}',
    });
    const fakeSidecar = {
      run: async () => ({
        ok: true,
        exitCode: 0,
        stdout: '{"action":"stopped"}',
        stderr: '',
      }),
    };
    const service = new ExecutionControlService(ctx, fakeFetch, fakeSidecar as never);
    const canceled = await service.cancelRobotPlan('RP-000001');
    expect(canceled['cancelRequested']).toBe(true);
    expect(canceled['mode']).toBe('sidecar_cancel');
    expect(canceled['targetPlatform']).toBe('integra_assist');

    const executionRun = await ctx.store.get('EXR-000001');
    expect((executionRun?.payload as { status?: string }).status).toBe('canceled');
    const plannedRun = await ctx.store.get('PLR-000001');
    expect((plannedRun?.payload as { state?: string }).state).toBe('executing');
    const log = await ctx.store.get('ILOG-000001');
    expect((log?.payload as { status?: string }).status).toBe('aborted');
  });

  it('queries and cancels integra_http runs via HTTP bridge', async () => {
    await ctx.store.update({
      envelope: {
        recordId: 'RP-000001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/robot-plan.schema.yaml',
        payload: {
          kind: 'robot-plan',
          id: 'RP-000001',
          targetPlatform: 'integra_assist',
          plannedRunRef: { kind: 'record', id: 'PLR-000001', type: 'planned-run' },
          status: 'compiled',
        },
      },
      message: 'ensure robot plan',
      skipValidation: true,
      skipLint: true,
    });
    await ctx.store.update({
      envelope: {
        recordId: 'EXR-000001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/execution-run.schema.yaml',
        payload: {
          kind: 'execution-run',
          recordId: 'EXR-000001',
          robotPlanRef: { kind: 'record', id: 'RP-000001', type: 'robot-plan' },
          plannedRunRef: { kind: 'record', id: 'PLR-000001', type: 'planned-run' },
          status: 'running',
          mode: 'integra_http',
          startedAt: new Date().toISOString(),
        },
      },
      message: 'reset execution run',
      skipValidation: true,
      skipLint: true,
    });
    await ctx.store.update({
      envelope: {
        recordId: 'ILOG-000001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/instrument-log.schema.yaml',
        payload: {
          kind: 'instrument-log',
          id: 'ILOG-000001',
          logType: 'robot_telemetry',
          status: 'completed',
          plannedRunRef: { kind: 'record', id: 'PLR-000001', type: 'planned-run' },
          entries: [
            {
              entryType: 'info',
              message: 'seed',
              data: {
                robotPlanId: 'RP-000001',
                executionMode: 'integra_http',
                assistRunId: 'assist-run-1',
              },
            },
          ],
        },
      },
      message: 'update log for integra mode',
      skipValidation: true,
      skipLint: true,
    });

    process.env['LABOS_INTEGRA_ASSIST_BASE_URL'] = 'http://assist.local';
    const fakeFetch = async (url: string, init?: { method?: string }) => {
      if ((init?.method ?? 'GET') === 'GET') {
        expect(url).toContain('/runs/assist-run-1');
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            contractVersion: LABOS_BRIDGE_CONTRACT_VERSION,
            adapterId: 'integra_assist',
            operation: 'status',
            result: {
              runId: 'assist-run-1',
              status: 'running',
            },
          }),
        };
      }
      expect(url).toContain('/runs/assist-run-1/cancel');
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          contractVersion: LABOS_BRIDGE_CONTRACT_VERSION,
          adapterId: 'integra_assist',
          operation: 'cancel',
          result: {
            runId: 'assist-run-1',
            status: 'stopped',
          },
        }),
      };
    };
    const service = new ExecutionControlService(ctx, fakeFetch);
    const status = await service.getRobotPlanStatus('RP-000001');
    expect(status['assistRunId']).toBe('assist-run-1');
    expect(status['normalizedStatus']).toBe('executing');
    const canceled = await service.cancelRobotPlan('RP-000001');
    expect(canceled['assistRunId']).toBe('assist-run-1');
    expect(canceled['cancelRequested']).toBe(true);
    delete process.env['LABOS_INTEGRA_ASSIST_BASE_URL'];
  });

  it('rejects invalid integra status contract responses in strict mode', async () => {
    await ctx.store.update({
      envelope: {
        recordId: 'ILOG-000001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/instrument-log.schema.yaml',
        payload: {
          kind: 'instrument-log',
          id: 'ILOG-000001',
          logType: 'robot_telemetry',
          status: 'completed',
          plannedRunRef: { kind: 'record', id: 'PLR-000001', type: 'planned-run' },
          entries: [
            {
              entryType: 'info',
              message: 'seed',
              data: {
                robotPlanId: 'RP-000001',
                executionMode: 'integra_http',
                assistRunId: 'assist-run-1',
              },
            },
          ],
        },
      },
      message: 'ensure integra http status context',
      skipValidation: true,
      skipLint: true,
    });
    process.env['LABOS_INTEGRA_ASSIST_BASE_URL'] = 'http://assist.local';
    process.env['LABOS_SIDECAR_CONTRACT_STRICT'] = '1';
    const fakeFetch = async (url: string, init?: { method?: string }) => {
      if ((init?.method ?? 'GET') === 'GET') {
        expect(url).toContain('/runs/assist-run-1');
        return {
          ok: true,
          status: 200,
          text: async () => '{"status":"running"}',
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => '{"status":"stopped"}',
      };
    };
    const service = new ExecutionControlService(ctx, fakeFetch);
    await expect(service.getRobotPlanStatus('RP-000001')).rejects.toThrow(/Invalid INTEGRA status response contract/);
    delete process.env['LABOS_INTEGRA_ASSIST_BASE_URL'];
    delete process.env['LABOS_SIDECAR_CONTRACT_STRICT'];
  });
});
