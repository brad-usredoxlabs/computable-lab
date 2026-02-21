import type { AppContext } from '../server.js';
import { ExecutionError } from './ExecutionOrchestrator.js';
import { ExecutionRunService } from './ExecutionRunService.js';

type TimelineEntry = {
  at: string;
  source: 'execution-run' | 'instrument-log' | 'event-graph';
  type: string;
  message: string;
  data?: Record<string, unknown>;
};

type InstrumentLogPayload = {
  entries?: Array<{
    timestamp?: string;
    entryType?: string;
    message?: string;
    data?: Record<string, unknown>;
  }>;
};

type EventGraphPayload = {
  events?: Array<{
    eventId?: string;
    event_type?: string;
    at?: string;
    t_offset?: string;
  }>;
};

export class ExecutionTimelineService {
  private readonly ctx: AppContext;
  private readonly runs: ExecutionRunService;

  constructor(ctx: AppContext, runs?: ExecutionRunService) {
    this.ctx = ctx;
    this.runs = runs ?? new ExecutionRunService(ctx);
  }

  async getTimeline(executionRunId: string): Promise<{ executionRunId: string; entries: TimelineEntry[]; total: number }> {
    const run = await this.runs.getExecutionRun(executionRunId);
    const payload = run.payload;
    const entries: TimelineEntry[] = [];

    const startedAt = typeof (payload as Record<string, unknown>)['startedAt'] === 'string'
      ? String((payload as Record<string, unknown>)['startedAt'])
      : new Date().toISOString();
    entries.push({
      at: startedAt,
      source: 'execution-run',
      type: 'run_started',
      message: `Execution ${executionRunId} started`,
      data: {
        ...(payload.attempt ? { attempt: payload.attempt } : {}),
        ...(payload.status ? { status: payload.status } : {}),
      },
    });

    if (payload.status && payload.status !== 'running') {
      const completedAt = typeof (payload as Record<string, unknown>)['completedAt'] === 'string'
        ? String((payload as Record<string, unknown>)['completedAt'])
        : startedAt;
      entries.push({
        at: completedAt,
        source: 'execution-run',
        type: 'run_finished',
        message: `Execution ${executionRunId} ${payload.status}`,
        data: { status: payload.status },
      });
    }

    const logs = await this.ctx.store.list({ kind: 'instrument-log', limit: 500 });
    const relatedLogs = logs.filter((log) => {
      const logPayload = log.payload as InstrumentLogPayload;
      const first = logPayload.entries?.[0];
      const robotPlanId = first?.data?.['robotPlanId'];
      return typeof robotPlanId === 'string' && robotPlanId === payload.robotPlanRef?.id;
    });
    for (const log of relatedLogs) {
      const logPayload = log.payload as InstrumentLogPayload;
      for (const entry of logPayload.entries ?? []) {
        entries.push({
          at: entry.timestamp ?? startedAt,
          source: 'instrument-log',
          type: entry.entryType ?? 'info',
          message: entry.message ?? 'instrument log',
          ...(entry.data ? { data: entry.data } : {}),
        });
      }
    }

    if (payload.materializedEventGraphId) {
      const evgEnv = await this.ctx.store.get(payload.materializedEventGraphId);
      if (!evgEnv) {
        throw new ExecutionError('NOT_FOUND', `Materialized event graph not found: ${payload.materializedEventGraphId}`, 404);
      }
      const evg = evgEnv.payload as EventGraphPayload;
      for (const evt of evg.events ?? []) {
        entries.push({
          at: evt.at ?? startedAt,
          source: 'event-graph',
          type: evt.event_type ?? 'event',
          message: evt.eventId ? `Event ${evt.eventId}` : 'Event',
          data: {
            ...(evt.eventId ? { eventId: evt.eventId } : {}),
            ...(evt.t_offset ? { t_offset: evt.t_offset } : {}),
          },
        });
      }
    }

    entries.sort((a, b) => a.at.localeCompare(b.at) || a.type.localeCompare(b.type));
    return {
      executionRunId,
      entries,
      total: entries.length,
    };
  }
}
