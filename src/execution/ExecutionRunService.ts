import type { AppContext } from '../server.js';
import { ExecutionControlService } from './ExecutionControlService.js';
import { ExecutionError } from './ExecutionOrchestrator.js';
import type { ExecutionProvider } from './providers/ExecutionProvider.js';
import { createExecutionProvider } from './providers/createExecutionProvider.js';

type ExecutionRunPayload = {
  kind?: string;
  recordId?: string;
  robotPlanRef?: { id?: string };
  plannedRunRef?: { id?: string };
  parentExecutionRunRef?: { id?: string };
  attempt?: number;
  status?: string;
  materializedEventGraphId?: string;
  failureClass?: 'transient' | 'terminal' | 'unknown';
  retryRecommended?: boolean;
  failureCode?: string;
  retryReason?: string;
  notes?: string;
};

type ExecutionRunView = { recordId: string; payload: ExecutionRunPayload };

export class ExecutionRunService {
  private readonly ctx: AppContext;
  private readonly provider: ExecutionProvider;
  private readonly control: ExecutionControlService;

  constructor(ctx: AppContext, provider?: ExecutionProvider, control?: ExecutionControlService) {
    this.ctx = ctx;
    this.provider = provider ?? createExecutionProvider(ctx);
    this.control = control ?? new ExecutionControlService(ctx);
  }

  async getExecutionRun(executionRunId: string): Promise<{ recordId: string; payload: ExecutionRunPayload }> {
    const env = await this.ctx.store.get(executionRunId);
    if (!env) {
      throw new ExecutionError('NOT_FOUND', `Execution run not found: ${executionRunId}`, 404);
    }
    const payload = env.payload as ExecutionRunPayload;
    if (payload.kind !== 'execution-run') {
      throw new ExecutionError('BAD_REQUEST', `${executionRunId} is not an execution-run`, 400);
    }
    return { recordId: env.recordId, payload };
  }

  async getExecutionRunStatus(executionRunId: string): Promise<Record<string, unknown>> {
    const run = await this.getExecutionRun(executionRunId);
    const robotPlanId = run.payload.robotPlanRef?.id;
    if (!robotPlanId) {
      throw new ExecutionError('BAD_REQUEST', `Execution run ${executionRunId} missing robotPlanRef.id`, 400);
    }
    const runtime = await this.control.getRobotPlanStatus(robotPlanId);
    return {
      executionRunId,
      executionRunStatus: run.payload.status ?? 'unknown',
      robotPlanId,
      ...runtime,
    };
  }

  async retryExecutionRun(executionRunId: string): Promise<{ executionRunId: string; logId?: string; taskId?: string; status: 'queued' | 'completed' | 'error' }> {
    return this.retryExecutionRunWithOptions(executionRunId, {});
  }

  async retryExecutionRunWithOptions(
    executionRunId: string,
    options: { force?: boolean }
  ): Promise<{ executionRunId: string; logId?: string; taskId?: string; status: 'queued' | 'completed' | 'error' }> {
    const run = await this.getExecutionRun(executionRunId);
    if (run.payload.status === 'running' && !options.force) {
      throw new ExecutionError('BAD_REQUEST', `Execution run ${executionRunId} is currently running`, 400);
    }
    const robotPlanId = run.payload.robotPlanRef?.id;
    if (!robotPlanId) {
      throw new ExecutionError('BAD_REQUEST', `Execution run ${executionRunId} missing robotPlanRef.id`, 400);
    }
    if (run.payload.status === 'failed' && run.payload.failureClass === 'terminal' && !options.force) {
      throw new ExecutionError(
        'BAD_REQUEST',
        `Execution run ${executionRunId} classified as terminal (${run.payload.retryReason ?? 'no retry'})`,
        400
      );
    }
    if (run.payload.status === 'failed' && run.payload.retryRecommended === false && !options.force) {
      throw new ExecutionError(
        'BAD_REQUEST',
        `Execution run ${executionRunId} is marked non-retriable`,
        400
      );
    }
    return this.provider.executeRobotPlan(robotPlanId, {
      parentExecutionRunId: executionRunId,
    });
  }

