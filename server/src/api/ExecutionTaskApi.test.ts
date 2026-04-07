import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createServer, initializeApp } from '../server.js';
import type { AppContext } from '../server.js';

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
  status: { type: string }
  mode: { type: string }
  startedAt: { type: string }
  completedAt: { type: string }
  failureClass: { type: string }
  failureCode: { type: string }
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
  executorId: { type: string }
  lastSequence: { type: integer }
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

describe('Execution Task API', () => {
  const testDir = resolve(process.cwd(), 'tmp/execution-task-api-test');
  let ctx: AppContext;
  let app: FastifyInstance;

  beforeAll(async () => {
    await mkdir(resolve(testDir, 'schema'), { recursive: true });
    await mkdir(resolve(testDir, 'records'), { recursive: true });
    await writeFile(resolve(testDir, 'schema/robot-plan.schema.yaml'), robotPlanSchema);
    await writeFile(resolve(testDir, 'schema/execution-run.schema.yaml'), executionRunSchema);
    await writeFile(resolve(testDir, 'schema/execution-task.schema.yaml'), executionTaskSchema);
    await writeFile(resolve(testDir, 'schema/instrument-log.schema.yaml'), instrumentLogSchema);

    process.env['CL_EXECUTION_MODE'] = 'remote';
    process.env['CL_EXECUTOR_TOKENS'] = 'integra-token=integra_assist;op-token=opentrons_ot2';

    ctx = await initializeApp(testDir, {
      schemaDir: 'schema',
      recordsDir: 'records',
      logLevel: 'silent',
    });

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

    app = await createServer(ctx, { logLevel: 'silent' });
    await app.ready();
  });

  afterAll(async () => {
    delete process.env['CL_EXECUTION_MODE'];
    delete process.env['CL_EXECUTOR_TOKENS'];
    await app.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it('executes remote task lifecycle with scoped auth and idempotency', async () => {
    const dispatch = await app.inject({
      method: 'POST',
      url: '/api/robot-plans/RP-000001/execute',
      payload: { parameters: { simulate: true } },
    });
    expect(dispatch.statusCode).toBe(200);
    const dispatchBody = JSON.parse(dispatch.payload) as { success: boolean; status: string; executionRunId: string; taskId: string };
    expect(dispatchBody.success).toBe(true);
    expect(dispatchBody.status).toBe('queued');
    expect(dispatchBody.executionRunId).toBe('EXR-000001');
    expect(dispatchBody.taskId).toBe('EXT-000001');

    const claim = await app.inject({
      method: 'POST',
      url: '/api/execution-tasks/claim',
      headers: { authorization: 'Bearer integra-token' },
      payload: {
        executorId: 'pyexec-1',
        capabilities: ['integra_assist'],
        maxTasks: 1,
      },
    });
    expect(claim.statusCode).toBe(200);
    const claimBody = JSON.parse(claim.payload) as { claimed: number; tasks: Array<{ taskId: string }> };
    expect(claimBody.claimed).toBe(1);
    expect(claimBody.tasks[0]?.taskId).toBe('EXT-000001');

    const forbiddenHb = await app.inject({
      method: 'POST',
      url: '/api/execution-tasks/EXT-000001/heartbeat',
      headers: { authorization: 'Bearer op-token' },
      payload: { executorId: 'pyexec-1', sequence: 1, status: 'running' },
    });
    expect(forbiddenHb.statusCode).toBe(403);

    const heartbeat = await app.inject({
      method: 'POST',
      url: '/api/execution-tasks/EXT-000001/heartbeat',
      headers: { authorization: 'Bearer integra-token' },
      payload: { executorId: 'pyexec-1', sequence: 1, status: 'running', progress: { percent: 25 } },
    });
    expect(heartbeat.statusCode).toBe(200);
    expect(JSON.parse(heartbeat.payload).accepted).toBe(true);

    const heartbeatDup = await app.inject({
      method: 'POST',
      url: '/api/execution-tasks/EXT-000001/heartbeat',
      headers: { authorization: 'Bearer integra-token' },
      payload: { executorId: 'pyexec-1', sequence: 1, status: 'running' },
    });
    expect(heartbeatDup.statusCode).toBe(200);
    expect(JSON.parse(heartbeatDup.payload).accepted).toBe(false);

    const logs = await app.inject({
      method: 'POST',
      url: '/api/execution-tasks/EXT-000001/logs',
      headers: { authorization: 'Bearer integra-token' },
      payload: {
        executorId: 'pyexec-1',
        sequence: 2,
        entries: [{ message: 'dispensed', level: 'info', data: { well: 'A1' } }],
      },
    });
    expect(logs.statusCode).toBe(200);
    const logsBody = JSON.parse(logs.payload) as { accepted: boolean; logId: string };
    expect(logsBody.accepted).toBe(true);
    expect(logsBody.logId).toBe('ILOG-000001');

    const status = await app.inject({
      method: 'POST',
      url: '/api/execution-tasks/EXT-000001/status',
      headers: { authorization: 'Bearer integra-token' },
      payload: {
        executorId: 'pyexec-1',
        sequence: 3,
        status: 'running',
        external: { runId: 'assist-123', rawStatus: 'running' },
      },
    });
    expect(status.statusCode).toBe(200);
    expect(JSON.parse(status.payload).accepted).toBe(true);

    const complete = await app.inject({
      method: 'POST',
      url: '/api/execution-tasks/EXT-000001/complete',
      headers: { authorization: 'Bearer integra-token' },
      payload: {
        executorId: 'pyexec-1',
        sequence: 4,
        finalStatus: 'completed',
        artifacts: [{ role: 'telemetry_csv', uri: 'records/artifacts/EXR-000001/telemetry.csv' }],
      },
    });
    expect(complete.statusCode).toBe(200);
    expect(JSON.parse(complete.payload).accepted).toBe(true);

    const run = await ctx.store.get('EXR-000001');
    expect((run?.payload as { status?: string }).status).toBe('completed');
  });
});
