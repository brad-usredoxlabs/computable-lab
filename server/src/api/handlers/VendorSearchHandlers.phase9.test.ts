/**
 * Phase 9 ingest → artifact-record tests.
 *
 *  - ingest with `studyId` writes a kind=artifact record to the store
 *  - ingest without `studyId` doesn't write (legacy behavior preserved)
 *  - ingest with no `store` configured doesn't write (handler still
 *    returns sourcePdf metadata so legacy chat keeps working)
 *  - re-ingesting the same PDF (same sha256) is a no-op (idempotent)
 *  - malformed studyId returns 400
 *  - failures inside extractVendorPdfText degrade gracefully (artifact
 *    still written, with empty extractedText)
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
  it('writes a kind=artifact record when studyId is supplied', async () => {
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
    expect((result as { recordedArtifact?: { recordId: string } }).recordedArtifact)
      .toBeDefined();
    expect(upserted).toHaveLength(1);
    const env = upserted[0];
    expect(env.recordId).toBe(`ART-${SAMPLE_SHA.slice(0, 12).toUpperCase()}`);
    const payload = env.payload as Record<string, unknown>;
    expect(payload.kind).toBe('artifact');
    expect(payload.artifactKind).toBe('pdf');
    expect(payload.studyId).toBe('STU-000001');
    const file = payload.file as Record<string, unknown>;
    expect(file.stored_path).toBe('artifacts/foundry/pdfs/protocol.pdf');
    expect(file.sha256).toBe(SAMPLE_SHA);
    const extractedText = payload.extractedText as Array<unknown>;
    expect(extractedText).toHaveLength(2);
  });

  it('does NOT write a record when studyId is omitted (legacy chat path)', async () => {
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
    expect((result as { recordedArtifact?: unknown }).recordedArtifact).toBeUndefined();
    expect(upserted).toHaveLength(0);
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
    // Mark the artifact id as already-existing so the handler skips create().
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
    // can reference the existing artifact.
    expect(upserted).toHaveLength(0);
    expect((result as { recordedArtifact?: { recordId: string } }).recordedArtifact?.recordId)
      .toBe(`ART-${SAMPLE_SHA.slice(0, 12).toUpperCase()}`);
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

  it('writes the artifact with empty extractedText when layout extraction fails', async () => {
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
    expect(upserted).toHaveLength(1);
    const extractedText = (upserted[0].payload as Record<string, unknown>)
      .extractedText as Array<unknown>;
    expect(extractedText).toHaveLength(0);
  });
});
