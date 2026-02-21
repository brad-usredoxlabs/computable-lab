import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp } from '../server.js';
import type { AppContext } from '../server.js';
import { ExecutionRunService } from './ExecutionRunService.js';

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
  status: { type: string, enum: [running, completed, failed, canceled] }
  mode: { type: string }
  startedAt: { type: string }
  completedAt: { type: string }
`;

describe('ExecutionRunService', () => {
  const testDir = resolve(process.cwd(), 'tmp/execution-run-service-test');
  let ctx: AppContext;

  beforeAll(async () => {
    await mkdir(resolve(testDir, 'schema'), { recursive: true });
    await mkdir(resolve(testDir, 'records/robot-artifact/integra_assist'), { recursive: true });
    await writeFile(resolve(testDir, 'schema/planned-run.schema.yaml'), plannedRunSchema);
    await writeFile(resolve(testDir, 'schema/robot-plan.schema.yaml'), robotPlanSchema);
    await writeFile(resolve(testDir, 'schema/instrument-log.schema.yaml'), instrumentLogSchema);
    await writeFile(resolve(testDir, 'schema/execution-run.schema.yaml'), executionRunSchema);

    ctx = await initializeApp(testDir, {
      schemaDir: 'schema',
      recordsDir: 'records',
      logLevel: 'silent',
    });

    await ctx.repoAdapter.createFile({
      path: 'records/robot-artifact/integra_assist/RP-000001.xml',
      content: '<VialabProtocol id="RP-000001" />',
      message: 'seed artifact',
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
          title: 'run',
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
          artifacts: [
            { role: 'integra_vialab_xml', fileRef: { uri: 'records/robot-artifact/integra_assist/RP-000001.xml' } },
          ],
        },
      },
      message: 'seed robot plan',
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
          status: 'failed',
          mode: 'sidecar_process',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      },
      message: 'seed execution-run',
      skipLint: true,
    });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('retries from prior execution-run and reports status', async () => {
    const service = new ExecutionRunService(ctx);
    const allForPlan = await service.listExecutionRuns({ robotPlanId: 'RP-000001' });
    expect(allForPlan.length).toBe(1);
    const retried = await service.retryExecutionRun('EXR-000001');
    expect(retried.executionRunId).toBe('EXR-000002');
    const retryRun = await ctx.store.get('EXR-000002');
    const retryPayload = retryRun?.payload as { attempt?: number; parentExecutionRunRef?: { id?: string } };
    expect(retryPayload.attempt).toBe(2);
    expect(retryPayload.parentExecutionRunRef?.id).toBe('EXR-000001');
    const status = await service.getExecutionRunStatus('EXR-000002');
    expect(status['executionRunId']).toBe('EXR-000002');
    expect(status['robotPlanId']).toBe('RP-000001');
    const lineage = await service.getExecutionRunLineage('EXR-000002');
    expect(lineage.total).toBe(2);
    expect(lineage.lineage[0]?.executionRunId).toBe('EXR-000002');
    expect(lineage.lineage[1]?.executionRunId).toBe('EXR-000001');
    const latest = await service.getLatestExecutionRunForRobotPlan('RP-000001');
    expect(latest?.recordId).toBe('EXR-000002');
    const materialized = await service.getMaterializedEventGraph('EXR-000002');
    expect(materialized?.eventGraphId).toBe('EVG-000001');

    await ctx.store.create({
      envelope: {
        recordId: 'EXR-000003',
        schemaId: 'https://computable-lab.com/schema/computable-lab/execution-run.schema.yaml',
        payload: {
          kind: 'execution-run',
          recordId: 'EXR-000003',
          robotPlanRef: { kind: 'record', id: 'RP-000001', type: 'robot-plan' },
          plannedRunRef: { kind: 'record', id: 'PLR-000001', type: 'planned-run' },
          parentExecutionRunRef: { kind: 'record', id: 'EXR-000002', type: 'execution-run' },
          attempt: 3,
          status: 'completed',
          mode: 'sidecar_process',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      },
      message: 'seed third execution-run',
      skipLint: true,
    });

    const pagedAttemptDesc = await service.listExecutionRunsPaged({
      robotPlanId: 'RP-000001',
      sort: 'attempt_desc',
      limit: 2,
      offset: 0,
    });
    expect(pagedAttemptDesc.total).toBe(3);
    expect(pagedAttemptDesc.runs[0]?.recordId).toBe('EXR-000003');
    expect(pagedAttemptDesc.runs[1]?.recordId).toBe('EXR-000002');

    const pagedNext = await service.listExecutionRunsPaged({
      robotPlanId: 'RP-000001',
      sort: 'attempt_desc',
      limit: 1,
      offset: 1,
    });
    expect(pagedNext.total).toBe(3);
    expect(pagedNext.runs[0]?.recordId).toBe('EXR-000002');

    await ctx.store.create({
      envelope: {
        recordId: 'EXR-000010',
        schemaId: 'https://computable-lab.com/schema/computable-lab/execution-run.schema.yaml',
        payload: {
          kind: 'execution-run',
          recordId: 'EXR-000010',
          robotPlanRef: { kind: 'record', id: 'RP-000001', type: 'robot-plan' },
          plannedRunRef: { kind: 'record', id: 'PLR-000001', type: 'planned-run' },
          status: 'failed',
          mode: 'sidecar_process',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          failureClass: 'terminal',
          retryRecommended: false,
          retryReason: 'invalid_protocol_or_payload',
        },
      },
      message: 'seed terminal failure execution-run',
      skipLint: true,
    });
    await expect(service.retryExecutionRun('EXR-000010')).rejects.toThrow(/terminal|non-retriable/i);
    const forcedRetry = await service.retryExecutionRunWithOptions('EXR-000010', { force: true });
    expect(forcedRetry.executionRunId).toBe('EXR-000011');

    const resolved = await service.resolveExecutionRun('EXR-000011', {
      status: 'canceled',
      failureClass: 'terminal',
      failureCode: 'RETRY_EXHAUSTED',
      retryRecommended: false,
      retryReason: 'manual_resolution',
      notes: 'operator stopped run',
    });
    expect(resolved.status).toBe('canceled');
    const resolvedRun = await ctx.store.get('EXR-000011');
    const resolvedPayload = resolvedRun?.payload as { failureCode?: string; status?: string };
    expect(resolvedPayload.status).toBe('canceled');
    expect(resolvedPayload.failureCode).toBe('RETRY_EXHAUSTED');
  });
});
