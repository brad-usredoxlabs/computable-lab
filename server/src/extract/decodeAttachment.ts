/**
 * Shared helper: decode an uploaded attachment's buffer into plain text
 * using the right per-format adapter (PDF / HTML / XLSX / plain-text).
 *
 * Used by both the chatbot-compile pipeline's extract_entities pass and
 * the AgentOrchestrator fallthrough path that injects attachment text
 * into LLM context when the pipeline emits no events.
 */

import type { ExtractionDiagnostic } from './ExtractorAdapter.js';
import { extractPdfText } from './PdfTextAdapter.js';
import { extractHtmlText } from './HtmlTextAdapter.js';
import { extractXlsxText } from './XlsxTextAdapter.js';

export interface DecodedAttachment {
  text: string;
  diagnostics: ExtractionDiagnostic[];
}

export async function decodeAttachmentText(
  name: string,
  mimeType: string | undefined,
  content: string | Buffer | Uint8Array,
): Promise<DecodedAttachment> {
  if (typeof content === 'string') {
    return { text: content, diagnostics: [] };
  }
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);

  const lowerName = name.toLowerCase();
  const mime = (mimeType ?? '').toLowerCase();
  const isPdf = lowerName.endsWith('.pdf') || mime.includes('pdf');
  const isHtml = lowerName.endsWith('.html') || lowerName.endsWith('.htm') || mime.includes('html');
  const isXlsx =
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.xls') ||
    mime.includes('spreadsheet') ||
    mime.includes('excel');

  try {
    if (isPdf) {
      const res = await extractPdfText(buf);
      return { text: res.text, diagnostics: res.diagnostics ?? [] };
    }
    if (isHtml) {
      const res = await extractHtmlText(buf);
      return { text: res.text, diagnostics: res.diagnostics ?? [] };
    }
    if (isXlsx) {
      const res = await extractXlsxText(buf);
      return { text: res.text, diagnostics: res.diagnostics ?? [] };
    }
    return { text: buf.toString('utf-8'), diagnostics: [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      text: '',
      diagnostics: [
        {
          severity: 'error',
          code: 'attachment_decode_failed',
          message: `Failed to decode ${name}: ${message}`,
        },
      ],
    };
  }
}
