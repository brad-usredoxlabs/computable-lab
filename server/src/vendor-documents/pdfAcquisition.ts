import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { extractPdfText } from '../extract/PdfTextAdapter.js';
import { extractPdfLayoutText, type PdfExtractionResult as LayoutPdfExtractionResult } from '../ingestion/pdf/TableExtractionService.js';
import { decodeAttachmentText, documentFormatFor, type DocumentMediaKind } from '../extract/decodeAttachment.js';
import { loadImageOcrConfig, IMAGE_DIAGNOSTIC_CODES, LOCAL_OCR_REVIEW_MESSAGE, type ExecFn } from '../extract/ImageTextAdapter.js';
import type { ExtractionDiagnostic } from '../extract/ExtractorAdapter.js';

// A realistic browser UA — vendor CDNs (e.g. tools.thermofisher.com) 403 a
// custom "ProtocolFoundry/1.0" token as a bot. Matches the UA the vendor
// search path already uses successfully.
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 20_000;

export interface VendorPdfDownloadInput {
  url: string;
  workspaceRoot: string;
  title?: string;
  sourceDomain?: string;
  assay?: string;
  outputName?: string;
  timeoutMs?: number;
  maxBytes?: number;
  fetchImpl?: typeof fetch;
}

export interface VendorPdfDownloadResult {
  kind: 'vendor-pdf-download';
  status: 'downloaded';
  url: string;
  effectiveUrl: string;
  title?: string;
  sourceDomain?: string;
  assay?: string;
  artifactPath: string;
  relativePath: string;
  sidecarPath: string;
  contentType: string;
  bytesDownloaded: number;
  sha256: string;
  validation: string;
  generatedAt: string;
}

export interface VendorPdfExtractionInput {
  workspaceRoot: string;
  artifactPath?: string;
  contentBase64?: string;
  fileName?: string;
  mode?: 'plain' | 'layout' | 'both';
  /**
   * DOCINGEST-B test seam for the OCR arms: an injected configPath (absolute
   * tmpdir YAML — never cwd-relative) and/or exec (argv pin without real
   * tools). Production callers pass nothing; defaults are the shipped config
   * and promisify(execFile).
   */
  ocr?: { configPath?: string; exec?: ExecFn };
}

export interface VendorPdfExtractionResult {
  kind: 'vendor-pdf-text-extraction';
  source: {
    artifactPath?: string;
    fileName: string;
    sha256: string;
  };
  mode: 'plain' | 'layout' | 'both';
  /**
   * What the stored file IS (from the config-declared format map). OPTIONAL:
   * every pre-existing consumer (VendorSearchHandlers, LabwareSpecCandidate-
   * Service, vendorPdfTools) compiles and behaves untouched without it.
   */
  mediaKind?: DocumentMediaKind;
  plainText?: {
    text: string;
    pageCount: number;
    diagnostics: unknown[];
  };
  layoutText?: {
    pages: Array<{ pageNumber: number; text: string }>;
    pageCount: number;
  };
  /** Reserved for Stage B (DOCINGEST-B page images); Stage A never fills it. */
  images?: Array<{ pageNumber: number; path: string }>;
  /**
   * DOCINGEST-B: the scan arm's OCR diagnostics (LOCAL_OCR_REVIEW caution,
   * LOCAL_OCR_PAGE_LIMIT coverage warning, IMAGE_OCR_* honest failures) ride
   * on the result so the upload handler can persist them on the record.
   */
  diagnostics?: ExtractionDiagnostic[];
}

export function vendorPdfArtifactRoot(workspaceRoot: string): string {
  return resolve(workspaceRoot, 'artifacts', 'foundry', 'pdfs');
}

/**
 * DOCINGEST-B §B2 — the ONE page-image naming convention, shared by the
 * writer (acquisition) AND the reader (the page route). Page images are
 * data-referenced artifacts under the workspace artifact root (git-ignored
 * via `artifacts/`), never committed. Files are `page-NNN.<image-ext>`
 * (1-based, zero-padded): `page-001.png` for rasterized scan pages, and the
 * record's config-declared image extension for a direct photo upload (a .jpg
 * kept as .png would be served under a dishonest media type).
 */
export function vendorPdfPageDir(workspaceRoot: string, sha12: string): string {
  return join(vendorPdfArtifactRoot(workspaceRoot), 'pages', sha12.slice(0, 12));
}

export function vendorPdfPageFileName(pageNumber: number, extension: string): string {
  return `page-${String(pageNumber).padStart(3, '0')}.${extension.replace(/^\./, '')}`;
}

