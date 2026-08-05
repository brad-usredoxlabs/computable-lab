import { describe, expect, it } from 'vitest';
import { ProtocolContextService } from './ProtocolContextService.js';
import type { CreateRecordOptions, DeleteRecordOptions, GetRecordOptions, RecordEnvelope, RecordFilter, RecordStore, StoreResult, UpdateRecordOptions } from '../store/types.js';

class MemoryRecordStore implements RecordStore {
  records = new Map<string, RecordEnvelope>();

  constructor(records: RecordEnvelope[] = []) {
    for (const record of records) this.records.set(record.recordId, record);
  }

  async get(recordId: string): Promise<RecordEnvelope | null> {
    return this.records.get(recordId) ?? null;
  }

  async getByPath(): Promise<RecordEnvelope | null> {
    return null;
  }

  async getWithValidation(options: GetRecordOptions): Promise<StoreResult> {
    const envelope = this.records.get(options.recordId);
    return envelope ? { success: true, envelope } : { success: false, error: 'not found' };
  }

  async list(filter?: RecordFilter): Promise<RecordEnvelope[]> {
    const records = Array.from(this.records.values());
    if (!filter?.kind) return records;
    return records.filter((record) => (record.payload as Record<string, unknown>).kind === filter.kind);
  }

  async create(options: CreateRecordOptions): Promise<StoreResult> {
    this.records.set(options.envelope.recordId, options.envelope);
    return { success: true, envelope: options.envelope };
  }

  async update(options: UpdateRecordOptions): Promise<StoreResult> {
    this.records.set(options.envelope.recordId, options.envelope);
    return { success: true, envelope: options.envelope };
  }

  async delete(options: DeleteRecordOptions): Promise<StoreResult> {
    this.records.delete(options.recordId);
    return { success: true };
  }

  async validate() {
    return { valid: true, errors: [] };
  }

  async lint() {
    return { valid: true, errors: [] };
  }

  async exists(recordId: string): Promise<boolean> {
    return this.records.has(recordId);
  }
}

function env(recordId: string, payload: Record<string, unknown>): RecordEnvelope {
  return { recordId, schemaId: `schema:${String(payload.kind)}`, payload };
}