  async cancelExecutionRun(executionRunId: string): Promise<Record<string, unknown>> {
    const run = await this.getExecutionRun(executionRunId);
    const robotPlanId = run.payload.robotPlanRef?.id;
    if (!robotPlanId) {
      throw new ExecutionError('BAD_REQUEST', `Execution run ${executionRunId} missing robotPlanRef.id`, 400);
    }
    const details = await this.control.cancelRobotPlan(robotPlanId);
    return {
      executionRunId,
      ...details,
    };
  }

  async resolveExecutionRun(
    executionRunId: string,
    input: {
      status: 'completed' | 'failed' | 'canceled';
      failureClass?: 'transient' | 'terminal' | 'unknown';
      failureCode?: string;
      retryRecommended?: boolean;
      retryReason?: string;
      notes?: string;
    }
  ): Promise<{ executionRunId: string; status: string }> {
    const run = await this.getExecutionRun(executionRunId);
    const nextPayload: Record<string, unknown> = {
      ...(run.payload as Record<string, unknown>),
      status: input.status,
      completedAt: new Date().toISOString(),
      ...(input.failureClass !== undefined ? { failureClass: input.failureClass } : {}),
      ...(input.failureCode !== undefined ? { failureCode: input.failureCode } : {}),
      ...(input.retryRecommended !== undefined ? { retryRecommended: input.retryRecommended } : {}),
      ...(input.retryReason !== undefined ? { retryReason: input.retryReason } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    };
    await this.ctx.store.update({
      envelope: {
        recordId: executionRunId,
        schemaId: 'https://computable-lab.com/schema/computable-lab/execution-run.schema.yaml',
        payload: nextPayload,
      },
      message: `Resolve execution run ${executionRunId} as ${input.status}`,
      skipValidation: true,
      skipLint: true,
    });
    return { executionRunId, status: input.status };
  }

  async markRetryExhausted(executionRunId: string, maxAttempts: number): Promise<{ executionRunId: string; status: string }> {
    return this.resolveExecutionRun(executionRunId, {
      status: 'failed',
      failureClass: 'terminal',
      failureCode: 'RETRY_EXHAUSTED',
      retryRecommended: false,
      retryReason: `retry_exhausted_after_${maxAttempts}`,
      notes: `Automatic retry exhausted after ${maxAttempts} attempts`,
    });
  }

  async getExecutionRunLineage(executionRunId: string): Promise<{ lineage: Array<{ executionRunId: string; attempt?: number; parentExecutionRunId?: string; status?: string }>; total: number }> {
    const allRuns = await this.ctx.store.list({ kind: 'execution-run', limit: 1000 });
    const byId = new Map<string, ExecutionRunPayload>();
    for (const env of allRuns) {
      byId.set(env.recordId, env.payload as ExecutionRunPayload);
    }

    const lineage: Array<{ executionRunId: string; attempt?: number; parentExecutionRunId?: string; status?: string }> = [];
    let currentId: string | undefined = executionRunId;
    const seen = new Set<string>();
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const payload = byId.get(currentId);
      if (!payload) break;
      const parentId = payload.parentExecutionRunRef?.id;
      lineage.push({
        executionRunId: currentId,
        ...(typeof payload.attempt === 'number' ? { attempt: payload.attempt } : {}),
        ...(parentId ? { parentExecutionRunId: parentId } : {}),
        ...(payload.status ? { status: payload.status } : {}),
      });
      currentId = parentId;
    }

    return { lineage, total: lineage.length };
  }

