import type { AppContext } from '../server.js';
import { AdapterHealthService } from './AdapterHealthService.js';

const EXECUTION_INCIDENT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/execution-incident.schema.yaml';

type ExecutionRunPayload = {
  kind?: string;
  failureCode?: string;
  failureClass?: string;
  retryReason?: string;
  retryRecommended?: boolean;
  status?: string;
  robotPlanRef?: { id?: string };
};

type IncidentPayload = {
  kind?: string;
  recordId?: string;
  status?: string;
  dedupeKey?: string;
};

function parseSuffixNumber(id: string, prefix: string): number | null {
  if (!id.startsWith(`${prefix}-`)) return null;
  const suffix = id.slice(prefix.length + 1);
  if (!/^\d+$/.test(suffix)) return null;
  return Number.parseInt(suffix, 10);
}

export class ExecutionIncidentService {
  private readonly ctx: AppContext;
  private readonly health: AdapterHealthService;

  constructor(ctx: AppContext, health?: AdapterHealthService) {
    this.ctx = ctx;
    this.health = health ?? new AdapterHealthService();
  }

  private async nextIncidentId(): Promise<string> {
    const records = await this.ctx.store.list({ kind: 'execution-incident', limit: 5000 });
    let max = 0;
    for (const envelope of records) {
      const n = parseSuffixNumber(envelope.recordId, 'EXI');
      if (n !== null && n > max) max = n;
    }
    return `EXI-${String(max + 1).padStart(6, '0')}`;
  }

  private async hasOpenIncidentByKey(dedupeKey: string): Promise<boolean> {
    const incidents = await this.ctx.store.list({ kind: 'execution-incident', limit: 5000 });
    return incidents
      .map((e) => e.payload as IncidentPayload)
      .some((p) => p.kind === 'execution-incident' && p.status === 'open' && p.dedupeKey === dedupeKey);
  }

  private async createIncident(input: {
    title: string;
    incidentType: 'adapter_health' | 'retry_exhausted' | 'runtime_failure';
    severity: 'info' | 'warning' | 'critical';
    source: { kind: 'adapter' | 'execution-run' | 'robot-plan' | 'system'; id: string };
    dedupeKey: string;
    details?: Record<string, unknown>;
  }): Promise<{ created: boolean; recordId?: string }> {
    if (await this.hasOpenIncidentByKey(input.dedupeKey)) {
      return { created: false };
    }
    const recordId = await this.nextIncidentId();
    const payload = {
      kind: 'execution-incident',
      recordId,
      title: input.title,
      status: 'open',
      incidentType: input.incidentType,
      severity: input.severity,
      source: input.source,
      dedupeKey: input.dedupeKey,
      details: input.details ?? {},
      detectedAt: new Date().toISOString(),
    };
    await this.ctx.store.create({
      envelope: {
        recordId,
        schemaId: EXECUTION_INCIDENT_SCHEMA_ID,
        payload,
      },
      message: `Create execution incident ${recordId}`,
      skipValidation: true,
      skipLint: true,
    });
    return { created: true, recordId };
  }

  async listIncidents(filter?: { status?: 'open' | 'acked' | 'resolved'; limit?: number }): Promise<Array<{ recordId: string; payload: unknown }>> {
    const incidents = await this.ctx.store.list({ kind: 'execution-incident', limit: filter?.limit ?? 200 });
    return incidents
      .map((env) => ({ recordId: env.recordId, payload: env.payload }))
      .filter((incident) => {
        if (!filter?.status) return true;
        const payload = incident.payload as IncidentPayload;
        return payload.status === filter.status;
      });
  }

  async acknowledgeIncident(incidentId: string, notes?: string): Promise<{ incidentId: string; status: 'acked' }> {
    const envelope = await this.ctx.store.get(incidentId);
    if (!envelope) {
      throw new Error(`Incident not found: ${incidentId}`);
    }
    const payload = envelope.payload as Record<string, unknown>;
    if (payload['kind'] !== 'execution-incident') {
      throw new Error(`${incidentId} is not an execution-incident`);
    }
    await this.ctx.store.update({
      envelope: {
        recordId: envelope.recordId,
        schemaId: envelope.schemaId,
        payload: {
          ...payload,
          status: 'acked',
          acknowledgedAt: new Date().toISOString(),
          ...(notes ? { notes } : {}),
        },
      },
      message: `Acknowledge incident ${incidentId}`,
      skipValidation: true,
      skipLint: true,
    });
    return { incidentId, status: 'acked' };
  }

