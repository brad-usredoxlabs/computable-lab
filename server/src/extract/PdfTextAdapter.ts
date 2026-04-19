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
import { spawn } from 'node:child_process';

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
  PDF_LAYOUT_TOOL_MISSING: 'pdf_layout_tool_missing',
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

/**
 * Options for layout-preserving PDF text extraction.
 * Extends PdfTextAdapterOptions with optional pdftotextCommand injection.
 */
export interface PdfLayoutTextAdapterOptions extends PdfTextAdapterOptions {
  /**
   * Optional custom pdftotext command runner.
   * If provided, used instead of the default pdftotext invocation.
   * Useful for testing with stubs.
   */
  pdftotextCommand?: (buf: Buffer) => Promise<{ stdout: string; code: number }>;
}

/**
 * Result type for pdftotext command execution.
 */
interface PdftotextResult {
  stdout: string;
  code: number;
}

/**
 * Default runner that invokes pdftotext with -layout flag.
 * Pipes the PDF buffer to stdin and captures stdout.
 * 
 * @param buf - The PDF buffer to process
 * @returns Promise resolving to stdout text and exit code
 */
async function defaultPdftotextRunner(buf: Buffer): Promise<PdftotextResult> {
  return new Promise((resolve) => {
    const proc = spawn('pdftotext', ['-layout', '-', '-']);
    const chunks: Buffer[] = [];

    proc.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    proc.on('error', () => {
      resolve({ stdout: '', code: -1 });
    });

    proc.on('close', (code) => {
      resolve({
        stdout: Buffer.concat(chunks).toString('utf8'),
        code: code ?? 0,
      });
    });

    proc.stdin.end(buf);
  });
}

/**
 * Extract text from a PDF file buffer using pdftotext with -layout flag.
 * This preserves columnar alignment by maintaining the spatial layout of text.
 * 
 * Falls back to extractPdfText() if pdftotext is unavailable, with a warning diagnostic.
 * 
 * @param buffer - The PDF file as a Buffer or Uint8Array
 * @param options - Optional configuration including custom pdftotext runner
 * @returns PdfExtractionResult with text, page count, and any diagnostics
 */
export async function extractPdfLayoutText(
  buffer: Buffer | Uint8Array,
  options?: PdfLayoutTextAdapterOptions,
): Promise<PdfExtractionResult> {
  const pdfBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const runner = options?.pdftotextCommand ?? defaultPdftotextRunner;

  try {
    const result = await runner(pdfBuffer);
    if (result.code === 0 && result.stdout) {
      return {
        text: result.stdout,
        page_count: 0,
        diagnostics: [],
      };
    }
    // Falls through to fallback
  } catch {
    // Intentionally ignored — fall through to fallback + diagnostic
  }

  // Fallback: use the plain-text extractor and surface a warning
  const fallback = await extractPdfText(pdfBuffer, options);
  return {
    ...fallback,
    diagnostics: [
      ...fallback.diagnostics,
      {
        severity: 'warning',
        code: PDF_DIAGNOSTIC_CODES.PDF_LAYOUT_TOOL_MISSING,
        message: 'pdftotext -layout unavailable; columnar alignment may be lost',
      },
    ],
  };
}
