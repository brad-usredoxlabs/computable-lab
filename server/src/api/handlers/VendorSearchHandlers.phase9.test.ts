/**
 * Phase 9 ingest → artifact-record tests.
 *
 *  - ingest with `studyId` writes a kind=artifact record to the store
 *  - ingest WITHOUT `studyId` persists a kind=vendor-pdf record (Phase 2)
 *  - ingest with no `store` configured doesn't write (handler still
 *    returns sourcePdf metadata so legacy chat keeps working)
 *  - re-ingesting the same PDF (same sha256) is a no-op (idempotent)
 *  - malformed studyId returns 400
 *  - failures inside extractVendorPdfText degrade gracefully (artifact
 *    still written, with empty extractedText)
 *
 * Phase 2 vendor-pdf tests:
 *  - vendor-pdf record always written (with or without studyId)
 *  - vendor-pdf carries links.studyId only when studyId was provided
 *  - vendor-pdf recordId is VPDF-<sha256_prefix>
 *  - vendor-pdf source.engine === 'exa'
 *  - vendor-pdf carries vendorProtocolCandidateRef
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDownloadVendorPdf = vi.hoisted(() => vi.fn());
const mockExtractCandidate = vi.hoisted(() => vi.fn());
const mockExtractVendorPdfText = vi.hoisted(() => vi.fn());

vi.mock('../../vendor-documents/pdfAcquisition.js', () => ({
  downloadVendorPdf: mockDownloadVendorPdf,
  extractVendorPdfText: mockExtractVendorPdfText,
}));

vi.mock(
  '../../ingestion/vendor-protocol/VendorProtocolCandidateService.js',
  () => ({
    extractVendorProtocolCandidateFromInput: mockExtractCandidate,
  }),
);

import { createVendorSearchHandlers } from './VendorSearchHandlers.js';
import type { RecordStore } from '../../store/types.js';
import type { RecordEnvelope } from '../../types/RecordEnvelope.js';

function makeReply() {
  let statusCode = 200;
  let body: unknown;
  const reply = {
    status(code: number) {
      statusCode = code;
      return reply;
    },
    code(code: number) {
      statusCode = code;
      return reply;
    },
    send(payload: unknown) {
      body = payload;
      return reply;
    },
  } as unknown as FastifyReply;
  return {
    reply,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
  };
}

function ingestRequest(body: Record<string, unknown>) {
  return {
    body,
    log: { warn: vi.fn() },
  } as unknown as FastifyRequest<{ Body: typeof body }>;
}

const SAMPLE_SHA = 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd';

function downloadResult() {
  return {
    kind: 'vendor-pdf-download' as const,
    status: 'downloaded' as const,
    url: 'https://vendor.example/protocol.pdf',
    effectiveUrl: 'https://vendor.example/protocol.pdf',
    artifactPath: '/workspace/artifacts/foundry/pdfs/protocol.pdf',
    relativePath: 'artifacts/foundry/pdfs/protocol.pdf',
    sidecarPath: '/workspace/artifacts/foundry/pdfs/protocol.pdf.json',
    contentType: 'application/pdf',
    bytesDownloaded: 42,
    sha256: SAMPLE_SHA,
    validation: 'valid PDF',
    generatedAt: '2026-06-02T00:00:00.000Z',
  };
}

function candidateResult() {
  return {
    kind: 'vendor-protocol-candidate-extraction' as const,
    source: {
      inputKind: 'pdf' as const,
      artifactPath: 'artifacts/foundry/pdfs/protocol.pdf',
      fileName: 'protocol.pdf',
      sha256: SAMPLE_SHA,
    },
    candidate: {
      title: 'Buffer prep protocol',
      sections: [],
      // summarizeProtocolCandidate reads these directly — the real
      // service always populates them, so the mock has to as well.
      source: {
        documentId: 'graph-lemur-abc123def456',
        vendor: 'thermo',
        title: 'Buffer prep protocol',
      },
      materials: [],
      labware: [],
      equipment: [],
      steps: [],
      diagnostics: [],
    },
    candidatePath: 'artifacts/foundry/protocol-candidates/abc.json',
    document: {
      source: {
        documentId: 'graph-lemur-abc123def456',
        filename: 'protocol.pdf',
        title: 'Buffer prep protocol',
        vendor: 'thermo',
        pageCount: 8,
      },
      pageCount: 8,
      sectionCount: 3,
      tableCount: 1,
      diagnostics: [],
    },
  };
}

function makeStubStore(): {
  store: RecordStore;
  upserted: RecordEnvelope[];
  shouldExist: Set<string>;
} {
  const upserted: RecordEnvelope[] = [];
  const shouldExist = new Set<string>();
  const store = {
    async get(id: string) {
      return upserted.find((e) => e.recordId === id) ?? null;
    },
    async exists(id: string) {
      return shouldExist.has(id);
    },
    async create({ envelope }: { envelope: RecordEnvelope }) {
      upserted.push(envelope);
      shouldExist.add(envelope.recordId);
      return { success: true, envelope };
    },
    async update() {
      return { success: false };
    },
    async delete() {
      return { success: false };
    },
    async list() {
      return upserted;
    },
    async getByPath() {
      return null;
    },
    async getWithValidation() {
      return { success: false };
    },
    async validate() {
      return { valid: true, errors: [] };
    },
    async lint() {
      return { valid: true, errors: [] };
    },
  } as unknown as RecordStore;
  return { store, upserted, shouldExist };
}

beforeEach(() => {
  mockDownloadVendorPdf.mockResolvedValue(downloadResult());
  mockExtractCandidate.mockResolvedValue(candidateResult());
  mockExtractVendorPdfText.mockResolvedValue({
    kind: 'vendor-pdf-text-extraction',
    source: { fileName: 'protocol.pdf', sha256: SAMPLE_SHA },
    mode: 'layout',
    layoutText: {
      pages: [
        { pageNumber: 1, text: 'Page 1: buffer prep' },
        { pageNumber: 2, text: 'Page 2: incubate' },
      ],
      pageCount: 2,
    },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GraphLemur PDF ingest → artifact', () => {
  it('writes a kind=vendor-pdf record AND legacy artifact when studyId is supplied', async () => {
    const { store, upserted } = makeStubStore();
    const handlers = createVendorSearchHandlers({
      workspaceRoot: '/workspace',
      store,
    });
    const reply = makeReply();
    const result = await handlers.ingestGraphLemurPdf(
      ingestRequest({
        url: 'https://vendor.example/protocol.pdf',
        studyId: 'STU-000001',
        query: 'buffer prep',
      }),
      reply.reply,
    );
    expect(reply.statusCode).toBe(200);

    // vendor-pdf record
    expect(upserted).toHaveLength(2);
    const vpdfEnv = upserted[0];
    expect(vpdfEnv.recordId).toBe(`VPDF-${SAMPLE_SHA.slice(0, 12).toUpperCase()}`);
    const vpdfPayload = vpdfEnv.payload as Record<string, unknown>;
    expect(vpdfPayload.kind).toBe('vendor-pdf');
    expect(vpdfPayload.state).toBe('ingested');
    const vpdfSource = vpdfPayload.source as Record<string, unknown>;
    expect(vpdfSource.engine).toBe('exa');
    expect(vpdfSource.query).toBe('buffer prep');
    const vpdfLinks = vpdfPayload.links as Record<string, unknown>;
    expect(vpdfLinks).toBeDefined();
    expect(vpdfLinks.studyId).toBe('STU-000001');
    const vpdfRef = vpdfPayload.vendorProtocolCandidateRef as Record<string, unknown>;
    expect(vpdfRef.kind).toBe('record');
    expect(vpdfRef.type).toBe('vendor-protocol-candidate');
    expect(vpdfRef.id).toBe(`graph-lemur-${SAMPLE_SHA.slice(0, 12)}`);
    const vpdfFile = vpdfPayload.file as Record<string, unknown>;
    expect(vpdfFile.stored_path).toBe('artifacts/foundry/pdfs/protocol.pdf');
    expect(vpdfFile.sha256).toBe(SAMPLE_SHA);
    const vpdfExtracted = vpdfPayload.extractedText as Array<unknown>;
    expect(vpdfExtracted).toHaveLength(2);

    // Legacy artifact record (Phase 9 back-compat)
    const artEnv = upserted[1];
    expect(artEnv.recordId).toBe(`ART-${SAMPLE_SHA.slice(0, 12).toUpperCase()}`);
    const artPayload = artEnv.payload as Record<string, unknown>;
    expect(artPayload.kind).toBe('artifact');
    expect(artPayload.artifactKind).toBe('pdf');
    expect(artPayload.studyId).toBe('STU-000001');

    // recordedArtifact reflects vendor-pdf
    expect((result as { recordedArtifact?: { recordId: string } }).recordedArtifact)
      .toBeDefined();
    expect((result as { recordedArtifact?: { recordId: string; studyId?: string } }).recordedArtifact?.recordId)
      .toBe(`VPDF-${SAMPLE_SHA.slice(0, 12).toUpperCase()}`);
    expect((result as { recordedArtifact?: { recordId: string; studyId?: string } }).recordedArtifact?.studyId)
      .toBe('STU-000001');
  });

  it('writes a kind=vendor-pdf record when studyId is omitted (no legacy artifact)', async () => {
    const { store, upserted } = makeStubStore();
    const handlers = createVendorSearchHandlers({
      workspaceRoot: '/workspace',
      store,
    });
    const reply = makeReply();
    const result = await handlers.ingestGraphLemurPdf(
      ingestRequest({ url: 'https://vendor.example/protocol.pdf' }),
      reply.reply,
    );
    expect(reply.statusCode).toBe(200);

    // vendor-pdf record written
    expect(upserted).toHaveLength(1);
    const env = upserted[0];
    expect(env.recordId).toBe(`VPDF-${SAMPLE_SHA.slice(0, 12).toUpperCase()}`);
    const payload = env.payload as Record<string, unknown>;
    expect(payload.kind).toBe('vendor-pdf');
    expect(payload.state).toBe('ingested');
    const source = payload.source as Record<string, unknown>;
    expect(source.engine).toBe('exa');
    // No links key when studyId not provided
    expect(payload.links).toBeUndefined();
    const ref = payload.vendorProtocolCandidateRef as Record<string, unknown>;
    expect(ref.kind).toBe('record');
    expect(ref.type).toBe('vendor-protocol-candidate');

    // recordedArtifact reflects vendor-pdf without studyId
    expect((result as { recordedArtifact?: { recordId: string; studyId?: string } }).recordedArtifact)
      .toBeDefined();
    expect((result as { recordedArtifact?: { recordId: string; studyId?: string } }).recordedArtifact?.recordId)
      .toBe(`VPDF-${SAMPLE_SHA.slice(0, 12).toUpperCase()}`);
    expect((result as { recordedArtifact?: { recordId: string; studyId?: string } }).recordedArtifact?.studyId)
      .toBeUndefined();
  });

  it('does NOT write when no store is configured (legacy server)', async () => {
    const handlers = createVendorSearchHandlers({
      workspaceRoot: '/workspace',
      // store omitted
    });
    const reply = makeReply();
    const result = await handlers.ingestGraphLemurPdf(
      ingestRequest({
        url: 'https://vendor.example/protocol.pdf',
        studyId: 'STU-000001',
      }),
      reply.reply,
    );
    expect(reply.statusCode).toBe(200);
    expect((result as { recordedArtifact?: unknown }).recordedArtifact).toBeUndefined();
  });

  it('is idempotent on re-ingest (same sha256)', async () => {
    const { store, upserted, shouldExist } = makeStubStore();
    // Mark the vendor-pdf id as already-existing so the handler skips create().
    shouldExist.add(`VPDF-${SAMPLE_SHA.slice(0, 12).toUpperCase()}`);
    shouldExist.add(`ART-${SAMPLE_SHA.slice(0, 12).toUpperCase()}`);
    const handlers = createVendorSearchHandlers({
      workspaceRoot: '/workspace',
      store,
    });
    const reply = makeReply();
    const result = await handlers.ingestGraphLemurPdf(
      ingestRequest({
        url: 'https://vendor.example/protocol.pdf',
        studyId: 'STU-000001',
      }),
      reply.reply,
    );
    expect(reply.statusCode).toBe(200);
    // No new write, but recordedArtifact still surfaced so the caller
    // can reference the existing vendor-pdf record.
    expect(upserted).toHaveLength(0);
    expect((result as { recordedArtifact?: { recordId: string } }).recordedArtifact?.recordId)
      .toBe(`VPDF-${SAMPLE_SHA.slice(0, 12).toUpperCase()}`);
  });

  it('rejects malformed studyId with 400', async () => {
    const { store } = makeStubStore();
    const handlers = createVendorSearchHandlers({
      workspaceRoot: '/workspace',
      store,
    });
    const reply = makeReply();
    await handlers.ingestGraphLemurPdf(
      ingestRequest({
        url: 'https://vendor.example/protocol.pdf',
        studyId: '../etc/passwd',
      }),
      reply.reply,
    );
    expect(reply.statusCode).toBe(400);
  });

  it('writes both records with empty extractedText when layout extraction fails', async () => {
    mockExtractVendorPdfText.mockRejectedValueOnce(new Error('pdfjs explosion'));
    const { store, upserted } = makeStubStore();
    const handlers = createVendorSearchHandlers({
      workspaceRoot: '/workspace',
      store,
    });
    const reply = makeReply();
    await handlers.ingestGraphLemurPdf(
      ingestRequest({
        url: 'https://vendor.example/protocol.pdf',
        studyId: 'STU-000001',
      }),
      reply.reply,
    );
    // Both vendor-pdf and legacy artifact written, both with empty extractedText
    expect(upserted).toHaveLength(2);
    for (const env of upserted) {
      const extractedText = (env.payload as Record<string, unknown>)
        .extractedText as Array<unknown>;
      expect(extractedText).toHaveLength(0);
    }
  });
});
