/**
 * analysisService — CRUD orchestration for analysis records
 * (analysis-revision, analysis-run).
 *
 * Records are stored as YAML in the git-backed records tree. Applied schema
 * validation is delegated to the store (skipValidation NOT set). Each analysis
 * record family uses a stable id prefix (ANREV-/ANR-).
 */
import type { AppContext } from '../server.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';

const SCHEMAS = {
  rev: 'https://computable-lab.com/schema/computable-lab/analysis-revision.schema.yaml',
  run: 'https://computable-lab.com/schema/computable-lab/analysis-run.schema.yaml',
  out: 'https://computable-lab.com/schema/computable-lab/analysis-output-artifact.schema.yaml',
  view: 'https://computable-lab.com/schema/computable-lab/view-spec.schema.yaml',
};

export class AnalysisServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = 'AnalysisServiceError';
  }
}

async function nextId(ctx: AppContext, kind: 'analysis-revision' | 'analysis-run'): Promise<string> {
  const prefix = kind === 'analysis-revision' ? 'ANREV-' : 'ANR-';
  let max = 0;
  try {
    const envelopes = await ctx.store.list({ kind, limit: 5000 });
    for (const env of envelopes) {
      const m = new RegExp(`^${prefix}(\\d+)$`).exec(env.recordId);
      if (m) {
        const n = Number.parseInt(m[1] ?? '0', 10);
        if (n > max) max = n;
      }
    }
  } catch {
    // ignore — fresh store
  }
  return `${prefix}${String(max + 1).padStart(6, '0')}`;
}

export interface CreateRevisionInput {
  title: string;
  description?: string;
  parentRevisionRef?: { kind: 'record'; id: string; type: 'analysis-revision'; label?: string };
  entryScript: string;
  sdkVersion: string;
  methodNotes?: string;
  inputs?: Array<{ name: string; description?: string; dataKind?: string; required?: boolean }>;
  parameterSchema?: Record<string, unknown>;
}

export interface CreateRunInput {
  title: string;
  description?: string;
  revisionRef: { kind: 'record'; id: string; type: 'analysis-revision' };
  inputs: Record<string, { kind: 'record'; id: string; type: string }>;
  parameters?: Record<string, unknown>;
  initiator?: string;
}

export class AnalysisService {
  constructor(private readonly ctx: AppContext) {}

  async createRevision(input: CreateRevisionInput): Promise<{ recordId: string; payload: Record<string, unknown> }> {
    if (!input.title?.trim() || !input.entryScript?.trim() || !input.sdkVersion?.trim()) {
      throw new AnalysisServiceError('BAD_REQUEST', 'title, entryScript, and sdkVersion are required');
    }
    const recordId = await nextId(this.ctx, 'analysis-revision');
    const payload: Record<string, unknown> = {
      kind: 'analysis-revision',
      id: recordId,
      title: input.title.trim(),
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      ...(input.parentRevisionRef ? { parentRevisionRef: input.parentRevisionRef } : {}),
      entryScript: input.entryScript,
      sdkVersion: input.sdkVersion.trim(),
      ...(input.methodNotes?.trim() ? { methodNotes: input.methodNotes.trim() } : {}),
      ...(input.inputs && input.inputs.length > 0 ? { inputs: input.inputs } : {}),
      ...(input.parameterSchema ? { parameterSchema: input.parameterSchema } : {}),
    };
    const result = await this.ctx.store.create({
      envelope: { recordId, schemaId: SCHEMAS.rev, payload },
      message: `Create analysis revision ${recordId}`,
    });
    if (!result.success) throw new AnalysisServiceError('CREATE_FAILED', result.error ?? 'failed', 400);
    return { recordId, payload };
  }

  async createRun(input: CreateRunInput): Promise<{ recordId: string; payload: Record<string, unknown> }> {
    if (!input.title?.trim() || !input.revisionRef?.id) {
      throw new AnalysisServiceError('BAD_REQUEST', 'title and revisionRef are required');
    }
    const recordId = await nextId(this.ctx, 'analysis-run');
    const payload: Record<string, unknown> = {
      kind: 'analysis-run',
      id: recordId,
      title: input.title.trim(),
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      revisionRef: input.revisionRef,
      status: 'queued',
      inputs: input.inputs ?? {},
      ...(input.parameters ? { parameters: input.parameters } : {}),
      ...(input.initiator ? { initiator: input.initiator } : {}),
    };
    const result = await this.ctx.store.create({
      envelope: { recordId, schemaId: SCHEMAS.run, payload },
      message: `Create analysis run ${recordId}`,
    });
    if (!result.success) throw new AnalysisServiceError('CREATE_FAILED', result.error ?? 'failed', 400);
    return { recordId, payload };
  }

  async getRevision(id: string): Promise<RecordEnvelope | null> {
    return this.ctx.store.get(id);
  }

  async getRun(id: string): Promise<RecordEnvelope | null> {
    return this.ctx.store.get(id);
  }

  async list(kind: 'analysis-revision' | 'analysis-run', limit = 50): Promise<RecordEnvelope[]> {
    return this.ctx.store.list({ kind, limit });
  }

  async setRunStatus(recordId: string, status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'): Promise<void> {
    const env = await this.ctx.store.get(recordId);
    if (!env) throw new AnalysisServiceError('NOT_FOUND', `analysis-run not found: ${recordId}`, 404);
    const payload = { ...(env.payload as Record<string, unknown>), status } as Record<string, unknown>;
    const result = await this.ctx.store.update({
      envelope: { recordId, schemaId: SCHEMAS.run, payload },
      message: `Update analysis run ${recordId} → ${status}`,
    });
    if (!result.success) throw new AnalysisServiceError('UPDATE_FAILED', result.error ?? 'failed', 400);
  }
}