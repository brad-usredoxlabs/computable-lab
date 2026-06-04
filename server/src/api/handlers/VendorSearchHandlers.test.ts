import type { FastifyReply, FastifyRequest } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDownloadVendorPdf = vi.hoisted(() => vi.fn());
const mockExtractVendorProtocolCandidateFromInput = vi.hoisted(() => vi.fn());

vi.mock('../../vendor-documents/pdfAcquisition.js', () => ({
  downloadVendorPdf: mockDownloadVendorPdf,
}));

vi.mock('../../ingestion/vendor-protocol/VendorProtocolCandidateService.js', () => ({
  extractVendorProtocolCandidateFromInput: mockExtractVendorProtocolCandidateFromInput,
}));

import { createVendorSearchHandlers, parseDeclaredConcentrationText, parseVendorIds, VALID_VENDOR_IDS } from './VendorSearchHandlers.js';
import { validateIntakeRequest } from '../../protocol/ProtocolIdeIntakeContracts.js';


function makeMockReply() {
  const statusMock = vi.fn().mockReturnThis();
  return {
    status: statusMock,
    code: statusMock,
    send: vi.fn().mockReturnThis(),
  } as unknown as FastifyReply;
}

function graphLemurIngestRequest(body: { url?: string; title?: string; vendor?: string }) {
  return { body } as unknown as FastifyRequest<{
    Body: { url?: string; title?: string; vendor?: string };
  }>;
}

function downloadResult(url: string, relativePath = 'artifacts/foundry/pdfs/protocol.pdf') {
  return {
    kind: 'vendor-pdf-download' as const,
    status: 'downloaded' as const,
    url,
    effectiveUrl: url,
    artifactPath: `/workspace/${relativePath}`,
    relativePath,
    sidecarPath: `/workspace/${relativePath}.procurement.json`,
    contentType: 'application/pdf',
    bytesDownloaded: 42,
    sha256: 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd',
    validation: 'valid PDF',
    generatedAt: '2026-06-02T00:00:00.000Z',
  };
}

function extractionResult() {
  return {
    kind: 'vendor-protocol-candidate-extraction' as const,
    source: {
      inputKind: 'pdf' as const,
      artifactPath: 'artifacts/foundry/pdfs/protocol.pdf',
      fileName: 'protocol.pdf',
      sha256: 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd',
    },
    document: {
      source: {
        documentId: 'graph-lemur-abc123def456',
        filename: 'protocol.pdf',
        title: 'Vendor Protocol',
        vendor: 'thermo',
        pageCount: 8,
      },
      pageCount: 8,
      sectionCount: 3,
      tableCount: 1,
      diagnostics: [],
    },
    candidate: {
      kind: 'vendor-protocol-candidate' as const,
      source: {
        documentId: 'graph-lemur-abc123def456',
        filename: 'protocol.pdf',
        title: 'Vendor Protocol',
        vendor: 'thermo',
        pageCount: 8,
      },
      title: 'Vendor Protocol',
      sections: [],
      materials: [{
        id: 'mat-1',
        label: 'Lysis buffer',
        sourceText: 'Use lysis buffer',
        provenance: { documentId: 'graph-lemur-abc123def456', pageStart: 2 },
        confidence: 0.9,
      }],
      equipment: [],
      labware: [],
      steps: [{
        id: 'step-1',
        stepNumber: 1,
        sourceText: 'Add lysis buffer to each well.',
        actions: [],
        conditions: {},
        materials: ['Lysis buffer'],
        labware: ['96-well plate'],
        equipment: [],
        notes: [],
        branches: [],
        provenance: { documentId: 'graph-lemur-abc123def456', pageStart: 2, sectionId: 'protocol' },
        confidence: 0.88,
      }],
      tables: [],
      notes: [],
      outputs: [],
      diagnostics: [],
    },
    candidatePath: 'artifacts/foundry/protocol-candidates/graph-lemur-abc123def456.json',
  };
}

