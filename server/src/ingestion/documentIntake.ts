/**
 * L2-DOC-INTAKE-1 — ONE shared document-intake entry point (page level).
 *
 * Rule (item verified-by a+b): the TEXT LAYER first; OCR only for pages that
 * have NO text layer; the method is recorded PER PAGE (never a whole-document
 * `mergedTextLength > 40` decision — that heuristic stays out of this seam).
 *
 * Composition, not a rewrite: the OCR arm is the config-declared reader from
 * ImageTextAdapter (tesseract + rasterizer are DATA in
 * config/ingestion/document-extraction.yaml — no binary literal lives here),
 * and every diagnostic code is imported from the adapters, never retyped.
 *
 * Honesty contract (CLAUDE.md): the function NEVER throws. Every failure arm
 * returns a typed diagnostic; an empty OCR result is flagged, never presented
 * as a successful blank page; every local-OCR read carries LOCAL_OCR_REVIEW.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { promisify } from 'node:util';
import { PDFParse } from 'pdf-parse';
import {
  IMAGE_DIAGNOSTIC_CODES,
  LOCAL_OCR_REVIEW_MESSAGE,
  extractImageText,
  loadImageOcrConfig,
  type ImageOcrConfig,
} from '../extract/ImageTextAdapter.js';
import { PDF_DIAGNOSTIC_CODES } from '../extract/PdfTextAdapter.js';
import type { ExtractionDiagnostic } from '../extract/ExtractorAdapter.js';

const execFileAsync = promisify(execFile);

/** Method recorded for one page. 'ocr' = the page was routed to OCR (its
 * outcome, including a missing tool, is in `diagnostics`). */
export type DocumentPageMethod = 'pdf_text' | 'ocr' | 'plain_text';

export interface DocumentIntakePage {
  page: number;
  text: string;
  method: DocumentPageMethod;
}

/** Per-tool booleans, keyed by the config-declared tool names. */
export type DocumentToolsAvailable = Record<string, boolean>;

export interface DocumentIntakeResult {
  pages: DocumentIntakePage[];
  diagnostics: ExtractionDiagnostic[];
  toolsAvailable: DocumentToolsAvailable;
}

/** Codes owned by this seam (the adapter codes are imported above). */
export const DOCUMENT_INTAKE_DIAGNOSTIC_CODES = {
  READ_FAILED: 'DOCUMENT_INTAKE_READ_FAILED',
  UNSUPPORTED_FORMAT: 'DOCUMENT_INTAKE_UNSUPPORTED_FORMAT',
} as const;

/** Plain-text sources are one pseudo-page (they have no page model). */
const PLAIN_TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.csv', '.tsv']);

interface PageTexts {
  pages: Array<{ page: number; text: string }>;
  diagnostics: ExtractionDiagnostic[];
}

/** Injectable seams: units pin the behaviour without invoking a real binary. */
export interface DocumentIntakeOptions {
  /** Per-page text-layer reader; defaults to pdf-parse (the library PdfTextAdapter uses). */
  readPageTexts?: (filePath: string) => Promise<PageTexts>;
  /** OCR one page; defaults to config-rasterizer + config reader per page. */
  ocrPage?: (
    filePath: string,
    page: number,
    config: ImageOcrConfig,
  ) => Promise<{ text: string; diagnostics: ExtractionDiagnostic[] }>;
  /** Tool-availability probe; defaults to `which`. */
  probeTool?: (tool: string) => Promise<boolean>;
  /** OCR config reader; defaults to the shipped document-extraction config. */
  loadOcrConfig?: () => Promise<ImageOcrConfig | null>;
}

