/**
 * Tests for ChunkedExtractionMerger
 */

import { describe, it, expect, vi } from 'vitest';
import { runChunkedExtraction } from './ChunkedExtractionMerger.js';
import type { ExtractorAdapter, ExtractionRequest, ExtractionResult } from './ExtractorAdapter.js';

describe('ChunkedExtractionMerger', () => {
  describe('single chunk passthrough', () => {
    it('should pass text under default limit to extractor once and return its candidates', async () => {
      // Text under default 8000 char limit -> single chunk
      const shortText = 'This is a short document that fits in one chunk.';
      
      const mockExtractor: ExtractorAdapter = {
        extract: vi.fn().mockResolvedValue({
          candidates: [
            {
              target_kind: 'material-spec',
              draft: { name: 'Test Material', concentration: '1M' },
              confidence: 0.9,
            },
          ],
          diagnostics: [
            {
              severity: 'info',
              code: 'EXTRACT_OK',
              message: 'Extraction successful',
            },
          ],
        }),
      };
      
      const result = await runChunkedExtraction({ text: shortText, extractor: mockExtractor });
      
      // Should have called extractor exactly once
      expect(mockExtractor.extract).toHaveBeenCalledTimes(1);
      expect(mockExtractor.extract).toHaveBeenCalledWith({ text: shortText });
      
      // Should return the candidate as-is
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].target_kind).toBe('material-spec');
      expect(result.candidates[0].confidence).toBe(0.9);
      
      // Diagnostic should have chunk_index metadata
      expect(result.diagnostics).toHaveLength(1);
      expect((result.diagnostics[0].details as Record<string, unknown>)?.chunk_index).toBe(0);
    });
  });

  describe('two chunks with distinct candidates', () => {
    it('should merge distinct candidates from multiple chunks without loss', async () => {
      // Use custom chunk options to create multiple chunks
      const longText = '## Section One\n' + 'A'.repeat(1000) + '\n\n## Section Two\n' + 'B'.repeat(1000);
      
      const mockExtractor: ExtractorAdapter = {
        extract: vi.fn(),
      };
      
      let callCount = 0;
      // Return distinct candidates based on call order
      mockExtractor.extract.mockImplementation((req: ExtractionRequest) => {
        const chunkIndex = callCount++;
        if (chunkIndex === 0) {
          return Promise.resolve({
            candidates: [
              {
                target_kind: 'material-spec',
                draft: { name: 'Material A', concentration: '1M' },
                confidence: 0.85,
              },
            ],
            diagnostics: [
              {
                severity: 'info',
                code: 'EXTRACT_OK',
                message: 'Extraction from first chunk',
              },
            ],
          });
        } else {
          return Promise.resolve({
            candidates: [
              {
                target_kind: 'protocol',
                draft: { name: 'Protocol B', steps: ['step1', 'step2'] },
                confidence: 0.92,
              },
            ],
            diagnostics: [
              {
                severity: 'info',
                code: 'EXTRACT_OK',
                message: 'Extraction from subsequent chunk',
              },
            ],
          });
        }
      });
      
      const result = await runChunkedExtraction({
        text: longText,
        extractor: mockExtractor,
        chunkOpts: { maxCharsPerChunk: 500, overlapChars: 0 },
      });
      
      // Should have called extractor multiple times (more than 1)
      expect(mockExtractor.extract).toHaveBeenCalled();
      expect(mockExtractor.extract).toHaveBeenCalledTimes(5);
      
      // Should have both distinct candidates (no loss)
      expect(result.candidates).toHaveLength(2);
      
      // Verify both candidates are present
      const targetKinds = result.candidates.map((c) => c.target_kind).sort();
      expect(targetKinds).toEqual(['material-spec', 'protocol']);
      
      // Diagnostics should have chunk_index metadata
      expect(result.diagnostics.length).toBeGreaterThan(0);
      const diagIndices = result.diagnostics.map((d) => (d.details as Record<string, unknown>)?.chunk_index);
      expect(diagIndices).toContain(0);
      expect(diagIndices).toContain(1);
    });
  });

  describe('duplicate candidate deduplication', () => {
    it('should keep only one candidate with max confidence when duplicates exist', async () => {
      // Use custom chunk options to create multiple chunks
      const longText = '## Section One\n' + 'A'.repeat(1000) + '\n\n## Section Two\n' + 'B'.repeat(1000);
      
      const mockExtractor: ExtractorAdapter = {
        extract: vi.fn(),
      };
      
      let callCount = 0;
      // Both chunks return the SAME candidate (same target_kind and draft) but different confidence
      mockExtractor.extract.mockImplementation((req: ExtractionRequest) => {
        const chunkIndex = callCount++;
        if (chunkIndex === 0) {
          return Promise.resolve({
            candidates: [
              {
                target_kind: 'material-spec',
                draft: { name: 'Duplicate Material', concentration: '2M' },
                confidence: 0.75,
              },
            ],
            diagnostics: [],
          });
        } else {
          return Promise.resolve({
            candidates: [
              {
                target_kind: 'material-spec',
                draft: { name: 'Duplicate Material', concentration: '2M' },
                confidence: 0.95,
              },
            ],
            diagnostics: [],
          });
        }
      });
      
      const result = await runChunkedExtraction({
        text: longText,
        extractor: mockExtractor,
        chunkOpts: { maxCharsPerChunk: 500, overlapChars: 0 },
      });
      
      // Should have called extractor multiple times
      expect(mockExtractor.extract).toHaveBeenCalled();
      expect(mockExtractor.extract).toHaveBeenCalledTimes(5);
      
      // Should have only ONE candidate (deduplicated)
      expect(result.candidates).toHaveLength(1);
      
      // The kept candidate should have the MAX confidence
      expect(result.candidates[0].confidence).toBe(0.95);
      expect(result.candidates[0].target_kind).toBe('material-spec');
      expect(result.candidates[0].draft).toEqual({ name: 'Duplicate Material', concentration: '2M' });
    });
  });

  describe('hint propagation', () => {
    it('should pass hint to each chunk extraction request', async () => {
      const shortText = 'Some text with a hint.';
      
      const mockExtractor: ExtractorAdapter = {
        extract: vi.fn().mockResolvedValue({
          candidates: [],
          diagnostics: [],
        }),
      };
      
      const hint = { target_kinds: ['protocol'] };
      await runChunkedExtraction({ text: shortText, extractor: mockExtractor, hint });
      
      expect(mockExtractor.extract).toHaveBeenCalledWith({
        text: shortText,
        hint,
      });
    });
  });

  describe('custom chunk options', () => {
    it('should pass chunk options to chunkText', async () => {
      // Create text that would normally be one chunk but with small maxChars becomes multiple
      const text = 'A'.repeat(1000) + '\n\n' + 'B'.repeat(1000);
      
      const mockExtractor: ExtractorAdapter = {
        extract: vi.fn().mockResolvedValue({
          candidates: [],
          diagnostics: [],
        }),
      };
      
      // Use very small chunk size to force multiple chunks
      await runChunkedExtraction({
        text,
        extractor: mockExtractor,
        chunkOpts: { maxCharsPerChunk: 500, overlapChars: 0 },
      });
      
      // Should have been called multiple times due to small chunk size
      expect(mockExtractor.extract).toHaveBeenCalledTimes(4);
    });
  });
});
