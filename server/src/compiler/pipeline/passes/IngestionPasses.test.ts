/**
 * Tests for IngestionPasses.
 */

import { describe, it, expect } from 'vitest';
import type { PassRunArgs, PipelineState, PassDiagnostic } from '../types.js';
import { createPdfTextExtractPass, createChunkTextPass, createMultiChunkExtractorPass } from './IngestionPasses.js';
import type { ExtractorAdapter, ExtractionRequest, ExtractionResult } from '../../../extract/ExtractorAdapter.js';
import type { PdfTextAdapterOptions } from '../../../extract/PdfTextAdapter.js';

/**
 * Helper to create a minimal PassRunArgs for testing.
 */
function makeArgs(input: Record<string, unknown>, outputs?: Map<string, unknown>): PassRunArgs {
  return {
    pass_id: 'test',
    state: {
      input,
      context: {},
      meta: {},
      outputs: outputs ?? new Map(),
      diagnostics: [],
    } as PipelineState,
  };
}

describe('createPdfTextExtractPass', () => {
  it('should extract text from PDF buffer', async () => {
    const mockOptions: PdfTextAdapterOptions = {
      parse: async (buffer) => ({
        text: 'Hello, this is PDF text.',
        numpages: 1,
      }),
    };

    const pass = createPdfTextExtractPass(mockOptions);
    const args = makeArgs({
      pdfBuffer: Buffer.from('fake pdf content'),
    });

    const result = await pass.run(args);

    expect(result.ok).toBe(true);
    expect(result.output).toEqual({
      text: 'Hello, this is PDF text.',
      page_count: 1,
    });
  });

  it('should fail when pdfBuffer is missing', async () => {
    const pass = createPdfTextExtractPass();
    const args = makeArgs({});

    const result = await pass.run(args);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics?.[0].code).toBe('missing_input');
  });

  it('should handle parse errors gracefully', async () => {
    const mockOptions: PdfTextAdapterOptions = {
      parse: async (buffer) => {
        throw new Error('Parse failed');
      },
    };

    const pass = createPdfTextExtractPass(mockOptions);
    const args = makeArgs({
      pdfBuffer: Buffer.from('fake pdf content'),
    });

    const result = await pass.run(args);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics?.[0].severity).toBe('error');
  });
});

describe('createChunkTextPass', () => {
  it('should split text on paragraph boundaries', () => {
    const pass = createChunkTextPass(100);
    
    const text = 'Paragraph one with about 50 characters.\n\nParagraph two with about 50 characters.\n\nParagraph three with about 50 characters.';
    
    const args = makeArgs(
      {},
      new Map([['pdf_text_extract', { text, page_count: 1 }]])
    );

    const result = pass.run(args);

    expect(result.ok).toBe(true);
    expect(result.output).toBeDefined();
    
    const chunks = (result.output as { chunks: string[] }).chunks;
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    
    // Each chunk should be <= 100 chars
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
  });

  it('should hard-split long paragraphs', () => {
    const pass = createChunkTextPass(100);
    
    // Create a 500-character paragraph
    const longParagraph = 'A'.repeat(500);
    
    const args = makeArgs(
      {},
      new Map([['pdf_text_extract', { text: longParagraph, page_count: 1 }]])
    );

    const result = pass.run(args);

    expect(result.ok).toBe(true);
    expect(result.output).toBeDefined();
    
    const chunks = (result.output as { chunks: string[] }).chunks;
    // Should have 5 chunks of 100 chars each
    expect(chunks.length).toBe(5);
    
    // Each chunk should be exactly 100 chars
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
  });

  it('should handle empty text with warning', () => {
    const pass = createChunkTextPass(2000);
    
    const args = makeArgs(
      {},
      new Map([['pdf_text_extract', { text: '', page_count: 0 }]])
    );

    const result = pass.run(args);

    expect(result.ok).toBe(true);
    expect((result.output as { chunks: string[] }).chunks).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics?.[0].code).toBe('no_chunks');
    expect(result.diagnostics?.[0].severity).toBe('warning');
  });

  it('should fail when pdf_text_extract output is missing', () => {
    const pass = createChunkTextPass(2000);
    
    const args = makeArgs({});

    const result = pass.run(args);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics?.[0].code).toBe('MISSING_PDF_EXTRACT_OUTPUT');
  });
});

