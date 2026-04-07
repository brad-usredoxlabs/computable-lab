import type { AppContext } from '../server.js';
import { ExecutionError } from './ExecutionOrchestrator.js';

const EXECUTION_TASK_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/execution-task.schema.yaml';
const EXECUTION_RUN_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/execution-run.schema.yaml';
const INSTRUMENT_LOG_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/instrument-log.schema.yaml';

export type ExecutionTaskStatus =
  | 'queued'
  | 'claimed'
  | 'running'
  | 'cancel_requested'
  | 'completed'
  | 'failed'
  | 'canceled';

export type TargetPlatform = 'integra_assist' | 'opentrons_ot2' | 'opentrons_flex';

type Ref = { kind: 'record'; id: string; type?: string };

type RobotPlanPayload = {
  kind?: string;
  id?: string;
  targetPlatform?: TargetPlatform;
  plannedRunRef?: { kind?: string; id?: string };
  artifacts?: Array<{ role?: string; fileRef?: { uri?: string; mimeType?: string; label?: string } }>;
};

type ExecutionRunPayload = {
  kind?: string;
  recordId?: string;
  robotPlanRef?: { id?: string };
  plannedRunRef?: { id?: string };
  parentExecutionRunRef?: { id?: string };
  attempt?: number;
  status?: 'running' | 'completed' | 'failed' | 'canceled';
  mode?: string;
  startedAt?: string;
  completedAt?: string;
  externalRunId?: string;
  externalProtocolId?: string;
  lastStatusRaw?: string;
  failureClass?: 'transient' | 'terminal' | 'unknown';
  retryRecommended?: boolean;
  failureCode?: string;
  retryReason?: string;
  notes?: string;
};

export type ExecutionTaskPayload = {
  kind: 'execution-task';
  recordId: string;
  executionRunRef: Ref;
  robotPlanRef: Ref;
  plannedRunRef?: Ref;
  adapterId: string;
  targetPlatform: TargetPlatform;
  status: ExecutionTaskStatus;
  runtimeParameters?: Record<string, unknown>;
  contractVersion: string;
  artifactRefs?: Array<{ role: string; uri: string; mimeType?: string; label?: string }>;
  executorId?: string;
  claimedAt?: string;
  leaseDurationMs?: number;
  leaseExpiresAt?: string;
  lastHeartbeatAt?: string;
  lastSequence?: number;
  progress?: Record<string, unknown>;
  failure?: { code?: string; class?: 'transient' | 'terminal' | 'unknown'; message?: string };
  external?: { runId?: string; protocolId?: string; rawStatus?: string };
  startedAt?: string;
  completedAt?: string;
  artifacts?: Array<{ role: string; uri: string; sha256?: string; mimeType?: string }>;
  measurements?: Array<Record<string, unknown>>;
  updatedAt: string;
  createdAt: string;
};

type ClaimResultTask = {
  taskId: string;
  executionRunId: string;
  robotPlanId: string;
  adapterId: string;
  targetPlatform: TargetPlatform;
  contractVersion: string;
  runtimeParameters: Record<string, unknown>;
  artifactRefs: Array<{ role: string; uri: string; mimeType?: string; label?: string }>;
  leaseExpiresAt?: string;
};

const TERMINAL_STATUSES: ExecutionTaskStatus[] = ['completed', 'failed', 'canceled'];

const TRANSITIONS: Record<ExecutionTaskStatus, ExecutionTaskStatus[]> = {
  queued: ['claimed', 'canceled'],
  claimed: ['claimed', 'running', 'cancel_requested', 'failed', 'canceled'],
  running: ['running', 'cancel_requested', 'failed', 'completed', 'canceled'],
  cancel_requested: ['cancel_requested', 'failed', 'completed', 'canceled'],
  completed: [],
  failed: [],
  canceled: [],
};