export async function extractDocumentPages(
  filePath: string,
  options: DocumentIntakeOptions = {},
): Promise<DocumentIntakeResult> {
  const diagnostics: ExtractionDiagnostic[] = [];
  const toolsAvailable: DocumentToolsAvailable = {};
  try {
    const extension = extname(filePath).toLowerCase();

    if (PLAIN_TEXT_EXTENSIONS.has(extension)) {
      const text = await readFile(filePath, 'utf-8');
      return { pages: [{ page: 1, text, method: 'plain_text' }], diagnostics, toolsAvailable };
    }

    if (extension !== '.pdf') {
      diagnostics.push({
        severity: 'error',
        code: DOCUMENT_INTAKE_DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT,
        message: `Unsupported document format "${extension || '(none)'}": only PDF and plain-text sources are read.`,
      });
      return { pages: [], diagnostics, toolsAvailable };
    }

    const textOutcome = await (options.readPageTexts ?? readPdfPageTexts)(filePath);
    diagnostics.push(...textOutcome.diagnostics);

    // OCR setup happens only if some page actually lacks a text layer.
    let ocrConfig: ImageOcrConfig | null = null;
    let ocrAvailable = false;
    if (textOutcome.pages.some((page) => page.text.trim().length === 0)) {
      ocrConfig = await (options.loadOcrConfig ?? (() => loadImageOcrConfig()))();
      if (!ocrConfig) {
        diagnostics.push({
          severity: 'error',
          code: IMAGE_DIAGNOSTIC_CODES.IMAGE_OCR_NOT_CONFIGURED,
          message:
            'No image OCR reader is configured (config/ingestion/document-extraction.yaml: images.executable). The pages were stored, but their text could not be read.',
        });
      } else {
        const probe = options.probeTool ?? commandAvailable;
        toolsAvailable[ocrConfig.rasterizer] = await probe(ocrConfig.rasterizer);
        toolsAvailable[ocrConfig.executable] = await probe(ocrConfig.executable);
        ocrAvailable = Boolean(
          toolsAvailable[ocrConfig.rasterizer] && toolsAvailable[ocrConfig.executable],
        );
        if (!ocrAvailable) {
          const missing = [
            toolsAvailable[ocrConfig.rasterizer] ? '' : ocrConfig.rasterizer,
            toolsAvailable[ocrConfig.executable] ? '' : ocrConfig.executable,
          ].filter((name) => name.length > 0);
          diagnostics.push({
            severity: 'error',
            code: IMAGE_DIAGNOSTIC_CODES.IMAGE_OCR_TOOL_MISSING,
            message: `The configured OCR tool${missing.length === 1 ? '' : 's'} ${missing.map((name) => `"${name}"`).join(', ')} ${missing.length === 1 ? 'is' : 'are'} not installed on this host. Install ${missing.length === 1 ? 'it' : 'them'}, or read the page by hand.`,
          });
        }
      }
    }

    const ocr = options.ocrPage ?? rasterizeAndOcrPage;
    const pages: DocumentIntakePage[] = [];
    for (const sourcePage of textOutcome.pages) {
      if (sourcePage.text.trim().length > 0) {
        pages.push({ page: sourcePage.page, text: sourcePage.text, method: 'pdf_text' });
        continue;
      }
      const page: DocumentIntakePage = { page: sourcePage.page, text: '', method: 'ocr' };
      if (ocrConfig && ocrAvailable) {
        const outcome = await ocr(filePath, sourcePage.page, ocrConfig);
        page.text = outcome.text;
        diagnostics.push(...outcome.diagnostics.filter((entry) => entry.code !== 'LOCAL_OCR_REVIEW'));
        // The caution rides EVERY local-OCR success, imported, never retyped.
        diagnostics.push({
          severity: 'warning',
          code: 'LOCAL_OCR_REVIEW',
          message: LOCAL_OCR_REVIEW_MESSAGE,
          details: { page: sourcePage.page },
        });
        if (outcome.text.trim().length === 0) {
          diagnostics.push({
            severity: 'warning',
            code: PDF_DIAGNOSTIC_CODES.PDF_NO_TEXT_LAYER,
            message: `Page ${sourcePage.page} has no text layer and OCR returned no text; read it from the page image.`,
            details: { page: sourcePage.page },
          });
        }
      }
      pages.push(page);
    }

    return { pages, diagnostics, toolsAvailable };
  } catch (err) {
    diagnostics.push({
      severity: 'error',
      code: DOCUMENT_INTAKE_DIAGNOSTIC_CODES.READ_FAILED,
      message: err instanceof Error ? err.message : String(err),
      details: { filePath },
    });
    return { pages: [], diagnostics, toolsAvailable };
  }
}

async function commandAvailable(command: string): Promise<boolean> {
  try {
    await execFileAsync('which', [command]);
    return true;
  } catch {
    return false;
  }
}

/** Per-page text layer via pdf-parse — the same library PdfTextAdapter wraps. */
async function readPdfPageTexts(filePath: string): Promise<PageTexts> {
  const buffer = await readFile(filePath);
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const diagnostics: ExtractionDiagnostic[] = [];
    if (result.text.trim().length === 0 && result.pages.length > 0) {
      diagnostics.push({
        severity: 'warning',
        code: PDF_DIAGNOSTIC_CODES.PDF_NO_TEXT_LAYER,
        message: 'PDF has pages but no extractable text layer (may be scanned)',
      });
    }
    return {
      pages: result.pages.map((page) => ({ page: page.num, text: page.text })),
      diagnostics,
    };
  } catch (err) {
    return {
      pages: [],
      diagnostics: [{
        severity: 'error',
        code: PDF_DIAGNOSTIC_CODES.PDF_PARSE_FAILED,
        message: err instanceof Error ? err.message : String(err),
      }],
    };
  } finally {
    await parser.destroy();
  }
}

/**
 * Rasterize ONE page with the config-declared rasterizer, then read it with the
 * config-declared OCR reader (ImageTextAdapter.extractImageText) — the oligo /
 * DOCINGEST-B argv discipline: scratch dir removed in `finally`.
 */
async function rasterizeAndOcrPage(
  filePath: string,
  page: number,
  config: ImageOcrConfig,
): Promise<{ text: string; diagnostics: ExtractionDiagnostic[] }> {
  const dir = await mkdtemp(join(tmpdir(), 'cl-doc-intake-'));
  try {
    const prefix = join(dir, 'page');
    await execFileAsync(config.rasterizer, [
      '-png',
      '-r',
      String(config.dpi),
      '-f',
      String(page),
      '-l',
      String(page),
      filePath,
      prefix,
    ], { timeout: config.timeoutSeconds * 1000, maxBuffer: 10 * 1024 * 1024 });
    const imageName = (await readdir(dir)).filter((name) => name.endsWith('.png')).sort()[0];
    if (!imageName) {
      return {
        text: '',
        diagnostics: [{
          severity: 'error',
          code: IMAGE_DIAGNOSTIC_CODES.IMAGE_OCR_FAILED,
          message: `The configured rasterizer "${config.rasterizer}" produced no image for page ${page}.`,
        }],
      };
    }
    const image = await readFile(join(dir, imageName));
    return await extractImageText(image, { fileName: imageName });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      text: '',
      diagnostics: [{
        severity: 'error',
        code: /ENOENT/.test(message)
          ? IMAGE_DIAGNOSTIC_CODES.IMAGE_OCR_TOOL_MISSING
          : IMAGE_DIAGNOSTIC_CODES.IMAGE_OCR_FAILED,
        message: `OCR of page ${page} failed: ${message}`,
      }],
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