export async function downloadVendorPdf(input: VendorPdfDownloadInput): Promise<VendorPdfDownloadResult> {
  const url = parseHttpUrl(input.url);
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;
  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const generatedAt = new Date().toISOString();
  try {
    const response = await fetchImpl(url.href, {
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        // Browser-like Accept + language + same-origin Referer so hotlink
        // protection and bot filters treat this like a normal click-through.
        'Accept': 'application/pdf,application/xhtml+xml,text/html;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': url.origin + '/',
      },
      // Follow the vendor's redirects (landing → CDN) like a browser would.
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`PDF download failed: HTTP ${response.status}`);
    }
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    const data = await readResponseBodyLimited(response, maxBytes);
    const validation = validatePdfBytes(data, contentType);
    const sha256 = createHash('sha256').update(data).digest('hex');
    const artifactRoot = vendorPdfArtifactRoot(input.workspaceRoot);
    const outputName = ensurePdfExtension(safeFileName(input.outputName || input.title || basename(url.pathname) || sha256.slice(0, 12)));
    const artifactPath = join(artifactRoot, outputName);
    const sidecarPath = `${artifactPath}.procurement.json`;
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, data);
    const result: VendorPdfDownloadResult = compact({
      kind: 'vendor-pdf-download' as const,
      status: 'downloaded' as const,
      url: url.href,
      effectiveUrl: response.url || url.href,
      ...(input.title ? { title: input.title } : {}),
      ...(input.sourceDomain ? { sourceDomain: input.sourceDomain } : {}),
      ...(input.assay ? { assay: input.assay } : {}),
      artifactPath,
      relativePath: relative(input.workspaceRoot, artifactPath),
      sidecarPath,
      contentType,
      bytesDownloaded: data.length,
      sha256,
      validation,
      generatedAt,
    });
    await writeFile(sidecarPath, `${JSON.stringify(result, null, 2)}\n`, 'utf-8');
    return result;
  } finally {
    clearTimeout(timer);
  }
}

export async function extractVendorPdfText(input: VendorPdfExtractionInput): Promise<VendorPdfExtractionResult> {
  const mode = input.mode ?? 'layout';
  const { buffer, fileName, artifactPath } = await loadPdfBuffer(input);
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const result: VendorPdfExtractionResult = {
    kind: 'vendor-pdf-text-extraction',
    source: compact({
      ...(artifactPath ? { artifactPath } : {}),
      fileName,
      sha256,
    }),
    mode,
  };

  // DOCINGEST-A A3: format dispatch, not a second per-format if-chain. The
  // PDF arm below is byte-identical to today (layout + fallback +
  // diagnostics) — a .pdf buffer must NEVER reach the dispatcher's plain-text
  // pdf arm, which would silently degrade vendor-PDF extraction. Everything
  // else delegates to the ONE dispatcher (decodeAttachmentText); the mediaKind
  // comes from the config-declared format map, never a hardcoded list.
  const isPdf = fileName.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    result.mediaKind = 'pdf';

    if (mode === 'plain' || mode === 'both') {
      const plain = await extractPdfText(buffer);
      result.plainText = {
        text: plain.text,
        pageCount: plain.page_count,
        diagnostics: plain.diagnostics,
      };
    }

    if (mode === 'layout' || mode === 'both') {
      const layout = await extractPdfLayoutText(buffer, fileName).catch(async () => fallbackLayoutExtraction(buffer));

      // DOCINGEST-B B2 — the scan arm. THE scan detector is the oligo
      // precedent (oligoOrder.ts:73-74): the PDF's own text layer is empty.
      // A text-layer PDF never reaches this block, so it never touches the
      // rasterizer (bait 5). A scan rasterizes via the config-declared
      // pdftoppm, KEEPS the page images under the per-record page dir, and
      // OCRs each page via the config-declared tesseract.
      if (layout.pages.length === 0) {
        const scan = await rasterizeAndOcrPdf({
          buffer,
          workspaceRoot: input.workspaceRoot,
          sha12: sha256.slice(0, 12),
          ...(input.ocr ? { ocr: input.ocr } : {}),
        });
        if (scan) {
          result.mediaKind = 'image';
          result.layoutText = { pages: scan.pages, pageCount: scan.pages.length };
          result.images = scan.images;
          result.diagnostics = scan.diagnostics;
          if (mode === 'both') {
            result.plainText = {
              text: scan.pages.map((page) => page.text).join('\f'),
              pageCount: scan.pages.length,
              diagnostics: scan.diagnostics,
            };
          }
          return result;
        }
      }

      result.layoutText = {
        pages: layout.pages,
        pageCount: layout.pages.length,
      };
    }

    return result;
  }

  const decoded = await decodeAttachmentText(fileName, undefined, buffer);
  const format = await documentFormatFor(fileName);
  if (format) {
    result.mediaKind = format.mediaKind;
  }

  // DOCINGEST-B B1/B2 — a photographed page (direct image upload) OCRs its
  // own bytes through the ONE dispatcher's image arm (no rasterizer: the
  // bytes ARE the page) and keeps the page image under the same per-record
  // page dir the scan arm writes.
  if (format?.mediaKind === 'image') {
    const pageDir = vendorPdfPageDir(input.workspaceRoot, sha256.slice(0, 12));
    const pageName = vendorPdfPageFileName(1, format.extension);
    const pagePath = join(pageDir, pageName);
    try {
      await mkdir(pageDir, { recursive: true });
      await writeFile(pagePath, buffer);
      result.images = [{ pageNumber: 1, path: relative(input.workspaceRoot, pagePath) }];
    } catch {
      // A page image that could not be kept is reported by its absence; the
      // OCR text (and its diagnostics) still travel.
    }
  }

  // A non-PDF has no page model: one pseudo-page keeps the downstream page
  // contract satisfied without pretending the document is paginated. An image
  // IS one page, so the same shape holds honestly.
  const pages = [{ pageNumber: 1, text: decoded.text }];

  if (mode === 'plain' || mode === 'both') {
    result.plainText = {
      text: decoded.text,
      pageCount: 1,
      diagnostics: decoded.diagnostics,
    };
  }

  if (mode === 'layout' || mode === 'both') {
    result.layoutText = {
      pages,
      pageCount: pages.length,
    };
  }

  return result;
}

