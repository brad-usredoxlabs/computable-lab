import type { AppContext } from '../server.js';
import { ExecutionRunService } from './ExecutionRunService.js';

const EXECUTION_WORKER_STATE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/execution-worker-state.schema.yaml';

type ExecutionRunPayload = {
  kind?: string;
  status?: string;
  failureClass?: 'transient' | 'terminal' | 'unknown';
  retryRecommended?: boolean;
  attempt?: number;
  parentExecutionRunRef?: { id?: string };
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

export class ExecutionRetryWorker {
  private readonly ctx: AppContext;
  private readonly runs: ExecutionRunService;
  private readonly workerId = 'retry-worker';
  private readonly stateRecordId = 'EWS-RETRY-WORKER';
  private readonly leaseOwner = `${process.env['HOSTNAME'] ?? 'local'}:${process.pid}:${Math.random().toString(36).slice(2, 8)}`;
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<Record<string, unknown>> | null = null;
  private intervalMs = 30_000;
  private readonly maxAttempts: number;
  private lastRunAt: string | undefined;
  private lastRunSummary: Record<string, unknown> | undefined;
  private errorStreak = 0;
  private lastError: string | undefined;
  private restoring: Promise<void> | null = null;
  private restored = false;
  private leaseBlockedBy: { owner?: string; expiresAt?: string } | undefined;

  constructor(ctx: AppContext, runs?: ExecutionRunService) {
    this.ctx = ctx;
    this.runs = runs ?? new ExecutionRunService(ctx);
    const envMaxAttempts = process.env['LABOS_RETRY_MAX_ATTEMPTS'];
    const parsed = envMaxAttempts ? Number.parseInt(envMaxAttempts, 10) : Number.NaN;
    this.maxAttempts = Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
  }

  private resolveLeaseTtlMs(): number {
    const specific = process.env['LABOS_RETRY_WORKER_LEASE_TTL_MS'];
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

  async runOnce(limit: number = 100): Promise<Record<string, unknown>> {
    if (this.inFlight) {
      return {
        skippedBusy: true,
        timestamp: new Date().toISOString(),
      };
    }
    const task = this.runOnceInternal(limit);
    this.inFlight = task;
    try {
      return await task;
    } finally {
      this.inFlight = null;
    }
  }

  private async runOnceInternal(limit: number): Promise<Record<string, unknown>> {
    const all = await this.ctx.store.list({ kind: 'execution-run', limit: 5000 });
    const payloadById = new Map<string, ExecutionRunPayload>();
    const childIds = new Set<string>();
    for (const env of all) {
      const payload = env.payload as ExecutionRunPayload;
      payloadById.set(env.recordId, payload);
      const parentId = payload.parentExecutionRunRef?.id;
      if (typeof parentId === 'string' && parentId.length > 0) {
        childIds.add(parentId);
      }
    }

    const transientFailed = all
      .map((env) => ({ recordId: env.recordId, payload: env.payload as ExecutionRunPayload }))
      .filter((run) => run.payload.status === 'failed')
      .filter((run) => run.payload.failureClass === 'transient')
      .filter((run) => run.payload.retryRecommended !== false);

    let skippedHasChild = 0;
    let skippedMaxAttempt = 0;
    let exhaustedMarked = 0;
    let retryErrors = 0;
    let retried = 0;
    const attempted: string[] = [];

    for (const run of transientFailed.sort((a, b) => a.recordId.localeCompare(b.recordId))) {
      if (attempted.length >= limit) break;
      if (childIds.has(run.recordId)) {
        skippedHasChild += 1;
        continue;
      }
      const attempt = typeof run.payload.attempt === 'number' && Number.isFinite(run.payload.attempt) ? run.payload.attempt : 1;
      if (attempt >= this.maxAttempts) {
        skippedMaxAttempt += 1;
        await this.runs.markRetryExhausted(run.recordId, this.maxAttempts);
        exhaustedMarked += 1;
        continue;
      }
      attempted.push(run.recordId);
      try {
        await this.runs.retryExecutionRunWithOptions(run.recordId, { force: false });
        retried += 1;
      } catch {
        retryErrors += 1;
      }
    }

    const summary = {
      scanned: all.length,
      transientFailed: transientFailed.length,
      attempted: attempted.length,
      retried,
      retryErrors,
      skippedHasChild,
      skippedMaxAttempt,
      exhaustedMarked,
      maxAttempts: this.maxAttempts,
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
      void this.runOnce().catch((err) => {
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
      maxAttempts: this.maxAttempts,
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