  async listExecutionRuns(filter?: {
    status?: string;
    robotPlanId?: string;
    plannedRunId?: string;
    limit?: number;
    offset?: number;
    sort?: 'attempt_desc' | 'attempt_asc' | 'record_desc' | 'record_asc';
  }): Promise<ExecutionRunView[]> {
    const runs = await this.ctx.store.list({ kind: 'execution-run', limit: filter?.limit ?? 50 });
    const filtered = runs
      .map((run) => ({ recordId: run.recordId, payload: run.payload as ExecutionRunPayload }))
      .filter((run) => (filter?.status ? run.payload.status === filter.status : true))
      .filter((run) => (filter?.robotPlanId ? run.payload.robotPlanRef?.id === filter.robotPlanId : true))
      .filter((run) => (filter?.plannedRunId ? run.payload.plannedRunRef?.id === filter.plannedRunId : true));
    const sort = filter?.sort ?? 'record_desc';
    filtered.sort((a, b) => {
      const aa = typeof a.payload.attempt === 'number' ? a.payload.attempt : 1;
      const ba = typeof b.payload.attempt === 'number' ? b.payload.attempt : 1;
      if (sort === 'attempt_desc') {
        if (ba !== aa) return ba - aa;
        return b.recordId.localeCompare(a.recordId);
      }
      if (sort === 'attempt_asc') {
        if (aa !== ba) return aa - ba;
        return a.recordId.localeCompare(b.recordId);
      }
      if (sort === 'record_asc') {
        return a.recordId.localeCompare(b.recordId);
      }
      return b.recordId.localeCompare(a.recordId);
    });
    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 50;
    return filtered.slice(offset, offset + limit);
  }

  async listExecutionRunsPaged(filter?: {
    status?: string;
    robotPlanId?: string;
    plannedRunId?: string;
    limit?: number;
    offset?: number;
    sort?: 'attempt_desc' | 'attempt_asc' | 'record_desc' | 'record_asc';
  }): Promise<{ runs: ExecutionRunView[]; total: number; offset: number; limit: number }> {
    const all = await this.ctx.store.list({ kind: 'execution-run', limit: 5000 });
    const filtered = all
      .map((run) => ({ recordId: run.recordId, payload: run.payload as ExecutionRunPayload }))
      .filter((run) => (filter?.status ? run.payload.status === filter.status : true))
      .filter((run) => (filter?.robotPlanId ? run.payload.robotPlanRef?.id === filter.robotPlanId : true))
      .filter((run) => (filter?.plannedRunId ? run.payload.plannedRunRef?.id === filter.plannedRunId : true));
    const sort = filter?.sort ?? 'record_desc';
    filtered.sort((a, b) => {
      const aa = typeof a.payload.attempt === 'number' ? a.payload.attempt : 1;
      const ba = typeof b.payload.attempt === 'number' ? b.payload.attempt : 1;
      if (sort === 'attempt_desc') {
        if (ba !== aa) return ba - aa;
        return b.recordId.localeCompare(a.recordId);
      }
      if (sort === 'attempt_asc') {
        if (aa !== ba) return aa - ba;
        return a.recordId.localeCompare(b.recordId);
      }
      if (sort === 'record_asc') {
        return a.recordId.localeCompare(b.recordId);
      }
      return b.recordId.localeCompare(a.recordId);
    });
    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 50;
    return {
      runs: filtered.slice(offset, offset + limit),
      total: filtered.length,
      offset,
      limit,
    };
  }

  async getLatestExecutionRunForRobotPlan(robotPlanId: string): Promise<{ recordId: string; payload: ExecutionRunPayload } | null> {
    const runs = await this.listExecutionRuns({ robotPlanId, limit: 1000 });
    if (runs.length === 0) return null;
    runs.sort((a, b) => {
      const at = typeof a.payload.attempt === 'number' ? a.payload.attempt : 1;
      const bt = typeof b.payload.attempt === 'number' ? b.payload.attempt : 1;
      if (bt !== at) return bt - at;
      return b.recordId.localeCompare(a.recordId);
    });
    return runs[0] ?? null;
  }

  async getMaterializedEventGraph(executionRunId: string): Promise<{ eventGraphId: string; record: unknown } | null> {
    const run = await this.getExecutionRun(executionRunId);
    const eventGraphId = run.payload.materializedEventGraphId;
    if (!eventGraphId) return null;
    const record = await this.ctx.store.get(eventGraphId);
    if (!record) return null;
    return { eventGraphId, record };
  }
}
