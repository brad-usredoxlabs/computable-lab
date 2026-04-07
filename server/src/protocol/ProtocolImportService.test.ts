import { describe, expect, it } from 'vitest';
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
