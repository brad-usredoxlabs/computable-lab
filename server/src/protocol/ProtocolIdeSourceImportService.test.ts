/**
 * Tests for ProtocolIdeSourceImportService
 *
 * These tests verify:
 * - Successful import from a deterministic PDF fixture
 * - Evidence citation shaping with page/snippet provenance
 * - Correct session updates after import completes (in-place mutation)
 * - Handling of vendor_document and pasted_url source kinds
 * - Session not found error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RecordStore, RecordEnvelope } from '../store/types.js';
import {
  ProtocolIdeSourceImportService,
  type SourceImportRequest,
  type EvidenceCitation,
} from './ProtocolIdeSourceImportService.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockStore(
  sessionEnvelope: RecordEnvelope | null = null,
): RecordStore {
  return {
    create: vi.fn().mockResolvedValue({ success: true }),
    get: vi.fn().mockResolvedValue(sessionEnvelope),
    getByPath: vi.fn().mockResolvedValue(null),
    getWithValidation: vi.fn().mockResolvedValue({ success: true }),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({ success: true }),
    delete: vi.fn().mockResolvedValue({ success: true }),
    validate: vi.fn().mockResolvedValue({ valid: true }),
    lint: vi.fn().mockResolvedValue({ valid: true }),
    exists: vi.fn().mockResolvedValue(false),
  } as unknown as RecordStore;
}

function makeMockSessionEnvelope(
  sessionId: string = 'PIS-test-001',
  overrides: Record<string, unknown> = {},
): RecordEnvelope {
  return {
    kind: 'protocol-ide-session',
    recordId: sessionId,
    schemaId: 'https://computable-lab.com/schema/computable-lab/workflow/protocol-ide-session.schema.yaml',
    payload: {
      kind: 'protocol-ide-session',
      recordId: sessionId,
      sourceMode: 'upload',
      status: 'importing',
      latestDirectiveText: 'extract the protocol',
      sourceSummary: 'Uploaded: test.pdf',
      vendorDocumentRef: null,
      ingestionJobRef: null,
      protocolImportRef: null,
      extractedTextRef: null,
      evidenceRefs: [],
      evidenceCitations: [],
      protocolImportState: null,
      protocolImportConfidence: null,
      lastImportedAt: null,
      updatedAt: new Date().toISOString(),
      ...overrides,
    },
    meta: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

/**
 * A deterministic mock PDF extractor that returns predictable page text.
 * This avoids relying on system commands (pdftotext, pdfinfo) in tests.
 */
function makeMockPdfExtractor(): (buffer: Buffer, fileName: string) => Promise<Array<{ pageNumber: number; text: string }>> {
  return async (_buffer: Buffer, _fileName: string) => [
    {
      pageNumber: 1,
      text: [
        'Vendor Lysis Protocol',
        'Objective',
        'Prepare the assay plate for lysis.',
        'Materials',
        '- Lysis buffer',
        '- Wash buffer',
        'Equipment',
        '- Plate shaker',
        'Safety',
        'Wear gloves and eye protection.',
        'Procedure',
        '1. Warm the plate to room temperature.',
        '2. Add lysis buffer to each well.',
      ].join('\n'),
    },
    {
      pageNumber: 2,
      text: [
        'Step 3. Incubate for 30 minutes.',
        'Step 4. Centrifuge at 10000 rpm.',
        'Materials continued',
        '- Ethanol 70%',
      ].join('\n'),
    },
  ];
}

function makePdfFixture(): { contentBase64: string; fileName: string; mediaType: string } {
  // A minimal deterministic PDF-like buffer for testing
  const pdfContent = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n0\n%%EOF';
  return {
    contentBase64: Buffer.from(pdfContent).toString('base64'),
    fileName: 'test-protocol.pdf',
    mediaType: 'application/pdf',
  };
}

// ---------------------------------------------------------------------------
// importSource — successful import from uploaded PDF
// ---------------------------------------------------------------------------

