/**
 * Image / scanned-page -> plain text via a CONFIG-DECLARED external OCR tool
 * (tesseract), exactly the shape the oligo OCR path declares and runs
 * (server/src/sequences/oligoOrder.ts:75-86 — borrow its discipline, not its
 * code path). The tool, language, timeout, rasterizer, dpi and page cap are
 * DATA in config/ingestion/document-extraction.yaml `images:`; swapping the
 * tool is a data edit, not a code edit.
 *
 * Honesty contract (CLAUDE.md: "a missing tool must produce a diagnostic,
 * never an empty document"): an unset `images:` block yields
 * IMAGE_OCR_NOT_CONFIGURED; a declared-but-absent binary yields
 * IMAGE_OCR_TOOL_MISSING; a failing run yields IMAGE_OCR_FAILED. Every failure
 * arm returns empty text WITH an error diagnostic — a blank OCR'd page is
 * never presented as success. A success carries the LOCAL_OCR_REVIEW warning
 * (the oligo caution reworded for protocols) so the human review is part of
 * the result, not an afterthought.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ExtractionDiagnostic } from './ExtractorAdapter.js';
// ONE config reader for this file (Stage A's loader, sequenceRuntime.ts:15
// import.meta.url precedent). A second config reader would be a defect.
import { DOCUMENT_EXTRACTION_CONFIG_PATH } from './DocxTextAdapter.js';

// Re-exported so consumers/tests see ONE config path for the whole
// document-extraction file (docx AND images arms) — not a second constant.
export { DOCUMENT_EXTRACTION_CONFIG_PATH };

export const IMAGE_DIAGNOSTIC_CODES = {
  IMAGE_OCR_NOT_CONFIGURED: 'IMAGE_OCR_NOT_CONFIGURED',
  IMAGE_OCR_TOOL_MISSING: 'IMAGE_OCR_TOOL_MISSING',
  IMAGE_OCR_FAILED: 'IMAGE_OCR_FAILED',
} as const;

/** The caution every local-OCR success carries (oligo LOCAL_OCR_REVIEW,
 * reworded for protocol pages; the review pane derives the same caution from
 * mediaKind 'image' — §B2). */
export const LOCAL_OCR_REVIEW_MESSAGE =
  'Transcribed using local OCR (up to the configured page limit). Check page coverage and every volume against the page image before importing.';

export interface ImageExtractionResult {
  text: string;
  diagnostics: ExtractionDiagnostic[];
}

export interface ImageOcrConfig {
  executable: string;
  language: string;
  timeoutSeconds: number;
  rasterizer: string;
  dpi: number;
  maxPages: number;
}

/** Injectable exec seam: units pin the argv without invoking real tesseract
 * (bait 14); production defaults to promisify(execFile). */
export type ExecFn = (
  file: string,
  args: string[],
  options: { timeout: number; maxBuffer: number },
) => Promise<{ stdout: string }>;

/**
 * Read the `images:` block. configPath defaults to the repo config resolved
 * via import.meta.url (through Stage A's DOCUMENT_EXTRACTION_CONFIG_PATH) — a
 * cwd-relative default NEVER resolves under server/ vitest and would silently
 * take the NOT_CONFIGURED arm on a configured host (bait 9). Tests inject an
 * absolute tmpdir path.
 */
export async function loadImageOcrConfig(configPath?: string): Promise<ImageOcrConfig | null> {
  const path = configPath ?? DOCUMENT_EXTRACTION_CONFIG_PATH;
  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch {
    return null;
  }
  let doc: { images?: Partial<ImageOcrConfig> } | null = null;
  try {
    doc = parseYaml(raw) as { images?: Partial<ImageOcrConfig> } | null;
  } catch {
    return null;
  }
  const images = doc?.images;
  if (!images || typeof images.executable !== 'string' || images.executable.trim().length === 0) {
    return null;
  }
  return {
    executable: images.executable.trim(),
    language: typeof images.language === 'string' && images.language.trim() ? images.language.trim() : 'eng',
    timeoutSeconds: typeof images.timeoutSeconds === 'number' && images.timeoutSeconds > 0 ? images.timeoutSeconds : 120,
    rasterizer: typeof images.rasterizer === 'string' && images.rasterizer.trim() ? images.rasterizer.trim() : 'pdftoppm',
    dpi: typeof images.dpi === 'number' && images.dpi > 0 ? images.dpi : 200,
    maxPages: typeof images.maxPages === 'number' && images.maxPages > 0 ? images.maxPages : 40,
  };
}

function notConfigured(): ImageExtractionResult {
  return {
    text: '',
    diagnostics: [
      {
        severity: 'error',
        code: IMAGE_DIAGNOSTIC_CODES.IMAGE_OCR_NOT_CONFIGURED,
        message:
          'No image OCR reader is configured (config/ingestion/document-extraction.yaml: images.executable). The page was stored, but its text could not be read.',
      },
    ],
  };
}

function toolFailure(config: ImageOcrConfig, message: string): ImageExtractionResult {
  const missing = /ENOENT/.test(message);
  return {
    text: '',
    diagnostics: [
      {
        severity: 'error',
        code: missing ? IMAGE_DIAGNOSTIC_CODES.IMAGE_OCR_TOOL_MISSING : IMAGE_DIAGNOSTIC_CODES.IMAGE_OCR_FAILED,
        message: missing
          ? `The configured image OCR reader "${config.executable}" is not installed on this host. Install it, or read the page by hand.`
          : `Image OCR failed: ${message}`,
      },
    ],
  };
}

/**
 * OCR ONE image buffer through the config-declared tesseract. The buffer is
 * written to a scratch dir (mkdtemp, removed in `finally` — oligo :76/:85) and
 * the argv mirrors the oligo per-page call (oligo :82):
 *   [input, 'stdout', '-l', language] with { timeout, maxBuffer: 10 MB }.
 */
export async function extractImageText(
  buffer: Buffer,
  options: {
    configPath?: string;
    fileName?: string;
    exec?: ExecFn;
  } = {},
): Promise<ImageExtractionResult> {
  const config = await loadImageOcrConfig(options.configPath);
  if (!config) return notConfigured();

  const exec: ExecFn = options.exec ?? ((file, args, opts) => promisify(execFile)(file, args, opts));
  const dir = await mkdtemp(join(tmpdir(), 'cl-image-ocr-'));
  try {
    const input = join(dir, safeImageName(options.fileName));
    await writeFile(input, buffer);
    // Oligo precedent (oligoOrder.ts:82): exec(executable, [page, 'stdout',
    // '-l', language]) — the config-declared tool is the executable; the
    // written page is argv[0].
    const { stdout } = await exec(config.executable, [input, 'stdout', '-l', config.language], {
      timeout: config.timeoutSeconds * 1000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      text: stdout,
      diagnostics: [{ severity: 'warning', code: 'LOCAL_OCR_REVIEW', message: LOCAL_OCR_REVIEW_MESSAGE }],
    };
  } catch (err) {
    return toolFailure(config, err instanceof Error ? err.message : String(err));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function safeImageName(fileName?: string): string {
  const cleaned = (fileName ?? 'page.png')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned : 'page.png';
}
