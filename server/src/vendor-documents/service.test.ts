import { describe, expect, it, vi } from 'vitest';
import { buildVendorDocumentExtraction } from './service.js';
import {
  shapeDocumentResult,
  filterAndShapeDocumentResults,
  getCuratedProtocolIdeVendors,
  protocolIdeDocumentToFoundryPdfCandidate,
  protocolIdeDocumentsToFoundryPdfCandidates,
} from './service.js';
import { PROTOCOL_IDE_VENDORS, isCuratedVendor } from './protocolIdeVendors.js';

describe('vendor document extraction service', () => {
  it('builds a composition draft from plain text content', async () => {
    const text = [
      'RPMI 1640 formulation',
      'Glucose 2 g/L',
      'L-Glutamine 2 mM',
      'Sodium bicarbonate 2 g/L',
    ].join('\n');

    const result = await buildVendorDocumentExtraction({
      fileName: 'rpmi-1640.txt',
      mediaType: 'text/plain',
      contentBase64: Buffer.from(text, 'utf8').toString('base64'),
      documentKind: 'formulation_sheet',
      title: 'RPMI 1640 formulation',
    });

    expect(result.document).toMatchObject({
      title: 'RPMI 1640 formulation',
      document_kind: 'formulation_sheet',
      file_ref: {
        file_name: 'rpmi-1640.txt',
        media_type: 'text/plain',
        page_count: 1,
      },
      extraction: {
        method: 'plain_text',
      },
    });
    expect(result.draft).toBeDefined();
    expect((result.draft as { items: Array<{ component_name: string; concentration: { value: number; unit: string } }> }).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          component_name: 'Glucose',
          concentration: { value: 2, unit: 'g/L', basis: 'mass_per_volume' },
        }),
        expect.objectContaining({
          component_name: 'L-Glutamine',
          concentration: { value: 2, unit: 'mM', basis: 'molar' },
        }),
      ]),
    );
  });

  it('builds a composition draft from vendor formulation HTML content', async () => {
    const html = `
      <!doctype html>
      <html>
        <head><title>RPMI-1640 Media Formulation</title></head>
        <body>
          <h1>RPMI-1640 Media Formulation</h1>
          <h2>RPMI-1640 Medium Composition</h2>
          <table>
            <tr><th>Component</th><th>[1x] g/L</th></tr>
            <tr><td>Glucose</td><td>2 g/L</td></tr>
            <tr><td>Sodium bicarbonate</td><td>2 g/L</td></tr>
            <tr><td>L-Glutamine</td><td>0.3 g/L</td></tr>
          </table>
          <h2>RPMI-1640 Medium HEPES Modification</h2>
          <table>
            <tr><th>Component</th><th>[1x] g/L</th></tr>
            <tr><td>Glucose</td><td>2 g/L</td></tr>
            <tr><td>Sodium bicarbonate</td><td>2 g/L</td></tr>
            <tr><td>HEPES</td><td>4.77 g/L</td></tr>
          </table>
        </body>
      </html>
    `;

    const result = await buildVendorDocumentExtraction({
      fileName: 'rpmi-1640.html',
      mediaType: 'text/html',
      contentBase64: Buffer.from(html, 'utf8').toString('base64'),
      documentKind: 'formulation_sheet',
      title: 'RPMI-1640 formulation page',
    });

    expect(result.document).toMatchObject({
      title: 'RPMI-1640 formulation page',
      document_kind: 'formulation_sheet',
      file_ref: {
        file_name: 'rpmi-1640.html',
        media_type: 'text/html',
        page_count: 1,
      },
      extraction: {
        method: 'html_section_parser',
      },
    });
    expect(result.draft).toBeDefined();
    expect(result.drafts).toHaveLength(2);
    expect((result.draft as { extraction_method: string; items: Array<{ component_name: string; concentration?: { value: number; unit: string } }> }).extraction_method).toBe('html_section_parser');
    expect((result.drafts as Array<{ notes?: string }>)[1]?.notes).toContain('HEPES Modification');
    expect((result.draft as { items: Array<{ component_name: string; concentration?: { value: number; unit: string } }> }).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          component_name: 'Glucose',
          concentration: { value: 2, unit: 'g/L', basis: 'mass_per_volume' },
        }),
        expect.objectContaining({
          component_name: 'L-Glutamine',
          concentration: { value: 0.3, unit: 'g/L', basis: 'mass_per_volume' },
        }),
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// Curated vendor filtering tests
// ---------------------------------------------------------------------------

describe('curated vendor filtering', () => {
  it('returns all six curated vendors', () => {
    const vendors = getCuratedProtocolIdeVendors();
    expect(vendors).toHaveLength(6);
    expect(vendors).toEqual(PROTOCOL_IDE_VENDORS);
  });

  it('recognizes all curated vendor IDs', () => {
    for (const vendor of PROTOCOL_IDE_VENDORS) {
      expect(isCuratedVendor(vendor)).toBe(true);
    }
  });

  it('rejects non-curated vendor IDs', () => {
    expect(isCuratedVendor('atcc')).toBe(false);
    expect(isCuratedVendor('abcam')).toBe(false);
    expect(isCuratedVendor('unknown')).toBe(false);
  });

  it('is case-sensitive for vendor IDs', () => {
    expect(isCuratedVendor('THERMO')).toBe(false);
    expect(isCuratedVendor('Thermo')).toBe(false);
    expect(isCuratedVendor('thermo')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Document-oriented search result shaping tests
// ---------------------------------------------------------------------------

describe('document result shaping', () => {
  it('shapes a curated vendor result with all fields', () => {
    const result = shapeDocumentResult(
      'thermo',
      'DNA Extraction Protocol v2',
      'https://www.thermofisher.com/order/catalog/product/12345',
      'A comprehensive DNA extraction protocol for 96-well format.',
    );

    expect(result).not.toBeNull();
    expect(result!.vendor).toBe('thermo');
    expect(result!.title).toBe('DNA Extraction Protocol v2');
    expect(result!.pdfUrl).toBe('https://www.thermofisher.com/order/catalog/product/12345');
    expect(result!.landingUrl).toBe('https://www.thermofisher.com/order/catalog/product/12345');
    expect(result!.snippet).toBe('A comprehensive DNA extraction protocol for 96-well format.');
    expect(result!.documentType).toBe('protocol');
    expect(result!.sessionIdHint).toBe('thermo::DNA Extraction Protocol v2');
  });

  it('infers document type from title keywords', () => {
    const protocolResult = shapeDocumentResult('sigma', 'Cell Culture Protocol', 'https://example.com');
    expect(protocolResult?.documentType).toBe('protocol');

    const manualResult = shapeDocumentResult('fisher', 'User Manual for Device X', 'https://example.com');
    expect(manualResult?.documentType).toBe('manual');

    const whitepaperResult = shapeDocumentResult('cayman', 'White Paper on AhR Activation', 'https://example.com');
    expect(whitepaperResult?.documentType).toBe('white_paper');

    const appNoteResult = shapeDocumentResult('vwr', 'Application Note: Redox Assay', 'https://example.com');
    expect(appNoteResult?.documentType).toBe('application_note');

    const otherResult = shapeDocumentResult('thomas', 'General Product Info', 'https://example.com');
    expect(otherResult?.documentType).toBe('other');
  });

  it('returns null for non-curated vendors', () => {
    const result = shapeDocumentResult('atcc', 'ATCC Protocol', 'https://example.com');
    expect(result).toBeNull();
  });

  it('handles missing optional fields gracefully', () => {
    const result = shapeDocumentResult('thermo', 'Minimal Document');
    expect(result).not.toBeNull();
    expect(result!.vendor).toBe('thermo');
    expect(result!.title).toBe('Minimal Document');
    expect(result!.pdfUrl).toBeUndefined();
    expect(result!.landingUrl).toBe('');
    expect(result!.snippet).toBeUndefined();
    expect(result!.documentType).toBe('other');
  });

  it('filterAndShapeDocumentResults is an alias for shapeDocumentResult', () => {
    const shaped = shapeDocumentResult('thermo', 'Test Protocol', 'https://example.com', 'A test');
    const filtered = filterAndShapeDocumentResults('thermo', 'Test Protocol', 'https://example.com', 'A test');
    expect(filtered).toEqual(shaped);
  });

  it('projects Protocol IDE document results into foundry PDF collection candidates', () => {
    const document = shapeDocumentResult(
      'thermo',
      'DNA Extraction Protocol',
      'https://example.com/protocol.pdf',
      'Vendor protocol PDF for extraction.',
    );

    const candidate = protocolIdeDocumentToFoundryPdfCandidate(document!, {
      searchQuery: 'dna extraction protocol filetype:pdf',
      provenance: { testRun: true },
    });

    expect(candidate).toMatchObject({
      vendor: 'thermo',
      title: 'DNA Extraction Protocol',
      sourceUrl: 'https://example.com/protocol.pdf',
      searchQuery: 'dna extraction protocol filetype:pdf',
      documentType: 'protocol',
      provenance: {
        source: 'protocol-ide-document-search',
        source_url_role: 'pdfUrl',
        landingUrl: 'https://example.com/protocol.pdf',
        testRun: true,
      },
    });
  });

  it('deduplicates projected foundry PDF candidates and skips non-PDF documents without pdfUrl', () => {
    const candidates = protocolIdeDocumentsToFoundryPdfCandidates([
      {
        vendor: 'sigma',
        title: 'Assay Protocol',
        pdfUrl: 'https://example.com/assay.pdf',
        landingUrl: 'https://example.com/assay',
        documentType: 'protocol',
      },
      {
        vendor: 'sigma',
        title: 'Assay Protocol Duplicate',
        pdfUrl: 'https://example.com/assay.pdf',
        landingUrl: 'https://example.com/assay-dup',
        documentType: 'protocol',
      },
      {
        vendor: 'sigma',
        title: 'Product Landing Page',
        landingUrl: 'https://example.com/product',
        documentType: 'other',
      },
    ], {
      searchQuery: 'assay protocol',
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      vendor: 'sigma',
      title: 'Assay Protocol',
      sourceUrl: 'https://example.com/assay.pdf',
    });
  });
});

// ---------------------------------------------------------------------------
// PDF arm delegates the page/OCR decision to the shared intake seam
// (L2-DOC-INTAKE-1 unit 4). No binaries and no real PDF bytes: the injected
// readPageTexts/ocrPage own everything the shared seam would shell out for.
// ---------------------------------------------------------------------------

const PDF_PAGE_1_TEXT = [
  'RPMI 1640 formulation sheet (vendor product document)',
  'Glucose 2 g/L',
  'Sodium bicarbonate 2 g/L',
].join('\n');

function pdfUpload(): { fileName: string; mediaType: string; contentBase64: string } {
  return {
    fileName: 'formulation.pdf',
    mediaType: 'application/pdf',
    contentBase64: Buffer.from('bytes that are not a real PDF').toString('base64'),
  };
}

describe('pdf extraction delegates to the shared intake service', () => {
  it('OCRs only the page without a text layer and records the method per page', async () => {
    const ocrPage = vi.fn(async (_filePath: string, _page: number, _config: unknown) => ({
      text: 'HEPES 4.77 g/L',
      diagnostics: [],
    }));

    const result = await buildVendorDocumentExtraction(pdfUpload(), {
      readPageTexts: async () => ({
        pages: [
          { page: 1, text: PDF_PAGE_1_TEXT },
          { page: 2, text: '' },
        ],
        diagnostics: [],
      }),
      ocrPage,
      probeTool: async () => true,
      loadOcrConfig: async () => ({
        executable: 'tesseract',
        language: 'eng',
        timeoutSeconds: 30,
        rasterizer: 'pdftoppm',
        dpi: 200,
        maxPages: 10,
      }),
    });

    expect(result.document).toMatchObject({
      file_ref: { page_count: 2 },
      extraction: {
        method: 'ocr',
        page_count: 2,
        ocr_attempted: true,
        ocr_available: true,
      },
    });
    expect(ocrPage).toHaveBeenCalledTimes(1);
    expect(ocrPage).toHaveBeenCalledWith(expect.any(String), 2, expect.anything());

    const draft = result.draft as { items: Array<{ component_name: string; source_page: number }> };
    expect(draft.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ component_name: 'HEPES', source_page: 2 }),
      ]),
    );
  });

  it('keeps a text-layer-only PDF on pdf_text and never calls OCR', async () => {
    const ocrPage = vi.fn(async (_filePath: string, _page: number, _config: unknown) => ({
      text: 'unexpected OCR text',
      diagnostics: [],
    }));

    const result = await buildVendorDocumentExtraction(pdfUpload(), {
      readPageTexts: async () => ({
        pages: [
          { page: 1, text: PDF_PAGE_1_TEXT },
          { page: 2, text: 'L-Glutamine 2 mM\nHEPES 4.77 g/L' },
        ],
        diagnostics: [],
      }),
      ocrPage,
      probeTool: async () => true,
      loadOcrConfig: async () => ({
        executable: 'tesseract',
        language: 'eng',
        timeoutSeconds: 30,
        rasterizer: 'pdftoppm',
        dpi: 200,
        maxPages: 10,
      }),
    });

    expect(result.document).toMatchObject({
      file_ref: { page_count: 2 },
      extraction: {
        method: 'pdf_text',
        ocr_attempted: false,
        ocr_available: false,
      },
    });
    expect(ocrPage).not.toHaveBeenCalled();
  });

  // Adversarial c1 defect: a PDF whose fileName carries no `.pdf` suffix must
  // still be extracted on the strength of its mediaType. Before the fix the
  // temp file kept the suffixless name, so the shared seam
  // (extractDocumentPages, which decides on `extension !== '.pdf'`) returned
  // UNSUPPORTED and the arm reported method 'failed'.
  it('extracts a PDF whose fileName has no .pdf suffix when mediaType says application/pdf', async () => {
    const result = await buildVendorDocumentExtraction(
      { ...pdfUpload(), fileName: 'spec-sheet-no-suffix' },
      {
        readPageTexts: async () => ({
          pages: [{ page: 1, text: PDF_PAGE_1_TEXT }],
          diagnostics: [],
        }),
        ocrPage: async () => ({ text: 'unexpected OCR text', diagnostics: [] }),
        probeTool: async () => true,
        loadOcrConfig: async () => ({
          executable: 'tesseract',
          language: 'eng',
          timeoutSeconds: 30,
          rasterizer: 'pdftoppm',
          dpi: 200,
          maxPages: 10,
        }),
      },
    );

    expect(result.document).toMatchObject({
      file_ref: { page_count: 1 },
      extraction: { method: 'pdf_text', page_count: 1 },
    });
    expect((result.document as { extraction: { method: string } }).extraction.method)
      .not.toBe('failed');
  });
});
