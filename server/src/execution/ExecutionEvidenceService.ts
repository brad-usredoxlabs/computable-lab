import type { AppContext } from '../server.js';
import { PolicyProfileService } from '../policy/PolicyProfileService.js';
import type { ActivePolicyScope, ApprovalAuthority, PolicyProfile, ResolvedPolicyProfile } from '../policy/types.js';
import { ExecutionError } from './ExecutionOrchestrator.js';

const EXECUTION_REMEDIATION_DECISION_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/execution-remediation-decision.schema.yaml';
const EXECUTION_DEVIATION_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/execution-deviation.schema.yaml';
const EXECUTION_OBSERVATION_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/execution-observation.schema.yaml';

type RecordRef = {
  kind: 'record';
  id: string;
  type: string;
};

type ExecutionRunPayload = {
  kind?: string;
  recordId?: string;
  robotPlanRef?: RecordRef;
  plannedRunRef?: RecordRef;
};

type PlannedRunPayload = {
  kind?: string;
  recordId?: string;
  protocolCompilation?: {
    remediationOptions?: unknown[];
    steps?: unknown[];
    activePolicy?: {
      scope?: unknown;
      profiles?: unknown;
      settings?: Record<string, unknown>;
    };
  };
};

type RobotPlanPayload = {
  kind?: string;
  id?: string;
  plannedRunRef?: RecordRef;
  executionSteps?: unknown[];
};

type RemediationLookup = {
  code: string;
  stepId: string;
  action?: string;
};

type EvidenceCreateResult = {
  recordId: string;
};

type PlanContext = {
  executionRunId: string;
  run: ExecutionRunPayload;
  plannedRunId: string;
  plannedRun: PlannedRunPayload;
  robotPlanId: string;
  robotPlan: RobotPlanPayload;
  resolvedPolicy: ResolvedPolicyProfile;
  approvalAuthority: ExecutionApprovalAuthority;
  activePolicy: ExecutionActivePolicy;
};

export type ExecutionActorRole = 'run-operator' | 'supervisor' | 'qa-reviewer' | 'system';

export type ExecutionApprovalAuthority = ApprovalAuthority | 'system';

export type ExecutionDiffOperation = 'add' | 'replace' | 'remove' | 'annotate';

export type ExecutionDiffTarget = 'protocol-step' | 'robot-step' | 'run';

export interface ExecutionEvidenceActor {
  actorId: string;
  role: ExecutionActorRole;
  displayName?: string;
}

export interface ExecutionIntentSnapshot {
  stepId?: string;
  source: 'protocol-compilation' | 'robot-plan' | 'run';
  snapshot: Record<string, unknown>;
}

export interface ExecutionDiff {
  stepId?: string;
  target: ExecutionDiffTarget;
  path: string;
  op: ExecutionDiffOperation;
  previousValue?: unknown;
  value?: unknown;
  note?: string;
}

export interface ExecutionObservedOutcome {
  stepId?: string;
  outcomeCode: string;
  status?: string;
  details?: Record<string, unknown>;
}

export interface ExecutionActivePolicy {
  scope: ActivePolicyScope;
  profileIds: string[];
  approvalAuthority: ExecutionApprovalAuthority;
  originProfileId: string;
  settings: Record<string, unknown>;
}

export interface ProposedRemediation {
  code: string;
  stepId: string;
  action: string;
  disposition?: string;
  message?: string;
  authority?: string;
  backendId?: string;
  equipmentRef?: RecordRef;
}

export interface ExecutionRemediationDecisionPayload {
  kind: 'execution-remediation-decision';
  recordId: string;
  executionRunRef: RecordRef;
  plannedRunRef: RecordRef;
  robotPlanRef: RecordRef;
  decision: 'accepted' | 'rejected';
  proposedRemediation: ProposedRemediation;
  acceptedDiff?: ExecutionDiff;
  actor: ExecutionEvidenceActor;
  authority: ExecutionApprovalAuthority;
  rationale: string;
  decidedAt: string;
  activePolicy: ExecutionActivePolicy;
}

