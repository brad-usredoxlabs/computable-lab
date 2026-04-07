import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp } from '../server.js';
import type { AppContext } from '../server.js';
import { ExecutionEvidenceService } from './ExecutionEvidenceService.js';

async function seedRun(
  ctx: AppContext,
  ids: { plannedRunId: string; robotPlanId: string; executionRunId: string },
  approvalAuthority: 'run-operator' | 'supervisor' | 'qa-reviewer',
): Promise<void> {
  await ctx.store.create({
    envelope: {
      recordId: ids.plannedRunId,
      schemaId: 'https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml',
      payload: {
        kind: 'planned-run',
        recordId: ids.plannedRunId,
        state: 'ready',
        title: `planned ${ids.plannedRunId}`,
        protocolCompilation: {
          steps: [
            {
              stepId: 'step-1',
              kind: 'mix',
              executionMode: 'instrument',
              selectedBackendId: 'backend-a',
            },
          ],
          remediationOptions: [
            {
              code: 'manual-backend',
              stepId: 'step-1',
              action: 'switch-backend',
              disposition: 'needs-confirmation',
              message: 'Switch to manual backend',
              backendId: 'manual-backend',
            },
          ],
          activePolicy: {
            scope: {
              organizationId: 'org-1',
              runId: ids.executionRunId,
            },
            profiles: [
              {
                id: `run-policy-${ids.executionRunId}`,
                scope: 'run',
                scopeId: ids.executionRunId,
                settings: {
                  allowRemediation: 'confirm',
                  approvalAuthority,
                },
              },
            ],
            settings: {
              approvalAuthority,
            },
          },
        },
      },
    },
    message: `seed ${ids.plannedRunId}`,
    skipValidation: true,
    skipLint: true,
  });

  await ctx.store.create({
    envelope: {
      recordId: ids.robotPlanId,
      schemaId: 'https://computable-lab.com/schema/computable-lab/robot-plan.schema.yaml',
      payload: {
        kind: 'robot-plan',
        id: ids.robotPlanId,
        plannedRunRef: { kind: 'record', id: ids.plannedRunId, type: 'planned-run' },
        targetPlatform: 'opentrons_flex',
        status: 'compiled',
        executionSteps: [
          {
            stepId: 'robot-step-1',
            sourceStepRef: 'step-1',
            command: 'mix',
            params: { repetitions: 3 },
          },
        ],
      },
    },
    message: `seed ${ids.robotPlanId}`,
    skipValidation: true,
    skipLint: true,
  });

  await ctx.store.create({
    envelope: {
      recordId: ids.executionRunId,
      schemaId: 'https://computable-lab.com/schema/computable-lab/execution-run.schema.yaml',
      payload: {
        kind: 'execution-run',
        recordId: ids.executionRunId,
        plannedRunRef: { kind: 'record', id: ids.plannedRunId, type: 'planned-run' },
        robotPlanRef: { kind: 'record', id: ids.robotPlanId, type: 'robot-plan' },
        status: 'running',
        mode: 'sidecar_process',
        startedAt: '2026-04-05T15:00:00.000Z',
      },
    },
    message: `seed ${ids.executionRunId}`,
    skipValidation: true,
    skipLint: true,
  });
}

