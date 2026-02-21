import type { AppContext } from '../server.js';
import { ExecutionIncidentService } from './ExecutionIncidentService.js';

const EXECUTION_WORKER_STATE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/execution-worker-state.schema.yaml';

type WorkerStatePayload = {
  kind?: string;
  recordId?: string;
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

export class ExecutionIncidentWorker {
  private readonly ctx: AppContext;
  private readonly incidents: ExecutionIncidentService;
  private readonly workerId: string;
  private readonly stateRecordId: string;
  private readonly leaseOwner = `${process.env['HOSTNAME'] ?? 'local'}:${process.pid}:${Math.random().toString(36).slice(2, 8)}`;
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<Record<string, unknown>> | null = null;
  private intervalMs = 60_000;
  private lastRunAt: string | undefined;
  private lastRunSummary: Record<string, unknown> | undefined;
  private errorStreak = 0;
  private lastError: string | undefined;
  private restoring: Promise<void> | null = null;
  private restored = false;
  private leaseBlockedBy: { owner?: string; expiresAt?: string } | undefined;

  constructor(
    ctx: AppContext,
    incidents: ExecutionIncidentService,
    options?: { workerId?: string; stateRecordId?: string },
  ) {
    this.ctx = ctx;
    this.incidents = incidents;
    this.workerId = options?.workerId ?? 'incident-scanner';
    this.stateRecordId = options?.stateRecordId ?? 'EWS-INCIDENT-SCANNER';
  }

  private resolveLeaseTtlMs(): number {
    const specific = process.env['LABOS_INCIDENT_WORKER_LEASE_TTL_MS'];
    const global = process.env['LABOS_WORKER_LEASE_TTL_MS'];
    const parsed = Number.parseInt((specific ?? global ?? ''), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    return Math.max(30_000, this.intervalMs * 3);
  }

  private async persistState(): Promise<void> {
    const running = this.timer !== null;
    const leaseMs = this.resolveLeaseTtlMs();
    const payload = {
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
        return;
      }
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
    } catch {
      // Non-fatal: worker operation should continue even if state persistence fails.
    }
  }

  private async acquireLease(forceTakeover: boolean = false): Promise<{ acquired: boolean; owner?: string; expiresAt?: string }> {
    if (forceTakeover) {
      return { acquired: true };
    }
    const existing = await this.ctx.store.get(this.stateRecordId);
    if (!existing) return { acquired: true };
    const payload = existing.payload as WorkerStatePayload;
    if (payload.kind !== 'execution-worker-state' || payload.workerId !== this.workerId) {
      return { acquired: true };
    }
    const expiresAt = payload.leaseExpiresAt ? Date.parse(payload.leaseExpiresAt) : Number.NaN;
    const leaseActive = Number.isFinite(expiresAt) && expiresAt > Date.now();
    if (payload.running === true && payload.leaseOwner && payload.leaseOwner !== this.leaseOwner && leaseActive) {
      return {
        acquired: false,
        owner: payload.leaseOwner,
        ...(payload.leaseExpiresAt ? { expiresAt: payload.leaseExpiresAt } : {}),
      };
    }
    return { acquired: true };
  }

  private async restoreInternal(): Promise<void> {
    const existing = await this.ctx.store.get(this.stateRecordId);
    if (!existing) return;
    const payload = existing.payload as WorkerStatePayload;
    if (payload.kind !== 'execution-worker-state' || payload.workerId !== this.workerId) return;
    if (typeof payload.intervalMs === 'number' && Number.isFinite(payload.intervalMs) && payload.intervalMs > 0) {
      this.intervalMs = payload.intervalMs;
    }
    if (typeof payload.lastRunAt === 'string') {
      this.lastRunAt = payload.lastRunAt;
    }
    if (payload.lastRunSummary && typeof payload.lastRunSummary === 'object') {
      this.lastRunSummary = payload.lastRunSummary;
    }
    if (typeof payload.errorStreak === 'number' && Number.isFinite(payload.errorStreak) && payload.errorStreak >= 0) {
      this.errorStreak = payload.errorStreak;
    }
    if (typeof payload.lastError === 'string') {
      this.lastError = payload.lastError;
    }
    if (payload.running === true) {
      await this.start(this.intervalMs, { persist: false });
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

  async runOnce(): Promise<Record<string, unknown>> {
    if (this.inFlight) {
      return {
        skippedBusy: true,
        timestamp: new Date().toISOString(),
      };
    }
    const task = this.incidents.scanAndCreateIncidents();
    this.inFlight = task;
    try {
      const summary = await task;
      const out = {
        ...summary,
        timestamp: new Date().toISOString(),
      };
      this.lastRunAt = out.timestamp;
      this.lastRunSummary = out;
      this.errorStreak = 0;
      this.lastError = undefined;
      await this.persistState();
      return out;
    } finally {
      this.inFlight = null;
    }
  }

  async start(intervalMs: number = this.intervalMs, options?: { persist?: boolean; forceTakeover?: boolean }): Promise<Record<string, unknown>> {
    if (this.timer) return this.status();
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
        void this.persistState();
      });
    }, this.intervalMs);
    if (options?.persist !== false) {
      await this.persistState();
    }
    return this.status();
  }

  async stop(options?: { persist?: boolean }): Promise<Record<string, unknown>> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (options?.persist !== false) {
      await this.persistState();
    }
    return this.status();
  }

  status(): Record<string, unknown> {
    return {
      workerId: this.workerId,
      stateRecordId: this.stateRecordId,
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
