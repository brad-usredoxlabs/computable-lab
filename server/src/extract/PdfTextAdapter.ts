/**
 * PDF text extraction adapter.
 * 
 * Extracts plain text from PDF file buffers using pdf-parse.
 * This adapter handles text-layer only - no OCR.
 * 
 * Per spec-060: Adapter NEVER throws - all failures surface as diagnostics.
 */

import type { ExtractionDiagnostic } from './ExtractorAdapter.js';
import { PDFParse } from 'pdf-parse';

/**
 * Result of PDF text extraction.
 */
export interface PdfExtractionResult {
  text: string;
  page_count: number;
  diagnostics: ExtractionDiagnostic[];
}

/**
 * Options for PDF text extraction.
 */
export interface PdfTextAdapterOptions {
  /**
   * Optional custom parser function.
   * If provided, used instead of the default pdf-parse.
   * Useful for testing with stubs.
   */
  parse?: (buffer: Buffer) => Promise<{ text: string; numpages: number }>;
}

/**
 * Diagnostic codes for PDF extraction.
 */
export const PDF_DIAGNOSTIC_CODES = {
  PDF_PARSE_FAILED: 'pdf_parse_failed',
  PDF_NO_TEXT_LAYER: 'pdf_no_text_layer',
} as const;

/**
 * Extract plain text from a PDF file buffer.
 * 
 * @param buffer - The PDF file as a Buffer or Uint8Array
 * @param options - Optional configuration
 * @returns PdfExtractionResult with text, page count, and any diagnostics
 */
export async function extractPdfText(
  buffer: Buffer | Uint8Array,
  options?: PdfTextAdapterOptions,
): Promise<PdfExtractionResult> {
  // Normalize to Buffer
  const pdfBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  // Use custom parser if provided
  if (options?.parse) {
    try {
      const result = await options.parse(pdfBuffer);
      const text = result.text ?? '';
      const page_count = result.numpages ?? 0;
      const diagnostics: ExtractionDiagnostic[] = [];

      // Check for empty text layer
      if (text === '' && page_count > 0) {
        diagnostics.push({
          severity: 'warning',
          code: PDF_DIAGNOSTIC_CODES.PDF_NO_TEXT_LAYER,
          message: 'PDF has pages but no extractable text layer (may be scanned)',
        });
      }

      return {
        text,
        page_count,
        diagnostics,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        text: '',
        page_count: 0,
        diagnostics: [{
          severity: 'error',
          code: PDF_DIAGNOSTIC_CODES.PDF_PARSE_FAILED,
          message: errorMessage,
        }],
      };
    }
  }

  // Use pdf-parse library
  try {
    const parser = new PDFParse({ data: pdfBuffer });
    const textResult = await parser.getText();
    const text = textResult.text ?? '';
    const page_count = textResult.pages.length;
    const diagnostics: ExtractionDiagnostic[] = [];

    // Check for empty text layer
    if (text === '' && page_count > 0) {
      diagnostics.push({
        severity: 'warning',
        code: PDF_DIAGNOSTIC_CODES.PDF_NO_TEXT_LAYER,
        message: 'PDF has pages but no extractable text layer (may be scanned)',
      });
    }

    return {
      text,
      page_count,
      diagnostics,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return {
      text: '',
      page_count: 0,
      diagnostics: [{
        severity: 'error',
        code: PDF_DIAGNOSTIC_CODES.PDF_PARSE_FAILED,
        message: errorMessage,
      }],
    };
  }
}

export default extractPdfText;
