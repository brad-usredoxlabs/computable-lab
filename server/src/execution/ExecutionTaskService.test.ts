import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { initializeApp } from '../server.js';
import type { AppContext } from '../server.js';
import { ExecutionTaskService } from './ExecutionTaskService.js';

const robotPlanSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/robot-plan.schema.yaml"
type: object
required: [kind, id, targetPlatform, status]
properties:
  kind: { const: "robot-plan" }
  id: { type: string }
  targetPlatform: { type: string, enum: [integra_assist, opentrons_ot2, opentrons_flex] }
  status: { type: string }
  plannedRunRef: { type: object }
  artifacts: { type: array, items: { type: object } }
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
  status: { type: string }
  mode: { type: string }
  startedAt: { type: string }
  completedAt: { type: string }
`;

const executionTaskSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/execution-task.schema.yaml"
type: object
required: [kind, recordId, executionRunRef, robotPlanRef, adapterId, targetPlatform, status, contractVersion, createdAt, updatedAt]
properties:
  kind: { const: "execution-task" }
  recordId: { type: string }
  executionRunRef: { type: object }
  robotPlanRef: { type: object }
  adapterId: { type: string }
  targetPlatform: { type: string }
  status: { type: string }
  contractVersion: { type: string }
  createdAt: { type: string }
  updatedAt: { type: string }
  lastSequence: { type: integer }
  runtimeParameters: { type: object }
  executorId: { type: string }
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
  status: { type: string }
  entries: { type: array, items: { type: object } }
`;

describe('ExecutionTaskService', () => {
  const testDir = resolve(process.cwd(), 'tmp/execution-task-service-test');
  let ctx: AppContext;
  let svc: ExecutionTaskService;

  beforeAll(async () => {
    await mkdir(resolve(testDir, 'schema'), { recursive: true });
    await mkdir(resolve(testDir, 'records'), { recursive: true });
    await writeFile(resolve(testDir, 'schema/robot-plan.schema.yaml'), robotPlanSchema);
    await writeFile(resolve(testDir, 'schema/execution-run.schema.yaml'), executionRunSchema);
    await writeFile(resolve(testDir, 'schema/execution-task.schema.yaml'), executionTaskSchema);
    await writeFile(resolve(testDir, 'schema/instrument-log.schema.yaml'), instrumentLogSchema);

    ctx = await initializeApp(testDir, {
      schemaDir: 'schema',
      recordsDir: 'records',
      logLevel: 'silent',
    });
    svc = new ExecutionTaskService(ctx);

    await ctx.store.create({
      envelope: {
        recordId: 'RP-000001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/robot-plan.schema.yaml',
        payload: {
          kind: 'robot-plan',
          id: 'RP-000001',
          targetPlatform: 'integra_assist',
          status: 'compiled',
          artifacts: [{ role: 'integra_xml', fileRef: { uri: 'records/robot-artifact/integra_assist/RP-000001.xml' } }],
        },
      },
      message: 'seed robot plan',
      skipValidation: true,
      skipLint: true,
    });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('creates, claims, updates, and completes a task with idempotent sequences', async () => {
    const queued = await svc.createQueuedTask({
      robotPlanId: 'RP-000001',
      runtimeParameters: { simulate: true },
    });
    expect(queued.executionRunId).toBe('EXR-000001');
    expect(queued.taskId).toBe('EXT-000001');

    const claimed = await svc.claimTasks({ executorId: 'pyexec-1', capabilities: ['integra_assist'], maxTasks: 1 });
    expect(claimed.claimed).toBe(1);
    expect(claimed.tasks[0]?.taskId).toBe('EXT-000001');

    const hb1 = await svc.heartbeat('EXT-000001', {
      executorId: 'pyexec-1',
      sequence: 1,
      status: 'running',
      progress: { step: 'aspirate', percent: 25 },
    });
    expect(hb1.accepted).toBe(true);

    const hbDup = await svc.heartbeat('EXT-000001', {
      executorId: 'pyexec-1',
      sequence: 1,
      status: 'running',
    });
    expect(hbDup.accepted).toBe(false);

    const logs = await svc.appendLogs('EXT-000001', {
      executorId: 'pyexec-1',
      sequence: 2,
      entries: [{ message: 'dispensed to A1', level: 'info', data: { well: 'A1' } }],
    });
    expect(logs.accepted).toBe(true);
    expect(logs.logId).toBe('ILOG-000001');

    const final = await svc.complete('EXT-000001', {
      executorId: 'pyexec-1',
      sequence: 3,
      finalStatus: 'completed',
      artifacts: [{ role: 'telemetry_csv', uri: 'records/artifacts/EXR-000001/telemetry.csv' }],
    });
    expect(final.accepted).toBe(true);

    const run = await ctx.store.get('EXR-000001');
    expect((run?.payload as { status?: string }).status).toBe('completed');
  });
});
