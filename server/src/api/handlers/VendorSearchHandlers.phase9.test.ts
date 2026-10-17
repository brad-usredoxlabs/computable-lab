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
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDownloadVendorPdf = vi.hoisted(() => vi.fn());
const mockExtractCandidate = vi.hoisted(() => vi.fn());
const mockExtractVendorPdfText = vi.hoisted(() => vi.fn());
const mockExaGetContents = vi.hoisted(() => vi.fn());

vi.mock('../../integrations/exa.js', () => ({
  exaSearch: vi.fn(),
  exaGetContents: mockExaGetContents,
  resolveExaConfig: () => ({ apiKey: 'test-key' }),
}));

vi.mock('../../vendor-documents/pdfAcquisition.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../vendor-documents/pdfAcquisition.js')>();
  return {
    ...actual,
    downloadVendorPdf: mockDownloadVendorPdf,
    extractVendorPdfText: mockExtractVendorPdfText,
  };
});

vi.mock(
  '../../ingestion/vendor-protocol/VendorProtocolCandidateService.js',
  () => ({
    extractVendorProtocolCandidateFromInput: mockExtractCandidate,
  }),
);

import { createVendorSearchHandlers } from './VendorSearchHandlers.js';
import type { RecordStore } from '../../store/types.js';
import type { RecordEnvelope } from '../../types/RecordEnvelope.js';
import { createSchemaRegistry } from '../../schema/SchemaRegistry.js';
import { loadSchemasFromContent } from '../../schema/SchemaLoader.js';
import { createValidator } from '../../validation/AjvValidator.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Bait 5 guard: the upload payload the handler builds must pass the REAL
 * vendor-pdf Ajv gate (strict, same registry load as the server runtime) —
 * a stub store that accepts anything would hide an undeclared source field.
 */
async function validateAgainstVendorPdfSchema(payload: unknown): Promise<{ valid: boolean; errors: unknown }> {
  const registry = createSchemaRegistry();
  const validator = createValidator({ strict: true });
  const schemaRoot = join(process.cwd(), '..', 'schema');
  const paths = [
    'lab/vendor-pdf.schema.yaml',
    'core/common.schema.yaml',
    'core/datatypes/file-ref.schema.yaml',
    'core/datatypes/ref.schema.yaml',
  ];
  const contents = new Map<string, string>();
  for (const path of paths) contents.set(path, await readFile(join(schemaRoot, path), 'utf8'));
  const result = loadSchemasFromContent(contents);
  registry.addSchemas(result.entries);
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema, entry.id);
  }
  return validator.validate(payload, 'https://computable-lab.com/schema/computable-lab/vendor-pdf.schema.yaml');
}

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

  it('persists a durable vendor-pdf record when the vendor blocks the download, even without studyId', async () => {
    // Vendor blocks the direct download → server falls back to Exa text.
    mockDownloadVendorPdf.mockRejectedValueOnce(new Error('HTTP 403'));
    mockExaGetContents.mockResolvedValue({
      results: [{ text: 'Exa fallback protocol text...', title: 'Blocked Protocol' }],
    });

    const { store, upserted } = makeStubStore();
    const handlers = createVendorSearchHandlers({
      workspaceRoot: '/workspace',
      store,
    });
    const reply = makeReply();
    const result = await handlers.ingestGraphLemurPdf(
      ingestRequest({ url: 'https://vendor.example/blocked.pdf' }),
      reply.reply,
    );
    expect(reply.statusCode).toBe(200);

    // Despite no studyId, a durable vendor-pdf record is written so the ingest
    // is never "silently lost" — the free-floating ingestion surface needs it.
    const vpdf = upserted.find((e) => (e.payload as { kind?: string }).kind === 'vendor-pdf');
    expect(vpdf).toBeDefined();
    const payload = vpdf!.payload as Record<string, unknown>;
    expect(payload.state).toBe('ingested');
    expect(payload.file).toBeUndefined(); // no binary — text-only
    expect((payload.extractedText as Array<{ text?: string }>)[0]?.text).toContain('Exa fallback');

    const recorded = (result as { recordedArtifact?: { recordId?: string } }).recordedArtifact;
    expect(recorded?.recordId).toBe(vpdf!.recordId);
  });
});

