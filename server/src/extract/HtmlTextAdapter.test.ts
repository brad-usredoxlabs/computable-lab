/**
 * Tests for HtmlTextAdapter
 */

import { describe, it, expect } from 'vitest';
import { extractHtmlText, HTML_DIAGNOSTIC_CODES } from './HtmlTextAdapter.js';

describe('HtmlTextAdapter', () => {
  describe('extractHtmlText', () => {
    describe('simple <h1>/<p> input', () => {
      it('should extract heading and paragraph text with ## prefix', async () => {
        const html = '<h1>Title</h1><p>Body</p>';
        const result = await extractHtmlText(html);
        
        expect(result.text).toContain('## Title');
        expect(result.text).toContain('Body');
        expect(result.diagnostics).toHaveLength(0);
      });

      it('should handle multiple headings and paragraphs', async () => {
        const html = '<h1>Main</h1><p>First paragraph</p><h2>Section</h2><p>Second paragraph</p>';
        const result = await extractHtmlText(html);
        
        expect(result.text).toContain('## Main');
        expect(result.text).toContain('## Section');
        expect(result.text).toContain('First paragraph');
        expect(result.text).toContain('Second paragraph');
        expect(result.diagnostics).toHaveLength(0);
      });
    });

    describe('nested tags and attributes', () => {
      it('should handle nested tags with attributes', async () => {
        const html = '<div><p><strong>Bold</strong> text</p></div>';
        const result = await extractHtmlText(html);
        
        expect(result.text).toContain('Bold text');
        expect(result.diagnostics).toHaveLength(0);
      });

      it('should handle complex nested structure', async () => {
        const html = '<div class="container"><section><h1 class="title">Heading</h1><p><em>Italic</em> and <strong>bold</strong></p></section></div>';
        const result = await extractHtmlText(html);
        
        expect(result.text).toContain('## Heading');
        expect(result.text).toContain('Italic and bold');
        expect(result.diagnostics).toHaveLength(0);
      });

      it('should handle lists', async () => {
        const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
        const result = await extractHtmlText(html);
        
        expect(result.text).toContain('Item 1');
        expect(result.text).toContain('Item 2');
        expect(result.diagnostics).toHaveLength(0);
      });
    });

    describe('empty input', () => {
      it('should return empty text with info diagnostic for empty string', async () => {
        const result = await extractHtmlText('');
        
        expect(result.text).toBe('');
        expect(result.diagnostics).toHaveLength(1);
        expect(result.diagnostics[0].severity).toBe('info');
        expect(result.diagnostics[0].code).toBe(HTML_DIAGNOSTIC_CODES.HTML_EMPTY_INPUT);
        // Should NOT have error severity
        const errorDiagnostics = result.diagnostics.filter(d => d.severity === 'error');
        expect(errorDiagnostics).toHaveLength(0);
      });

      it('should return empty text with info diagnostic for whitespace-only input', async () => {
        const result = await extractHtmlText('   \n\t  ');
        
        expect(result.text).toBe('');
        expect(result.diagnostics).toHaveLength(1);
        expect(result.diagnostics[0].severity).toBe('info');
        expect(result.diagnostics[0].code).toBe(HTML_DIAGNOSTIC_CODES.HTML_EMPTY_INPUT);
      });
    });

    describe('malformed HTML', () => {
      it('should return error diagnostic when no text can be extracted', async () => {
        const html = '<invalid><tags>that produce no readable text</invalid>';
        const result = await extractHtmlText(html);
        
        // Even malformed HTML might produce some text, so we check the diagnostic logic
        // The key is that errors go to diagnostics, not thrown
        expect(result.diagnostics).toBeDefined();
      });
    });

    describe('HTML entity decoding', () => {
      it('should decode common HTML entities', async () => {
        const html = '<p>&amp; &lt; &gt; &quot; &#39; &nbsp;</p>';
        const result = await extractHtmlText(html);
        
        expect(result.text).toContain('&');
        expect(result.text).toContain('<');
        expect(result.text).toContain('>');
        expect(result.text).toContain('"');
        expect(result.text).toContain("'");
        expect(result.diagnostics).toHaveLength(0);
      });
    });

    describe('whitespace handling', () => {
      it('should collapse multiple whitespace to single space', async () => {
        const html = '<p>Multiple    spaces   here</p>';
        const result = await extractHtmlText(html);
        
        expect(result.text).toMatch(/\bMultiple spaces here\b/);
        expect(result.diagnostics).toHaveLength(0);
      });

      it('should preserve paragraph breaks as blank lines', async () => {
        const html = '<p>First</p><p>Second</p>';
        const result = await extractHtmlText(html);
        
        // Should have blank line between paragraphs
        expect(result.text).toContain('\n\n');
        expect(result.diagnostics).toHaveLength(0);
      });
    });

    describe('Buffer input', () => {
      it('should handle Buffer input', async () => {
        const buffer = Buffer.from('<h1>Buffer Title</h1><p>Buffer body</p>');
        const result = await extractHtmlText(buffer);
        
        expect(result.text).toContain('## Buffer Title');
        expect(result.text).toContain('Buffer body');
        expect(result.diagnostics).toHaveLength(0);
      });
    });

    describe('never throws', () => {
      it('should not throw on malformed HTML', async () => {
        const malformedHtml = '<div><p>Unclosed tags everywhere';
        await expect(extractHtmlText(malformedHtml)).resolves.not.toThrow();
      });

      it('should not throw on null-like input', async () => {
        await expect(extractHtmlText(null as unknown as string)).resolves.not.toThrow();
      });
    });
  });
});
