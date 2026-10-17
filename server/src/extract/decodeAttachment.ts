/**
 * Shared helper: decode an uploaded attachment's buffer into plain text
 * using the right per-format adapter (PDF / HTML / XLSX / DOCX / RTF /
 * Markdown / image OCR / plain-text).
 *
 * Used by both the chatbot-compile pipeline's extract_entities pass and
 * the AgentOrchestrator fallthrough path that injects attachment text
 * into LLM context when the pipeline emits no events. DOCINGEST-A made this
 * the ONE dispatcher every ingest caller delegates to (vendor-document
 * acquisition, VendorProtocolPdf, ProtocolImportService, AiIngestionHandlers)
 * — per-format if-chains in callers are a defect.
 */

import type { ExtractionDiagnostic } from './ExtractorAdapter.js';
import { extname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { extractPdfText } from './PdfTextAdapter.js';
import { extractHtmlText } from './HtmlTextAdapter.js';
import { extractXlsxText } from './XlsxTextAdapter.js';
import { extractDocxText } from './DocxTextAdapter.js';
import { DOCUMENT_EXTRACTION_CONFIG_PATH } from './DocxTextAdapter.js';
import { extractImageText } from './ImageTextAdapter.js';

export interface DecodedAttachment {
  text: string;
  diagnostics: ExtractionDiagnostic[];
}

/**
 * What a readable lab document IS. The values are the vendor-pdf schema's
 * source.mediaKind enum (schema/lab/vendor-pdf.schema.yaml); `image` is
 * reserved for Stage B (DOCINGEST-B) and is not declared in the config until
 * its reader exists.
 */
export type DocumentMediaKind = 'pdf' | 'text' | 'spreadsheet' | 'image';

export interface DocumentFormat {
  extension: string;
  mediaKind: DocumentMediaKind;
  mediaType: string;
  analysisLabel: string;
}

const DOCUMENT_MEDIA_KINDS: readonly DocumentMediaKind[] = ['pdf', 'text', 'spreadsheet', 'image'];

/**
 * The readable-format policy — extension -> mediaKind/mediaType/analysisLabel
 * — is DATA (config/ingestion/document-extraction.yaml `formats:`), read via
 * import.meta.url (sequenceRuntime.ts:15 precedent). Callers gate on it and
 * stamp from it; no extension list or media_type map may live in TypeScript
 * (CLAUDE.md "The Hard Boundary"). Changing what the ingestor accepts is a
 * config edit, not a code edit.
 *
 * DOCINGEST-B: an `image`-kind entry is only live while it ALSO appears in
 * the `images:` block's `formats:` list — the OCR reader's own gate. Removing
 * an extension from EITHER list removes it from the ingestor (mutation probe:
 * drop `webp` -> a webp upload is refused UNSUPPORTED_DOCUMENT).
 */
export async function loadDocumentFormats(): Promise<DocumentFormat[]> {
  let raw: string;
  try {
    raw = await readFile(DOCUMENT_EXTRACTION_CONFIG_PATH, 'utf-8');
  } catch {
    return [];
  }
  let doc: { formats?: unknown; images?: { formats?: unknown } } | null = null;
  try {
    doc = parseYaml(raw) as { formats?: unknown; images?: { formats?: unknown } } | null;
  } catch {
    return [];
  }
  const entries = Array.isArray(doc?.formats) ? doc.formats : [];
  const imageGate = new Set(
    (Array.isArray(doc?.images?.formats) ? doc.images.formats : [])
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.toLowerCase().replace(/^\./, '')),
  );
  const formats: DocumentFormat[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (
      typeof e.extension !== 'string' ||
      typeof e.mediaType !== 'string' ||
      typeof e.analysisLabel !== 'string' ||
      !DOCUMENT_MEDIA_KINDS.includes(e.mediaKind as DocumentMediaKind)
    ) {
      continue;
    }
    const extension = e.extension.toLowerCase().replace(/^\./, '');
    if (e.mediaKind === 'image' && !imageGate.has(extension)) continue;
    formats.push({
      extension,
      mediaKind: e.mediaKind as DocumentMediaKind,
      mediaType: e.mediaType,
      analysisLabel: e.analysisLabel,
    });
  }
  return formats;
}

/** The declared format for a file name, or undefined when nothing can read it. */
export async function documentFormatFor(fileName: string): Promise<DocumentFormat | undefined> {
  const extension = extname(fileName).toLowerCase().replace(/^\./, '');
  if (!extension) return undefined;
  const formats = await loadDocumentFormats();
  return formats.find((format) => format.extension === extension);
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
  const isDocx = lowerName.endsWith('.docx') || lowerName.endsWith('.doc') || mime.includes('wordprocessingml');
  const isRtf = lowerName.endsWith('.rtf');
  const isMarkdown = lowerName.endsWith('.md') || lowerName.endsWith('.markdown');
  // DOCINGEST-B: the image gate is the config-declared format map (extension
  // -> mediaKind 'image', itself gated by `images.formats`) plus the image
  // mime family. No extension literal lives here (bait 10).
  const isImageKind = (await documentFormatFor(name))?.mediaKind === 'image' || mime.startsWith('image/');

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
    if (isImageKind) {
      // A photographed/scanned page goes through the config-declared OCR
      // reader (config/ingestion/document-extraction.yaml `images:`). An unset
      // block or an absent binary returns an honest IMAGE_OCR_* error
      // diagnostic — never a blank page and never the utf8 fallback.
      const res = await extractImageText(buf, { fileName: lowerName });
      return { text: res.text, diagnostics: res.diagnostics };
    }
    if (isDocx || isRtf) {
      // The reader tool is config-declared (config/ingestion/document-
      // extraction.yaml). An unset config or an absent binary returns an
      // honest DOCX_* error diagnostic — never a silent empty text.
      const res = await extractDocxText(buf, { fileName: lowerName });
      return { text: res.text, diagnostics: res.diagnostics };
    }
    if (isMarkdown) {
      // Markdown IS text: the plain-utf8 arm already returns it. Kept explicit
      // so the format is DECLARED rather than falling through by accident, and
      // the caller sees that headings/emphasis were not interpreted.
      return {
        text: buf.toString('utf-8'),
        diagnostics: [
          {
            severity: 'info',
            code: 'markdown_as_text',
            message: 'Markdown was read as plain text; headings and emphasis are not interpreted.',
          },
        ],
      };
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