describe('VendorSearchHandlers', () => {
  it('parses declared concentration from vendor text', () => {
    expect(parseDeclaredConcentrationText('Clofibrate sodium salt solution, 100 mM')).toEqual({
      concentration: {
        value: 100,
        unit: 'mM',
        basis: 'molar',
      },
      sourceText: 'Clofibrate sodium salt solution, 100 mM',
    });
  });

  it('normalizes percent volume fractions', () => {
    expect(parseDeclaredConcentrationText('Triton X-100, 0.1% v/v in PBS')).toEqual({
      concentration: {
        value: 0.1,
        unit: '% v/v',
        basis: 'volume_fraction',
      },
      sourceText: 'Triton X-100, 0.1% v/v in PBS',
    });
  });

  it('returns null when no supported concentration is present', () => {
    expect(parseDeclaredConcentrationText('Dimethyl sulfoxide, molecular biology grade')).toBeNull();
  });

  describe('parseVendorIds', () => {
    it('accepts all six vendor ids', () => {
      const result = parseVendorIds('thermo,sigma,fisher,vwr,cayman,thomas');
      expect(result).toEqual(['thermo', 'sigma', 'fisher', 'vwr', 'cayman', 'thomas']);
    });

    it('accepts a subset of vendor ids', () => {
      const result = parseVendorIds('fisher,vwr');
      expect(result).toEqual(['fisher', 'vwr']);
    });

    it('filters out unknown vendor ids', () => {
      const result = parseVendorIds('thermo,unknown,sigma,bad');
      expect(result).toEqual(['thermo', 'sigma']);
    });

    it('handles case-insensitive input', () => {
      const result = parseVendorIds('Thermo,SIGMA,Fisher');
      expect(result).toEqual(['thermo', 'sigma', 'fisher']);
    });

    it('returns empty array for empty string', () => {
      const result = parseVendorIds('');
      expect(result).toEqual([]);
    });

    it('trims whitespace around vendor ids', () => {
      const result = parseVendorIds(' thermo , sigma ');
      expect(result).toEqual(['thermo', 'sigma']);
    });

    it('deduplicates vendor ids', () => {
      const result = parseVendorIds('thermo,thermo,sigma');
      expect(result).toEqual(['thermo', 'sigma']);
    });
  });

  describe('VALID_VENDOR_IDS', () => {
    it('contains exactly six vendor ids', () => {
      expect(VALID_VENDOR_IDS).toHaveLength(6);
    });

    it('includes all required vendors', () => {
      expect(VALID_VENDOR_IDS).toContain('thermo');
      expect(VALID_VENDOR_IDS).toContain('sigma');
      expect(VALID_VENDOR_IDS).toContain('fisher');
      expect(VALID_VENDOR_IDS).toContain('vwr');
      expect(VALID_VENDOR_IDS).toContain('cayman');
      expect(VALID_VENDOR_IDS).toContain('thomas');
    });

    it('does not contain unknown vendors', () => {
      expect(VALID_VENDOR_IDS).not.toContain('atcc');
      expect(VALID_VENDOR_IDS).not.toContain('other');
    });
  });
});

// ---------------------------------------------------------------------------
// Protocol IDE intake validation tests
// ---------------------------------------------------------------------------

