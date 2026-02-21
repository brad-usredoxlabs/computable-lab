import type { AppContext } from '../server.js';
import { ExecutionControlService } from './ExecutionControlService.js';
import { ExecutionError } from './ExecutionOrchestrator.js';
import { ExecutionMaterializer } from './ExecutionMaterializer.js';
import { classifyExecutionFailure } from './RetryPolicy.js';

const EXECUTION_WORKER_STATE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/execution-worker-state.schema.yaml';

type ExecutionRunPayload = {
  kind: 'execution-run';
  recordId: string;
  robotPlanRef?: { kind?: string; id?: string };
  plannedRunRef?: { kind?: string; id?: string };
  status?: string;
  lastStatusRaw?: string;
  lastPolledAt?: string;
  materializedEventGraphId?: string;
  failureClass?: 'transient' | 'terminal' | 'unknown';
  retryRecommended?: boolean;
  failureCode?: string;
  retryReason?: string;
};

type WorkerStatePayload = {
  kind?: string;
  workerId?: string;
  running?: boolean;
  intervalMs?: number;
  lastRunAt?: string;
  lastRunSummary?: Record<string, unknown>;
  errorStreak?: number;
  lastError?: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
};

export class ExecutionPoller {
  private readonly ctx: AppContext;
  private readonly controlService: ExecutionControlService;
  private readonly materializer: ExecutionMaterializer;
  private readonly workerId = 'execution-poller';
  private readonly stateRecordId = 'EWS-EXECUTION-POLLER';
  private readonly leaseOwner = `${process.env['HOSTNAME'] ?? 'local'}:${process.pid}:${Math.random().toString(36).slice(2, 8)}`;
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<Record<string, unknown>> | null = null;
  private intervalMs = 15_000;
  private lastRunAt?: string;
  private lastRunSummary?: Record<string, unknown>;
  private errorStreak = 0;
  private lastError: string | undefined;
  private restoring: Promise<void> | null = null;
  private restored = false;
  private leaseBlockedBy: { owner?: string; expiresAt?: string } | undefined;
  private readonly maxRunMs: number;
  private readonly staleUnknownMs: number;

  constructor(ctx: AppContext, controlService?: ExecutionControlService) {
    this.ctx = ctx;
    this.controlService = controlService ?? new ExecutionControlService(ctx);
    this.materializer = new ExecutionMaterializer(ctx);
    const envValue = process.env['LABOS_EXECUTION_MAX_RUN_MS'];
    const parsed = envValue ? Number.parseInt(envValue, 10) : Number.NaN;
    this.maxRunMs = Number.isFinite(parsed) && parsed > 0 ? parsed : 4 * 60 * 60 * 1000;
    const staleValue = process.env['LABOS_EXECUTION_STALE_UNKNOWN_MS'];
    const staleParsed = staleValue ? Number.parseInt(staleValue, 10) : Number.NaN;
    this.staleUnknownMs = Number.isFinite(staleParsed) && staleParsed > 0 ? staleParsed : 30 * 60 * 1000;
  }

