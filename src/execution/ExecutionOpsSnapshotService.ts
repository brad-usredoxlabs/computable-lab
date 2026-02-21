import type { AppContext } from '../server.js';
import { AdapterHealthService } from './AdapterHealthService.js';
import { ExecutionIncidentService } from './ExecutionIncidentService.js';
import { WorkerLeaseViewService } from './WorkerLeaseViewService.js';

type ExecutionRunPayload = {
  kind?: string;
  status?: string;
  failureClass?: 'transient' | 'terminal' | 'unknown';
  retryRecommended?: boolean;
  parentExecutionRunRef?: { id?: string };
};

export class ExecutionOpsSnapshotService {
  private readonly ctx: AppContext;
  private readonly adapterHealth: AdapterHealthService;
  private readonly incidents: ExecutionIncidentService;
  private readonly workerLeases: WorkerLeaseViewService;

  constructor(
    ctx: AppContext,
    adapterHealth?: AdapterHealthService,
    incidents?: ExecutionIncidentService,
    workerLeases?: WorkerLeaseViewService,
  ) {
    this.ctx = ctx;
    this.adapterHealth = adapterHealth ?? new AdapterHealthService();
    this.incidents = incidents ?? new ExecutionIncidentService(ctx, this.adapterHealth);
    this.workerLeases = workerLeases ?? new WorkerLeaseViewService(ctx);
  }

  async snapshot(options?: { probeAdapters?: boolean; workerId?: string }): Promise<Record<string, unknown>> {
    const runs = await this.ctx.store.list({ kind: 'execution-run', limit: 5000 });
    const statusCounts: Record<string, number> = {};
    const childIds = new Set<string>();
    let retryCandidates = 0;

    for (const env of runs) {
      const payload = env.payload as ExecutionRunPayload;
      if (payload.kind !== 'execution-run') continue;
      const status = payload.status ?? 'unknown';
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
      const parentId = payload.parentExecutionRunRef?.id;
      if (typeof parentId === 'string' && parentId.length > 0) {
        childIds.add(parentId);
      }
    }

    for (const env of runs) {
      const payload = env.payload as ExecutionRunPayload;
      if (payload.kind !== 'execution-run') continue;
      if (payload.status !== 'failed') continue;
      if (payload.failureClass !== 'transient') continue;
      if (payload.retryRecommended === false) continue;
      if (childIds.has(env.recordId)) continue;
      retryCandidates += 1;
    }

    const [incidents, adapterHealth, leases] = await Promise.all([
      this.incidents.summary(),
      this.adapterHealth.check({ probe: options?.probeAdapters === true }),
      this.workerLeases.list({
        ...(options?.workerId ? { workerId: options.workerId } : {}),
      }),
    ]);

    return {
      executionRuns: {
        total: runs.length,
        byStatus: statusCounts,
        retryCandidates,
      },
      incidents,
      adapterHealth: {
        total: adapterHealth.total,
        summary: adapterHealth.summary,
        timestamp: adapterHealth.timestamp,
      },
      workerLeases: leases,
      timestamp: new Date().toISOString(),
    };
  }
}