describe('Protocol IDE intake validation', () => {
  describe('vendor_document source mode', () => {
    it('accepts a valid vendor_document intake', () => {
      const request = {
        directiveText: 'extract the DNA extraction protocol and extend it to a 96-well format',
        source: {
          sourceKind: 'vendor_document',
          vendor: 'thermo',
          title: 'DNA Extraction Protocol v2',
          pdfUrl: 'https://example.com/protocol.pdf',
          landingUrl: 'https://example.com/protocol',
          snippet: 'A comprehensive DNA extraction protocol.',
          documentType: 'protocol',
          sessionIdHint: 'thermo::DNA Extraction Protocol v2',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.request.directiveText).toBe(request.directiveText);
        expect(result.request.source.sourceKind).toBe('vendor_document');
        expect(result.request.source.vendor).toBe('thermo');
        expect(result.request.source.title).toBe('DNA Extraction Protocol v2');
      }
    });

    it('rejects vendor_document with missing vendor', () => {
      const request = {
        directiveText: 'extract protocol',
        source: {
          sourceKind: 'vendor_document',
          title: 'Test',
          landingUrl: 'https://example.com',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('vendor');
      }
    });

    it('rejects vendor_document with missing title', () => {
      const request = {
        directiveText: 'extract protocol',
        source: {
          sourceKind: 'vendor_document',
          vendor: 'thermo',
          landingUrl: 'https://example.com',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('title');
      }
    });

    it('rejects vendor_document with missing landingUrl', () => {
      const request = {
        directiveText: 'extract protocol',
        source: {
          sourceKind: 'vendor_document',
          vendor: 'thermo',
          title: 'Test',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('landingUrl');
      }
    });
  });

  describe('pasted_url source mode', () => {
    it('accepts a valid pasted_url intake', () => {
      const request = {
        directiveText: 'extract the DNA extraction protocol',
        source: {
          sourceKind: 'pasted_url',
          url: 'https://example.com/protocol.pdf',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.request.source.sourceKind).toBe('pasted_url');
        expect(result.request.source.url).toBe('https://example.com/protocol.pdf');
      }
    });

    it('rejects pasted_url with missing url', () => {
      const request = {
        directiveText: 'extract protocol',
        source: {
          sourceKind: 'pasted_url',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('url');
      }
    });
  });

  describe('uploaded_pdf source mode', () => {
    it('accepts a valid uploaded_pdf intake', () => {
      const request = {
        directiveText: 'extract the protocol from this PDF',
        source: {
          sourceKind: 'uploaded_pdf',
          uploadId: 'upload-abc123',
          fileName: 'protocol.pdf',
          mediaType: 'application/pdf',
          contentBase64: 'AAAA',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.request.source.sourceKind).toBe('uploaded_pdf');
        expect(result.request.source.uploadId).toBe('upload-abc123');
        expect(result.request.source.fileName).toBe('protocol.pdf');
        expect(result.request.source.mediaType).toBe('application/pdf');
        expect(result.request.source.contentBase64).toBe('AAAA');
      }
    });

    it('rejects uploaded_pdf with missing contentBase64', () => {
      const request = {
        directiveText: 'extract protocol',
        source: {
          sourceKind: 'uploaded_pdf',
          uploadId: 'upload-abc123',
          fileName: 'protocol.pdf',
          mediaType: 'application/pdf',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe('uploaded_pdf.source.contentBase64 is required.');
      }
    });

    it('rejects uploaded_pdf with missing uploadId', () => {
      const request = {
        directiveText: 'extract protocol',
        source: {
          sourceKind: 'uploaded_pdf',
          fileName: 'protocol.pdf',
          mediaType: 'application/pdf',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('uploadId');
      }
    });

    it('rejects uploaded_pdf with missing fileName', () => {
      const request = {
        directiveText: 'extract protocol',
        source: {
          sourceKind: 'uploaded_pdf',
          uploadId: 'upload-abc123',
          mediaType: 'application/pdf',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('fileName');
      }
    });

    it('rejects uploaded_pdf with missing mediaType', () => {
      const request = {
        directiveText: 'extract protocol',
        source: {
          sourceKind: 'uploaded_pdf',
          uploadId: 'upload-abc123',
          fileName: 'protocol.pdf',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('mediaType');
      }
    });
  });

  describe('directiveText validation', () => {
    it('rejects empty directiveText', () => {
      const request = {
        directiveText: '',
        source: {
          sourceKind: 'pasted_url',
          url: 'https://example.com/protocol.pdf',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('directiveText');
      }
    });

    it('rejects whitespace-only directiveText', () => {
      const request = {
        directiveText: '   ',
        source: {
          sourceKind: 'pasted_url',
          url: 'https://example.com/protocol.pdf',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('directiveText');
      }
    });

    it('rejects missing directiveText', () => {
      const request = {
        source: {
          sourceKind: 'pasted_url',
          url: 'https://example.com/protocol.pdf',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('directiveText');
      }
    });
  });

  describe('invalid sourceKind', () => {
    it('rejects unknown sourceKind', () => {
      const request = {
        directiveText: 'extract protocol',
        source: {
          sourceKind: 'unknown_kind',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Unknown sourceKind');
      }
    });

    it('rejects missing sourceKind', () => {
      const request = {
        directiveText: 'extract protocol',
        source: {
          vendor: 'thermo',
          title: 'Test',
          landingUrl: 'https://example.com',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('sourceKind');
      }
    });
  });

  describe('invalid input types', () => {
    it('rejects null input', () => {
      const result = validateIntakeRequest(null);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('object');
      }
    });

    it('rejects non-object input', () => {
      const result = validateIntakeRequest('not an object');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('object');
      }
    });

    it('rejects array input', () => {
      const result = validateIntakeRequest([]);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('object');
      }
    });
  });

  describe('directiveText trimming', () => {
    it('trims whitespace from directiveText', () => {
      const request = {
        directiveText: '  extract the protocol  ',
        source: {
          sourceKind: 'pasted_url',
          url: 'https://example.com/protocol.pdf',
        },
      };

      const result = validateIntakeRequest(request);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.request.directiveText).toBe('extract the protocol');
      }
    });
  });
});


describe('GraphLemur PDF ingest', () => {
  beforeEach(() => {
    mockDownloadVendorPdf.mockReset();
    mockExtractVendorProtocolCandidateFromInput.mockReset();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('downloads and extracts a direct PDF source', async () => {
    mockDownloadVendorPdf.mockResolvedValue(downloadResult('https://vendor.example/protocol.pdf'));
    mockExtractVendorProtocolCandidateFromInput.mockResolvedValue(extractionResult());
    const handlers = createVendorSearchHandlers({ workspaceRoot: '/workspace' });
    const reply = makeMockReply();

    const result = await handlers.ingestGraphLemurPdf(graphLemurIngestRequest({
      url: 'https://vendor.example/protocol.pdf',
      title: 'Vendor Protocol',
      vendor: 'thermo',
    }), reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(mockDownloadVendorPdf).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://vendor.example/protocol.pdf',
      workspaceRoot: '/workspace',
      title: 'Vendor Protocol',
      outputName: 'Vendor Protocol',
    }));
    expect(mockExtractVendorProtocolCandidateFromInput).toHaveBeenCalledWith(expect.objectContaining({
      workspaceRoot: '/workspace',
      artifactPath: 'artifacts/foundry/pdfs/protocol.pdf',
      documentId: 'graph-lemur-abc123def456',
      vendor: 'thermo',
      persist: true,
    }));
    expect(result).toMatchObject({
      sourcePdf: {
        url: 'https://vendor.example/protocol.pdf',
        title: 'Vendor Protocol',
        vendor: 'thermo',
        artifactPath: 'artifacts/foundry/pdfs/protocol.pdf',
      },
      sourceProtocolCandidate: {
        kind: 'vendor-protocol-candidate',
        title: 'Vendor Protocol',
        steps: [{ stepNumber: 1, text: 'Add lysis buffer to each well.' }],
      },
      extraction: {
        requestedUrl: 'https://vendor.example/protocol.pdf',
        resolvedPdfUrl: 'https://vendor.example/protocol.pdf',
        resolution: 'direct',
        candidatePath: 'artifacts/foundry/protocol-candidates/graph-lemur-abc123def456.json',
        pageCount: 8,
      },
    });
  });

  it('resolves a landing page to the best protocol-like PDF before extraction', async () => {
    mockDownloadVendorPdf
      .mockRejectedValueOnce(new Error('download is HTML, not PDF'))
      .mockResolvedValueOnce(downloadResult('https://vendor.example/files/protocol.pdf'));
    mockExtractVendorProtocolCandidateFromInput.mockResolvedValue(extractionResult());
    vi.stubGlobal('fetch', vi.fn(async () => new Response(`
      <html><body>
        <a href="/files/sds.pdf">Safety data sheet PDF</a>
        <a href="/files/protocol.pdf">DNA extraction protocol PDF</a>
      </body></html>
    `, { headers: { 'content-type': 'text/html' } })));
    const handlers = createVendorSearchHandlers({ workspaceRoot: '/workspace' });
    const reply = makeMockReply();

    const result = await handlers.ingestGraphLemurPdf(graphLemurIngestRequest({
      url: 'https://vendor.example/product-page',
      title: 'Vendor Protocol',
    }), reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(mockDownloadVendorPdf).toHaveBeenNthCalledWith(1, expect.objectContaining({
      url: 'https://vendor.example/product-page',
    }));
    expect(mockDownloadVendorPdf).toHaveBeenNthCalledWith(2, expect.objectContaining({
      url: 'https://vendor.example/files/protocol.pdf',
    }));
    expect(result).toMatchObject({
      extraction: {
        requestedUrl: 'https://vendor.example/product-page',
        resolvedPdfUrl: 'https://vendor.example/files/protocol.pdf',
        resolution: 'landing_page',
      },
    });
  });

  it('returns 503 when workspace root is unavailable', async () => {
    const handlers = createVendorSearchHandlers();
    const reply = makeMockReply();

    const result = await handlers.ingestGraphLemurPdf(graphLemurIngestRequest({
      url: 'https://vendor.example/protocol.pdf',
    }), reply);

    expect(reply.status).toHaveBeenCalledWith(503);
    expect(result).toEqual({
      error: 'WORKSPACE_NOT_CONFIGURED',
      message: 'GraphLemur PDF ingest requires a configured workspace root.',
    });
    expect(mockDownloadVendorPdf).not.toHaveBeenCalled();
  });
});