describe('ProtocolContextService', () => {
  it('groups project templates, experiment protocols, and run methods by links', async () => {
    const store = new MemoryRecordStore([
      env('PRT-project', { kind: 'protocol', recordId: 'PRT-project', title: 'Project PRT', links: { studyId: 'STU-1' }, steps: [] }),
      env('LPR-project', { kind: 'local-protocol', recordId: 'LPR-project', title: 'Project LPR', links: { studyId: 'STU-1' }, inherits_from: { kind: 'record', id: 'PRT-project', type: 'protocol' }, status: 'draft' }),
      env('LPR-exp', { kind: 'local-protocol', recordId: 'LPR-exp', title: 'Experiment LPR', links: { studyId: 'STU-1', experimentId: 'EXP-1' }, inherits_from: { kind: 'record', id: 'PRT-project', type: 'protocol' }, status: 'draft' }),
      env('PLR-run', { kind: 'planned-run', recordId: 'PLR-run', title: 'Run plan', sourceType: 'local-protocol', sourceRef: { kind: 'record', id: 'LPR-exp', type: 'local-protocol' }, state: 'draft', links: { studyId: 'STU-1', experimentId: 'EXP-1', runId: 'RUN-1' } }),
      env('EVG-run', { kind: 'event-graph', id: 'EVG-run', events: [], labwares: [], links: { studyId: 'STU-1', experimentId: 'EXP-1', runId: 'RUN-1' } }),
    ]);

    const context = await new ProtocolContextService(store).getContext({ studyId: 'STU-1', experimentId: 'EXP-1', runId: 'RUN-1' });

    expect(context.projectTemplates.map((record) => record.recordId)).toEqual(['PRT-project', 'LPR-project']);
    expect(context.experimentProtocols.map((record) => record.recordId)).toEqual(['LPR-exp']);
    expect(context.runMethods.map((record) => record.recordId)).toEqual(['PLR-run', 'EVG-run']);
    expect(context.availableProtocols.map((record) => record.recordId)).toEqual(['PLR-run', 'EVG-run', 'LPR-exp', 'PRT-project', 'LPR-project']);
  });

  it('includes lab-wide universal protocols (no links) in availableProtocols', async () => {
    const store = new MemoryRecordStore([
      // A universal lab protocol — no study/experiment/run links.
      env('PRT-universal', { kind: 'protocol', recordId: 'PRT-universal', title: 'Universal qPCR', steps: [] }),
      env('LPR-universal', { kind: 'local-protocol', recordId: 'LPR-universal', title: 'Universal LPR', inherits_from: { kind: 'record', id: 'PRT-universal', type: 'protocol' }, status: 'draft' }),
      // Scoped ones must still be separated by the selector.
      env('PRT-project', { kind: 'protocol', recordId: 'PRT-project', title: 'Project PRT', links: { studyId: 'STU-1' }, steps: [] }),
      env('PLR-run', { kind: 'planned-run', recordId: 'PLR-run', title: 'Run plan', sourceType: 'protocol', sourceRef: { kind: 'record', id: 'PRT-project', type: 'protocol' }, state: 'draft', links: { studyId: 'STU-1', runId: 'RUN-1' } }),
    ]);

    const context = await new ProtocolContextService(store).getContext({ studyId: 'STU-1', runId: 'RUN-1' });

    // Universal lab protocols surface in availableProtocols (regardless of scope).
    expect(context.availableProtocols.map((record) => record.recordId)).toEqual(
      expect.arrayContaining(['PRT-universal', 'LPR-universal']),
    );
    // They must NOT be bucketed as project templates (no studyId link).
    expect(context.projectTemplates.map((record) => record.recordId)).not.toContain('PRT-universal');
    expect(context.projectTemplates.map((record) => record.recordId)).not.toContain('LPR-universal');
  });

  it('uses a protocol in a run by creating planned-run and method event graph records', async () => {
    const store = new MemoryRecordStore([
      env('PRT-qPCR', { kind: 'protocol', recordId: 'PRT-qPCR', title: 'Generic qPCR', links: { studyId: 'STU-1' }, steps: [] }),
      env('RUN-1', { kind: 'run', recordId: 'RUN-1', title: 'Primer test', studyId: 'STU-1', experimentId: 'EXP-1', status: 'planned' }),
    ]);

    const result = await new ProtocolContextService(store).useProtocolInRun({ protocolId: 'PRT-qPCR', runId: 'RUN-1' });

    expect(result.plannedRunId).toMatch(/^PLR-/);
    expect(result.methodEventGraphId).toMatch(/^EVG-/);
    expect((await store.get(result.plannedRunId))?.payload).toMatchObject({
      kind: 'planned-run',
      sourceType: 'protocol',
      links: { studyId: 'STU-1', experimentId: 'EXP-1', runId: 'RUN-1' },
      methodEventGraphId: result.methodEventGraphId,
    });
    expect((await store.get(result.methodEventGraphId))?.payload).toMatchObject({
      kind: 'event-graph',
      id: result.methodEventGraphId,
      methodContext: { runId: 'RUN-1', vocabId: 'liquid-handling/v1', platform: 'manual', locked: false },
    });
    expect((await store.get('RUN-1'))?.payload).toMatchObject({
      methodEventGraphId: result.methodEventGraphId,
      plannedRunRef: { kind: 'record', id: result.plannedRunId, type: 'planned-run' },
    });
  });

  it('specializes a project protocol into an experiment-linked local-protocol', async () => {
    const store = new MemoryRecordStore([
      env('PRT-qPCR', { kind: 'protocol', recordId: 'PRT-qPCR', title: 'Generic qPCR', overview: 'PCR overview', purpose: 'Detect targets', notes: 'Use controls', links: { studyId: 'STU-1' }, steps: [] }),
    ]);

    const record = await new ProtocolContextService(store).specializeForExperiment({ protocolId: 'PRT-qPCR', studyId: 'STU-1', experimentId: 'EXP-LOD' });

    expect(record.recordId).toMatch(/^LPR-/);
    expect(record.payload).toMatchObject({
      kind: 'local-protocol',
      inherits_from: { kind: 'record', id: 'PRT-qPCR', type: 'protocol' },
      links: { studyId: 'STU-1', experimentId: 'EXP-LOD' },
      overview: 'PCR overview',
      purpose: 'Detect targets',
      notes: 'Use controls',
    });
    // Local-protocol is realized via additive overrides (empty until the lab
    // binds roles/parameters — canonical per lifecycle spec §5).
    expect(record.payload).toHaveProperty('overrides');
    expect((record.payload as Record<string, unknown>).overrides).toEqual({});
  });

  it('promotes a run method to a project local-protocol template', async () => {
    const store = new MemoryRecordStore([
      env('PRT-qPCR', { kind: 'protocol', recordId: 'PRT-qPCR', title: 'Generic qPCR', links: { studyId: 'STU-1' }, steps: [] }),
      env('LPR-run', { kind: 'local-protocol', recordId: 'LPR-run', title: 'Run local', inherits_from: { kind: 'record', id: 'PRT-qPCR', type: 'protocol' }, status: 'draft', links: { studyId: 'STU-1', experimentId: 'EXP-1' } }),
      env('PLR-run', { kind: 'planned-run', recordId: 'PLR-run', title: 'Planned', sourceType: 'local-protocol', sourceRef: { kind: 'record', id: 'LPR-run', type: 'local-protocol' }, localProtocolRef: { kind: 'record', id: 'LPR-run', type: 'local-protocol' }, state: 'draft', links: { studyId: 'STU-1', runId: 'RUN-1' }, methodEventGraphId: 'EVG-run' }),
      env('RUN-1', { kind: 'run', recordId: 'RUN-1', title: 'Primer test', studyId: 'STU-1', experimentId: 'EXP-1', status: 'planned', plannedRunRef: { kind: 'record', id: 'PLR-run', type: 'planned-run' }, methodEventGraphId: 'EVG-run' }),
      env('EVG-run', { kind: 'event-graph', id: 'EVG-run', events: [], labwares: [], links: { studyId: 'STU-1', runId: 'RUN-1' } }),
    ]);

    const record = await new ProtocolContextService(store).promoteRunMethod({ runId: 'RUN-1' });

    expect(record.recordId).toMatch(/^LPR-/);
    expect(record.payload).toMatchObject({
      kind: 'local-protocol',
      inherits_from: { kind: 'record', id: 'PRT-qPCR', type: 'protocol' },
      links: { studyId: 'STU-1' },
    });
  });
});
