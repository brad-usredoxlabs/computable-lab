import { describe, expect, it, vi } from 'vitest';
import { importProtocolPdf } from './ProtocolImportService.js';

describe('ProtocolImportService', () => {
  it('maps extracted PDF text into a ready editable draft', async () => {
    const response = await importProtocolPdf({
      fileName: 'lysis-protocol.pdf',
      contentBase64: Buffer.from('%PDF-1.4 mock').toString('base64'),
    }, {
      extractPdfText: async () => ({
        sha256: 'mock',
        pages: [
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
        ],
      }),
    });

    expect(response.success).toBe(true);
    expect(response.state).toBe('ready');
    expect(response.document.title).toBe('Vendor Lysis Protocol');
    expect(response.document.materials).toContain('Lysis buffer');
    expect(response.document.steps).toHaveLength(2);
  });

  it('returns a partial draft when extracted text is sparse', async () => {
    const response = await importProtocolPdf({
      fileName: 'sparse.pdf',
      contentBase64: Buffer.from('%PDF-1.4 sparse').toString('base64'),
    }, {
      extractPdfText: async () => ({
        sha256: 'mock',
        pages: [
          {
            pageNumber: 1,
            text: [
              'Sparse Vendor Protocol',
              'Overview',
              'Minimal OCR text recovered from the source PDF.',
            ].join('\n'),
          },
        ],
      }),
    });

    expect(response.state).toBe('partial');
    expect(response.extraction.missingSections).toContain('Procedure Steps');
    expect(response.document.steps[0]?.title).toBe('Review vendor instructions');
  });
});

// DOCINGEST-A convergence site 3 — importProtocolPdf pre-branches non-PDF
// formats through the ONE dispatcher while the injectable extractPdfText
// seam (typeof extractPdfLayoutText) keeps working untouched for PDFs.
describe('importProtocolPdf — non-PDF formats dispatch (injectable seam kept)', () => {
  it('a .md file imports through the dispatcher without any PDF extractor call', async () => {
    const extractSpy = vi.fn();
    const md = '# Lysis protocol\n\nMaterials\n- Lysis buffer\n\nProcedure\n1. Warm the plate to room temperature.\n2. Add lysis buffer to each well.\n';
    const response = await importProtocolPdf(
      {
        fileName: 'lysis-protocol.md',
        contentBase64: Buffer.from(md).toString('base64'),
      },
      { extractPdfText: extractSpy },
    );
    expect(extractSpy, 'a markdown import must never call the PDF extractor seam').not.toHaveBeenCalled();
    expect(response.success).toBe(true);
    // The dispatcher declares markdown is read AS TEXT (headings not
    // interpreted), so the heading marker survives into the derived title.
    expect(response.document.title).toBe('# Lysis protocol');
    expect(response.document.materials).toContain('Lysis buffer');
    expect(response.document.steps).toHaveLength(2);
  });

  it('a .pdf file still goes through the injectable seam (test hook byte-identical)', async () => {
    const extractSpy = vi.fn(async () => ({
      sha256: 'mock',
      pages: [{ pageNumber: 1, text: 'Vendor Lysis Protocol\nProcedure\n1. Warm the plate.' }],
    }));
    const response = await importProtocolPdf(
      { fileName: 'x.pdf', contentBase64: Buffer.from('%PDF-1.4 mock').toString('base64') },
      { extractPdfText: extractSpy },
    );
    expect(extractSpy).toHaveBeenCalledTimes(1);
    expect(response.success).toBe(true);
  });
});