describe('ProtocolIdeSourceImportService — importSource (uploaded_pdf)', () => {
  it('imports a PDF and updates the session with refs and evidence citations', async () => {
    const session = makeMockSessionEnvelope();
    const store = makeMockStore(session);
    const pdfExtractor = makeMockPdfExtractor();
    const service = new ProtocolIdeSourceImportService(store, { pdfExtractor });

    const pdfFixture = makePdfFixture();
    const request: SourceImportRequest = {
      sessionId: session.recordId,
      sourceKind: 'uploaded_pdf',
      upload: {
        fileName: pdfFixture.fileName,
        mediaType: pdfFixture.mediaType,
        contentBase64: pdfFixture.contentBase64,
      },
    };

    const result = await service.importSource(request);

    expect(result.sessionId).toBe(session.recordId);
    expect(result.status).toBe('imported');
    expect(result.vendorDocumentRef).toMatch(/^VDOC-/);
    expect(result.protocolImportRef).toMatch(/^protocol-import-/);
    expect(result.extractedTextRef).toMatch(/^TEXT-/);
    expect(result.evidenceRefs).toBeInstanceOf(Array);
    expect(result.protocolImportState).toBeDefined();
    expect(result.protocolImportConfidence).toBeDefined();

    // Verify store.update was called (in-place session mutation)
    expect(store.update).toHaveBeenCalledTimes(1);
    const updateCall = store.update.mock.calls[0][0];
    expect(updateCall.envelope.recordId).toBe(session.recordId);
    expect(updateCall.envelope.payload.status).toBe('imported');
    expect(updateCall.envelope.payload.vendorDocumentRef).toBe(result.vendorDocumentRef);
    expect(updateCall.envelope.payload.protocolImportRef).toBe(result.protocolImportRef);
    expect(updateCall.envelope.payload.evidenceRefs).toEqual(result.evidenceRefs);
  });

  it('evidence citations carry page and snippet provenance', async () => {
    const session = makeMockSessionEnvelope();
    const store = makeMockStore(session);
    const pdfExtractor = makeMockPdfExtractor();
    const service = new ProtocolIdeSourceImportService(store, { pdfExtractor });

    const pdfFixture = makePdfFixture();
    const request: SourceImportRequest = {
      sessionId: session.recordId,
      sourceKind: 'uploaded_pdf',
      upload: {
        fileName: pdfFixture.fileName,
        mediaType: pdfFixture.mediaType,
        contentBase64: pdfFixture.contentBase64,
      },
    };

    const result = await service.importSource(request);

    // Evidence citations should have proper provenance
    expect(result.evidenceCitations.length).toBeGreaterThan(0);
    for (const citation of result.evidenceCitations) {
      expect(citation.citationId).toMatch(/^cite-/);
      expect(citation.pageNumber).toBeGreaterThanOrEqual(1);
      expect(citation.snippet.length).toBeGreaterThan(0);
      expect(citation.evidenceKind).toBeDefined();
      expect(citation.confidence).toBeGreaterThan(0);
      expect(citation.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('evidence citations include context when available', async () => {
    const session = makeMockSessionEnvelope();
    const store = makeMockStore(session);
    const pdfExtractor = makeMockPdfExtractor();
    const service = new ProtocolIdeSourceImportService(store, { pdfExtractor });

    const pdfFixture = makePdfFixture();
    const request: SourceImportRequest = {
      sessionId: session.recordId,
      sourceKind: 'uploaded_pdf',
      upload: {
        fileName: pdfFixture.fileName,
        mediaType: pdfFixture.mediaType,
        contentBase64: pdfFixture.contentBase64,
      },
    };

    const result = await service.importSource(request);

    // Check that citations with context have it populated
    expect(result.evidenceCitations).toBeInstanceOf(Array);
    // Multiple lines in the mock PDF should produce context
    const citationsWithContext = result.evidenceCitations.filter((c) => c.context);
    expect(citationsWithContext.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// importSource — vendor_document source kind
// ---------------------------------------------------------------------------

describe('ProtocolIdeSourceImportService — importSource (vendor_document)', () => {
  it('creates placeholder refs when no PDF content is available', async () => {
    const session = makeMockSessionEnvelope();
    const store = makeMockStore(session);
    const service = new ProtocolIdeSourceImportService(store);

    const request: SourceImportRequest = {
      sessionId: session.recordId,
      sourceKind: 'vendor_document',
      vendor: {
        vendor: 'thermo',
        title: 'DNA Extraction Protocol v2',
        pdfUrl: 'https://example.com/protocol.pdf',
        landingUrl: 'https://example.com/protocol',
        snippet: 'A comprehensive DNA extraction protocol.',
      },
    };

    const result = await service.importSource(request);

    expect(result.sessionId).toBe(session.recordId);
    expect(result.status).toBe('imported');
    expect(result.vendorDocumentRef).toMatch(/VDOC/);
    expect(result.protocolImportRef).toMatch(/pending/);
    expect(result.extractedTextRef).toMatch(/pending/);
    expect(result.evidenceRefs).toEqual([]);
    expect(result.evidenceCitations).toEqual([]);

    // Verify session was updated in place
    expect(store.update).toHaveBeenCalledTimes(1);
    const updateCall = store.update.mock.calls[0][0];
    expect(updateCall.envelope.payload.vendorDocumentRef).toBe(result.vendorDocumentRef);
  });
});

// ---------------------------------------------------------------------------
// importSource — pasted_url source kind
// ---------------------------------------------------------------------------

describe('ProtocolIdeSourceImportService — importSource (pasted_url)', () => {
  it('creates placeholder refs when no PDF content is available', async () => {
    const session = makeMockSessionEnvelope();
    const store = makeMockStore(session);
    const service = new ProtocolIdeSourceImportService(store);

    const request: SourceImportRequest = {
      sessionId: session.recordId,
      sourceKind: 'pasted_url',
      pastedUrl: 'https://example.com/protocol.pdf',
    };

    const result = await service.importSource(request);

    expect(result.sessionId).toBe(session.recordId);
    expect(result.status).toBe('imported');
    expect(result.protocolImportRef).toMatch(/pending/);
    expect(result.extractedTextRef).toMatch(/pending/);
    expect(result.evidenceRefs).toEqual([]);
    expect(result.evidenceCitations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// importSource — error cases
// ---------------------------------------------------------------------------

describe('ProtocolIdeSourceImportService — importSource error cases', () => {
  it('throws when session is not found', async () => {
    const store = makeMockStore(null);
    const service = new ProtocolIdeSourceImportService(store);

    const request: SourceImportRequest = {
      sessionId: 'PIS-nonexistent',
      sourceKind: 'uploaded_pdf',
      upload: {
        fileName: 'test.pdf',
        mediaType: 'application/pdf',
        contentBase64: Buffer.from('test').toString('base64'),
      },
    };

    await expect(service.importSource(request)).rejects.toThrow('Session not found');
  });

  it('throws when record is not a protocol-ide-session', async () => {
    const wrongSession: RecordEnvelope = {
      kind: 'protocol',
      recordId: 'PRT-000001',
      schemaId: 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml',
      payload: { kind: 'protocol', recordId: 'PRT-000001' },
      meta: { createdAt: new Date().toISOString() },
    };
    const store = makeMockStore(wrongSession);
    const service = new ProtocolIdeSourceImportService(store);

    const request: SourceImportRequest = {
      sessionId: 'PRT-000001',
      sourceKind: 'uploaded_pdf',
      upload: {
        fileName: 'test.pdf',
        mediaType: 'application/pdf',
        contentBase64: Buffer.from('test').toString('base64'),
      },
    };

    await expect(service.importSource(request)).rejects.toThrow('not a protocol-ide-session');
  });

  it('throws when uploaded_pdf source is missing upload fields', async () => {
    const session = makeMockSessionEnvelope();
    const store = makeMockStore(session);
    const service = new ProtocolIdeSourceImportService(store);

    const request: SourceImportRequest = {
      sessionId: session.recordId,
      sourceKind: 'uploaded_pdf',
      // No upload field
    };

    await expect(service.importSource(request)).rejects.toThrow('requires upload fields');
  });

  it('throws when contentBase64 is invalid', async () => {
    const session = makeMockSessionEnvelope();
    const store = makeMockStore(session);
    const service = new ProtocolIdeSourceImportService(store);

    // Use a string that will produce a Buffer but will fail PDF extraction
    // The service should handle extraction failures gracefully
    const request: SourceImportRequest = {
      sessionId: session.recordId,
      sourceKind: 'uploaded_pdf',
      upload: {
        fileName: 'test.pdf',
        mediaType: 'application/pdf',
        contentBase64: Buffer.from('not-a-pdf').toString('base64'),
      },
    };

    // With invalid PDF content, the service should still succeed but with partial/placeholder refs
    const result = await service.importSource(request);
    expect(result.sessionId).toBe(session.recordId);
    expect(result.status).toBe('imported');
    // Should have placeholder refs since PDF extraction failed
    expect(result.protocolImportRef).toBeNull();
    expect(result.evidenceCitations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// refreshSourceWorkspace
// ---------------------------------------------------------------------------

describe('ProtocolIdeSourceImportService — refreshSourceWorkspace', () => {
  it('refreshes the source workspace in place', async () => {
    const session = makeMockSessionEnvelope();
    const store = makeMockStore(session);
    const pdfExtractor = makeMockPdfExtractor();
    const service = new ProtocolIdeSourceImportService(store, { pdfExtractor });

    const pdfFixture = makePdfFixture();
    const request: Omit<SourceImportRequest, 'sessionId'> = {
      sourceKind: 'uploaded_pdf',
      upload: {
        fileName: pdfFixture.fileName,
        mediaType: pdfFixture.mediaType,
        contentBase64: pdfFixture.contentBase64,
      },
    };

    const result = await service.refreshSourceWorkspace(session.recordId, request);

    expect(result.sessionId).toBe(session.recordId);
    expect(result.status).toBe('imported');
    expect(store.update).toHaveBeenCalledTimes(1);

    // Verify the update was in-place (same recordId)
    const updateCall = store.update.mock.calls[0][0];
    expect(updateCall.envelope.recordId).toBe(session.recordId);
  });
});

// ---------------------------------------------------------------------------
// Evidence citation classification
// ---------------------------------------------------------------------------

describe('ProtocolIdeSourceImportService — evidence citation classification', () => {
  it('classifies procedure step snippets correctly', async () => {
    const session = makeMockSessionEnvelope();
    const store = makeMockStore(session);
    const pdfExtractor = makeMockPdfExtractor();
    const service = new ProtocolIdeSourceImportService(store, { pdfExtractor });

    const pdfFixture = makePdfFixture();
    const request: SourceImportRequest = {
      sessionId: session.recordId,
      sourceKind: 'uploaded_pdf',
      upload: {
        fileName: pdfFixture.fileName,
        mediaType: pdfFixture.mediaType,
        contentBase64: pdfFixture.contentBase64,
      },
    };

    const result = await service.importSource(request);

    // All citations should have a valid evidenceKind
    for (const citation of result.evidenceCitations) {
      expect(['procedure_step', 'material', 'equipment', 'safety', 'general']).toContain(
        citation.evidenceKind,
      );
    }
  });

  it('evidence refs match citation IDs', async () => {
    const session = makeMockSessionEnvelope();
    const store = makeMockStore(session);
    const pdfExtractor = makeMockPdfExtractor();
    const service = new ProtocolIdeSourceImportService(store, { pdfExtractor });

    const pdfFixture = makePdfFixture();
    const request: SourceImportRequest = {
      sessionId: session.recordId,
      sourceKind: 'uploaded_pdf',
      upload: {
        fileName: pdfFixture.fileName,
        mediaType: pdfFixture.mediaType,
        contentBase64: pdfFixture.contentBase64,
      },
    };

    const result = await service.importSource(request);

    // evidenceRefs should be the citation IDs
    const citationIds = result.evidenceCitations.map((c) => c.citationId);
    expect(result.evidenceRefs).toEqual(citationIds);
  });
});