export interface ExecutionDeviationPayload {
  kind: 'execution-deviation';
  recordId: string;
  executionRunRef: RecordRef;
  plannedRunRef: RecordRef;
  robotPlanRef: RecordRef;
  deviationType: 'remediation' | 'operator' | 'runtime';
  status: 'accepted' | 'observed';
  compiledIntent: ExecutionIntentSnapshot;
  diff: ExecutionDiff;
  actor: ExecutionEvidenceActor;
  authority: ExecutionApprovalAuthority;
  rationale: string;
  recordedAt: string;
  remediationDecisionRef?: RecordRef;
  activePolicy: ExecutionActivePolicy;
}

export interface ExecutionObservationPayload {
  kind: 'execution-observation';
  recordId: string;
  executionRunRef: RecordRef;
  plannedRunRef: RecordRef;
  robotPlanRef: RecordRef;
  observationType: 'step-outcome' | 'runtime-note' | 'measurement';
  compiledIntent?: ExecutionIntentSnapshot;
  observedOutcome: ExecutionObservedOutcome;
  actor: ExecutionEvidenceActor;
  recordedAt: string;
  deviationRef?: RecordRef;
}

export interface RecordRemediationDecisionInput {
  remediation: RemediationLookup;
  decision: 'accepted' | 'rejected';
  actor: ExecutionEvidenceActor;
  rationale: string;
  decidedAt?: string;
  acceptedDiff?: Partial<ExecutionDiff>;
}

export interface RecordDeviationInput {
  deviationType: 'remediation' | 'operator' | 'runtime';
  actor: ExecutionEvidenceActor;
  rationale: string;
  status?: 'accepted' | 'observed';
  stepId?: string;
  recordedAt?: string;
  remediationDecisionId?: string;
  diff?: Partial<ExecutionDiff>;
}

export interface RecordObservationInput {
  observationType: 'step-outcome' | 'runtime-note' | 'measurement';
  actor: ExecutionEvidenceActor;
  observedOutcome: ExecutionObservedOutcome;
  recordedAt?: string;
  stepId?: string;
  deviationId?: string;
}

