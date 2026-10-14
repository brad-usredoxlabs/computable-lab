import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { downloadVendorPdf, extractVendorPdfText, vendorPdfPageDir } from './pdfAcquisition.js';

function pdfBytes(): Uint8Array {
  return new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
}

// Shared between the PDF-arm regression suite and the DOCINGEST-B scan suite.
const realPdfPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../resources/vendor_pdfs/_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf',
);

function response(body: Uint8Array | string, init: { contentType?: string; url?: string; ok?: boolean; status?: number } = {}): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { 'content-type': init.contentType ?? 'application/pdf' },
  }) as Response & { url: string };
}

describe('vendor PDF acquisition', () => {
  it('downloads a validated PDF artifact and writes a procurement sidecar', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'vendor-pdf-workspace-'));
    try {
      const fetchImpl = vi.fn(async () => response(pdfBytes()));
      const result = await downloadVendorPdf({
        workspaceRoot,
        url: 'https://vendor.example/protocol.pdf',
        title: 'Vendor Protocol',
        outputName: 'protocol.pdf',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      expect(result.status).toBe('downloaded');
      expect(result.validation).toBe('valid PDF');
      expect(result.relativePath).toBe('artifacts/foundry/pdfs/protocol.pdf');
      await expect(readFile(result.artifactPath, 'utf-8')).resolves.toContain('%PDF-1.4');
      await expect(readFile(result.sidecarPath, 'utf-8')).resolves.toContain('vendor-pdf-download');
      expect(fetchImpl).toHaveBeenCalledWith('https://vendor.example/protocol.pdf', expect.objectContaining({
        headers: expect.objectContaining({ Accept: expect.stringContaining('application/pdf') }),
      }));
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('rejects HTML responses before writing an artifact', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'vendor-pdf-workspace-'));
    try {
      const fetchImpl = vi.fn(async () => response('<html>not a pdf</html>', { contentType: 'text/html' }));
      await expect(downloadVendorPdf({
        workspaceRoot,
        url: 'https://vendor.example/protocol.pdf',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })).rejects.toThrow('download is HTML, not PDF');
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});

// DOCINGEST-A A3 — text documents acquire through the ONE dispatcher and
// report what the stored file IS (mediaKind). The PDF arm (layout + fallback
// + diagnostics) is pinned byte-identical: a .pdf buffer must never touch the
// dispatcher's plain-text pdf arm.
describe('vendor document text acquisition (format-agnostic)', () => {
  const realPdfPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../resources/vendor_pdfs/_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf',
  );

  it('reads a markdown document as text (one pseudo-page, mediaKind text)', async () => {
    const buffer = Buffer.from('# Lysis protocol\n\n1. Add 500 uL of buffer.\n');
    const result = await extractVendorPdfText({
      workspaceRoot: '/workspace',
      contentBase64: buffer.toString('base64'),
      fileName: 'lab-protocol.md',
      mode: 'both',
    });
    expect(result.mediaKind).toBe('text');
    expect(result.layoutText?.pages).toEqual([
      { pageNumber: 1, text: expect.stringContaining('Lysis protocol') },
    ]);
    expect(result.layoutText?.pageCount).toBe(1);
    // The dispatcher's honest info diagnostic travels with the result.
    expect(JSON.stringify(result.plainText?.diagnostics ?? [])).toContain('markdown_as_text');
    expect(result.source.fileName).toBe('lab-protocol.md');
  });

  it('a .docx upload acquires as mediaKind text with the honest DOCX diagnostic (never a blank success)', async () => {
    const buffer = Buffer.from('PK\u0003\u0004 fake-docx-bytes');
    const result = await extractVendorPdfText({
      workspaceRoot: '/workspace',
      contentBase64: buffer.toString('base64'),
      fileName: 'sop.docx',
      mode: 'both',
    });
    expect(result.mediaKind).toBe('text');
    expect(result.layoutText?.pages).toHaveLength(1);
    // pandoc ABSENT on this host -> DOCX_TOOL_MISSING (composer-verified host
    // state). If ops installs pandoc, the fake bytes fail the reader ->
    // DOCX_EXTRACTION_FAILED. Either way an honest DOCX_* error diagnostic is
    // present — a silent empty text is the defect this pins out.
    const diagnostics = JSON.stringify(result.plainText?.diagnostics ?? []);
    expect(diagnostics).toMatch(/DOCX_/);
  });

  it('PDF arm regression: a real vendor PDF still extracts via the layout path (mediaKind pdf, multi-page)', async () => {
    const buffer = await readFile(realPdfPath);
    const result = await extractVendorPdfText({
      workspaceRoot: '/workspace',
      contentBase64: buffer.toString('base64'),
      fileName: '_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf',
      mode: 'layout',
    });
    expect(result.mediaKind).toBe('pdf');
    expect(result.layoutText!.pageCount).toBeGreaterThanOrEqual(29);
    expect(result.layoutText!.pages[0]?.text).toContain('ZymoBIOMICS');
    // mode 'layout' keeps plainText absent exactly as today.
    expect(result.plainText).toBeUndefined();
  });

  it('PDF arm regression: mode both keeps plainText + layoutText shapes byte-identical', async () => {
    const buffer = await readFile(realPdfPath);
    const result = await extractVendorPdfText({
      workspaceRoot: '/workspace',
      contentBase64: buffer.toString('base64'),
      fileName: 'zymo.pdf',
      mode: 'both',
    });
    expect(result.mediaKind).toBe('pdf');
    expect(typeof result.plainText?.text).toBe('string');
    expect(result.plainText!.text.length).toBeGreaterThan(1000);
    expect(result.plainText!.pageCount).toBeGreaterThanOrEqual(29);
    expect(Array.isArray(result.plainText!.diagnostics)).toBe(true);
    expect(result.layoutText!.pages.length).toBeGreaterThanOrEqual(29);
  });

  it('unknown-but-readable extension (txt) acquires as mediaKind text through the dispatcher', async () => {
    const buffer = Buffer.from('Equilibrate at room temperature for 10 minutes.\n');
    const result = await extractVendorPdfText({
      workspaceRoot: '/workspace',
      contentBase64: buffer.toString('base64'),
      fileName: 'notes.txt',
      mode: 'layout',
    });
    expect(result.mediaKind).toBe('text');
    expect(result.layoutText?.pages).toEqual([
      { pageNumber: 1, text: expect.stringContaining('Equilibrate') },
    ]);
  });
});

// DOCINGEST-B B2 — the scan arm. A photographed/scanned page (empty text
// layer) rasterizes via the config-declared pdftoppm, KEEPS page-NNN.png
// artifacts under the per-record page dir, and OCRs each page via the
// config-declared tesseract: mediaKind 'image', images[] written, layoutText
// from the OCR text. A text-layer PDF NEVER touches the rasterizer (spy pin).
// maxPages is a cap with an honest coverage warning, never a silent truncation.
//
// Fixture provenance (bait 14): every "scan" here is DEMO-labeled synthetic
// material built AT RUNTIME in a tmpdir with the host's declared tools — the
// §6 B0b recipe (ImageMagick renders the page; pdftoppm/tesseract are the
// config-declared OCR tools). No binary is committed to git.
describe('scanned-page acquisition (DOCINGEST-B)', () => {
  const run = promisify(execFile);

  async function makeScanPdf(workspace: string, lines: string[]): Promise<Buffer> {
    // B0b recipe: ImageMagick renders text into a raster-only PDF (no text
    // layer — pdftotext returns nothing), exactly the class of a phone photo.
    const pagePngs: string[] = [];
    for (const [i, line] of lines.entries()) {
      const png = join(workspace, `demo-page-${i + 1}.png`);
      await run('magick', ['-size', '1400x1800', 'xc:white', '-pointsize', '48', '-annotate', '+100+200', `DEMO ${line}`, png]);
      pagePngs.push(png);
    }
    const pdf = join(workspace, 'demo-scan.pdf');
    await run('magick', [...pagePngs, pdf]);
    return readFile(pdf);
  }

  it('empty-text-layer PDF rasterizes + OCRs to mediaKind image with KEPT page images', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'vendor-scan-workspace-'));
    try {
      const buffer = await makeScanPdf(workspaceRoot, ['LYSIS BUFFER ADD 500 uL']);
      const result = await extractVendorPdfText({
        workspaceRoot,
        contentBase64: buffer.toString('base64'),
        fileName: 'photographed-protocol.pdf',
        mode: 'layout',
      });
      expect(result.mediaKind, 'a scan is an image-kind document').toBe('image');
      const sha12 = createHash('sha256').update(buffer).digest('hex').slice(0, 12);
      const pageDir = vendorPdfPageDir(workspaceRoot, sha12);
      expect(result.images, 'the kept page images travel with the result').toBeTruthy();
      expect(result.images!.length).toBe(1);
      expect(result.images![0]!.pageNumber).toBe(1);
      // page-001.png exists under the per-record page dir (the §B2 convention)
      const pageFile = join(pageDir, 'page-001.png');
      await expect(readFile(pageFile)).resolves.toBeTruthy();
      expect(result.images![0]!.path).toBe(relative(workspaceRoot, pageFile));
      // layoutText carries the OCR text
      expect(result.layoutText?.pages[0]?.text).toContain('LYSIS');
      // the OCR caution travels with the result
      const diags = JSON.stringify(result.plainText?.diagnostics ?? []) + JSON.stringify(result.layoutText ?? '');
      expect(diags + JSON.stringify(result.diagnostics ?? [])).toContain('LOCAL_OCR_REVIEW');
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  }, 30_000);

  it('text-layer PDF NEVER touches the rasterizer (Stage-A arm pinned, bait 5)', async () => {
    const buffer = await readFile(realPdfPath);
    const execSpy = vi.fn(async () => ({ stdout: 'should never run' }));
    const result = await extractVendorPdfText({
      workspaceRoot: '/workspace',
      contentBase64: buffer.toString('base64'),
      fileName: 'zymo.pdf',
      mode: 'layout',
      ocr: { exec: execSpy },
    });
    expect(result.mediaKind).toBe('pdf');
    expect(execSpy, 'a text-layer PDF must never invoke the rasterizer or OCR').not.toHaveBeenCalled();
    expect(result.images, 'a text-layer PDF has no page images').toBeUndefined();
  });

  it('direct image upload OCRs the bytes (no rasterizer) and keeps the page image', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'vendor-image-workspace-'));
    try {
      await run('magick', ['-size', '1400x1800', 'xc:white', '-pointsize', '48', '-annotate', '+100+200', 'DEMO ADD 500 uL LYSIS BUFFER', join(workspaceRoot, 'demo.png')]);
      const buffer = await readFile(join(workspaceRoot, 'demo.png'));
      const result = await extractVendorPdfText({
        workspaceRoot,
        contentBase64: buffer.toString('base64'),
        fileName: 'photographed-page.png',
        mode: 'both',
      });
      expect(result.mediaKind).toBe('image');
      expect(result.layoutText?.pages[0]?.text).toContain('LYSIS');
      const sha12 = createHash('sha256').update(buffer).digest('hex').slice(0, 12);
      const pageFile = join(vendorPdfPageDir(workspaceRoot, sha12), 'page-001.png');
      await expect(readFile(pageFile)).resolves.toBeTruthy();
      expect(result.images).toEqual([{ pageNumber: 1, path: relative(workspaceRoot, pageFile) }]);
      // the OCR caution is present on success
      expect(JSON.stringify(result.plainText?.diagnostics ?? [])).toContain('LOCAL_OCR_REVIEW');
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  }, 30_000);

  it('maxPages caps the rasterizer AND reports the coverage warning (bait 11: never silent)', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'vendor-cap-workspace-'));
    try {
      const buffer = await makeScanPdf(workspaceRoot, ['LYSIS BUFFER PAGE ONE', 'INCUBATE 10 MIN PAGE TWO']);
      // Config mutation (never an uninstall): cap at ONE page.
      const configPath = join(workspaceRoot, 'cap-config.yaml');
      await writeFile(configPath, 'images:\n  executable: tesseract\n  language: eng\n  timeoutSeconds: 30\n  rasterizer: pdftoppm\n  dpi: 200\n  maxPages: 1\n', 'utf-8');
      const result = await extractVendorPdfText({
        workspaceRoot,
        contentBase64: buffer.toString('base64'),
        fileName: 'two-page-scan.pdf',
        mode: 'layout',
        ocr: { configPath },
      });
      expect(result.mediaKind).toBe('image');
      expect(result.layoutText?.pages.length, 'the cap is honored').toBe(1);
      expect(result.images?.length).toBe(1);
      const diags = JSON.stringify(result.diagnostics ?? []);
      expect(diags, 'a capped scan must declare the coverage limit — a silent truncation is a lie').toContain('LOCAL_OCR_PAGE_LIMIT');
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  }, 30_000);

  it('vendorPdfPageDir is the single naming convention (sibling of vendorPdfArtifactRoot)', () => {
    const dir = vendorPdfPageDir('/ws', 'abc123def456');
    expect(dir).toBe(join('/ws', 'artifacts', 'foundry', 'pdfs', 'pages', 'abc123def456'));
  });
});
