import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp } from '../server.js';
import type { AppContext } from '../server.js';
import { ExecutionRetryWorker } from './ExecutionRetryWorker.js';

const plannedRunSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml"
type: object
required: [kind, recordId, state, sourceType, sourceRef, title]
properties:
  kind: { const: "planned-run" }
  recordId: { type: string }
  state: { type: string, enum: [draft, ready, executing, completed, failed] }
  sourceType: { type: string }
  sourceRef: { type: object }
  title: { type: string }
`;

const robotPlanSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/robot-plan.schema.yaml"
type: object
required: [kind, id, plannedRunRef, targetPlatform, status, artifacts]
properties:
  kind: { const: "robot-plan" }
  id: { type: string }
  plannedRunRef: { type: object }
  targetPlatform: { type: string, enum: [integra_assist, opentrons_ot2, opentrons_flex] }
  status: { type: string }
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
  parentExecutionRunRef: { type: object }
  attempt: { type: number }
  status: { type: string, enum: [running, completed, failed, canceled] }
  mode: { type: string }
  startedAt: { type: string }
  completedAt: { type: string }
  failureClass: { type: string, enum: [transient, terminal, unknown] }
  retryRecommended: { type: boolean }
  retryReason: { type: string }
  failureCode: { type: string }
`;

const instrumentLogSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/instrument-log.schema.yaml"
type: object
required: [kind, id, logType, status]
properties:
  kind: { const: "instrument-log" }
  id: { type: string }
  logType: { type: string }
  status: { type: string, enum: [completed, aborted, error] }
  entries: { type: array, items: { type: object } }
  artifacts: { type: array, items: { type: object } }
`;

describe('ExecutionRetryWorker', () => {
  const testDir = resolve(process.cwd(), 'tmp/execution-retry-worker-test');
  let ctx: AppContext;

  beforeAll(async () => {
    await mkdir(resolve(testDir, 'schema'), { recursive: true });
    await mkdir(resolve(testDir, 'records/robot-artifact/integra_assist'), { recursive: true });
    await writeFile(resolve(testDir, 'schema/planned-run.schema.yaml'), plannedRunSchema);
    await writeFile(resolve(testDir, 'schema/robot-plan.schema.yaml'), robotPlanSchema);
    await writeFile(resolve(testDir, 'schema/execution-run.schema.yaml'), executionRunSchema);
    await writeFile(resolve(testDir, 'schema/instrument-log.schema.yaml'), instrumentLogSchema);
    await writeFile(resolve(testDir, 'records/robot-artifact/integra_assist/RP-000001.xml'), '<VialabProtocol id="RP-000001" />');
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
          state: 'ready',
          sourceType: 'protocol',
          sourceRef: { kind: 'record', id: 'PRO-000001', type: 'protocol' },
          title: 'retry worker run',
        },
      },
      message: 'seed planned',
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
          targetPlatform: 'integra_assist',
          status: 'compiled',
          artifacts: [{ role: 'integra_vialab_xml', fileRef: { uri: 'records/robot-artifact/integra_assist/RP-000001.xml' } }],
        },
      },
      message: 'seed robot',
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
          attempt: 1,
          status: 'failed',
          mode: 'sidecar_process',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          failureClass: 'transient',
          retryRecommended: true,
          retryReason: 'generic_execution_failure',
          failureCode: 'GENERIC_EXECUTION_FAILURE',
        },
      },
      message: 'seed failed execution',
      skipLint: true,
    });
    await ctx.store.create({
      envelope: {
        recordId: 'EXR-000009',
        schemaId: 'https://computable-lab.com/schema/computable-lab/execution-run.schema.yaml',
        payload: {
          kind: 'execution-run',
          recordId: 'EXR-000009',
          robotPlanRef: { kind: 'record', id: 'RP-000001', type: 'robot-plan' },
          plannedRunRef: { kind: 'record', id: 'PLR-000001', type: 'planned-run' },
          attempt: 1,
          status: 'failed',
          mode: 'sidecar_process',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          failureClass: 'terminal',
          retryRecommended: false,
          retryReason: 'invalid_protocol_or_payload',
          failureCode: 'INVALID_PROTOCOL',
        },
      },
      message: 'seed terminal failure',
      skipLint: true,
    });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('retries only transient failures and skips terminal ones', async () => {
    const worker = new ExecutionRetryWorker(ctx);
    const summary = await worker.runOnce(10);
    expect(summary['transientFailed']).toBe(1);
    expect(summary['retried']).toBe(1);
    expect(summary['retryErrors']).toBe(0);
    const newRun = await ctx.store.get('EXR-000010');
    expect(newRun).not.toBeNull();
    const payload = newRun?.payload as { parentExecutionRunRef?: { id?: string } };
    expect(payload.parentExecutionRunRef?.id).toBe('EXR-000001');
  });

  it('marks transient failures as exhausted when max attempts reached', async () => {
    await ctx.store.create({
      envelope: {
        recordId: 'EXR-000020',
        schemaId: 'https://computable-lab.com/schema/computable-lab/execution-run.schema.yaml',
        payload: {
          kind: 'execution-run',
          recordId: 'EXR-000020',
          robotPlanRef: { kind: 'record', id: 'RP-000001', type: 'robot-plan' },
          plannedRunRef: { kind: 'record', id: 'PLR-000001', type: 'planned-run' },
          attempt: 1,
          status: 'failed',
          mode: 'sidecar_process',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          failureClass: 'transient',
          retryRecommended: true,
          retryReason: 'generic_execution_failure',
          failureCode: 'GENERIC_EXECUTION_FAILURE',
        },
      },
      message: 'seed exhausted candidate',
      skipLint: true,
    });
    process.env['LABOS_RETRY_MAX_ATTEMPTS'] = '1';
    const worker = new ExecutionRetryWorker(ctx);
    const summary = await worker.runOnce(50);
    expect(summary['exhaustedMarked']).toBeGreaterThanOrEqual(1);
    const exhausted = await ctx.store.get('EXR-000020');
    const payload = exhausted?.payload as { failureCode?: string; retryRecommended?: boolean; failureClass?: string };
    expect(payload.failureCode).toBe('RETRY_EXHAUSTED');
    expect(payload.retryRecommended).toBe(false);
    expect(payload.failureClass).toBe('terminal');
    delete process.env['LABOS_RETRY_MAX_ATTEMPTS'];
  });

  it('persists running state and blocks competing lease holders', async () => {
    const workerA = new ExecutionRetryWorker(ctx);
    const started = await workerA.start(60_000);
    expect(started.running).toBe(true);

    const state = await ctx.store.get('EWS-RETRY-WORKER');
    const statePayload = state?.payload as { running?: boolean; workerId?: string; leaseOwner?: string };
    expect(statePayload.workerId).toBe('retry-worker');
    expect(statePayload.running).toBe(true);
    expect(typeof statePayload.leaseOwner).toBe('string');

    const workerB = new ExecutionRetryWorker(ctx);
    const blocked = await workerB.start(60_000);
    expect(blocked.running).toBe(false);
    expect(blocked.leaseBlockedBy).toBeDefined();
    const taken = await workerB.start(60_000, { forceTakeover: true });
    expect(taken.running).toBe(true);

    await workerB.stop();
    const stopped = await workerA.stop();
    expect(stopped.running).toBe(false);
    const stoppedState = await ctx.store.get('EWS-RETRY-WORKER');
    const stoppedPayload = stoppedState?.payload as { running?: boolean };
    expect(stoppedPayload.running).toBe(false);
  });
});