/**
 * DOCINGEST-B B2 — rasterize a scan (empty text layer) with the config-declared
 * rasterizer, KEEP the page images under the per-record page dir, and OCR each
 * page with the config-declared reader. The argv discipline is the oligo
 * precedent (oligoOrder.ts:76-85): mkdtemp scratch, `-r dpi -f 1 -l maxPages
 * -png`, numeric-sorted page list, per-page tesseract with timeout+maxBuffer,
 * pages joined with \f, LOCAL_OCR_REVIEW caution on success, honest error
 * diagnostic on failure, scratch removed in `finally`.
 *
 * maxPages is a CAP with a warning, never a silent truncation (bait 11): when
 * the rasterizer produced exactly maxPages pages, the result carries
 * LOCAL_OCR_PAGE_LIMIT so nobody mistakes a capped read for a complete one.
 *
 * Returns null when no OCR is configured at all — the caller then keeps the
 * Stage-A PDF behavior (mediaKind 'pdf', empty layout) rather than inventing
 * an image kind nothing can read.
 */
async function rasterizeAndOcrPdf(input: {
  buffer: Buffer;
  workspaceRoot: string;
  sha12: string;
  ocr?: { configPath?: string; exec?: ExecFn };
}): Promise<{ pages: Array<{ pageNumber: number; text: string }>; images: Array<{ pageNumber: number; path: string }>; diagnostics: ExtractionDiagnostic[] } | null> {
  const config = await loadImageOcrConfig(input.ocr?.configPath);
  if (!config) return null;

  const exec: ExecFn = input.ocr?.exec ?? ((file, args, opts) => promisify(execFile)(file, args, opts));
  const timeout = config.timeoutSeconds * 1000;
  const dir = await mkdtemp(join(tmpdir(), 'cl-scan-ocr-'));
  try {
    const source = join(dir, 'source.pdf');
    await writeFile(source, input.buffer);
    await exec(config.rasterizer, [
      '-r', String(config.dpi),
      '-f', '1',
      '-l', String(config.maxPages),
      '-png',
      source,
      join(dir, 'page'),
    ], { timeout, maxBuffer: 10 * 1024 * 1024 });

    const pageFiles = (await readdir(dir))
      .filter((f) => f.endsWith('.png'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const diagnostics: ExtractionDiagnostic[] = [];
    const pages: Array<{ pageNumber: number; text: string }> = [];
    const images: Array<{ pageNumber: number; path: string }> = [];
    const pageDir = vendorPdfPageDir(input.workspaceRoot, input.sha12);
    await mkdir(pageDir, { recursive: true });

    for (const [index, pageFile] of pageFiles.entries()) {
      const pageNumber = index + 1;
      const { stdout } = await exec(config.executable, [join(dir, pageFile), 'stdout', '-l', config.language], {
        timeout,
        maxBuffer: 10 * 1024 * 1024,
      });
      pages.push({ pageNumber, text: stdout.trimEnd() });
      // KEEP the page image: move it out of the scratch dir into the
      // per-record page dir under the ONE naming convention.
      const keptName = vendorPdfPageFileName(pageNumber, 'png');
      const keptPath = join(pageDir, keptName);
      await rename(join(dir, pageFile), keptPath);
      images.push({ pageNumber, path: relative(input.workspaceRoot, keptPath) });
    }

    diagnostics.push({ severity: 'warning', code: 'LOCAL_OCR_REVIEW', message: LOCAL_OCR_REVIEW_MESSAGE });
    if (pageFiles.length >= config.maxPages) {
      diagnostics.push({
        severity: 'warning',
        code: 'LOCAL_OCR_PAGE_LIMIT',
        message: `OCR covered the first ${pageFiles.length} page(s) — the configured page limit (images.maxPages) was reached, so later pages may be missing.`,
      });
    }
    return { pages, images, diagnostics };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const missing = /ENOENT/.test(message);
    return {
      pages: [],
      images: [],
      diagnostics: [
        {
          severity: 'error',
          code: missing ? IMAGE_DIAGNOSTIC_CODES.IMAGE_OCR_TOOL_MISSING : IMAGE_DIAGNOSTIC_CODES.IMAGE_OCR_FAILED,
          message: missing
            ? `The configured scan reader "${config.rasterizer}"/"${config.executable}" is not installed on this host. The PDF was stored, but its pages could not be read.`
            : `Scan OCR failed: ${message}`,
        },
      ],
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function fallbackLayoutExtraction(buffer: Buffer): Promise<LayoutPdfExtractionResult> {
  const plain = await extractPdfText(buffer);
  return {
    sha256: createHash('sha256').update(buffer).digest('hex'),
    pages: plain.text
      .split('\f')
      .map((text, index) => ({ pageNumber: index + 1, text: text.trimEnd() }))
      .filter((page) => page.text.trim().length > 0),
  };
}

async function loadPdfBuffer(input: VendorPdfExtractionInput): Promise<{ buffer: Buffer; fileName: string; artifactPath?: string }> {
  if (input.contentBase64) {
    return {
      buffer: Buffer.from(input.contentBase64, 'base64'),
      fileName: input.fileName ?? 'document.pdf',
    };
  }
  if (!input.artifactPath) {
    throw new Error('artifactPath or contentBase64 is required');
  }
  const artifactPath = resolveInsideArtifacts(input.workspaceRoot, input.artifactPath);
  return {
    buffer: await readFile(artifactPath),
    fileName: input.fileName ?? basename(artifactPath),
    artifactPath,
  };
}

function parseHttpUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http(s) PDF URLs are supported');
  }
  return url;
}

async function readResponseBodyLimited(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) {
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > maxBytes) throw new Error(`download exceeded max bytes (${maxBytes})`);
    return data;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) throw new Error(`download exceeded max bytes (${maxBytes})`);
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

function validatePdfBytes(data: Buffer, contentType: string): string {
  if (data.length < 8) throw new Error('download too small to be a PDF');
  const prefix = data.subarray(0, 1024).toString('utf8').trimStart().toLowerCase();
  if (prefix.startsWith('<!doctype html') || prefix.startsWith('<html') || prefix.slice(0, 256).includes('<html')) {
    throw new Error('download is HTML, not PDF');
  }
  if (contentType.includes('text/html')) {
    throw new Error('content-type is HTML, not PDF');
  }
  if (!data.subarray(0, 1024).toString('latin1').trimStart().startsWith('%PDF-')) {
    throw new Error('missing %PDF header');
  }
  return 'valid PDF';
}

function resolveInsideArtifacts(workspaceRoot: string, path: string): string {
  const artifactRoot = vendorPdfArtifactRoot(workspaceRoot);
  const resolved = resolve(workspaceRoot, path);
  const rel = relative(artifactRoot, resolved);
  if (rel === '' || (!rel.startsWith('..') && !resolve(rel).startsWith('..'))) {
    return resolved;
  }
  throw new Error(`artifactPath must be inside ${artifactRoot}`);
}

function safeFileName(value: string): string {
  return value
    .replace(extname(value), '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'vendor-document';
}

function ensurePdfExtension(value: string): string {
  return value.toLowerCase().endsWith('.pdf') ? value : `${value}.pdf`;
}

function compact<T extends Record<string, unknown>>(record: T): T {
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) delete record[key];
  }
  return record;
}