function parseSuffixNumber(id: string, prefix: string): number | null {
  if (!id.startsWith(`${prefix}-`)) return null;
  const suffix = id.slice(prefix.length + 1);
  if (!/^\d+$/.test(suffix)) return null;
  return Number.parseInt(suffix, 10);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeApprovalAuthority(value: unknown): ExecutionApprovalAuthority | undefined {
  switch (value) {
    case 'none':
    case 'run-operator':
    case 'supervisor':
    case 'project-owner':
    case 'lab-manager':
    case 'qa-reviewer':
    case 'organization-admin':
    case 'system':
      return value;
    default:
      return undefined;
  }
}

function authorityRoles(authority: ExecutionApprovalAuthority): ExecutionActorRole[] {
  switch (authority) {
    case 'none':
      return ['run-operator', 'supervisor', 'qa-reviewer', 'system'];
    case 'run-operator':
      return ['run-operator', 'supervisor', 'qa-reviewer', 'system'];
    case 'supervisor':
    case 'project-owner':
    case 'lab-manager':
      return ['supervisor', 'qa-reviewer', 'system'];
    case 'qa-reviewer':
    case 'organization-admin':
      return ['qa-reviewer', 'system'];
    case 'system':
      return ['system'];
  }
}

function normalizeActor(actor: ExecutionEvidenceActor): ExecutionEvidenceActor {
  const actorId = actor.actorId.trim();
  if (!actorId) {
    throw new ExecutionError('BAD_REQUEST', 'actor.actorId is required', 400);
  }
  return {
    actorId,
    role: actor.role,
    ...(actor.displayName ? { displayName: actor.displayName.trim() } : {}),
  };
}

function normalizeRationale(rationale: string): string {
  const normalized = rationale.trim();
  if (!normalized) {
    throw new ExecutionError('BAD_REQUEST', 'rationale is required', 400);
  }
  return normalized;
}

function stepIdFromDiff(diff: Partial<ExecutionDiff> | undefined): string | undefined {
  return asString(diff?.stepId);
}

export class ExecutionEvidenceService {
  private readonly ctx: AppContext;
  private readonly policyProfiles = new PolicyProfileService();

  constructor(ctx: AppContext) {
    this.ctx = ctx;
  }

  private async nextRecordId(prefix: string, kind: string): Promise<string> {
    const records = await this.ctx.store.list({ kind, limit: 5000 });
    let max = 0;
    for (const envelope of records) {
      const n = parseSuffixNumber(envelope.recordId, prefix);
      if (n !== null && n > max) max = n;
    }
    return `${prefix}-${String(max + 1).padStart(6, '0')}`;
  }

  private async getRunPayload(executionRunId: string): Promise<ExecutionRunPayload> {
    const envelope = await this.ctx.store.get(executionRunId);
    if (!envelope) {
      throw new ExecutionError('NOT_FOUND', `Execution run not found: ${executionRunId}`, 404);
    }
    const payload = envelope.payload as ExecutionRunPayload;
    if (payload.kind !== 'execution-run') {
      throw new ExecutionError('BAD_REQUEST', `${executionRunId} is not an execution-run`, 400);
    }
    return payload;
  }

  private async getPlanContext(executionRunId: string): Promise<PlanContext> {
    const run = await this.getRunPayload(executionRunId);
    const robotPlanId = run.robotPlanRef?.id;
    if (!robotPlanId) {
      throw new ExecutionError('BAD_REQUEST', `Execution run ${executionRunId} missing robotPlanRef.id`, 400);
    }

    const robotPlanEnvelope = await this.ctx.store.get(robotPlanId);
    if (!robotPlanEnvelope) {
      throw new ExecutionError('NOT_FOUND', `Robot plan not found: ${robotPlanId}`, 404);
    }
    const robotPlan = robotPlanEnvelope.payload as RobotPlanPayload;
    if (robotPlan.kind !== 'robot-plan') {
      throw new ExecutionError('BAD_REQUEST', `${robotPlanId} is not a robot-plan`, 400);
    }

    const plannedRunId = run.plannedRunRef?.id ?? robotPlan.plannedRunRef?.id;
    if (!plannedRunId) {
      throw new ExecutionError('BAD_REQUEST', `Execution run ${executionRunId} missing plannedRunRef.id`, 400);
    }

    const plannedRunEnvelope = await this.ctx.store.get(plannedRunId);
    if (!plannedRunEnvelope) {
      throw new ExecutionError('NOT_FOUND', `Planned run not found: ${plannedRunId}`, 404);
    }
    const plannedRun = plannedRunEnvelope.payload as PlannedRunPayload;
    if (plannedRun.kind !== 'planned-run') {
      throw new ExecutionError('BAD_REQUEST', `${plannedRunId} is not a planned-run`, 400);
    }

    const activePolicySnapshot = asRecord(plannedRun.protocolCompilation?.activePolicy);
    const rawScope = asRecord(activePolicySnapshot?.['scope']);
    const labId = asString(rawScope?.['labId']);
    const projectId = asString(rawScope?.['projectId']);
    const runId = asString(rawScope?.['runId']) ?? executionRunId;
    const scope: ActivePolicyScope = {
      organizationId: asString(rawScope?.['organizationId']) ?? 'default-org',
      ...(labId ? { labId } : {}),
      ...(projectId ? { projectId } : {}),
      runId,
    };
    const profiles = asArray(activePolicySnapshot?.['profiles']) as PolicyProfile[];
    const resolvedPolicy = this.policyProfiles.resolveActiveProfile(profiles, scope);
    const snapshotSettings = asRecord(activePolicySnapshot?.['settings']);
    const approvalAuthority = normalizeApprovalAuthority(snapshotSettings?.['approvalAuthority'])
      ?? normalizeApprovalAuthority(resolvedPolicy.settings.approvalAuthority)
      ?? 'project-owner';

    return {
      executionRunId,
      run,
      plannedRunId,
      plannedRun,
      robotPlanId,
      robotPlan,
      resolvedPolicy,
      approvalAuthority,
      activePolicy: {
        scope,
        profileIds: resolvedPolicy.profiles.map((profile) => profile.id),
        approvalAuthority,
        originProfileId: profiles.length > 0
          ? resolvedPolicy.origins.approvalAuthority.profileId
          : normalizeApprovalAuthority(snapshotSettings?.['approvalAuthority'])
            ? 'planned-run-active-policy'
            : resolvedPolicy.origins.approvalAuthority.profileId,
        settings: {
          ...resolvedPolicy.settings,
          ...(snapshotSettings ?? {}),
          approvalAuthority,
        },
      },
    };
  }

  private assertAuthority(actor: ExecutionEvidenceActor, authority: ExecutionApprovalAuthority): void {
    if (!authorityRoles(authority).includes(actor.role)) {
      throw new ExecutionError(
        'FORBIDDEN',
        `Active policy requires ${authority} authority, but actor role ${actor.role} cannot approve this evidence`,
        403,
      );
    }
  }

  private buildIntentSnapshot(stepId: string | undefined, context: PlanContext): ExecutionIntentSnapshot {
    if (!stepId) {
      return {
        source: 'run',
        snapshot: {
          plannedRunId: context.plannedRunId,
          robotPlanId: context.robotPlanId,
        },
      };
    }

    const protocolStep = asArray(context.plannedRun.protocolCompilation?.steps)
      .map((step) => asRecord(step))
      .find((step) => asString(step?.['stepId']) === stepId);
    const executionSteps = asArray(context.robotPlan.executionSteps)
      .map((step) => asRecord(step))
      .filter((step) => asString(step?.['stepId']) === stepId || asString(step?.['sourceStepRef']) === stepId)
      .filter((step): step is Record<string, unknown> => step !== undefined);

    if (protocolStep) {
      return {
        stepId,
        source: 'protocol-compilation',
        snapshot: {
          protocolStep,
          ...(executionSteps.length > 0 ? { executionSteps } : {}),
        },
      };
    }

    if (executionSteps.length > 0) {
      return {
        stepId,
        source: 'robot-plan',
        snapshot: { executionSteps },
      };
    }

    return {
      stepId,
      source: 'run',
      snapshot: {
        plannedRunId: context.plannedRunId,
        robotPlanId: context.robotPlanId,
      },
    };
  }

  private findRemediation(context: PlanContext, lookup: RemediationLookup): ProposedRemediation {
    const candidate = asArray(context.plannedRun.protocolCompilation?.remediationOptions)
      .map((item) => asRecord(item))
      .find((item) =>
        asString(item?.['code']) === lookup.code
        && asString(item?.['stepId']) === lookup.stepId
        && (lookup.action ? asString(item?.['action']) === lookup.action : true),
      );

    if (!candidate) {
      throw new ExecutionError(
        'NOT_FOUND',
        `No remediation option ${lookup.code} for step ${lookup.stepId} on planned run ${context.plannedRunId}`,
        404,
      );
    }

    const action = asString(candidate['action']);
    if (!action) {
      throw new ExecutionError('BAD_REQUEST', `Remediation option ${lookup.code} is missing action`, 400);
    }

    const disposition = asString(candidate['disposition']);
    const message = asString(candidate['message']);
    const authority = asString(candidate['authority']);
    const backendId = asString(candidate['backendId']);
    const equipmentRef = candidate['equipmentRef'] ? candidate['equipmentRef'] as RecordRef : undefined;

    return {
      code: lookup.code,
      stepId: lookup.stepId,
      action,
      ...(disposition ? { disposition } : {}),
      ...(message ? { message } : {}),
      ...(authority ? { authority } : {}),
      ...(backendId ? { backendId } : {}),
      ...(equipmentRef ? { equipmentRef } : {}),
    };
  }

  private normalizeDiff(
    diff: Partial<ExecutionDiff> | undefined,
    stepId: string | undefined,
    proposedRemediation?: ProposedRemediation,
  ): ExecutionDiff {
    if (!diff && !proposedRemediation) {
      throw new ExecutionError('BAD_REQUEST', 'A diff or accepted remediation is required to record a deviation', 400);
    }

    if (!diff) {
      const value: Record<string, unknown> = {
        ...(proposedRemediation?.action ? { action: proposedRemediation.action } : {}),
        ...(proposedRemediation?.backendId ? { backendId: proposedRemediation.backendId } : {}),
        ...(proposedRemediation?.equipmentRef ? { equipmentRef: proposedRemediation.equipmentRef } : {}),
      };
      return {
        ...(stepId ? { stepId } : {}),
        target: 'protocol-step',
        path: `/protocolCompilation/steps/${stepId ?? 'run'}`,
        op: 'annotate',
        value,
        note: 'Accepted remediation applied to compiled intent',
      };
    }

    const path = asString(diff.path);
    if (!path) {
      throw new ExecutionError('BAD_REQUEST', 'diff.path is required', 400);
    }

    const op = diff.op ?? 'annotate';
    const target = diff.target ?? (stepId ? 'protocol-step' : 'run');
    const note = asString(diff.note);

    return {
      ...(stepId ? { stepId } : {}),
      target,
      path,
      op,
      ...(diff.previousValue !== undefined ? { previousValue: diff.previousValue } : {}),
      ...(diff.value !== undefined ? { value: diff.value } : {}),
      ...(note ? { note } : {}),
    };
  }

  private async createRecord(recordId: string, schemaId: string, payload: unknown, message: string): Promise<void> {
    const result = await this.ctx.store.create({
      envelope: {
        recordId,
        schemaId,
        payload,
      },
      message,
      skipValidation: true,
      skipLint: true,
    });

    if (!result.success) {
      throw new ExecutionError('CREATE_FAILED', result.error ?? `Failed to create ${recordId}`, 400);
    }
  }

  private async getRemediationDecision(recordId: string): Promise<ExecutionRemediationDecisionPayload> {
    const envelope = await this.ctx.store.get(recordId);
    if (!envelope) {
      throw new ExecutionError('NOT_FOUND', `Remediation decision not found: ${recordId}`, 404);
    }
    const payload = envelope.payload as ExecutionRemediationDecisionPayload;
    if (payload.kind !== 'execution-remediation-decision') {
      throw new ExecutionError('BAD_REQUEST', `${recordId} is not an execution-remediation-decision`, 400);
    }
    return payload;
  }

  private async getDeviation(recordId: string): Promise<ExecutionDeviationPayload> {
    const envelope = await this.ctx.store.get(recordId);
    if (!envelope) {
      throw new ExecutionError('NOT_FOUND', `Deviation not found: ${recordId}`, 404);
    }
    const payload = envelope.payload as ExecutionDeviationPayload;
    if (payload.kind !== 'execution-deviation') {
      throw new ExecutionError('BAD_REQUEST', `${recordId} is not an execution-deviation`, 400);
    }
    return payload;
  }

  async recordRemediationDecision(executionRunId: string, input: RecordRemediationDecisionInput): Promise<EvidenceCreateResult> {
    const context = await this.getPlanContext(executionRunId);
    const actor = normalizeActor(input.actor);
    const rationale = normalizeRationale(input.rationale);
    this.assertAuthority(actor, context.approvalAuthority);

    const proposedRemediation = this.findRemediation(context, input.remediation);
    const stepId = proposedRemediation.stepId;
    const acceptedDiff = input.decision === 'accepted'
      ? this.normalizeDiff(input.acceptedDiff, stepId, proposedRemediation)
      : undefined;

    const recordId = await this.nextRecordId('ERD', 'execution-remediation-decision');
    const payload: ExecutionRemediationDecisionPayload = {
      kind: 'execution-remediation-decision',
      recordId,
      executionRunRef: { kind: 'record', id: executionRunId, type: 'execution-run' },
      plannedRunRef: { kind: 'record', id: context.plannedRunId, type: 'planned-run' },
      robotPlanRef: { kind: 'record', id: context.robotPlanId, type: 'robot-plan' },
      decision: input.decision,
      proposedRemediation,
      ...(acceptedDiff ? { acceptedDiff } : {}),
      actor,
      authority: context.approvalAuthority,
      rationale,
      decidedAt: input.decidedAt ?? new Date().toISOString(),
      activePolicy: context.activePolicy,
    };

    await this.createRecord(
      recordId,
      EXECUTION_REMEDIATION_DECISION_SCHEMA_ID,
      payload,
      `Record remediation decision ${recordId} for ${executionRunId}`,
    );

    return { recordId };
  }

  async recordDeviation(executionRunId: string, input: RecordDeviationInput): Promise<EvidenceCreateResult> {
    const context = await this.getPlanContext(executionRunId);
    const actor = normalizeActor(input.actor);
    const rationale = normalizeRationale(input.rationale);
    const status = input.status ?? 'accepted';
    if (status === 'accepted') {
      this.assertAuthority(actor, context.approvalAuthority);
    }

    const remediationDecision = input.remediationDecisionId
      ? await this.getRemediationDecision(input.remediationDecisionId)
      : undefined;
    const stepId = asString(input.stepId)
      ?? stepIdFromDiff(input.diff)
      ?? remediationDecision?.proposedRemediation.stepId;
    const diff = this.normalizeDiff(input.diff ?? remediationDecision?.acceptedDiff, stepId, remediationDecision?.proposedRemediation);

    const recordId = await this.nextRecordId('EXD', 'execution-deviation');
    const payload: ExecutionDeviationPayload = {
      kind: 'execution-deviation',
      recordId,
      executionRunRef: { kind: 'record', id: executionRunId, type: 'execution-run' },
      plannedRunRef: { kind: 'record', id: context.plannedRunId, type: 'planned-run' },
      robotPlanRef: { kind: 'record', id: context.robotPlanId, type: 'robot-plan' },
      deviationType: input.deviationType,
      status,
      compiledIntent: this.buildIntentSnapshot(stepId, context),
      diff,
      actor,
      authority: context.approvalAuthority,
      rationale,
      recordedAt: input.recordedAt ?? new Date().toISOString(),
      ...(remediationDecision ? {
        remediationDecisionRef: { kind: 'record', id: remediationDecision.recordId, type: 'execution-remediation-decision' },
      } : {}),
      activePolicy: context.activePolicy,
    };

    await this.createRecord(
      recordId,
      EXECUTION_DEVIATION_SCHEMA_ID,
      payload,
      `Record execution deviation ${recordId} for ${executionRunId}`,
    );

    return { recordId };
  }

  async recordObservation(executionRunId: string, input: RecordObservationInput): Promise<EvidenceCreateResult> {
    const context = await this.getPlanContext(executionRunId);
    const actor = normalizeActor(input.actor);
    const outcomeCode = input.observedOutcome.outcomeCode.trim();
    if (!outcomeCode) {
      throw new ExecutionError('BAD_REQUEST', 'observedOutcome.outcomeCode is required', 400);
    }

    const deviation = input.deviationId ? await this.getDeviation(input.deviationId) : undefined;
    const stepId = asString(input.stepId) ?? input.observedOutcome.stepId ?? deviation?.compiledIntent.stepId;
    const recordId = await this.nextRecordId('EXO', 'execution-observation');
    const payload: ExecutionObservationPayload = {
      kind: 'execution-observation',
      recordId,
      executionRunRef: { kind: 'record', id: executionRunId, type: 'execution-run' },
      plannedRunRef: { kind: 'record', id: context.plannedRunId, type: 'planned-run' },
      robotPlanRef: { kind: 'record', id: context.robotPlanId, type: 'robot-plan' },
      observationType: input.observationType,
      ...(stepId || deviation ? { compiledIntent: deviation?.compiledIntent ?? this.buildIntentSnapshot(stepId, context) } : {}),
      observedOutcome: {
        ...(stepId ? { stepId } : {}),
        outcomeCode,
        ...(input.observedOutcome.status ? { status: input.observedOutcome.status } : {}),
        ...(input.observedOutcome.details ? { details: input.observedOutcome.details } : {}),
      },
      actor,
      recordedAt: input.recordedAt ?? new Date().toISOString(),
      ...(deviation ? { deviationRef: { kind: 'record', id: deviation.recordId, type: 'execution-deviation' } } : {}),
    };

    await this.createRecord(
      recordId,
      EXECUTION_OBSERVATION_SCHEMA_ID,
      payload,
      `Record execution observation ${recordId} for ${executionRunId}`,
    );

    return { recordId };
  }

  async listExecutionEvidence(executionRunId: string): Promise<{
    remediationDecisions: ExecutionRemediationDecisionPayload[];
    deviations: ExecutionDeviationPayload[];
    observations: ExecutionObservationPayload[];
    total: number;
  }> {
    const decisions = (await this.ctx.store.list({ kind: 'execution-remediation-decision', limit: 5000 }))
      .map((env) => env.payload as ExecutionRemediationDecisionPayload)
      .filter((payload) => payload.executionRunRef?.id === executionRunId)
      .sort((left, right) => left.decidedAt.localeCompare(right.decidedAt) || left.recordId.localeCompare(right.recordId));

    const deviations = (await this.ctx.store.list({ kind: 'execution-deviation', limit: 5000 }))
      .map((env) => env.payload as ExecutionDeviationPayload)
      .filter((payload) => payload.executionRunRef?.id === executionRunId)
      .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt) || left.recordId.localeCompare(right.recordId));

    const observations = (await this.ctx.store.list({ kind: 'execution-observation', limit: 5000 }))
      .map((env) => env.payload as ExecutionObservationPayload)
      .filter((payload) => payload.executionRunRef?.id === executionRunId)
      .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt) || left.recordId.localeCompare(right.recordId));

    return {
      remediationDecisions: decisions,
      deviations,
      observations,
      total: decisions.length + deviations.length + observations.length,
    };
  }

  async getExecutionReality(executionRunId: string): Promise<{
    executionRunId: string;
    plannedRunId: string;
    robotPlanId: string;
    compiledIntent: {
      protocolSteps: unknown[];
      executionSteps: unknown[];
    };
    remediationDecisions: ExecutionRemediationDecisionPayload[];
    acceptedDiffs: ExecutionDeviationPayload[];
    observations: ExecutionObservationPayload[];
    stepStates: Array<{
      stepId: string;
      intendedProtocolStep?: Record<string, unknown>;
      intendedExecutionSteps: Record<string, unknown>[];
      acceptedDiffs: ExecutionDiff[];
      observedOutcomes: ExecutionObservedOutcome[];
    }>;
  }> {
    const context = await this.getPlanContext(executionRunId);
    const evidence = await this.listExecutionEvidence(executionRunId);
    const protocolSteps = asArray(context.plannedRun.protocolCompilation?.steps)
      .map((step) => asRecord(step))
      .filter((step): step is Record<string, unknown> => step !== undefined);
    const executionSteps = asArray(context.robotPlan.executionSteps)
      .map((step) => asRecord(step))
      .filter((step): step is Record<string, unknown> => step !== undefined);

    const stepIds = new Set<string>();
    for (const step of protocolSteps) {
      const stepId = asString(step['stepId']);
      if (stepId) stepIds.add(stepId);
    }
    for (const step of executionSteps) {
      const stepId = asString(step['sourceStepRef']) ?? asString(step['stepId']);
      if (stepId) stepIds.add(stepId);
    }
    for (const deviation of evidence.deviations) {
      const stepId = deviation.compiledIntent.stepId ?? deviation.diff.stepId;
      if (stepId) stepIds.add(stepId);
    }
    for (const observation of evidence.observations) {
      const stepId = observation.compiledIntent?.stepId ?? observation.observedOutcome.stepId;
      if (stepId) stepIds.add(stepId);
    }

    const stepStates = [...stepIds]
      .sort((left, right) => left.localeCompare(right))
      .map((stepId) => {
        const intendedProtocolStep = protocolSteps.find((step) => asString(step['stepId']) === stepId);
        return {
          stepId,
          ...(intendedProtocolStep ? { intendedProtocolStep } : {}),
          intendedExecutionSteps: executionSteps.filter((step) => {
          const sourceStepRef = asString(step['sourceStepRef']);
          const executionStepId = asString(step['stepId']);
          return sourceStepRef === stepId || executionStepId === stepId;
          }),
          acceptedDiffs: evidence.deviations
            .filter((deviation) => deviation.status === 'accepted')
            .filter((deviation) => deviation.compiledIntent.stepId === stepId || deviation.diff.stepId === stepId)
            .map((deviation) => deviation.diff),
          observedOutcomes: evidence.observations
            .filter((observation) => observation.compiledIntent?.stepId === stepId || observation.observedOutcome.stepId === stepId)
            .map((observation) => observation.observedOutcome),
        };
      });

    return {
      executionRunId,
      plannedRunId: context.plannedRunId,
      robotPlanId: context.robotPlanId,
      compiledIntent: {
        protocolSteps,
        executionSteps,
      },
      remediationDecisions: evidence.remediationDecisions,
      acceptedDiffs: evidence.deviations.filter((deviation) => deviation.status === 'accepted'),
      observations: evidence.observations,
      stepStates,
    };
  }
}
