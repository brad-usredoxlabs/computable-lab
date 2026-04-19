/**
 * Ingestion passes for the ingestion-compile pipeline.
 * 
 * This module provides pass factories for ingesting PDFs and other unstructured
 * sources: PDF text extraction, chunking, and multi-chunk extraction.
 */

import type { Pass, PassRunArgs, PassResult, PassDiagnostic } from '../types.js';
import type { PdfTextAdapterOptions, PdfExtractionResult } from '../../../extract/PdfTextAdapter.js';
import type { ExtractorAdapter, ExtractionRequest, ExtractionResult, ExtractionDiagnostic } from '../../../extract/ExtractorAdapter.js';
import { extractPdfText } from '../../../extract/PdfTextAdapter.js';

/**
 * Diagnostic codes for ingestion passes.
 */
export const INGESTION_DIAGNOSTIC_CODES = {
  MISSING_INPUT: 'missing_input',
  NO_CHUNKS: 'no_chunks',
} as const;

/**
 * Create the pdf_text_extract pass.
 * 
 * This pass extracts plain text from a PDF buffer.
 * 
 * @param options - Optional configuration for the PDF text adapter
 * @returns A pass that extracts text from PDFs
 */
export function createPdfTextExtractPass(options?: PdfTextAdapterOptions): Pass {
  return {
    id: 'pdf_text_extract',
    family: 'parse',
    async run(args: PassRunArgs): Promise<PassResult> {
      const { state, pass_id } = args;

      // Read pdfBuffer from state.input (required)
      const input = state.input;
      const pdfBuffer = input.pdfBuffer;

      if (!pdfBuffer) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: INGESTION_DIAGNOSTIC_CODES.MISSING_INPUT,
              message: 'state.input.pdfBuffer is required',
              pass_id,
            },
          ],
        };
      }

      // Extract text from PDF
      const result: PdfExtractionResult = await extractPdfText(pdfBuffer as Buffer | Uint8Array, options);

      // Fold extraction diagnostics into pass diagnostics
      const passDiagnostics: PassDiagnostic[] = result.diagnostics.map(d => ({
        severity: d.severity,
        code: d.code,
        message: d.message,
        pass_id,
        details: d.details as Record<string, unknown>,
      }));

      // Check for error-severity diagnostics
      const hasErrorDiagnostic = result.diagnostics.some(d => d.severity === 'error');

      if (hasErrorDiagnostic) {
        return {
          ok: false,
          output: {
            text: result.text,
            page_count: result.page_count,
          },
          diagnostics: passDiagnostics,
        };
      }

      // Success
      return {
        ok: true,
        output: {
          text: result.text,
          page_count: result.page_count,
        },
        diagnostics: passDiagnostics,
      };
    },
  };
}

/**
 * Create the chunk_text pass.
 * 
 * This pass splits extracted text into chunks of at most maxChars characters,
 * preferring to split at paragraph boundaries (\n\n).
 * 
 * @param maxChars - Maximum characters per chunk (default: 2000)
 * @returns A pass that chunks text
 */
export function createChunkTextPass(maxChars: number = 2000): Pass {
  return {
    id: 'chunk_text',
    family: 'normalize',
    run(args: PassRunArgs): PassResult {
      const { state, pass_id } = args;

      // Get pdf_text_extract output
      const pdfExtractOutput = state.outputs.get('pdf_text_extract') as { text: string; page_count: number } | undefined;

      if (!pdfExtractOutput) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'MISSING_PDF_EXTRACT_OUTPUT',
              message: 'pdf_text_extract output not found in state.outputs',
              pass_id,
            },
          ],
        };
      }

      const text = pdfExtractOutput.text;

      // Handle empty text
      if (text === '') {
        return {
          ok: true,
          output: {
            chunks: [],
          },
          diagnostics: [
            {
              severity: 'warning',
              code: INGESTION_DIAGNOSTIC_CODES.NO_CHUNKS,
              message: 'Input text is empty; no chunks produced',
              pass_id,
            },
          ],
        };
      }

      // Chunk the text
      const chunks = chunkText(text, maxChars);

      return {
        ok: true,
        output: {
          chunks,
        },
      };
    },
  };
}