function parseSuffixNumber(id: string, prefix: string): number | null {
  if (!id.startsWith(`${prefix}-`)) return null;
  const suffix = id.slice(prefix.length + 1);
  if (!/^\d+$/.test(suffix)) return null;
  return Number.parseInt(suffix, 10);
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeCapabilities(capabilities: string[] | undefined): Set<string> {
  return new Set((capabilities ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean));
}

function capabilityMatches(task: ExecutionTaskPayload, capabilities: Set<string>): boolean {
  if (capabilities.size === 0 || capabilities.has('*')) return true;
  return capabilities.has(task.adapterId.toLowerCase()) || capabilities.has(task.targetPlatform.toLowerCase());
}

function canTransition(from: ExecutionTaskStatus, to: ExecutionTaskStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

function mapLevelToEntryType(level: string | undefined): 'info' | 'warning' | 'error' | 'telemetry' {
  const normalized = (level ?? 'info').toLowerCase();
  if (normalized === 'error') return 'error';
  if (normalized === 'warning' || normalized === 'warn') return 'warning';
  if (normalized === 'telemetry' || normalized === 'debug') return 'telemetry';
  return 'info';
}

export class ExecutionTaskService {
  private readonly ctx: AppContext;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
  }

  async getTaskScope(taskId: string): Promise<{ adapterId: string; executorId?: string }> {
    const env = await this.getTask(taskId);
    return {
      adapterId: env.payload.adapterId,
      ...(env.payload.executorId ? { executorId: env.payload.executorId } : {}),
    };
  }

  private async nextRecordId(prefix: 'EXT' | 'EXR' | 'ILOG', kind: string): Promise<string> {
    const records = await this.ctx.store.list({ kind, limit: 5000 });
    let max = 0;
    for (const env of records) {
      const n = parseSuffixNumber(env.recordId, prefix);
      if (n !== null && n > max) max = n;
    }
    return `${prefix}-${String(max + 1).padStart(6, '0')}`;
  }

  private async getTask(taskId: string): Promise<{ recordId: string; schemaId: string; payload: ExecutionTaskPayload }> {
    const env = await this.ctx.store.get(taskId);
    if (!env) {
      throw new ExecutionError('NOT_FOUND', `Execution task not found: ${taskId}`, 404);
    }
    const payload = env.payload as ExecutionTaskPayload;
    if (payload.kind !== 'execution-task') {
      throw new ExecutionError('BAD_REQUEST', `${taskId} is not an execution-task`, 400);
    }
    return { recordId: env.recordId, schemaId: env.schemaId, payload };
  }

  private async updateTask(taskId: string, payload: ExecutionTaskPayload, message: string): Promise<void> {
    const result = await this.ctx.store.update({
      envelope: {
        recordId: taskId,
        schemaId: EXECUTION_TASK_SCHEMA_ID,
        payload,
      },
      message,
      skipValidation: true,
      skipLint: true,
    });
    if (!result.success) {
      throw new ExecutionError('UPDATE_FAILED', result.error ?? `Failed to update execution task ${taskId}`, 400);
    }
  }

  private async updateExecutionRun(executionRunId: string, patch: Record<string, unknown>, message: string): Promise<void> {
    const env = await this.ctx.store.get(executionRunId);
    if (!env) {
      throw new ExecutionError('NOT_FOUND', `Execution run not found: ${executionRunId}`, 404);
    }
    const payload = env.payload as ExecutionRunPayload;
    if (payload.kind !== 'execution-run') {
      throw new ExecutionError('BAD_REQUEST', `${executionRunId} is not an execution-run`, 400);
    }
    const result = await this.ctx.store.update({
      envelope: {
        recordId: env.recordId,
        schemaId: env.schemaId,
        payload: {
          ...(env.payload as Record<string, unknown>),
          ...patch,
        },
      },
      message,
      skipValidation: true,
      skipLint: true,
    });
    if (!result.success) {
      throw new ExecutionError('UPDATE_FAILED', result.error ?? `Failed to update execution run ${executionRunId}`, 400);
    }
  }

  private ensureOwnedByExecutor(payload: ExecutionTaskPayload, executorId: string): void {
    if (!payload.executorId) {
      throw new ExecutionError('BAD_REQUEST', `Task ${payload.recordId} has no executor ownership`, 400);
    }
    if (payload.executorId !== executorId) {
      throw new ExecutionError('FORBIDDEN', `Task ${payload.recordId} is owned by ${payload.executorId}`, 403);
    }
  }

  private ensureSequence(payload: ExecutionTaskPayload, sequence: number): { accepted: boolean; lastSequence: number } {
    if (!Number.isInteger(sequence) || sequence < 1) {
      throw new ExecutionError('BAD_REQUEST', 'sequence must be an integer >= 1', 400);
    }
    const lastSequence = Number.isInteger(payload.lastSequence) ? (payload.lastSequence as number) : 0;
    if (sequence <= lastSequence) {
      return { accepted: false, lastSequence };
    }
    return { accepted: true, lastSequence };
  }

  private mapTaskToRunStatus(status: ExecutionTaskStatus): 'running' | 'completed' | 'failed' | 'canceled' {
    if (status === 'completed') return 'completed';
    if (status === 'failed') return 'failed';
    if (status === 'canceled') return 'canceled';
    return 'running';
  }

  async createQueuedTask(input: {
    robotPlanId: string;
    runtimeParameters?: Record<string, unknown>;
    parentExecutionRunId?: string;
    contractVersion?: string;
  }): Promise<{ executionRunId: string; taskId: string }> {
    const robotPlanEnvelope = await this.ctx.store.get(input.robotPlanId);
    if (!robotPlanEnvelope) {
      throw new ExecutionError('NOT_FOUND', `Robot plan not found: ${input.robotPlanId}`, 404);
    }
    const robotPlan = robotPlanEnvelope.payload as RobotPlanPayload;
    if (robotPlan.kind !== 'robot-plan') {
      throw new ExecutionError('BAD_REQUEST', `${input.robotPlanId} is not a robot-plan`, 400);
    }
    if (!robotPlan.targetPlatform) {
      throw new ExecutionError('BAD_REQUEST', `Robot plan ${input.robotPlanId} missing targetPlatform`, 400);
    }

    const executionRunId = await this.nextRecordId('EXR', 'execution-run');
    const taskId = await this.nextRecordId('EXT', 'execution-task');
    const startedAt = nowIso();

    const existingRuns = await this.ctx.store.list({ kind: 'execution-run', limit: 5000 });
    let maxAttempt = 0;
    for (const run of existingRuns) {
      const p = run.payload as ExecutionRunPayload;
      if (p.robotPlanRef?.id !== input.robotPlanId) continue;
      const attempt = Number.isInteger(p.attempt) ? (p.attempt as number) : 1;
      if (attempt > maxAttempt) maxAttempt = attempt;
    }
    const attempt = maxAttempt + 1;

    const runPayload: Record<string, unknown> = {
      kind: 'execution-run',
      recordId: executionRunId,
      robotPlanRef: { kind: 'record', id: input.robotPlanId, type: 'robot-plan' },
      ...(robotPlan.plannedRunRef?.kind === 'record' && robotPlan.plannedRunRef.id
        ? { plannedRunRef: { kind: 'record', id: robotPlan.plannedRunRef.id, type: 'planned-run' } }
        : {}),
      ...(input.parentExecutionRunId
        ? { parentExecutionRunRef: { kind: 'record', id: input.parentExecutionRunId, type: 'execution-run' } }
        : {}),
      attempt,
      status: 'running',
      mode: 'remote_task',
      startedAt,
      notes: 'Dispatched to remote execution task queue',
    };

    const runCreate = await this.ctx.store.create({
      envelope: {
        recordId: executionRunId,
        schemaId: EXECUTION_RUN_SCHEMA_ID,
        payload: runPayload,
      },
      message: `Create execution run ${executionRunId} for queued task ${taskId}`,
      skipValidation: true,
      skipLint: true,
    });
    if (!runCreate.success) {
      throw new ExecutionError('CREATE_FAILED', runCreate.error ?? `Failed to create execution run ${executionRunId}`, 400);
    }

    const taskPayload: ExecutionTaskPayload = {
      kind: 'execution-task',
      recordId: taskId,
      executionRunRef: { kind: 'record', id: executionRunId, type: 'execution-run' },
      robotPlanRef: { kind: 'record', id: input.robotPlanId, type: 'robot-plan' },
      ...(robotPlan.plannedRunRef?.kind === 'record' && robotPlan.plannedRunRef.id
        ? { plannedRunRef: { kind: 'record', id: robotPlan.plannedRunRef.id, type: 'planned-run' } }
        : {}),
      adapterId: robotPlan.targetPlatform,
      targetPlatform: robotPlan.targetPlatform,
      status: 'queued',
      runtimeParameters: input.runtimeParameters ?? {},
      contractVersion: input.contractVersion ?? 'execution-task/v1',
      artifactRefs: (robotPlan.artifacts ?? [])
        .filter((a) => typeof a.role === 'string' && typeof a.fileRef?.uri === 'string')
        .map((a) => ({
          role: a.role as string,
          uri: a.fileRef!.uri as string,
          ...(a.fileRef?.mimeType ? { mimeType: a.fileRef.mimeType } : {}),
          ...(a.fileRef?.label ? { label: a.fileRef.label } : {}),
        })),
      lastSequence: 0,
      createdAt: startedAt,
      updatedAt: startedAt,
    };

    const taskCreate = await this.ctx.store.create({
      envelope: {
        recordId: taskId,
        schemaId: EXECUTION_TASK_SCHEMA_ID,
        payload: taskPayload,
      },
      message: `Queue execution task ${taskId} for ${input.robotPlanId}`,
      skipValidation: true,
      skipLint: true,
    });
    if (!taskCreate.success) {
      throw new ExecutionError('CREATE_FAILED', taskCreate.error ?? `Failed to create execution task ${taskId}`, 400);
    }

    return { executionRunId, taskId };
  }

  async claimTasks(input: {
    executorId: string;
    capabilities?: string[];
    maxTasks?: number;
    leaseDurationMs?: number;
  }): Promise<{ tasks: ClaimResultTask[]; claimed: number }> {
    if (!input.executorId || input.executorId.trim().length === 0) {
      throw new ExecutionError('BAD_REQUEST', 'executorId is required', 400);
    }
    const maxTasks = Math.max(1, Math.min(20, input.maxTasks ?? 1));
    const leaseDurationMs = Math.max(5_000, Math.min(300_000, input.leaseDurationMs ?? 60_000));
    const caps = normalizeCapabilities(input.capabilities);
    const all = await this.ctx.store.list({ kind: 'execution-task', limit: 5000 });
    const now = Date.now();

    const claimable = all
      .map((env) => env.payload as ExecutionTaskPayload)
      .filter((p) => p.kind === 'execution-task')
      .filter((p) => capabilityMatches(p, caps))
      .filter((p) => {
        if (p.status === 'queued') return true;
        if (p.status === 'claimed') {
          const lease = p.leaseExpiresAt ? Date.parse(p.leaseExpiresAt) : Number.NaN;
          return Number.isFinite(lease) && lease <= now;
        }
        return false;
      })
      .sort((a, b) => (a.createdAt.localeCompare(b.createdAt) || a.recordId.localeCompare(b.recordId)))
      .slice(0, maxTasks);

    const claimedTasks: ClaimResultTask[] = [];
    for (const task of claimable) {
      const nextStatus: ExecutionTaskStatus = 'claimed';
      if (!canTransition(task.status, nextStatus)) {
        continue;
      }
      const ts = nowIso();
      const next: ExecutionTaskPayload = {
        ...task,
        status: nextStatus,
        executorId: input.executorId,
        claimedAt: task.claimedAt ?? ts,
        leaseDurationMs,
        leaseExpiresAt: new Date(Date.now() + leaseDurationMs).toISOString(),
        lastHeartbeatAt: ts,
        updatedAt: ts,
      };
      await this.updateTask(task.recordId, next, `Claim execution task ${task.recordId} by ${input.executorId}`);
      claimedTasks.push({
        taskId: next.recordId,
        executionRunId: next.executionRunRef.id,
        robotPlanId: next.robotPlanRef.id,
        adapterId: next.adapterId,
        targetPlatform: next.targetPlatform,
        contractVersion: next.contractVersion,
        runtimeParameters: next.runtimeParameters ?? {},
        artifactRefs: next.artifactRefs ?? [],
        ...(next.leaseExpiresAt ? { leaseExpiresAt: next.leaseExpiresAt } : {}),
      });
    }

    return {
      tasks: claimedTasks,
      claimed: claimedTasks.length,
    };
  }

  async heartbeat(taskId: string, input: {
    executorId: string;
    sequence: number;
    status?: 'claimed' | 'running';
    progress?: Record<string, unknown>;
    at?: string;
  }): Promise<{ accepted: boolean; task: { taskId: string; status: ExecutionTaskStatus; lastSequence: number } }> {
    const env = await this.getTask(taskId);
    this.ensureOwnedByExecutor(env.payload, input.executorId);
    const seq = this.ensureSequence(env.payload, input.sequence);
    if (!seq.accepted) {
      return { accepted: false, task: { taskId, status: env.payload.status, lastSequence: seq.lastSequence } };
    }

    const requested = input.status ?? (env.payload.status === 'claimed' ? 'running' : env.payload.status);
    if (requested !== 'claimed' && requested !== 'running') {
      throw new ExecutionError('BAD_REQUEST', 'heartbeat status must be claimed or running', 400);
    }
    if (!canTransition(env.payload.status, requested)) {
      throw new ExecutionError('BAD_REQUEST', `Invalid transition ${env.payload.status} -> ${requested}`, 400);
    }

    const ts = input.at ?? nowIso();
    const leaseDurationMs = env.payload.leaseDurationMs ?? 60_000;
    const next: ExecutionTaskPayload = {
      ...env.payload,
      status: requested,
      lastSequence: input.sequence,
      lastHeartbeatAt: ts,
      leaseExpiresAt: new Date(Date.now() + leaseDurationMs).toISOString(),
      ...(input.progress ? { progress: input.progress } : {}),
      updatedAt: ts,
    };
    await this.updateTask(taskId, next, `Heartbeat for execution task ${taskId}`);

    await this.updateExecutionRun(next.executionRunRef.id, {
      status: 'running',
      ...(input.progress ? { notes: JSON.stringify(input.progress) } : {}),
    }, `Update execution run ${next.executionRunRef.id} from heartbeat`);

    return { accepted: true, task: { taskId, status: next.status, lastSequence: input.sequence } };
  }

  async appendLogs(taskId: string, input: {
    executorId: string;
    sequence: number;
    entries: Array<{
      timestamp?: string;
      level?: string;
      code?: string;
      message: string;
      data?: Record<string, unknown>;
    }>;
  }): Promise<{ accepted: boolean; logId?: string; task: { taskId: string; status: ExecutionTaskStatus; lastSequence: number } }> {
    if (!Array.isArray(input.entries) || input.entries.length === 0) {
      throw new ExecutionError('BAD_REQUEST', 'entries must contain at least one item', 400);
    }

    const env = await this.getTask(taskId);
    this.ensureOwnedByExecutor(env.payload, input.executorId);
    const seq = this.ensureSequence(env.payload, input.sequence);
    if (!seq.accepted) {
      return { accepted: false, task: { taskId, status: env.payload.status, lastSequence: seq.lastSequence } };
    }

    if (TERMINAL_STATUSES.includes(env.payload.status)) {
      throw new ExecutionError('BAD_REQUEST', `Task ${taskId} is terminal`, 400);
    }

    const next: ExecutionTaskPayload = {
      ...env.payload,
      lastSequence: input.sequence,
      updatedAt: nowIso(),
    };
    await this.updateTask(taskId, next, `Append logs for execution task ${taskId}`);

    const executionRunEnv = await this.ctx.store.get(env.payload.executionRunRef.id);
    const runPayload = executionRunEnv?.payload as ExecutionRunPayload | undefined;
    const logId = await this.nextRecordId('ILOG', 'instrument-log');
    const startedAt = input.entries[0]?.timestamp ?? nowIso();
    const completedAt = input.entries[input.entries.length - 1]?.timestamp ?? nowIso();

    const createResult = await this.ctx.store.create({
      envelope: {
        recordId: logId,
        schemaId: INSTRUMENT_LOG_SCHEMA_ID,
        payload: {
          kind: 'instrument-log',
          id: logId,
          logType: 'robot_telemetry',
          status: 'completed',
          ...(runPayload?.plannedRunRef?.id ? { plannedRunRef: { kind: 'record', id: runPayload.plannedRunRef.id, type: 'planned-run' } } : {}),
          startedAt,
          completedAt,
          entries: input.entries.map((entry) => ({
            timestamp: entry.timestamp ?? nowIso(),
            entryType: mapLevelToEntryType(entry.level),
            ...(entry.code ? { code: entry.code } : {}),
            message: entry.message,
            ...(entry.data ? { data: entry.data } : {}),
          })),
        },
      },
      message: `Append execution logs ${logId} for task ${taskId}`,
      skipValidation: true,
      skipLint: true,
    });

    if (!createResult.success) {
      throw new ExecutionError('CREATE_FAILED', createResult.error ?? `Failed to create instrument log ${logId}`, 400);
    }

    return { accepted: true, logId, task: { taskId, status: next.status, lastSequence: input.sequence } };
  }

  async updateStatus(taskId: string, input: {
    executorId: string;
    sequence: number;
    status: 'running' | 'failed' | 'completed' | 'canceled' | 'cancel_requested';
    failure?: { code?: string; class?: 'transient' | 'terminal' | 'unknown'; message?: string };
    external?: { runId?: string; protocolId?: string; rawStatus?: string };
    at?: string;
  }): Promise<{ accepted: boolean; task: { taskId: string; status: ExecutionTaskStatus; lastSequence: number } }> {
    const env = await this.getTask(taskId);
    this.ensureOwnedByExecutor(env.payload, input.executorId);
    const seq = this.ensureSequence(env.payload, input.sequence);
    if (!seq.accepted) {
      return { accepted: false, task: { taskId, status: env.payload.status, lastSequence: seq.lastSequence } };
    }

    const nextStatus = input.status;
    if (!canTransition(env.payload.status, nextStatus)) {
      throw new ExecutionError('BAD_REQUEST', `Invalid transition ${env.payload.status} -> ${nextStatus}`, 400);
    }

    const ts = input.at ?? nowIso();
    const next: ExecutionTaskPayload = {
      ...env.payload,
      status: nextStatus,
      lastSequence: input.sequence,
      ...(input.failure ? { failure: input.failure } : {}),
      ...(input.external ? { external: input.external } : {}),
      ...(TERMINAL_STATUSES.includes(nextStatus) ? { completedAt: ts } : {}),
      updatedAt: ts,
    };
    await this.updateTask(taskId, next, `Update status for execution task ${taskId} to ${nextStatus}`);

    const runPatch: Record<string, unknown> = {
      status: this.mapTaskToRunStatus(nextStatus),
      ...(input.external?.runId ? { externalRunId: input.external.runId } : {}),
      ...(input.external?.protocolId ? { externalProtocolId: input.external.protocolId } : {}),
      ...(input.external?.rawStatus ? { lastStatusRaw: input.external.rawStatus } : {}),
      ...(input.failure?.class ? { failureClass: input.failure.class } : {}),
      ...(input.failure?.code ? { failureCode: input.failure.code } : {}),
      ...(input.failure?.message ? { notes: input.failure.message } : {}),
      ...(nextStatus === 'failed'
        ? { retryRecommended: input.failure?.class === 'transient', retryReason: input.failure?.class === 'transient' ? 'remote_failure_transient' : 'remote_failure_terminal' }
        : {}),
      ...(TERMINAL_STATUSES.includes(nextStatus) ? { completedAt: ts } : {}),
    };

    await this.updateExecutionRun(next.executionRunRef.id, runPatch, `Update execution run ${next.executionRunRef.id} from task status`);

    return { accepted: true, task: { taskId, status: next.status, lastSequence: input.sequence } };
  }

  async complete(taskId: string, input: {
    executorId: string;
    sequence: number;
    finalStatus: 'completed' | 'failed' | 'canceled';
    startedAt?: string;
    completedAt?: string;
    artifacts?: Array<{ role: string; uri: string; sha256?: string; mimeType?: string }>;
    measurements?: Array<Record<string, unknown>>;
  }): Promise<{ accepted: boolean; task: { taskId: string; status: ExecutionTaskStatus; lastSequence: number } }> {
    const statusResult = await this.updateStatus(taskId, {
      executorId: input.executorId,
      sequence: input.sequence,
      status: input.finalStatus,
      ...(input.completedAt ? { at: input.completedAt } : {}),
    });
    if (!statusResult.accepted) {
      return statusResult;
    }

    const env = await this.getTask(taskId);
    const next: ExecutionTaskPayload = {
      ...env.payload,
      ...(input.startedAt ? { startedAt: input.startedAt } : {}),
      ...(input.completedAt ? { completedAt: input.completedAt } : {}),
      ...(input.artifacts ? { artifacts: input.artifacts } : {}),
      ...(input.measurements ? { measurements: input.measurements } : {}),
      updatedAt: nowIso(),
    };
    await this.updateTask(taskId, next, `Finalize execution task ${taskId}`);

    return { accepted: true, task: { taskId, status: next.status, lastSequence: next.lastSequence ?? input.sequence } };
  }
}