describe('createMultiChunkExtractorPass', () => {
  it('should concatenate candidates from multiple chunks', async () => {
    // Create a stub extractor that returns different candidates per chunk
    let callCount = 0;
    const stubExtractor: ExtractorAdapter = {
      extract: async (req: ExtractionRequest): Promise<ExtractionResult> => {
        callCount++;
        return {
          candidates: [
            {
              target_kind: 'material-spec',
              draft: { name: `Material from chunk ${callCount}` },
              confidence: 0.9,
            },
          ],
          diagnostics: [],
        };
      },
    };

    const pass = createMultiChunkExtractorPass(stubExtractor);
    
    const args = makeArgs(
      {},
      new Map([['chunk_text', { chunks: ['chunk 1 text', 'chunk 2 text'] }]])
    );

    const result = await pass.run(args);

    expect(result.ok).toBe(true);
    expect(result.output).toBeDefined();
    
    const output = result.output as ExtractionResult;
    expect(output.candidates.length).toBe(2);
    expect(output.diagnostics).toEqual([]);
  });

  it('should fail when all chunks produce errors and no candidates', async () => {
    const stubExtractor: ExtractorAdapter = {
      extract: async (): Promise<ExtractionResult> => {
        return {
          candidates: [],
          diagnostics: [
            {
              severity: 'error',
              code: 'EXTRACTION_FAILED',
              message: 'Failed to extract',
            },
          ],
        };
      },
    };

    const pass = createMultiChunkExtractorPass(stubExtractor);
    
    const args = makeArgs(
      {},
      new Map([['chunk_text', { chunks: ['chunk 1 text', 'chunk 2 text'] }]])
    );

    const result = await pass.run(args);

    expect(result.ok).toBe(false);
    expect(result.output).toBeDefined();
    
    const output = result.output as ExtractionResult;
    expect(output.candidates.length).toBe(0);
    expect(output.diagnostics.length).toBeGreaterThan(0);
  });

  it('should succeed when there are candidates even with some warnings', async () => {
    const stubExtractor: ExtractorAdapter = {
      extract: async (): Promise<ExtractionResult> => {
        return {
          candidates: [
            {
              target_kind: 'event',
              draft: { verb: 'create', container_type: 'plate' },
              confidence: 0.8,
            },
          ],
          diagnostics: [
            {
              severity: 'warning',
              code: 'LOW_CONFIDENCE',
              message: 'Low confidence extraction',
            },
          ],
        };
      },
    };

    const pass = createMultiChunkExtractorPass(stubExtractor);
    
    const args = makeArgs(
      {},
      new Map([['chunk_text', { chunks: ['some text'] }]])
    );

    const result = await pass.run(args);

    expect(result.ok).toBe(true);
    expect((result.output as ExtractionResult).candidates.length).toBe(1);
  });

  it('should handle empty chunks gracefully', async () => {
    const stubExtractor: ExtractorAdapter = {
      extract: async (): Promise<ExtractionResult> => {
        throw new Error('Should not be called');
      },
    };

    const pass = createMultiChunkExtractorPass(stubExtractor);
    
    const args = makeArgs(
      {},
      new Map([['chunk_text', { chunks: [] }]])
    );

    const result = await pass.run(args);

    expect(result.ok).toBe(true);
    expect((result.output as ExtractionResult).candidates).toEqual([]);
  });

  it('should fail when chunk_text output is missing', async () => {
    const stubExtractor: ExtractorAdapter = {
      extract: async (): Promise<ExtractionResult> => {
        throw new Error('Should not be called');
      },
    };

    const pass = createMultiChunkExtractorPass(stubExtractor);
    
    const args = makeArgs({});

    const result = await pass.run(args);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics?.[0].code).toBe('MISSING_CHUNK_TEXT_OUTPUT');
  });
});

describe('chunk_text edge cases', () => {
  it('should handle text with mixed paragraph lengths', () => {
    const pass = createChunkTextPass(100);
    
    const text = 'Short.\n\nThis is a much longer paragraph that exceeds the limit and should be split into multiple chunks because it is too long for a single chunk.';
    
    const args = makeArgs(
      {},
      new Map([['pdf_text_extract', { text, page_count: 1 }]])
    );

    const result = pass.run(args);

    expect(result.ok).toBe(true);
    const chunks = (result.output as { chunks: string[] }).chunks;
    
    // Each chunk should be <= 100 chars
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
  });

  it('should preserve paragraph boundaries within chunks', () => {
    const pass = createChunkTextPass(200);
    
    const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
    
    const args = makeArgs(
      {},
      new Map([['pdf_text_extract', { text, page_count: 1 }]])
    );

    const result = pass.run(args);

    expect(result.ok).toBe(true);
    const chunks = (result.output as { chunks: string[] }).chunks;
    
    // Should be able to fit all in one chunk since total is short
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    
    // Verify paragraphs are preserved
    for (const chunk of chunks) {
      expect(chunk).toContain('First paragraph');
      expect(chunk).toContain('Second paragraph');
      expect(chunk).toContain('Third paragraph');
    }
  });
});
