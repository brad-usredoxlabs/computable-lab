/**
 * FileContentExtractor — Lightweight text extraction from uploaded files.
 *
 * Supports text-based formats natively. Images are base64-encoded for
 * vision-capable models. Binary formats (xlsx, pdf) return metadata only
 * unless parsing dependencies are available.
 */

import { extname } from 'node:path';

export interface ExtractedFile {
  name: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  contentType: 'text' | 'image' | 'metadata-only';
  /** Extracted text content (for text and parsed binary) */
  textContent?: string;
  /** Base64-encoded content (for images) */
  base64Content?: string;
  /** True if content was truncated */
  truncated?: boolean;
  /** Error message if extraction failed */
  error?: string;
}

export interface UploadedFile {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  /** In-memory buffer */
  buffer: Buffer;
}

const MAX_TEXT_BYTES = 50 * 1024; // 50KB
const MAX_CSV_ROWS = 200;

function truncateTextContent(text: string, maxBytes: number): { text: string; truncated: boolean } {
  if (Buffer.byteLength(text, 'utf-8') <= maxBytes) {
    return { text, truncated: false };
  }
  // Truncate to approximate byte limit
  let truncated = text;
  while (Buffer.byteLength(truncated, 'utf-8') > maxBytes) {
    truncated = truncated.slice(0, Math.floor(truncated.length * 0.9));
  }
  return { text: truncated + '\n... [truncated]', truncated: true };
}

function truncateCsvRows(text: string, maxRows: number): { text: string; truncated: boolean } {
  const lines = text.split('\n');
  if (lines.length <= maxRows) {
    return { text, truncated: false };
  }
  return {
    text: lines.slice(0, maxRows).join('\n') + `\n... [${lines.length - maxRows} more rows truncated]`,
    truncated: true,
  };
}

export function extractFileContent(file: UploadedFile): ExtractedFile {
  const ext = extname(file.originalName).toLowerCase();

  try {
    // CSV/TSV: read as text, truncate rows
    if (ext === '.csv' || ext === '.tsv') {
      const raw = file.buffer.toString('utf-8');
      const { text, truncated } = truncateCsvRows(raw, MAX_CSV_ROWS);
      return {
        name: file.originalName,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        contentType: 'text',
        textContent: text,
        truncated,
      };
    }

    // JSON/YAML/TXT/MD: read as text, truncate bytes
    if (['.json', '.yaml', '.yml', '.txt', '.md'].includes(ext)) {
      const raw = file.buffer.toString('utf-8');
      const { text, truncated } = truncateTextContent(raw, MAX_TEXT_BYTES);
      return {
        name: file.originalName,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        contentType: 'text',
        textContent: text,
        truncated,
      };
    }

    // Images: base64 encode for vision models
    if (['.png', '.jpg', '.jpeg', '.gif'].includes(ext)) {
      const base64 = file.buffer.toString('base64');
      return {
        name: file.originalName,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        contentType: 'image',
        base64Content: base64,
      };
    }

    // Binary files (xlsx, xls, pdf): metadata only
    // Future: add xlsx/pdf parsing when dependencies are available
    if (['.xlsx', '.xls', '.pdf'].includes(ext)) {
      return {
        name: file.originalName,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        contentType: 'metadata-only',
        error: `Binary file parsing not available for ${ext}. File metadata included.`,
      };
    }

    // Fallback: try to read as text
    const raw = file.buffer.toString('utf-8');
    const { text, truncated } = truncateTextContent(raw, MAX_TEXT_BYTES);
    return {
      name: file.originalName,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      contentType: 'text',
      textContent: text,
      truncated,
    };
  } catch (err) {
    return {
      name: file.originalName,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      contentType: 'metadata-only',
      error: `Failed to extract content: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

