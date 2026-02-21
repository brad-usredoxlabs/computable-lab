import type { AppContext } from '../server.js';

type WorkerLeasePayload = {
  kind?: string;
  workerId?: string;
  running?: boolean;
  intervalMs?: number;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  lastRunAt?: string;
  updatedAt?: string;
};

const KNOWN_WORKERS = [
  { workerId: 'execution-poller', stateRecordId: 'EWS-EXECUTION-POLLER' },
  { workerId: 'retry-worker', stateRecordId: 'EWS-RETRY-WORKER' },
  { workerId: 'incident-scanner', stateRecordId: 'EWS-INCIDENT-SCANNER' },
] as const;

export class WorkerLeaseViewService {
  private readonly ctx: AppContext;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
  }

  async list(options?: { workerId?: string }): Promise<{ leases: Array<Record<string, unknown>>; total: number; timestamp: string }> {
    const targets = options?.workerId
      ? KNOWN_WORKERS.filter((worker) => worker.workerId === options.workerId)
      : [...KNOWN_WORKERS];
    const now = Date.now();
    const leases: Array<Record<string, unknown>> = [];

    for (const target of targets) {
      const env = await this.ctx.store.get(target.stateRecordId);
      if (!env) {
        leases.push({
          workerId: target.workerId,
          stateRecordId: target.stateRecordId,
          status: 'missing',
          running: false,
        });
        continue;
      }
      const payload = env.payload as WorkerLeasePayload;
      const leaseExpiryMs = payload.leaseExpiresAt ? Date.parse(payload.leaseExpiresAt) : Number.NaN;
      const leaseActive = Number.isFinite(leaseExpiryMs) && leaseExpiryMs > now;
      const status = payload.running === true
        ? (leaseActive ? 'active' : 'expired')
        : 'stopped';
      leases.push({
        workerId: target.workerId,
        stateRecordId: target.stateRecordId,
        status,
        running: payload.running === true,
        ...(typeof payload.intervalMs === 'number' ? { intervalMs: payload.intervalMs } : {}),
        ...(payload.leaseOwner ? { leaseOwner: payload.leaseOwner } : {}),
        ...(payload.leaseExpiresAt ? { leaseExpiresAt: payload.leaseExpiresAt } : {}),
        leaseActive,
        ...(payload.lastRunAt ? { lastRunAt: payload.lastRunAt } : {}),
        ...(payload.updatedAt ? { updatedAt: payload.updatedAt } : {}),
      });
    }

    return {
      leases,
      total: leases.length,
      timestamp: new Date().toISOString(),
    };
  }
}