  async resolveIncident(incidentId: string, notes?: string): Promise<{ incidentId: string; status: 'resolved' }> {
    const envelope = await this.ctx.store.get(incidentId);
    if (!envelope) {
      throw new Error(`Incident not found: ${incidentId}`);
    }
    const payload = envelope.payload as Record<string, unknown>;
    if (payload['kind'] !== 'execution-incident') {
      throw new Error(`${incidentId} is not an execution-incident`);
    }
    await this.ctx.store.update({
      envelope: {
        recordId: envelope.recordId,
        schemaId: envelope.schemaId,
        payload: {
          ...payload,
          status: 'resolved',
          resolvedAt: new Date().toISOString(),
          ...(notes ? { notes } : {}),
        },
      },
      message: `Resolve incident ${incidentId}`,
      skipValidation: true,
      skipLint: true,
    });
    return { incidentId, status: 'resolved' };
  }

  async summary(): Promise<Record<string, unknown>> {
    const incidents = await this.ctx.store.list({ kind: 'execution-incident', limit: 5000 });
    const byStatus: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const byType: Record<string, number> = {};
    for (const env of incidents) {
      const payload = env.payload as Record<string, unknown>;
      const status = typeof payload['status'] === 'string' ? payload['status'] : 'unknown';
      const severity = typeof payload['severity'] === 'string' ? payload['severity'] : 'unknown';
      const incidentType = typeof payload['incidentType'] === 'string' ? payload['incidentType'] : 'unknown';
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      bySeverity[severity] = (bySeverity[severity] ?? 0) + 1;
      byType[incidentType] = (byType[incidentType] ?? 0) + 1;
    }
    return {
      total: incidents.length,
      byStatus,
      bySeverity,
      byType,
      timestamp: new Date().toISOString(),
    };
  }

  async scanAndCreateIncidents(): Promise<{ created: number; skipped: number; details: Record<string, unknown> }> {
    let created = 0;
    let skipped = 0;
    let adapterHealthCreated = 0;
    let retryExhaustedCreated = 0;

    const health = await this.health.check({ probe: false });
    for (const adapter of health.adapters) {
      if (adapter.status === 'ready' || adapter.status === 'degraded') continue;
      const res = await this.createIncident({
        title: `Adapter ${adapter.adapterId} is ${adapter.status}`,
        incidentType: 'adapter_health',
        severity: adapter.status === 'unreachable' ? 'critical' : 'warning',
        source: { kind: 'adapter', id: adapter.adapterId },
        dedupeKey: `adapter_health:${adapter.adapterId}:${adapter.status}`,
        details: {
          adapterStatus: adapter.status,
          details: adapter.details,
        },
      });
      if (res.created) {
        created += 1;
        adapterHealthCreated += 1;
      } else {
        skipped += 1;
      }
    }

    const executionRuns = await this.ctx.store.list({ kind: 'execution-run', limit: 5000 });
    for (const run of executionRuns) {
      const payload = run.payload as ExecutionRunPayload;
      if (payload.kind !== 'execution-run') continue;
      if (payload.status !== 'failed') continue;
      if (payload.failureCode !== 'RETRY_EXHAUSTED') continue;
      const res = await this.createIncident({
        title: `Retry exhausted for ${run.recordId}`,
        incidentType: 'retry_exhausted',
        severity: 'critical',
        source: { kind: 'execution-run', id: run.recordId },
        dedupeKey: `retry_exhausted:${run.recordId}`,
        details: {
          failureClass: payload.failureClass,
          retryReason: payload.retryReason,
          retryRecommended: payload.retryRecommended,
          robotPlanId: payload.robotPlanRef?.id,
        },
      });
      if (res.created) {
        created += 1;
        retryExhaustedCreated += 1;
      } else {
        skipped += 1;
      }
    }

    return {
      created,
      skipped,
      details: {
        adapterHealthCreated,
        retryExhaustedCreated,
      },
    };
  }
}