  private resolveLeaseTtlMs(): number {
    const specific = process.env['LABOS_POLLER_LEASE_TTL_MS'];
    const global = process.env['LABOS_WORKER_LEASE_TTL_MS'];
    const parsed = Number.parseInt((specific ?? global ?? ''), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    return Math.max(30_000, this.intervalMs * 3);
  }

  private async loadState(): Promise<WorkerStatePayload | null> {
    const env = await this.ctx.store.get(this.stateRecordId);
    if (!env) return null;
    const payload = env.payload as WorkerStatePayload;
    if (payload.kind !== 'execution-worker-state' || payload.workerId !== this.workerId) {
      return null;
    }
    return payload;
  }

  private async persistState(running: boolean): Promise<void> {
    const leaseMs = this.resolveLeaseTtlMs();
    const payload: Record<string, unknown> = {
      kind: 'execution-worker-state',
      recordId: this.stateRecordId,
      workerId: this.workerId,
      running,
      intervalMs: this.intervalMs,
      ...(this.lastRunAt ? { lastRunAt: this.lastRunAt } : {}),
      ...(this.lastRunSummary ? { lastRunSummary: this.lastRunSummary } : {}),
      errorStreak: this.errorStreak,
      ...(this.lastError ? { lastError: this.lastError } : {}),
      ...(running ? { leaseOwner: this.leaseOwner, leaseExpiresAt: new Date(Date.now() + leaseMs).toISOString() } : {}),
      updatedAt: new Date().toISOString(),
    };
    try {
      const existing = await this.ctx.store.get(this.stateRecordId);
      if (existing) {
        await this.ctx.store.update({
          envelope: {
            recordId: this.stateRecordId,
            schemaId: existing.schemaId,
            payload,
          },
          message: `Update worker state ${this.workerId}`,
          skipValidation: true,
          skipLint: true,
        });
      } else {
        await this.ctx.store.create({
          envelope: {
            recordId: this.stateRecordId,
            schemaId: EXECUTION_WORKER_STATE_SCHEMA_ID,
            payload,
          },
          message: `Create worker state ${this.workerId}`,
          skipValidation: true,
          skipLint: true,
        });
      }
    } catch {
      // Non-fatal.
    }
  }

  private async acquireLease(forceTakeover: boolean = false): Promise<{ acquired: boolean; owner?: string; expiresAt?: string }> {
    if (forceTakeover) {
      return { acquired: true };
    }
    const state = await this.loadState();
    const expiresAt = state?.leaseExpiresAt ? Date.parse(state.leaseExpiresAt) : Number.NaN;
    const leaseActive = Number.isFinite(expiresAt) && expiresAt > Date.now();
    if (state?.running === true && state.leaseOwner && state.leaseOwner !== this.leaseOwner && leaseActive) {
      return {
        acquired: false,
        owner: state.leaseOwner,
        ...(state.leaseExpiresAt ? { expiresAt: state.leaseExpiresAt } : {}),
      };
    }
    return { acquired: true };
  }

  private async restoreInternal(): Promise<void> {
    const state = await this.loadState();
    if (!state) return;
    if (typeof state.intervalMs === 'number' && Number.isFinite(state.intervalMs) && state.intervalMs > 0) {
      this.intervalMs = state.intervalMs;
    }
    if (typeof state.lastRunAt === 'string') this.lastRunAt = state.lastRunAt;
    if (state.lastRunSummary && typeof state.lastRunSummary === 'object') this.lastRunSummary = state.lastRunSummary;
    if (typeof state.errorStreak === 'number' && Number.isFinite(state.errorStreak) && state.errorStreak >= 0) {
      this.errorStreak = state.errorStreak;
    }
    if (typeof state.lastError === 'string') this.lastError = state.lastError;
    if (state.running === true) {
      await this.start(this.intervalMs, { persist: true });
    }
  }

  async restore(): Promise<Record<string, unknown>> {
    if (this.restored) return this.status();
    if (!this.restoring) {
      this.restoring = this.restoreInternal().finally(() => {
        this.restored = true;
        this.restoring = null;
      });
    }
    await this.restoring;
    return this.status();
  }

  private async updatePlannedRunState(plannedRunId: string, state: 'executing' | 'completed' | 'failed'): Promise<void> {
    const envelope = await this.ctx.store.get(plannedRunId);
    if (!envelope) return;
    const payload = envelope.payload;
    if (!payload || typeof payload !== 'object') return;
    const record = payload as Record<string, unknown>;
    if (record['kind'] !== 'planned-run') return;
    await this.ctx.store.update({
      envelope: {
        recordId: envelope.recordId,
        schemaId: envelope.schemaId,
        payload: {
          ...record,
          state,
        },
      },
      message: `Poller set ${plannedRunId} state to ${state}`,
    });
  }

  async pollOnce(limit: number = 100): Promise<Record<string, unknown>> {
    if (this.inFlight) {
      return {
        skippedBusy: true,
        timestamp: new Date().toISOString(),
      };
    }
    const task = this.pollOnceInternal(limit);
    this.inFlight = task;
    try {
      return await task;
    } finally {
      this.inFlight = null;
    }
  }

  private async pollOnceInternal(limit: number): Promise<Record<string, unknown>> {
    const runs = await this.ctx.store.list({ kind: 'execution-run', limit });
    const candidates = runs.filter((env) => {
      const payload = env.payload as ExecutionRunPayload;
      return payload.kind === 'execution-run' && payload.status === 'running';
    });

    let updated = 0;
    let completed = 0;
    let failed = 0;
    let staleUnknownFailed = 0;
    for (const env of candidates) {
      const payload = env.payload as ExecutionRunPayload;
      const robotPlanId = payload.robotPlanRef?.id;
      if (!robotPlanId) continue;
      const startedAt = Date.parse((payload as Record<string, unknown>)['startedAt'] as string);
      if (Number.isFinite(startedAt) && Date.now() - startedAt > this.maxRunMs) {
        const classified = classifyExecutionFailure({
          mode: 'poller',
          statusRaw: 'timeout',
          stderr: 'execution exceeded max runtime',
        });
        const timeoutPayload: ExecutionRunPayload = {
          ...payload,
          status: 'failed',
          lastStatusRaw: 'timeout',
          lastPolledAt: new Date().toISOString(),
          failureClass: classified.failureClass,
          retryRecommended: classified.retryRecommended,
          failureCode: classified.failureCode,
          retryReason: classified.reason,
        };
        await this.ctx.store.update({
          envelope: {
            recordId: env.recordId,
            schemaId: env.schemaId,
            payload: timeoutPayload,
          },
          message: `Mark execution run ${env.recordId} failed due to timeout`,
        });
        updated += 1;
        failed += 1;
        const plannedRunId = payload.plannedRunRef?.id;
        if (plannedRunId) {
          await this.updatePlannedRunState(plannedRunId, 'failed');
        }
        continue;
      }

      const status = await this.controlService.getRobotPlanStatus(robotPlanId);
      const normalized = status['normalizedStatus'];
      const nextStatus = normalized === 'completed'
        ? 'completed'
        : normalized === 'failed'
          ? 'failed'
          : 'running';
      const isStaleUnknown = normalized === 'unknown' && Number.isFinite(startedAt) && Date.now() - startedAt > this.staleUnknownMs;
      if (isStaleUnknown) {
        const classified = classifyExecutionFailure({
          mode: typeof status['executionMode'] === 'string' ? status['executionMode'] : 'poller',
          statusRaw: typeof status['externalStatus'] === 'string' ? status['externalStatus'] : 'unknown',
          stderr: 'stale_unknown',
        });
        const stalePayload: ExecutionRunPayload = {
          ...payload,
          status: 'failed',
          ...(typeof status['externalStatus'] === 'string' ? { lastStatusRaw: status['externalStatus'] } : { lastStatusRaw: 'unknown' }),
          lastPolledAt: new Date().toISOString(),
          failureClass: classified.failureClass,
          retryRecommended: classified.retryRecommended,
          retryReason: classified.reason,
        };
        await this.ctx.store.update({
          envelope: {
            recordId: env.recordId,
            schemaId: env.schemaId,
            payload: stalePayload,
          },
          message: `Mark execution run ${env.recordId} failed due to stale unknown status`,
        });
        updated += 1;
        failed += 1;
        staleUnknownFailed += 1;
        const plannedRunId = payload.plannedRunRef?.id;
        if (plannedRunId) {
          await this.updatePlannedRunState(plannedRunId, 'failed');
        }
        continue;
      }

      const nextPayload: ExecutionRunPayload = {
        ...payload,
        status: nextStatus,
        ...(typeof status['externalStatus'] === 'string' ? { lastStatusRaw: status['externalStatus'] } : {}),
        lastPolledAt: new Date().toISOString(),
        ...(nextStatus === 'failed'
          ? (() => {
              const classified = classifyExecutionFailure({
                mode: typeof status['executionMode'] === 'string' ? status['executionMode'] : 'poller',
                statusRaw: typeof status['externalStatus'] === 'string' ? status['externalStatus'] : 'failed',
              });
              return {
                failureClass: classified.failureClass,
                retryRecommended: classified.retryRecommended,
                failureCode: classified.failureCode,
                retryReason: classified.reason,
              };
            })()
          : {}),
      };
      const res = await this.ctx.store.update({
        envelope: {
          recordId: env.recordId,
          schemaId: env.schemaId,
          payload: nextPayload,
        },
        message: `Poll execution run ${env.recordId}`,
      });
      if (!res.success) {
        throw new ExecutionError('UPDATE_FAILED', res.error ?? `Failed to update execution run ${env.recordId}`, 400);
      }

      if (nextStatus !== payload.status) {
        updated += 1;
      }
      if (nextStatus === 'completed') {
        completed += 1;
        const plannedRunId = payload.plannedRunRef?.id;
        if (plannedRunId) {
          await this.updatePlannedRunState(plannedRunId, 'completed');
        }
        if (!payload.materializedEventGraphId) {
          try {
            await this.materializer.materializeFromExecutionRun(env.recordId);
          } catch {
            // Keep polling resilient; materialization can retry on next cycle.
          }
        }
      } else if (nextStatus === 'failed') {
        failed += 1;
        const plannedRunId = payload.plannedRunRef?.id;
        if (plannedRunId) {
          await this.updatePlannedRunState(plannedRunId, 'failed');
        }
      }
    }

    const summary = {
      scanned: candidates.length,
      updated,
      completed,
      failed,
      staleUnknownFailed,
      timestamp: new Date().toISOString(),
    };
    this.lastRunAt = summary.timestamp;
    this.lastRunSummary = summary;
    this.errorStreak = 0;
    this.lastError = undefined;
    await this.persistState(this.timer !== null);
    return summary;
  }

  async start(intervalMs: number = this.intervalMs, options?: { persist?: boolean; forceTakeover?: boolean }): Promise<Record<string, unknown>> {
    if (this.timer) {
      return this.status();
    }
    this.intervalMs = intervalMs;
    const lease = await this.acquireLease(options?.forceTakeover === true);
    if (!lease.acquired) {
      this.leaseBlockedBy = {
        ...(lease.owner ? { owner: lease.owner } : {}),
        ...(lease.expiresAt ? { expiresAt: lease.expiresAt } : {}),
      };
      return this.status();
    }
    this.leaseBlockedBy = undefined;
    this.timer = setInterval(() => {
      void this.pollOnce().catch((err) => {
        this.errorStreak += 1;
        this.lastError = err instanceof Error ? err.message : String(err);
        this.lastRunSummary = {
          error: this.lastError,
          errorStreak: this.errorStreak,
          timestamp: new Date().toISOString(),
        };
        void this.persistState(true);
      });
    }, this.intervalMs);
    if (options?.persist !== false) {
      await this.persistState(true);
    }
    return this.status();
  }

  async stop(options?: { persist?: boolean }): Promise<Record<string, unknown>> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (options?.persist !== false) {
      await this.persistState(false);
    }
    return this.status();
  }

  status(): Record<string, unknown> {
    return {
      running: this.timer !== null,
      intervalMs: this.intervalMs,
      ...(this.lastRunAt ? { lastRunAt: this.lastRunAt } : {}),
      ...(this.lastRunSummary ? { lastRunSummary: this.lastRunSummary } : {}),
      errorStreak: this.errorStreak,
      ...(this.lastError ? { lastError: this.lastError } : {}),
      inFlight: this.inFlight !== null,
      ...(this.leaseBlockedBy ? { leaseBlockedBy: this.leaseBlockedBy } : {}),
      leaseTtlMs: this.resolveLeaseTtlMs(),
    };
  }
}
