import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { extractPdfText } from '../extract/PdfTextAdapter.js';
import { extractPdfLayoutText, type PdfExtractionResult as LayoutPdfExtractionResult } from '../ingestion/pdf/TableExtractionService.js';

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ProtocolFoundry/1.0';
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
}

export interface VendorPdfExtractionResult {
  kind: 'vendor-pdf-text-extraction';
  source: {
    artifactPath?: string;
    fileName: string;
    sha256: string;
  };
  mode: 'plain' | 'layout' | 'both';
  plainText?: {
    text: string;
    pageCount: number;
    diagnostics: unknown[];
  };
  layoutText?: {
    pages: Array<{ pageNumber: number; text: string }>;
    pageCount: number;
  };
}

export function vendorPdfArtifactRoot(workspaceRoot: string): string {
  return resolve(workspaceRoot, 'artifacts', 'foundry', 'pdfs');
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
        'Accept': 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.5',
      },
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
    result.layoutText = {
      pages: layout.pages,
      pageCount: layout.pages.length,
    };
  }

  return result;
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
