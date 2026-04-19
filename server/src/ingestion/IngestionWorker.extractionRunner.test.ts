import { describe, expect, it, vi } from 'vitest';
import { IngestionWorker } from './IngestionWorker.js';
import type { RecordEnvelope, RecordStore } from '../store/types.js';
import type { ExtractionRunnerService } from '../extract/ExtractionRunnerService.js';
import type { ExtractionDraftBody } from '../extract/ExtractionDraftBuilder.js';
import type { IngestionArtifactPayload, IngestionJobPayload } from './types.js';

describe('IngestionWorker with ExtractionRunnerService', () => {
  it('calls extractionRunner.run when no library match is found and runner is supplied', async () => {
    // Create a fake store
    const store: RecordStore = {
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      list: vi.fn(),
      getByPath: vi.fn(),
      getWithValidation: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
      validate: vi.fn(),
      lint: vi.fn(),
    };

    // Create a fake ExtractionRunnerService
    const mockDraftBody: ExtractionDraftBody = {
      kind: 'extraction-draft',
      recordId: 'XDR-test-draft-001',
      source_artifact: { kind: 'file', id: 'ART-001', locator: 'test.pdf' },
      status: 'pending_review',
      candidates: [],
      created_at: new Date().toISOString(),
    };

    const extractionRunner: ExtractionRunnerService = {
      run: vi.fn().mockResolvedValue(mockDraftBody),
    } as unknown as ExtractionRunnerService;

    // Create blob store mock
    const blobStore = {
      loadBase64: vi.fn().mockResolvedValue(Buffer.from('test content').toString('base64')),
    };

    // Create worker with extraction runner
    const worker = new IngestionWorker(store, blobStore as any, extractionRunner);

    // Setup mock responses
    const mockJob: RecordEnvelope<IngestionJobPayload> = {
      schemaId: 'https://computable-lab.com/schema/computable-lab/ingestion-job.schema.yaml',
      recordId: 'JOB-001',
      kind: 'ingestion-job',
      payload: {
        kind: 'ingestion-job',
        id: 'JOB-001',
        name: 'Test Job',
        status: 'queued',
        stage: 'collect',
        source_kind: 'ai_assisted',
        submitted_at: new Date().toISOString(),
        artifact_refs: [{ id: 'ART-001' }],
      },
    };

    const mockArtifact: RecordEnvelope<IngestionArtifactPayload> = {
      schemaId: 'https://computable-lab.com/schema/computable-lab/ingestion-artifact.schema.yaml',
      recordId: 'ART-001',
      kind: 'ingestion-artifact',
      payload: {
        kind: 'ingestion-artifact',
        id: 'ART-001',
        job_ref: { recordId: 'JOB-001' },
        artifact_role: 'primary_source',
        file_ref: { file_name: 'unknown.pdf', stored_path: 'test.pdf' },
        media_type: 'application/pdf',
      },
    };

    // Setup store mocks
    let getCallCount = 0;
    store.get = vi.fn((id: string) => {
      getCallCount++;
      if (id === 'JOB-001') return Promise.resolve(mockJob);
      if (id === 'ART-001') return Promise.resolve(mockArtifact);
      return Promise.resolve(null);
    });

    let createCallCount = 0;
    store.create = vi.fn((args: { envelope: RecordEnvelope; message: string; skipLint: boolean }) => {
      createCallCount++;
      // First create call should be for the extraction-draft
      if (createCallCount === 1) {
        expect(args.envelope.recordId).toMatch(/^XDR-/);
        expect((args.envelope.payload as any).kind).toBe('extraction-draft');
      }
      return Promise.resolve({ success: true, envelope: args.envelope });
    });

    let updateCallCount = 0;
    store.update = vi.fn((args: { envelope: RecordEnvelope; message: string; skipLint: boolean }) => {
      updateCallCount++;
      const envelope = args.envelope as RecordEnvelope<IngestionArtifactPayload>;
      // Check for artifact update with text_extract metadata
      if (envelope.kind === 'ingestion-artifact' && envelope.payload.text_extract) {
        expect(envelope.payload.text_extract.method).toBe('extraction_pipeline');
        expect(envelope.payload.text_extract.draft_record_id).toBe('XDR-test-draft-001');
        expect(envelope.payload.text_extract.extracted_at).toBeTruthy();
      }
      return Promise.resolve({ success: true, envelope: args.envelope });
    });

    store.list = vi.fn().mockResolvedValue([]);

    // Run the job
    const result = await worker.runJob('JOB-001', {
      fileName: 'unknown.pdf',
      contentBase64: Buffer.from('test content').toString('base64'),
    });

    // Verify extractionRunner.run was called
    expect(extractionRunner.run).toHaveBeenCalledTimes(1);
    const runArgs = (extractionRunner.run as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(runArgs).toMatchObject({
      target_kind: 'material-spec',
      source: {
        kind: 'file',
        id: 'ART-001',
        locator: 'unknown.pdf',
      },
    });

    // Verify store.create was called with extraction-draft
    expect(store.create).toHaveBeenCalled();
    const draftCreateCall = (store.create as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: any) => (call[0].envelope.payload as any).kind === 'extraction-draft'
    );
    expect(draftCreateCall).toBeTruthy();
    expect(draftCreateCall[0].envelope.recordId).toMatch(/^XDR-/);

    // Verify artifact was updated with text_extract metadata
    const artifactUpdateCall = (store.update as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: any) => {
        const envelope = call[0].envelope as RecordEnvelope<IngestionArtifactPayload>;
        return envelope.kind === 'ingestion-artifact' && envelope.payload.text_extract?.method === 'extraction_pipeline';
      }
    );
    expect(artifactUpdateCall).toBeTruthy();
    expect(artifactUpdateCall[0].envelope.payload.text_extract.draft_record_id).toBe('XDR-test-draft-001');

    // Verify job was updated to review stage
    expect(result).toBeTruthy();
    expect(result?.payload.stage).toBe('review');
    expect(result?.payload.status).toBe('waiting_for_review');
  });

  it('throws when extractionRunner is supplied but draft creation fails', async () => {
    // Create a fake store
    const store: RecordStore = {
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      list: vi.fn(),
      getByPath: vi.fn(),
      getWithValidation: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
      validate: vi.fn(),
      lint: vi.fn(),
    };

    // Create a fake ExtractionRunnerService that returns a draft
    const mockDraftBody: ExtractionDraftBody = {
      kind: 'extraction-draft',
      recordId: 'XDR-test-draft-002',
      source_artifact: { kind: 'file', id: 'ART-002', locator: 'test.pdf' },
      status: 'pending_review',
      candidates: [],
      created_at: new Date().toISOString(),
    };

    const extractionRunner: ExtractionRunnerService = {
      run: vi.fn().mockResolvedValue(mockDraftBody),
    } as unknown as ExtractionRunnerService;

    // Create blob store mock
    const blobStore = {
      loadBase64: vi.fn().mockResolvedValue(Buffer.from('test content').toString('base64')),
    };

    // Create worker WITH extraction runner
    const worker = new IngestionWorker(store, blobStore as any, extractionRunner);

    // Setup mock responses
    const mockJob: RecordEnvelope<IngestionJobPayload> = {
      schemaId: 'https://computable-lab.com/schema/computable-lab/ingestion-job.schema.yaml',
      recordId: 'JOB-002',
      kind: 'ingestion-job',
      payload: {
        kind: 'ingestion-job',
        id: 'JOB-002',
        name: 'Test Job No Runner',
        status: 'queued',
        stage: 'collect',
        source_kind: 'ai_assisted',
        submitted_at: new Date().toISOString(),
        artifact_refs: [{ id: 'ART-002' }],
      },
    };

    const mockArtifact: RecordEnvelope<IngestionArtifactPayload> = {
      schemaId: 'https://computable-lab.com/schema/computable-lab/ingestion-artifact.schema.yaml',
      recordId: 'ART-002',
      kind: 'ingestion-artifact',
      payload: {
        kind: 'ingestion-artifact',
        id: 'ART-002',
        job_ref: { recordId: 'JOB-002' },
        artifact_role: 'primary_source',
        file_ref: { file_name: 'unknown.pdf', stored_path: 'test.pdf' },
        media_type: 'application/pdf',
      },
    };

    // Setup store mocks - need to handle multiple calls
    let getCallCount = 0;
    store.get = vi.fn((id: string) => {
      getCallCount++;
      if (id === 'JOB-002') return Promise.resolve(mockJob);
      if (id === 'ART-002') return Promise.resolve(mockArtifact);
      return Promise.resolve(null);
    });

    let updateCallCount = 0;
    store.update = vi.fn((args: { envelope: RecordEnvelope; message: string; skipLint: boolean }) => {
      updateCallCount++;
      // First few updates are for job progression - succeed
      if (updateCallCount <= 3) {
        return Promise.resolve({ success: true, envelope: args.envelope });
      }
      return Promise.resolve({ success: true, envelope: args.envelope });
    });

    // Mock store.create to fail on draft creation (4th call after job/artifact updates)
    let createCallCount = 0;
    store.create = vi.fn((args: { envelope: RecordEnvelope; message: string; skipLint: boolean }) => {
      createCallCount++;
      // First create is for the stub issue (if any), succeed
      // Second create is for the extraction-draft - fail
      if (createCallCount === 2) {
        return Promise.resolve({ success: false, error: 'Draft creation failed' });
      }
      return Promise.resolve({ success: true, envelope: args.envelope });
    });

    store.list = vi.fn().mockResolvedValue([]);

    // Should throw because bundle creation failed (draft was created but bundle failed)
    await expect(worker.runJob('JOB-002', {
      fileName: 'unknown.pdf',
      contentBase64: Buffer.from('test content').toString('base64'),
    })).rejects.toThrow('Failed to create bundle XDR-test-draft-002: Draft creation failed');
  });
});
