import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { downloadVendorPdf } from './pdfAcquisition.js';

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