describe('GraphLemur PDF upload → durable vendor-pdf record', () => {
  it('persists a vendor-pdf record from an uploaded PDF', async () => {
    const { store, upserted } = makeStubStore();
    const handlers = createVendorSearchHandlers({
      workspaceRoot: '/workspace',
      store,
    });
    const reply = makeReply();
    // A minimal PDF header is enough — the handler hashes bytes and persists
    // without re-parsing the bytes.
    const base64 = Buffer.from('%PDF-1.4 uploaded-demo-bytes').toString('base64');
    const result = await handlers.ingestGraphLemurPdfUpload(
      ingestRequest({
        url: 'https://vendor.example/protocol.pdf',
        title: 'Uploaded protocol',
        vendor: 'thermo',
        fileName: 'protocol.pdf',
        contentBase64: base64,
      }),
      reply.reply,
    );
    expect(reply.statusCode).toBe(200);

    expect(upserted).toHaveLength(1);
    const env = upserted[0];
    const payload = env.payload as Record<string, unknown>;
    expect(payload.kind).toBe('vendor-pdf');
    expect(payload.state).toBe('ingested');
    // Content-addressed by the uploaded bytes
    const expected = createVendorPdfIdFromBytes(base64);
    expect(env.recordId).toBe(expected);

    const source = payload.source as Record<string, unknown>;
    // DOCINGEST-A A5 (OQ3 contract inversion, deliberate): the upload path
    // stamps engine 'upload'. Stamping 'exa' here was a false provenance —
    // an uploaded file the user brought back has no Exa provenance. The
    // URL-ingest arms above keep engine 'exa'.
    expect(source.engine).toBe('upload');
    expect(source.url).toBe('https://vendor.example/protocol.pdf');
    const file = payload.file as Record<string, unknown>;
    expect(file.media_type).toBe('application/pdf');
    expect(file.file_name).toBe('protocol.pdf');

    const recorded = (result as { recordedArtifact?: { recordId: string } }).recordedArtifact;
    expect(recorded?.recordId).toBe(expected);
  });

  it('returns 400 when contentBase64 is missing', async () => {
    const { store } = makeStubStore();
    const handlers = createVendorSearchHandlers({
      workspaceRoot: '/workspace',
      store,
    });
    const reply = makeReply();
    await handlers.ingestGraphLemurPdfUpload(
      ingestRequest({ url: 'https://vendor.example/protocol.pdf' }),
      reply.reply,
    );
    expect(reply.statusCode).toBe(400);
  });

  // DOCINGEST-A A5 — the upload accepts what a lab actually has. A lab-
  // authored .md becomes a durable vendor-pdf with honest upload provenance
  // (engine 'upload', mediaKind 'text', originalFileName), an honest
  // media_type from the config-declared format map, an extension-preserving
  // artifact (a .md stored as .pdf would make the blob handler serve text as
  // application/pdf), and REAL extraction (today the upload ran none).
  it('uploads a lab markdown document: upload provenance, text mediaKind, .md artifact, real pseudo-page extraction', async () => {
    const mdText = '# Lysis protocol\n\n1. Add 500 uL of buffer.\n';
    mockExtractVendorPdfText.mockResolvedValue({
      kind: 'vendor-pdf-text-extraction',
      source: { fileName: 'lysis.md', sha256: SAMPLE_SHA },
      mode: 'both',
      mediaKind: 'text',
      plainText: {
        text: mdText,
        pageCount: 1,
        diagnostics: [{ severity: 'info', code: 'markdown_as_text', message: 'read as plain text' }],
      },
      layoutText: { pages: [{ pageNumber: 1, text: mdText }], pageCount: 1 },
    });
    const { store, upserted } = makeStubStore();
    const handlers = createVendorSearchHandlers({ workspaceRoot: '/workspace', store });
    const reply = makeReply();
    const base64 = Buffer.from(mdText).toString('base64');
    const result = await handlers.ingestGraphLemurPdfUpload(
      ingestRequest({ title: 'Composer md probe', fileName: 'lysis.md', contentBase64: base64 }),
      reply.reply,
    );
    expect(reply.statusCode).toBe(200);
    expect(upserted).toHaveLength(1);
    const payload = upserted[0].payload as Record<string, unknown>;
    const source = payload.source as Record<string, unknown>;
    expect(source.engine).toBe('upload');
    expect(source.mediaKind).toBe('text');
    expect(source.originalFileName).toBe('lysis.md');
    expect(source.url, 'an upload must never fabricate a url').toBeUndefined();
    const file = payload.file as Record<string, unknown>;
    expect(file.media_type).toBe('text/markdown');
    expect(file.file_name).toBe('lysis.md');
    expect(String(file.stored_path).endsWith('.md'), 'the artifact keeps the ORIGINAL extension').toBe(true);
    expect(file.page_count, 'file.page_count (minimum 1) must be omitted for a non-PDF').toBeUndefined();
    const pages = payload.extractedText as Array<{ pageNumber: number; text: string }>;
    expect(pages).toHaveLength(1);
    expect(pages[0]?.text).toContain('Lysis protocol');
    // Bait 5: the handler-built payload must pass the REAL Ajv gate, not just
    // the stub store. Validate the exact payload the handler handed the store.
    const { valid, errors } = await validateAgainstVendorPdfSchema(payload);
    expect(valid, JSON.stringify(errors)).toBe(true);
    const recorded = (result as { recordedArtifact?: { recordId: string; extractedTextPageCount?: number } }).recordedArtifact;
    expect(recorded?.extractedTextPageCount).toBe(1);
  });

  // S5 honesty arms: when the configured reader is MISSING (pandoc is absent
  // on this host), the record must still be stored AND must carry the honest
  // diagnostic on itself — the review page reads it from the record. A stored
  // docx with a silent empty text pane is the exact state §12 forbids.
  it('stores a .docx upload with the honest DOCX_TOOL_MISSING diagnostic ON THE RECORD (never a blank success)', async () => {
    mockExtractVendorPdfText.mockResolvedValue({
      kind: 'vendor-pdf-text-extraction',
      source: { fileName: 'demo-sop.docx', sha256: SAMPLE_SHA },
      mode: 'both',
      mediaKind: 'text',
      plainText: {
        text: '',
        pageCount: 1,
        diagnostics: [{ severity: 'error', code: 'DOCX_TOOL_MISSING', message: 'The configured DOCX reader "pandoc" is not installed on this host.' }],
      },
      layoutText: { pages: [{ pageNumber: 1, text: '' }], pageCount: 1 },
    });
    const { store, upserted } = makeStubStore();
    const handlers = createVendorSearchHandlers({ workspaceRoot: '/workspace', store });
    const reply = makeReply();
    const base64 = Buffer.from('PK\u0003\u0004 fake docx bytes').toString('base64');
    const result = await handlers.ingestGraphLemurPdfUpload(
      ingestRequest({ title: 'DEMO docx probe', fileName: 'demo-sop.docx', contentBase64: base64 }),
      reply.reply,
    );
    expect(reply.statusCode).toBe(200);
    expect(upserted, 'the document IS stored — the honest state is stored-with-diagnostic, not refused').toHaveLength(1);
    const payload = upserted[0].payload as Record<string, unknown>;
    const diagnostics = payload.extractionDiagnostics as Array<{ code: string; severity: string }> | undefined;
    expect(diagnostics, 'the record must carry the extraction diagnostics — a blank success is forbidden').toBeTruthy();
    expect(diagnostics.some((d) => d.code === 'DOCX_TOOL_MISSING')).toBe(true);
    const responseExtraction = (result as { extraction?: { diagnostics?: Array<{ code: string }> } }).extraction;
    expect(responseExtraction?.diagnostics?.some((d) => d.code === 'DOCX_TOOL_MISSING')).toBe(true);
    const { valid, errors } = await validateAgainstVendorPdfSchema(payload);
    expect(valid, JSON.stringify(errors)).toBe(true);
  });

  it('refuses an unreadable upload (virus.exe) with UNSUPPORTED_DOCUMENT and writes NOTHING', async () => {
    const { store, upserted } = makeStubStore();
    const handlers = createVendorSearchHandlers({ workspaceRoot: '/workspace', store });
    const reply = makeReply();
    const base64 = Buffer.from('MZ fake executable bytes').toString('base64');
    const result = await handlers.ingestGraphLemurPdfUpload(
      ingestRequest({ title: 'not a document', fileName: 'virus.exe', contentBase64: base64 }),
      reply.reply,
    );
    expect(reply.statusCode).toBe(415);
    const body = result as unknown as { error?: string; message?: string };
    expect(body.error).toBe('UNSUPPORTED_DOCUMENT');
    expect(body.message).toContain('virus.exe');
    expect(upserted, 'a refused upload must write no record').toHaveLength(0);
    expect(mockExtractVendorPdfText, 'a refused upload must run no extraction').not.toHaveBeenCalled();
  });

  // DOCINGEST-B B1/B3 — a photographed page upload becomes a durable
  // vendor-pdf with mediaKind 'image', OCR pages as extractedText, honest
  // image media_type from the config map, and upload provenance. The gate is
  // config-driven (images.formats): drop webp from the config and a webp
  // upload is refused (mutation probe, bait 10).
  it('uploads a photographed .png: mediaKind image, OCR extractedText, honest image media_type, page_count stamped', async () => {
    const ocrText = 'DEMO LYSIS BUFFER ADD 500 uL\n';
    mockExtractVendorPdfText.mockResolvedValue({
      kind: 'vendor-pdf-text-extraction',
      source: { fileName: 'photographed-page.png', sha256: SAMPLE_SHA },
      mode: 'both',
      mediaKind: 'image',
      plainText: {
        text: ocrText,
        pageCount: 1,
        diagnostics: [{ severity: 'warning', code: 'LOCAL_OCR_REVIEW', message: 'Transcribed using local OCR (up to the configured page limit). Check page coverage and every volume against the page image before importing.' }],
      },
      layoutText: { pages: [{ pageNumber: 1, text: ocrText }], pageCount: 1 },
      images: [{ pageNumber: 1, path: 'artifacts/foundry/pdfs/pages/abc123def456/page-001.png' }],
    });
    const { store, upserted } = makeStubStore();
    const handlers = createVendorSearchHandlers({ workspaceRoot: '/workspace', store });
    const reply = makeReply();
    const base64 = Buffer.from('\u0089PNG\r\n\u001a\n demo png bytes').toString('base64');
    const result = await handlers.ingestGraphLemurPdfUpload(
      ingestRequest({ title: 'Composer scan probe', fileName: 'photographed-page.png', contentBase64: base64 }),
      reply.reply,
    );
    expect(reply.statusCode).toBe(200);
    expect(upserted).toHaveLength(1);
    const payload = upserted[0].payload as Record<string, unknown>;
    const source = payload.source as Record<string, unknown>;
    expect(source.engine).toBe('upload');
    expect(source.mediaKind).toBe('image');
    expect(source.originalFileName).toBe('photographed-page.png');
    expect(source.pageCount, 'an image record carries its page count').toBe(1);
    const file = payload.file as Record<string, unknown>;
    expect(file.media_type, 'an image upload must NOT be re-stamped application/pdf').toBe('image/png');
    expect(String(file.stored_path).endsWith('.png'), 'the artifact keeps the image extension').toBe(true);
    expect(file.page_count, 'file-ref page_count (minimum 1) is honest for a real page').toBe(1);
    const pages = payload.extractedText as Array<{ pageNumber: number; text: string }>;
    expect(pages).toHaveLength(1);
    expect(pages[0]?.text).toContain('LYSIS');
    // The OCR caution persists on the record (schema-declared
    // extractionDiagnostics — NOT stuffed into source, bait 15).
    const diagnostics = payload.extractionDiagnostics as Array<{ code: string }> | undefined;
    expect(diagnostics?.some((d) => d.code === 'LOCAL_OCR_REVIEW')).toBe(true);
    const { valid, errors } = await validateAgainstVendorPdfSchema(payload);
    expect(valid, JSON.stringify(errors)).toBe(true);
  });

  it('a scanned PDF upload stamps mediaKind image with pageCount from the OCR pages', async () => {
    mockExtractVendorPdfText.mockResolvedValue({
      kind: 'vendor-pdf-text-extraction',
      source: { fileName: 'scan.pdf', sha256: SAMPLE_SHA },
      mode: 'both',
      mediaKind: 'image',
      plainText: { text: 'page one \f page two', pageCount: 2, diagnostics: [] },
      layoutText: {
        pages: [{ pageNumber: 1, text: 'page one' }, { pageNumber: 2, text: 'page two' }],
        pageCount: 2,
      },
      images: [
        { pageNumber: 1, path: 'artifacts/foundry/pdfs/pages/abc123def456/page-001.png' },
        { pageNumber: 2, path: 'artifacts/foundry/pdfs/pages/abc123def456/page-002.png' },
      ],
    });
    const { store, upserted } = makeStubStore();
    const handlers = createVendorSearchHandlers({ workspaceRoot: '/workspace', store });
    const reply = makeReply();
    const base64 = Buffer.from('%PDF-1.4 raster-only demo scan').toString('base64');
    await handlers.ingestGraphLemurPdfUpload(
      ingestRequest({ title: 'Scanned kit manual', fileName: 'scan.pdf', contentBase64: base64 }),
      reply.reply,
    );
    expect(reply.statusCode).toBe(200);
    const payload = upserted[0].payload as Record<string, unknown>;
    const source = payload.source as Record<string, unknown>;
    expect(source.mediaKind).toBe('image');
    expect(source.pageCount).toBe(2);
    const file = payload.file as Record<string, unknown>;
    expect(file.media_type).toBe('application/pdf');
    expect(file.page_count).toBe(2);
    const { valid, errors } = await validateAgainstVendorPdfSchema(payload);
    expect(valid, JSON.stringify(errors)).toBe(true);
  });

  it('non-image gate unchanged: a .docx still acquires as text and an unreadable file still 415s', async () => {
    // The image arms must not widen the gate beyond the config: .exe stays
    // refused (pinned above) and .docx keeps its Stage-A behavior.
    mockExtractVendorPdfText.mockResolvedValue({
      kind: 'vendor-pdf-text-extraction',
      source: { fileName: 'demo-sop.docx', sha256: SAMPLE_SHA },
      mode: 'both',
      mediaKind: 'text',
      plainText: { text: '', pageCount: 1, diagnostics: [{ severity: 'error', code: 'DOCX_TOOL_MISSING', message: 'reader absent' }] },
      layoutText: { pages: [{ pageNumber: 1, text: '' }], pageCount: 1 },
    });
    const { store, upserted } = makeStubStore();
    const handlers = createVendorSearchHandlers({ workspaceRoot: '/workspace', store });
    const reply = makeReply();
    await handlers.ingestGraphLemurPdfUpload(
      ingestRequest({ title: 'docx control', fileName: 'demo-sop.docx', contentBase64: Buffer.from('PK fake').toString('base64') }),
      reply.reply,
    );
    expect(reply.statusCode).toBe(200);
    const source = upserted[0].payload as Record<string, unknown>;
    expect((source.source as Record<string, unknown>).mediaKind).toBe('text');
  });

  it('W2-8-FIX2 D2: a failed record create surfaces recordWriteError instead of a silent 200', async () => {
    // The upload-by-content path (no url in the body). Before the schema
    // conditional, the store rejected this payload ('Missing required
    // property: url') and the response hid it. Now the failure is surfaced.
    const base = makeStubStore();
    const store = {
      ...base.store,
      async create() {
        return { success: false, error: 'Validation failed: Missing required property: url' };
      },
    } as unknown as RecordStore;
    const handlers = createVendorSearchHandlers({ workspaceRoot: '/workspace', store });
    const reply = makeReply();
    const base64 = Buffer.from('%PDF-1.4 upload-without-url').toString('base64');
    const result = await handlers.ingestGraphLemurPdfUpload(
      ingestRequest({ title: 'Uploaded protocol', fileName: 'protocol.pdf', contentBase64: base64 }),
      reply.reply,
    );
    const payload = (result as { recordWriteError?: string; recordedArtifact?: unknown })
    expect(payload.recordedArtifact, 'a failed create must NOT report a durable record').toBeUndefined();
    expect(payload.recordWriteError, 'the response must name the write failure').toContain('Validation failed');
  });
});

// Mirror of the handler's content-addressed id derivation for the upload path.
function createVendorPdfIdFromBytes(base64: string): string {
  const bytes = Buffer.from(base64, 'base64');
  return `VPDF-${createHash('sha256').update(bytes).digest('hex').slice(0, 12).toUpperCase()}`;
}
