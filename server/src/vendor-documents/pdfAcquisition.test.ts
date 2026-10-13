import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { downloadVendorPdf, extractVendorPdfText } from './pdfAcquisition.js';

function pdfBytes(): Uint8Array {
  return new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
}

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
