import type { AppContext } from '../server.js';
import { ExecutionError } from './ExecutionOrchestrator.js';

const EVENT_GRAPH_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml';

type ExecutionRunPayload = {
  kind: 'execution-run';
  recordId: string;
  robotPlanRef?: { id?: string };
  plannedRunRef?: { id?: string };
  status?: string;
  startedAt?: string;
  completedAt?: string;
  materializedEventGraphId?: string;
};

type PlannedRunPayload = {
  recordId: string;
  title?: string;
  sourceType?: 'protocol' | 'event-graph';
  sourceRef?: { kind?: string; id?: string; type?: string };
};

type ProtocolPayload = {
  title?: string;
  steps?: Array<{ stepId?: string; kind?: string }>;
};

function parseSuffixNumber(id: string, prefix: string): number | null {
  if (!id.startsWith(`${prefix}-`)) return null;
  const suffix = id.slice(prefix.length + 1);
  if (!/^\d+$/.test(suffix)) return null;
  return Number.parseInt(suffix, 10);
}

function mapProtocolStepToEventType(kind: string | undefined): string {
  const allowed = new Set([
    'add_material',
    'transfer',
    'mix',
    'wash',
    'incubate',
    'read',
    'harvest',
    'other',
  ]);
  if (!kind) return 'other';
  return allowed.has(kind) ? kind : 'other';
}

export class ExecutionMaterializer {
  private readonly ctx: AppContext;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
  }

  private async nextEventGraphId(): Promise<string> {
    const records = await this.ctx.store.list({ kind: 'event-graph' });
    let max = 0;
    for (const env of records) {
      const n = parseSuffixNumber(env.recordId, 'EVG');
      if (n !== null && n > max) max = n;
    }
    return `EVG-${String(max + 1).padStart(6, '0')}`;
  }

  async materializeFromExecutionRun(executionRunId: string): Promise<{ eventGraphId: string }> {
    const executionRunEnvelope = await this.ctx.store.get(executionRunId);
    if (!executionRunEnvelope) {
      throw new ExecutionError('NOT_FOUND', `Execution run not found: ${executionRunId}`, 404);
    }
    const executionRun = executionRunEnvelope.payload as ExecutionRunPayload;
    if (executionRun.kind !== 'execution-run') {
      throw new ExecutionError('BAD_REQUEST', `${executionRunId} is not an execution-run`, 400);
    }
    if (executionRun.materializedEventGraphId) {
      return { eventGraphId: executionRun.materializedEventGraphId };
    }
    if (executionRun.status !== 'completed') {
      throw new ExecutionError('BAD_REQUEST', `Execution run ${executionRunId} is not completed`, 400);
    }

    const plannedRunId = executionRun.plannedRunRef?.id;
    if (!plannedRunId) {
      throw new ExecutionError('BAD_REQUEST', `Execution run ${executionRunId} has no plannedRunRef`, 400);
    }
    const plannedRunEnvelope = await this.ctx.store.get(plannedRunId);
    if (!plannedRunEnvelope) {
      throw new ExecutionError('NOT_FOUND', `Planned run not found: ${plannedRunId}`, 404);
    }
    const plannedRun = plannedRunEnvelope.payload as PlannedRunPayload;

    const protocolId = plannedRun.sourceType === 'protocol' ? plannedRun.sourceRef?.id : undefined;
    const protocolEnvelope = protocolId ? await this.ctx.store.get(protocolId) : null;
    const protocol = (protocolEnvelope?.payload ?? {}) as ProtocolPayload;

    const eventGraphId = await this.nextEventGraphId();
    const now = new Date().toISOString();
    const events = (protocol.steps ?? []).map((step, i) => ({
      eventId: step.stepId ?? `e${i + 1}`,
      event_type: mapProtocolStepToEventType(step.kind),
      details: {},
    }));

    const payload = {
      id: eventGraphId,
      name: `${plannedRun.title ?? protocol.title ?? plannedRunId} executed`,
      description: `Materialized from ${executionRunId}`,
      status: 'filed',
      createdAt: executionRun.startedAt ?? now,
      updatedAt: executionRun.completedAt ?? now,
      events,
      labwares: [],
      implementsRef: plannedRunId,
      executionMeta: {
        startedAt: executionRun.startedAt ?? now,
        completedAt: executionRun.completedAt ?? now,
        status: 'completed',
      },
      links: {},
    };

    const createResult = await this.ctx.store.create({
      envelope: {
        recordId: eventGraphId,
        schemaId: EVENT_GRAPH_SCHEMA_ID,
        payload,
        meta: { kind: 'event-graph' },
      },
      message: `Materialize event-graph ${eventGraphId} from ${executionRunId}`,
      skipValidation: true,
      skipLint: true,
    });
    if (!createResult.success) {
      throw new ExecutionError('CREATE_FAILED', createResult.error ?? `Failed to create event-graph ${eventGraphId}`, 400);
    }

    const updateResult = await this.ctx.store.update({
      envelope: {
        recordId: executionRunEnvelope.recordId,
        schemaId: executionRunEnvelope.schemaId,
        payload: {
          ...(executionRunEnvelope.payload as Record<string, unknown>),
          materializedEventGraphId: eventGraphId,
        },
      },
      message: `Attach materialized event graph ${eventGraphId} to ${executionRunId}`,
      skipValidation: true,
      skipLint: true,
    });
    if (!updateResult.success) {
      throw new ExecutionError('UPDATE_FAILED', updateResult.error ?? `Failed to update execution run ${executionRunId}`, 400);
    }

    return { eventGraphId };
  }
}
