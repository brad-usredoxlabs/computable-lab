/**
 * Tests for CaymanPlateMapAdapter.
 * 
 * Tests the adapter's ability to parse Cayman plate-map PDFs into material-spec candidates.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCaymanPlateMapAdapter, CAYMAN_DIAGNOSTIC_CODES } from './CaymanPlateMapAdapter.js';
import type { ExtractionRequest } from '../ExtractorAdapter.js';

// Stub extractPdfLayoutText for deterministic testing
vi.mock('../PdfTextAdapter.js', () => ({
  extractPdfLayoutText: vi.fn().mockResolvedValue({
    text: '',
    page_count: 0,
    diagnostics: [],
  }),
}));

import { extractPdfLayoutText } from '../PdfTextAdapter.js';

describe('CaymanPlateMapAdapter', () => {
  let adapter: Awaited<ReturnType<typeof createCaymanPlateMapAdapter>>;

  beforeEach(async () => {
    adapter = await createCaymanPlateMapAdapter();
    vi.clearAllMocks();
  });

  describe('happy path - valid plate-map rows', () => {
    it('parses multiple plate-map rows into material-spec candidates', async () => {
      const stubbedText = `
Cayman Chemical Screening Library
Plate A - 96-Well Format

A1  Compound Alpha    12345-678   10 µM
A2  Compound Beta     23456-789   25 µM
B1  Compound Gamma    34567-890   50 µM
B2  Compound Delta    45678-901   100 µM
C1  Compound Epsilon  56789-012   5 µM
`;

      vi.mocked(extractPdfLayoutText).mockResolvedValue({
        text: stubbedText,
        page_count: 1,
        diagnostics: [],
      });

      const req: ExtractionRequest = {
        text: '',
        hint: {
          pdfBuffer: Buffer.from('stubbed-pdf-content'),
        },
      };

      const result = await adapter.extract(req);

      expect(result.candidates).toHaveLength(5);

      // Check first candidate
      expect(result.candidates[0]).toMatchObject({
        target_kind: 'material-spec',
        confidence: 0.85,
        draft: {
          display_name: 'Compound Alpha',
          catalog_id: '12345-678',
          concentration: '10 µM',
          well: 'A1',
          vendor: 'Cayman Chemical',
        },
        uncertainty: 'low',
      });

      // Check second candidate
      expect(result.candidates[1]).toMatchObject({
        target_kind: 'material-spec',
        draft: {
          display_name: 'Compound Beta',
          catalog_id: '23456-789',
          concentration: '25 µM',
          well: 'A2',
          vendor: 'Cayman Chemical',
        },
      });

      // Check last candidate
      expect(result.candidates[4]).toMatchObject({
        target_kind: 'material-spec',
        draft: {
          display_name: 'Compound Epsilon',
          catalog_id: '56789-012',
          concentration: '5 µM',
          well: 'C1',
          vendor: 'Cayman Chemical',
        },
      });

      expect(result.diagnostics).toHaveLength(0);
    });

    it('handles different concentration units', async () => {
      const stubbedText = `
A1  Test Compound 1   11111-222   100 nM
A2  Test Compound 2   22222-333   500 uM
A3  Test Compound 3   33333-444   1 mM
A4  Test Compound 4   44444-555   10 mg/mL
`;

      vi.mocked(extractPdfLayoutText).mockResolvedValue({
        text: stubbedText,
        page_count: 1,
        diagnostics: [],
      });

      const req: ExtractionRequest = {
        text: '',
        hint: {
          pdfBuffer: Buffer.from('stubbed-pdf-content'),
        },
      };

      const result = await adapter.extract(req);

      expect(result.candidates).toHaveLength(4);
      expect(result.candidates[0].draft.concentration).toBe('100 nM');
      expect(result.candidates[1].draft.concentration).toBe('500 uM');
      expect(result.candidates[2].draft.concentration).toBe('1 mM');
      expect(result.candidates[3].draft.concentration).toBe('10 mg/mL');
    });

    it('handles well IDs at boundaries (A1, H12)', async () => {
      const stubbedText = `
A1  First Compound    11111-222   10 µM
H12 Last Compound     99999-000   20 µM
`;

      vi.mocked(extractPdfLayoutText).mockResolvedValue({
        text: stubbedText,
        page_count: 1,
        diagnostics: [],
      });

      const req: ExtractionRequest = {
        text: '',
        hint: {
          pdfBuffer: Buffer.from('stubbed-pdf-content'),
        },
      };

      const result = await adapter.extract(req);

      expect(result.candidates).toHaveLength(2);
      expect(result.candidates[0].draft.well).toBe('A1');
      expect(result.candidates[1].draft.well).toBe('H12');
    });
  });

  describe('degenerate cases', () => {
    it('returns zero candidates with warning diagnostic for non-matching text', async () => {
      const stubbedText = `
This is just some random text
That doesn't match the plate-map format
No wells, no compounds, nothing recognizable
`;

      vi.mocked(extractPdfLayoutText).mockResolvedValue({
        text: stubbedText,
        page_count: 1,
        diagnostics: [],
      });

      const req: ExtractionRequest = {
        text: '',
        hint: {
          pdfBuffer: Buffer.from('stubbed-pdf-content'),
        },
      };

      const result = await adapter.extract(req);

      expect(result.candidates).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({
        severity: 'warning',
        code: CAYMAN_DIAGNOSTIC_CODES.CAYMAN_NO_ROWS_MATCHED,
        message: 'Cayman plate-map adapter found no recognizable plate rows',
      });
    });

    it('returns empty result for empty text', async () => {
      vi.mocked(extractPdfLayoutText).mockResolvedValue({
        text: '',
        page_count: 0,
        diagnostics: [],
      });

      const req: ExtractionRequest = {
        text: '',
        hint: {
          pdfBuffer: Buffer.from('stubbed-pdf-content'),
        },
      };

      const result = await adapter.extract(req);

      expect(result.candidates).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].code).toBe(CAYMAN_DIAGNOSTIC_CODES.CAYMAN_NO_ROWS_MATCHED);
    });
  });

  describe('fallback to req.text', () => {
    it('uses req.text when no pdfBuffer is provided', async () => {
      const stubbedText = `
A1  Direct Text Compound  12345-678   10 µM
`;

      const req: ExtractionRequest = {
        text: stubbedText,
        // No pdfBuffer hint
      };

      const result = await adapter.extract(req);

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].draft.display_name).toBe('Direct Text Compound');
      expect(result.candidates[0].draft.catalog_id).toBe('12345-678');
      expect(extractPdfLayoutText).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('never throws - converts errors to diagnostics', async () => {
      vi.mocked(extractPdfLayoutText).mockRejectedValue(new Error('PDF parsing failed'));

      const req: ExtractionRequest = {
        text: '',
        hint: {
          pdfBuffer: Buffer.from('bad-pdf'),
        },
      };

      // Should NOT throw
      const result = await adapter.extract(req);

      expect(result.candidates).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].severity).toBe('error');
      expect(result.diagnostics[0].code).toBe('CAYMAN_EXTRACTION_ERROR');
    });
  });
});
