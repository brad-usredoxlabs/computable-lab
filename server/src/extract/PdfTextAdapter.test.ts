/**
 * Tests for PdfTextAdapter.
 * 
 * Uses stubbed parser functions to test all scenarios without requiring
 * actual PDF files.
 */

import { describe, it, expect } from 'vitest';
import { extractPdfText, extractPdfLayoutText, PDF_DIAGNOSTIC_CODES } from './PdfTextAdapter.js';

describe('PdfTextAdapter', () => {
  describe('extractPdfText', () => {
    it('should extract text successfully with happy path stub', async () => {
      const stubParser = async (_buffer: Buffer) => ({
        text: 'hello world',
        numpages: 2,
      });

      const result = await extractPdfText(Buffer.from('fake pdf'), {
        parse: stubParser,
      });

      expect(result.text).toBe('hello world');
      expect(result.page_count).toBe(2);
      expect(result.diagnostics).toEqual([]);
    });

    it('should return error diagnostic when parser throws', async () => {
      const stubParser = async (_buffer: Buffer) => {
        throw new Error('bad pdf');
      };

      const result = await extractPdfText(Buffer.from('fake pdf'), {
        parse: stubParser,
      });

      expect(result.text).toBe('');
      expect(result.page_count).toBe(0);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].severity).toBe('error');
      expect(result.diagnostics[0].code).toBe(PDF_DIAGNOSTIC_CODES.PDF_PARSE_FAILED);
      expect(result.diagnostics[0].message).toContain('bad pdf');
    });

    it('should return warning diagnostic when text layer is empty but pages exist', async () => {
      const stubParser = async (_buffer: Buffer) => ({
        text: '',
        numpages: 5,
      });

      const result = await extractPdfText(Buffer.from('fake pdf'), {
        parse: stubParser,
      });

      expect(result.text).toBe('');
      expect(result.page_count).toBe(5);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].severity).toBe('warning');
      expect(result.diagnostics[0].code).toBe(PDF_DIAGNOSTIC_CODES.PDF_NO_TEXT_LAYER);
    });

    it('should handle Uint8Array input correctly', async () => {
      const uint8Array = new Uint8Array([1, 2, 3, 4, 5]);
      let receivedBuffer: Buffer | null = null;

      const stubParser = async (buffer: Buffer) => {
        receivedBuffer = buffer;
        return {
          text: 'content from uint8',
          numpages: 1,
        };
      };

      const result = await extractPdfText(uint8Array, {
        parse: stubParser,
      });

      expect(result.text).toBe('content from uint8');
      expect(result.page_count).toBe(1);
      expect(receivedBuffer).toBeInstanceOf(Buffer);
      expect(receivedBuffer?.toString('hex')).toBe('0102030405');
    });

    it('should handle Buffer input correctly', async () => {
      const buffer = Buffer.from([10, 20, 30, 40]);
      let receivedBuffer: Buffer | null = null;

      const stubParser = async (buf: Buffer) => {
        receivedBuffer = buf;
        return {
          text: 'content from buffer',
          numpages: 3,
        };
      };

      const result = await extractPdfText(buffer, {
        parse: stubParser,
      });

      expect(result.text).toBe('content from buffer');
      expect(result.page_count).toBe(3);
      expect(receivedBuffer).toBeInstanceOf(Buffer);
      expect(receivedBuffer?.toString('hex')).toBe('0a141e28');
    });

    it('should return empty diagnostics when text is empty and page_count is 0', async () => {
      const stubParser = async (_buffer: Buffer) => ({
        text: '',
        numpages: 0,
      });

      const result = await extractPdfText(Buffer.from('fake pdf'), {
        parse: stubParser,
      });

      expect(result.text).toBe('');
      expect(result.page_count).toBe(0);
      expect(result.diagnostics).toEqual([]);
    });

    it('should handle parser returning undefined text gracefully', async () => {
      const stubParser = async (_buffer: Buffer) => ({
        text: undefined as unknown as string,
        numpages: 1,
      });

      const result = await extractPdfText(Buffer.from('fake pdf'), {
        parse: stubParser,
      });

      expect(result.text).toBe('');
      expect(result.page_count).toBe(1);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].code).toBe(PDF_DIAGNOSTIC_CODES.PDF_NO_TEXT_LAYER);
    });

    it('should handle parser returning undefined numpages gracefully', async () => {
      const stubParser = async (_buffer: Buffer) => ({
        text: 'some text',
        numpages: undefined as unknown as number,
      });

      const result = await extractPdfText(Buffer.from('fake pdf'), {
        parse: stubParser,
      });

      expect(result.text).toBe('some text');
      expect(result.page_count).toBe(0);
    });
  });

  describe('extractPdfLayoutText', () => {
    it('should return layout-preserving text when pdftotextCommand succeeds', async () => {
      const stubPdftotext = async (_buffer: Buffer): Promise<{ stdout: string; code: number }> => ({
        stdout: 'aligned text\nwith columns    preserved',
        code: 0,
      });

      const result = await extractPdfLayoutText(Buffer.from('fake pdf'), {
        pdftotextCommand: stubPdftotext,
      });

      expect(result.text).toBe('aligned text\nwith columns    preserved');
      expect(result.page_count).toBe(0);
      expect(result.diagnostics).toEqual([]);
    });

    it('should fall back to extractPdfText when pdftotextCommand returns non-zero exit code', async () => {
      let fallbackCalled = false;
      const stubPdftotext = async (_buffer: Buffer): Promise<{ stdout: string; code: number }> => ({
        stdout: '',
        code: 1,
      });
      const stubParser = async (_buffer: Buffer) => ({
        text: 'fallback plain text',
        numpages: 1,
      });

      const result = await extractPdfLayoutText(Buffer.from('fake pdf'), {
        pdftotextCommand: stubPdftotext,
        parse: stubParser,
      });

      expect(result.text).toBe('fallback plain text');
      expect(result.page_count).toBe(1);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].severity).toBe('warning');
      expect(result.diagnostics[0].code).toBe(PDF_DIAGNOSTIC_CODES.PDF_LAYOUT_TOOL_MISSING);
      expect(result.diagnostics[0].message).toContain('columnar alignment may be lost');
    });

    it('should fall back to extractPdfText when pdftotextCommand throws', async () => {
      const stubPdftotext = async (_buffer: Buffer): Promise<{ stdout: string; code: number }> => {
        throw new Error('pdftotext not found');
      };
      const stubParser = async (_buffer: Buffer) => ({
        text: 'fallback text from parser',
        numpages: 2,
      });

      const result = await extractPdfLayoutText(Buffer.from('fake pdf'), {
        pdftotextCommand: stubPdftotext,
        parse: stubParser,
      });

      expect(result.text).toBe('fallback text from parser');
      expect(result.page_count).toBe(2);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].severity).toBe('warning');
      expect(result.diagnostics[0].code).toBe(PDF_DIAGNOSTIC_CODES.PDF_LAYOUT_TOOL_MISSING);
    });

    it('should handle Uint8Array input correctly', async () => {
      const uint8Array = new Uint8Array([100, 101, 102, 103]);
      let receivedBuffer: Buffer | null = null;

      const stubPdftotext = async (buffer: Buffer): Promise<{ stdout: string; code: number }> => {
        receivedBuffer = buffer;
        return {
          stdout: 'layout text from uint8',
          code: 0,
        };
      };

      const result = await extractPdfLayoutText(uint8Array, {
        pdftotextCommand: stubPdftotext,
      });

      expect(result.text).toBe('layout text from uint8');
      expect(result.page_count).toBe(0);
      expect(result.diagnostics).toEqual([]);
      expect(receivedBuffer).toBeInstanceOf(Buffer);
      expect(receivedBuffer?.toString('hex')).toBe('64656667');
    });

    it('should handle Buffer input correctly', async () => {
      const buffer = Buffer.from([1, 2, 3, 4]);
      let receivedBuffer: Buffer | null = null;

      const stubPdftotext = async (buf: Buffer): Promise<{ stdout: string; code: number }> => {
        receivedBuffer = buf;
        return {
          stdout: 'layout text from buffer',
          code: 0,
        };
      };

      const result = await extractPdfLayoutText(buffer, {
        pdftotextCommand: stubPdftotext,
      });

      expect(result.text).toBe('layout text from buffer');
      expect(result.page_count).toBe(0);
      expect(result.diagnostics).toEqual([]);
      expect(receivedBuffer).toBeInstanceOf(Buffer);
      expect(receivedBuffer?.toString('hex')).toBe('01020304');
    });

    it('should preserve fallback diagnostics when falling back', async () => {
      const stubPdftotext = async (_buffer: Buffer): Promise<{ stdout: string; code: number }> => ({
        stdout: '',
        code: 1,
      });
      const stubParser = async (_buffer: Buffer) => {
        throw new Error('parse error in fallback');
      };

      const result = await extractPdfLayoutText(Buffer.from('fake pdf'), {
        pdftotextCommand: stubPdftotext,
        parse: stubParser,
      });

      expect(result.text).toBe('');
      expect(result.page_count).toBe(0);
      expect(result.diagnostics).toHaveLength(2);
      // First diagnostic from fallback (error)
      expect(result.diagnostics[0].severity).toBe('error');
      expect(result.diagnostics[0].code).toBe(PDF_DIAGNOSTIC_CODES.PDF_PARSE_FAILED);
      // Second diagnostic from layout fallback
      expect(result.diagnostics[1].severity).toBe('warning');
      expect(result.diagnostics[1].code).toBe(PDF_DIAGNOSTIC_CODES.PDF_LAYOUT_TOOL_MISSING);
    });
  });
});