/**
 * Split text into chunks of at most maxChars characters.
 * 
 * Prefers to split at paragraph boundaries (\n\n). If a single paragraph
 * exceeds maxChars, falls back to hard-splitting at maxChars.
 * 
 * @param text - The text to chunk
 * @param maxChars - Maximum characters per chunk
 * @returns Array of chunks
 */
function chunkText(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  
  // Split into paragraphs (by \n\n)
  const paragraphs = text.split(/\n\n+/);
  
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    // If paragraph itself exceeds maxChars, hard-split it
    if (paragraph.length > maxChars) {
      // First, add any current chunk
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
      
      // Hard-split the long paragraph
      const hardChunks = hardSplitText(paragraph, maxChars);
      chunks.push(...hardChunks);
    } else if (currentChunk.length + paragraph.length + 2 <= maxChars) {
      // Can fit in current chunk (add \n\n between paragraphs)
      if (currentChunk) {
        currentChunk += '\n\n' + paragraph;
      } else {
        currentChunk = paragraph;
      }
    } else {
      // Start a new chunk
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      currentChunk = paragraph;
    }
  }
  
  // Add remaining chunk
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  // If no chunks were created (shouldn't happen if text is non-empty), create one
  if (chunks.length === 0 && text.length > 0) {
    chunks.push(text);
  }
  
  return chunks;
}

/**
 * Hard-split text into fixed-size chunks.
 * 
 * @param text - The text to split
 * @param chunkSize - Size of each chunk
 * @returns Array of chunks
 */
function hardSplitText(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  
  return chunks;
}

/**
 * Create the extractor_run pass for multi-chunk extraction.
 * 
 * This pass runs the extractor on each chunk and concatenates the results.
 * It re-registers under the same id as ExtractionPasses.createExtractorRunPass,
 * but this version handles multiple chunks.
 * 
 * @param extractor - The extractor adapter to use
 * @returns A pass that runs extraction on multiple chunks
 */
export function createMultiChunkExtractorPass(extractor: ExtractorAdapter): Pass {
  return {
    id: 'extractor_run',
    family: 'parse',
    async run(args: PassRunArgs): Promise<PassResult> {
      const { state, pass_id } = args;

      // Get chunk_text output
      const chunkTextOutput = state.outputs.get('chunk_text') as { chunks: string[] } | undefined;

      if (!chunkTextOutput) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'MISSING_CHUNK_TEXT_OUTPUT',
              message: 'chunk_text output not found in state.outputs',
              pass_id,
            },
          ],
        };
      }

      const chunks = chunkTextOutput.chunks;

      // Handle empty chunks
      if (chunks.length === 0) {
        return {
          ok: true,
          output: {
            candidates: [],
            diagnostics: [],
          },
        };
      }

      // Run extraction on each chunk
      const allCandidates: ExtractionResult['candidates'] = [];
      const allDiagnostics: ExtractionDiagnostic[] = [];

      for (const chunk of chunks) {
        const extractionRequest: ExtractionRequest = {
          text: chunk,
        };

        const result: ExtractionResult = await extractor.extract(extractionRequest);

        // Concatenate candidates and diagnostics
        allCandidates.push(...result.candidates);
        allDiagnostics.push(...result.diagnostics);
      }

      // Fold extraction diagnostics into pass diagnostics
      const passDiagnostics: PassDiagnostic[] = allDiagnostics.map(d => ({
        severity: d.severity,
        code: d.code,
        message: d.message,
        pass_id,
        details: d.details as Record<string, unknown>,
      }));

      // Check for failure: error-severity diagnostics AND zero candidates
      const hasErrorDiagnostic = allDiagnostics.some(d => d.severity === 'error');
      const hasNoCandidates = allCandidates.length === 0;

      if (hasNoCandidates && hasErrorDiagnostic) {
        return {
          ok: false,
          output: {
            candidates: allCandidates,
            diagnostics: allDiagnostics,
          },
          diagnostics: passDiagnostics,
        };
      }

      // Success
      return {
        ok: true,
        output: {
          candidates: allCandidates,
          diagnostics: allDiagnostics,
        },
        diagnostics: passDiagnostics,
      };
    },
  };
}