describe('ExecutionEvidenceService', () => {
  const testDir = resolve(process.cwd(), 'tmp/execution-evidence-service-test');
  let ctx: AppContext;

  beforeAll(async () => {
    await mkdir(resolve(testDir, 'schema'), { recursive: true });
    await mkdir(resolve(testDir, 'records'), { recursive: true });
    ctx = await initializeApp(testDir, {
      schemaDir: 'schema',
      recordsDir: 'records',
      logLevel: 'silent',
    });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('enforces profile-driven approval authority across operator, supervisor, and QA roles', async () => {
    const service = new ExecutionEvidenceService(ctx);

    await seedRun(ctx, {
      plannedRunId: 'PLR-AUTH-OP',
      robotPlanId: 'RP-AUTH-OP',
      executionRunId: 'EXR-AUTH-OP',
    }, 'run-operator');
    await seedRun(ctx, {
      plannedRunId: 'PLR-AUTH-SUP',
      robotPlanId: 'RP-AUTH-SUP',
      executionRunId: 'EXR-AUTH-SUP',
    }, 'supervisor');
    await seedRun(ctx, {
      plannedRunId: 'PLR-AUTH-QA',
      robotPlanId: 'RP-AUTH-QA',
      executionRunId: 'EXR-AUTH-QA',
    }, 'qa-reviewer');

    await expect(service.recordRemediationDecision('EXR-AUTH-OP', {
      remediation: { code: 'manual-backend', stepId: 'step-1' },
      decision: 'accepted',
      actor: { actorId: 'operator-1', role: 'run-operator' },
      rationale: 'Operator can accept under this run profile',
    })).resolves.toMatchObject({ recordId: expect.stringMatching(/^ERD-\d{6}$/) });

    await expect(service.recordRemediationDecision('EXR-AUTH-SUP', {
      remediation: { code: 'manual-backend', stepId: 'step-1' },
      decision: 'accepted',
      actor: { actorId: 'operator-2', role: 'run-operator' },
      rationale: 'Operator should be blocked under supervisor policy',
    })).rejects.toThrow(/requires supervisor authority/i);

    await expect(service.recordRemediationDecision('EXR-AUTH-SUP', {
      remediation: { code: 'manual-backend', stepId: 'step-1' },
      decision: 'accepted',
      actor: { actorId: 'supervisor-1', role: 'supervisor' },
      rationale: 'Supervisor can accept under this run profile',
    })).resolves.toMatchObject({ recordId: expect.stringMatching(/^ERD-\d{6}$/) });

    await expect(service.recordRemediationDecision('EXR-AUTH-QA', {
      remediation: { code: 'manual-backend', stepId: 'step-1' },
      decision: 'accepted',
      actor: { actorId: 'supervisor-2', role: 'supervisor' },
      rationale: 'Supervisor should be blocked under QA policy',
    })).rejects.toThrow(/requires qa-reviewer authority/i);

    await expect(service.recordRemediationDecision('EXR-AUTH-QA', {
      remediation: { code: 'manual-backend', stepId: 'step-1' },
      decision: 'accepted',
      actor: { actorId: 'qa-1', role: 'qa-reviewer' },
      rationale: 'QA can accept under this run profile',
    })).resolves.toMatchObject({ recordId: expect.stringMatching(/^ERD-\d{6}$/) });
  });

  it('records remediation, deviation, and observation as append-only evidence without mutating compiled intent', async () => {
    await seedRun(ctx, {
      plannedRunId: 'PLR-EVID-001',
      robotPlanId: 'RP-EVID-001',
      executionRunId: 'EXR-EVID-001',
    }, 'supervisor');

    const service = new ExecutionEvidenceService(ctx);
    const before = await ctx.store.get('PLR-EVID-001');
    const beforeCompilation = JSON.stringify((before?.payload as { protocolCompilation?: unknown }).protocolCompilation);

    const decision = await service.recordRemediationDecision('EXR-EVID-001', {
      remediation: { code: 'manual-backend', stepId: 'step-1' },
      decision: 'accepted',
      actor: { actorId: 'supervisor-7', role: 'supervisor' },
      rationale: 'Switch to manual backend after runtime review',
      acceptedDiff: {
        stepId: 'step-1',
        target: 'protocol-step',
        path: '/selectedBackendId',
        op: 'replace',
        previousValue: 'backend-a',
        value: 'manual-backend',
      },
    });

    const deviation = await service.recordDeviation('EXR-EVID-001', {
      deviationType: 'remediation',
      actor: { actorId: 'supervisor-7', role: 'supervisor' },
      rationale: 'Accepted backend override for execution',
      remediationDecisionId: decision.recordId,
    });

    const observation = await service.recordObservation('EXR-EVID-001', {
      observationType: 'step-outcome',
      actor: { actorId: 'operator-9', role: 'run-operator' },
      deviationId: deviation.recordId,
      observedOutcome: {
        stepId: 'step-1',
        outcomeCode: 'completed-with-manual-backend',
        status: 'completed',
        details: {
          backendId: 'manual-backend',
          note: 'Completed after supervisor-approved override',
        },
      },
    });

    expect(decision.recordId).toMatch(/^ERD-\d{6}$/);
    expect(deviation.recordId).toMatch(/^EXD-\d{6}$/);
    expect(observation.recordId).toMatch(/^EXO-\d{6}$/);

    const evidence = await service.listExecutionEvidence('EXR-EVID-001');
    expect(evidence.total).toBe(3);
    expect(evidence.remediationDecisions).toHaveLength(1);
    expect(evidence.deviations).toHaveLength(1);
    expect(evidence.observations).toHaveLength(1);
    expect(evidence.remediationDecisions[0]?.acceptedDiff?.path).toBe('/selectedBackendId');
    expect(evidence.deviations[0]?.remediationDecisionRef?.id).toBe(decision.recordId);
    expect(evidence.observations[0]?.deviationRef?.id).toBe(deviation.recordId);

    const after = await ctx.store.get('PLR-EVID-001');
    const afterCompilation = JSON.stringify((after?.payload as { protocolCompilation?: unknown }).protocolCompilation);
    expect(afterCompilation).toBe(beforeCompilation);

    const reality = await service.getExecutionReality('EXR-EVID-001');
    expect(reality.compiledIntent.protocolSteps).toHaveLength(1);
    expect(reality.acceptedDiffs).toHaveLength(1);
    expect(reality.observations).toHaveLength(1);
    expect(reality.stepStates[0]?.stepId).toBe('step-1');
    expect(reality.stepStates[0]?.acceptedDiffs[0]?.value).toBe('manual-backend');
    expect(reality.stepStates[0]?.observedOutcomes[0]?.outcomeCode).toBe('completed-with-manual-backend');
  });
});
