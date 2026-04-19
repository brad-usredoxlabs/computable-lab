/**
 * HTML text adapter for extracting plain text from HTML content.
 * 
 * This adapter strips HTML tags while preserving section structure through
 * heading markers. It is designed as a preprocessor for the extraction pipeline.
 */

import type { ExtractionDiagnostic } from './ExtractorAdapter.js';

/**
 * Result of HTML text extraction.
 */
export interface HtmlExtractionResult {
  text: string;
  diagnostics: ExtractionDiagnostic[];
}

/**
 * Diagnostic codes for HTML extraction.
 */
export const HTML_DIAGNOSTIC_CODES = {
  HTML_UNPARSEABLE: 'html_unparseable',
  HTML_EMPTY_INPUT: 'html_empty_input',
} as const;

/**
 * Extract plain text from HTML input, preserving section headings.
 * 
 * This function strips all HTML tags and returns plain text with section
 * headings prefixed with '## '. It never throws - all errors are returned
 * as diagnostics.
 * 
 * @param input - HTML content as string or Buffer
 * @returns Promise resolving to extracted text and any diagnostics
 */
export async function extractHtmlText(input: string | Buffer): Promise<HtmlExtractionResult> {
  // Handle null/undefined input gracefully
  if (input == null) {
    return { 
      text: '', 
      diagnostics: [{ 
        severity: 'info',
        code: HTML_DIAGNOSTIC_CODES.HTML_EMPTY_INPUT,
        message: 'HTML input was empty' 
      }] 
    };
  }
  
  const html = Buffer.isBuffer(input) ? input.toString('utf8') : input;
  
  if (!html.trim()) {
    return { 
      text: '', 
      diagnostics: [{ 
        severity: 'info',
        code: HTML_DIAGNOSTIC_CODES.HTML_EMPTY_INPUT,
        message: 'HTML input was empty' 
      }] 
    };
  }
  
  try {
    const text = stripHtmlPreservingHeadings(html);
    
    if (!text) {
      return { 
        text: '', 
        diagnostics: [{ 
          severity: 'error',
          code: HTML_DIAGNOSTIC_CODES.HTML_UNPARSEABLE,
          message: 'Could not extract any text from HTML input' 
        }] 
      };
    }
    
    return { text, diagnostics: [] };
  } catch (err) {
    return { 
      text: '', 
      diagnostics: [{ 
        severity: 'error',
        code: HTML_DIAGNOSTIC_CODES.HTML_UNPARSEABLE,
        message: err instanceof Error ? err.message : String(err) 
      }] 
    };
  }
}

/**
 * Strip HTML tags while preserving section headings with ## prefix.
 * 
 * @param html - Raw HTML string
 * @returns Plain text with heading markers
 */
function stripHtmlPreservingHeadings(html: string): string {
  let s = html
    // Replace <h1>-<h6> opening tags with '## ' prefix and newlines
    .replace(/<h[1-6][^>]*>/gi, '\n\n## ')
    // Replace closing heading tags with newline
    .replace(/<\/h[1-6]>/gi, '\n')
    // Replace </p> with paragraph breaks
    .replace(/<\/p>/gi, '\n\n')
    // Replace <br> tags with newlines
    .replace(/<br\s*\/?>/gi, '\n')
    // Replace closing tags for block elements with newlines
    .replace(/<\/(li|div|section|article|tr)>/gi, '\n')
    // Strip all remaining HTML tags, replacing with space
    .replace(/<[^>]+>/g, ' ')
    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    // Handle non-breaking spaces (Unicode)
    .replace(/\u00a0/g, ' ')
    // Collapse multiple spaces/tabs to single space
    .replace(/[ \t]+/g, ' ')
    // Collapse multiple newlines to at most two (one blank line)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  return s;
}
