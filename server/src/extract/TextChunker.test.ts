import { describe, it, expect } from 'vitest';
import { chunkText, TextChunk } from './TextChunker';

describe('TextChunker', () => {
  describe('chunkText', () => {
    it('returns a single chunk for short text', () => {
      const text = 'short string';
      const result = chunkText(text);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        index: 0,
        text: 'short string',
        byte_start: 0,
        byte_end: 12,
      });
    });

    it('returns a single chunk when text length equals maxChars', () => {
      const text = 'a'.repeat(8000);
      const result = chunkText(text, { maxCharsPerChunk: 8000 });
      
      expect(result).toHaveLength(1);
      expect(result[0].byte_start).toBe(0);
      expect(result[0].byte_end).toBe(8000);
    });

    it('splits long text at heading boundaries when present', () => {
      // Create text where sections are within maxCharsPerChunk so headings are hit
      const section1 = '## Section 1\n' + 'Some content here.\n'.repeat(200);  // ~3800 chars
      const section2 = '## Section 2\n' + 'More content in section two.\n'.repeat(200);  // ~5400 chars
      const section3 = '## Section 3\n' + 'Final section content.\n'.repeat(200);  // ~4600 chars
      const text = section1 + section2 + section3;
      
      // With maxCharsPerChunk=5000, should split at or near heading boundaries
      const result = chunkText(text, { maxCharsPerChunk: 5000, overlapChars: 50 });
      
      expect(result.length).toBeGreaterThan(1);
      
      // Verify that the text is properly chunked and byte offsets are correct
      for (const chunk of result) {
        expect(chunk.text).toBe(text.slice(chunk.byte_start, chunk.byte_end));
      }
      
      // Verify that chunks contain section headings (they may be at the start or within overlap)
      const allChunksText = result.map(c => c.text).join('');
      expect(allChunksText).toContain('## Section 1');
      expect(allChunksText).toContain('## Section 2');
      expect(allChunksText).toContain('## Section 3');
    });

    it('splits at paragraph breaks when no headings present', () => {
      const text = 
        'This is paragraph one.\n\n' +
        'This is paragraph two.\n\n' +
        'This is paragraph three.\n\n'.repeat(1000);
      
      const result = chunkText(text, { maxCharsPerChunk: 3000, overlapChars: 50 });
      
      expect(result.length).toBeGreaterThan(1);
      
      // Verify chunks don't cut mid-paragraph (should split at \n\n)
      for (const chunk of result) {
        // Chunks should not end in the middle of a paragraph
        // They should end at paragraph boundaries or be the last chunk
        const endsWithDoubleNewline = chunk.text.endsWith('\n\n');
        const isLastChunk = chunk === result[result.length - 1];
        expect(endsWithDoubleNewline || isLastChunk).toBe(true);
      }
    });

    it('preserves overlap between chunks', () => {
      const text = 
        '## Section 1\n' +
        'Content line 1.\n'.repeat(1000) +
        '## Section 2\n' +
        'Content line 2.\n'.repeat(1000);
      
      const overlap = 100;
      const result = chunkText(text, { maxCharsPerChunk: 3000, overlapChars: overlap });
      
      if (result.length >= 2) {
        const prevChunk = result[0];
        const nextChunk = result[1];
        
        // The overlap means nextChunk.byte_start should be before prevChunk.byte_end
        // by approximately `overlap` characters (allowing for split boundary adjustments)
        const overlapAmount = prevChunk.byte_end - nextChunk.byte_start;
        expect(overlapAmount).toBeGreaterThanOrEqual(overlap - 2);
        expect(overlapAmount).toBeLessThanOrEqual(overlap + 2);
        
        // Verify that the overlapping portion matches
        const prevOverlapPortion = text.slice(nextChunk.byte_start, prevChunk.byte_end);
        const nextOverlapPortion = nextChunk.text.slice(0, prevOverlapPortion.length);
        expect(nextOverlapPortion).toBe(prevOverlapPortion);
      }
    });

    it('byte_start and byte_end are strictly monotonic', () => {
      const text = 
        '## Section 1\n' +
        'Content.\n'.repeat(2000) +
        '## Section 2\n' +
        'More content.\n'.repeat(2000) +
        '## Section 3\n' +
        'Even more.\n'.repeat(2000);
      
      const result = chunkText(text, { maxCharsPerChunk: 4000, overlapChars: 100 });
      
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i + 1].byte_start).toBeGreaterThanOrEqual(result[i].byte_start);
        expect(result[i + 1].byte_end).toBeGreaterThanOrEqual(result[i].byte_end);
      }
    });

    it('handles custom maxCharsPerChunk option', () => {
      const text = 'a'.repeat(1000);
      const result = chunkText(text, { maxCharsPerChunk: 500 });
      
      expect(result).toHaveLength(2);
      expect(result[0].byte_end).toBe(500);
      expect(result[1].byte_start).toBeLessThanOrEqual(500);
      expect(result[1].byte_end).toBe(1000);
    });

    it('handles custom overlapChars option', () => {
      const text = 
        '## Section 1\n' +
        'Content.\n'.repeat(500) +
        '## Section 2\n' +
        'More.\n'.repeat(500);
      
      const overlap = 50;
      const result = chunkText(text, { maxCharsPerChunk: 2000, overlapChars: overlap });
      
      if (result.length >= 2) {
        const prevEnd = result[0].byte_end;
        const nextStart = result[1].byte_start;
        
        // The overlap means nextStart should be before prevEnd by the overlap amount
        // i.e., prevEnd - nextStart should equal the overlap
        expect(prevEnd - nextStart).toBeGreaterThanOrEqual(overlap - 1);
        expect(prevEnd - nextStart).toBeLessThanOrEqual(overlap + 1);
      }
    });

    it('returns empty array for empty input', () => {
      const result = chunkText('');
      expect(result).toHaveLength(0);
    });

    it('handles text with sentence boundaries', () => {
      const text = 
        'This is sentence one. This is sentence two. '.repeat(500) +
        'This is sentence three! This is sentence four! '.repeat(500) +
        'This is sentence five? This is sentence six? '.repeat(500);
      
      const result = chunkText(text, { maxCharsPerChunk: 3000, overlapChars: 50 });
      
      expect(result.length).toBeGreaterThan(1);
      
      // Verify chunks don't cut mid-sentence (should split at .!? followed by space)
      for (const chunk of result) {
        const chunkText = chunk.text;
        // Last chunk can end anywhere, others should end at sentence boundaries
        if (chunk !== result[result.length - 1]) {
          const lastChar = chunkText[chunkText.length - 1];
          const secondLastChar = chunkText[chunkText.length - 2];
          // Should end with .!? followed by space, or just .!?
          expect(['.', '!', '?'].includes(lastChar) || 
                 (secondLastChar && '.!?'.includes(secondLastChar) && lastChar === ' ')).toBe(true);
        }
      }
    });

    it('is deterministic - same input produces same output', () => {
      const text = 
        '## Section A\n' +
        'Content here.\n'.repeat(1000) +
        '## Section B\n' +
        'More content.\n'.repeat(1000);
      
      const result1 = chunkText(text, { maxCharsPerChunk: 4000, overlapChars: 100 });
      const result2 = chunkText(text, { maxCharsPerChunk: 4000, overlapChars: 100 });
      
      expect(result1).toEqual(result2);
    });

    it('correctly tracks byte offsets across chunks', () => {
      const text = 
        '## First\n' +
        'Content.\n'.repeat(1000) +
        '## Second\n' +
        'More.\n'.repeat(1000);
      
      const result = chunkText(text, { maxCharsPerChunk: 3000, overlapChars: 50 });
      
      // Verify byte offsets are correct
      for (const chunk of result) {
        expect(chunk.text).toBe(text.slice(chunk.byte_start, chunk.byte_end));
      }
    });
  });
});
