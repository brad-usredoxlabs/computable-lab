import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp } from '../server.js';
import type { AppContext } from '../server.js';
import { ExecutionPoller } from './ExecutionPoller.js';
import { ExecutionControlService } from './ExecutionControlService.js';

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
  externalRunId: { type: string }
  externalProtocolId: { type: string }
  lastStatusRaw: { type: string }
  lastPolledAt: { type: string }
  cancellationRequestedAt: { type: string }
  cancelResponse: {}
  materializedEventGraphId: { type: string }
  notes: { type: string }
`;

describe('ExecutionPoller', () => {
  const testDir = resolve(process.cwd(), 'tmp/execution-poller-test');
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
          title: 'running',
          sourceType: 'protocol',
          sourceRef: { kind: 'record', id: 'PRO-1', type: 'protocol' },
          state: 'executing',
        },
      },
      message: 'seed planned run',
      skipLint: true,
    });

    await ctx.store.create({
      envelope: {
        recordId: 'RP-000001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/robot-plan.schema.yaml',
        payload: {
          kind: 'robot-plan',
          id: 'RP-000001',
          plannedRunRef: { kind: 'record', id: 'PLR-000001', type: 'planned-run' },
          targetPlatform: 'opentrons_flex',
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
          mode: 'opentrons_http_two_step',
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
                executionMode: 'opentrons_http_two_step',
                opentronsRunId: 'run-1',
              },
            },
          ],
        },
      },
      message: 'seed log',
      skipValidation: true,
      skipLint: true,
    });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('polls running execution-runs and updates run/planned-run state', async () => {
    process.env['LABOS_OPENTRONS_BASE_URL'] = 'http://localhost:31950';
    const fakeFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => '{"data":{"status":"succeeded"}}',
    });
    const control = new ExecutionControlService(ctx, fakeFetch);
    const poller = new ExecutionPoller(ctx, control);
    const summary = await poller.pollOnce();
    expect(summary['completed']).toBe(1);

    const executionRun = await ctx.store.get('EXR-000001');
    expect((executionRun?.payload as { status?: string }).status).toBe('completed');
    const materializedId = (executionRun?.payload as { materializedEventGraphId?: string }).materializedEventGraphId;
    expect(materializedId).toBeDefined();
    const materialized = materializedId ? await ctx.store.get(materializedId) : null;
    expect(materialized).not.toBeNull();

    const plannedRun = await ctx.store.get('PLR-000001');
    expect((plannedRun?.payload as { state?: string }).state).toBe('completed');
    delete process.env['LABOS_OPENTRONS_BASE_URL'];
  });

  it('fails long-running execution-runs on timeout policy', async () => {
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
          mode: 'opentrons_http_two_step',
          startedAt: '2000-01-01T00:00:00.000Z',
        },
      },
      message: 'reset execution run to timed out state',
      skipValidation: true,
      skipLint: true,
    });
    process.env['LABOS_EXECUTION_MAX_RUN_MS'] = '1';
    const fakeFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => '{"data":{"status":"running"}}',
    });
    const control = new ExecutionControlService(ctx, fakeFetch);
    const poller = new ExecutionPoller(ctx, control);
    const summary = await poller.pollOnce();
    expect(summary['failed']).toBe(1);

    const executionRun = await ctx.store.get('EXR-000001');
    const payload = executionRun?.payload as { status?: string; lastStatusRaw?: string };
    expect(payload.status).toBe('failed');
    expect(payload.lastStatusRaw).toBe('timeout');
    const plannedRun = await ctx.store.get('PLR-000001');
    expect((plannedRun?.payload as { state?: string }).state).toBe('failed');
    delete process.env['LABOS_EXECUTION_MAX_RUN_MS'];
  });

  it('fails stale unknown-status runs via recovery policy', async () => {
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
          mode: 'opentrons_http_two_step',
          startedAt: '2000-01-01T00:00:00.000Z',
        },
      },
      message: 'reset execution run to stale unknown state',
      skipValidation: true,
      skipLint: true,
    });
    process.env['LABOS_EXECUTION_STALE_UNKNOWN_MS'] = '1';
    process.env['LABOS_EXECUTION_MAX_RUN_MS'] = '999999999999';
    process.env['LABOS_OPENTRONS_BASE_URL'] = 'http://localhost:31950';
    const fakeFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => '{"data":{"status":"mystery"}}',
    });
    const control = new ExecutionControlService(ctx, fakeFetch);
    const poller = new ExecutionPoller(ctx, control);
    const summary = await poller.pollOnce();
    expect(summary['staleUnknownFailed']).toBe(1);

    const executionRun = await ctx.store.get('EXR-000001');
    const payload = executionRun?.payload as { status?: string; failureClass?: string; retryRecommended?: boolean };
    expect(payload.status).toBe('failed');
    expect(payload.failureClass).toBe('unknown');
    expect(payload.retryRecommended).toBe(false);
    delete process.env['LABOS_EXECUTION_STALE_UNKNOWN_MS'];
    delete process.env['LABOS_EXECUTION_MAX_RUN_MS'];
    delete process.env['LABOS_OPENTRONS_BASE_URL'];
  });

  it('persists running state and blocks competing poller lease holders', async () => {
    const fakeFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => '{"data":{"status":"running"}}',
    });
    const control = new ExecutionControlService(ctx, fakeFetch);
    const pollerA = new ExecutionPoller(ctx, control);
    const started = await pollerA.start(60_000);
    expect(started.running).toBe(true);

    const state = await ctx.store.get('EWS-EXECUTION-POLLER');
    const statePayload = state?.payload as { running?: boolean; workerId?: string; leaseOwner?: string };
    expect(statePayload.workerId).toBe('execution-poller');
    expect(statePayload.running).toBe(true);
    expect(typeof statePayload.leaseOwner).toBe('string');

    const pollerB = new ExecutionPoller(ctx, control);
    const blocked = await pollerB.start(60_000);
    expect(blocked.running).toBe(false);
    expect(blocked.leaseBlockedBy).toBeDefined();
    const taken = await pollerB.start(60_000, { forceTakeover: true });
    expect(taken.running).toBe(true);

    await pollerB.stop();
    const stopped = await pollerA.stop();
    expect(stopped.running).toBe(false);
    const stoppedState = await ctx.store.get('EWS-EXECUTION-POLLER');
    const stoppedPayload = stoppedState?.payload as { running?: boolean };
    expect(stoppedPayload.running).toBe(false);
  });
});
