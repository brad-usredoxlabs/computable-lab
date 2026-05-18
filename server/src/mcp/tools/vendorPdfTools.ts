import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';
import { downloadVendorPdf, extractVendorPdfText } from '../../vendor-documents/pdfAcquisition.js';

export function registerVendorPdfTools(server: McpServer, ctx: AppContext, registry?: ToolRegistry): void {
  dualRegister(
    server,
    registry,
    'vendor_pdf_download',
    'Download, validate, and store a public vendor or protocol PDF under artifacts/foundry/pdfs. Returns artifact path, sha256, content type, and procurement sidecar path.',
    {
      url: z.string().url().describe('Public http(s) URL for the PDF'),
      title: z.string().optional().describe('Optional human-readable title'),
      sourceDomain: z.string().optional().describe('Expected vendor/source domain for provenance'),
      assay: z.string().optional().describe('Optional assay/protocol family tag'),
      outputName: z.string().optional().describe('Optional output file name; sanitized and forced to .pdf'),
      timeoutMs: z.number().int().min(1000).max(120000).optional().describe('Download timeout in milliseconds'),
      maxBytes: z.number().int().min(1024).max(100 * 1024 * 1024).optional().describe('Maximum accepted PDF byte size'),
    },
    async (args) => {
      try {
        return jsonResult(await downloadVendorPdf({
          workspaceRoot: ctx.workspaceRoot,
          url: args.url,
          ...(args.title ? { title: args.title } : {}),
          ...(args.sourceDomain ? { sourceDomain: args.sourceDomain } : {}),
          ...(args.assay ? { assay: args.assay } : {}),
          ...(args.outputName ? { outputName: args.outputName } : {}),
          ...(args.timeoutMs ? { timeoutMs: args.timeoutMs } : {}),
          ...(args.maxBytes ? { maxBytes: args.maxBytes } : {}),
        }));
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  dualRegister(
    server,
    registry,
    'vendor_pdf_extract_text',
    'Extract text from a stored vendor PDF artifact or base64 PDF content. Supports layout-preserving pdftotext extraction with plain-text fallback diagnostics.',
    {
      artifactPath: z.string().optional().describe('Path returned by vendor_pdf_download; must be under artifacts/foundry/pdfs'),
      contentBase64: z.string().optional().describe('Base64-encoded PDF content when no artifact path exists yet'),
      fileName: z.string().optional().describe('Optional file name for diagnostics and temp extraction'),
      mode: z.enum(['plain', 'layout', 'both']).optional().describe('Extraction mode; default is layout'),
    },
    async (args) => {
      try {
        return jsonResult(await extractVendorPdfText({
          workspaceRoot: ctx.workspaceRoot,
          ...(args.artifactPath ? { artifactPath: args.artifactPath } : {}),
          ...(args.contentBase64 ? { contentBase64: args.contentBase64 } : {}),
          ...(args.fileName ? { fileName: args.fileName } : {}),
          ...(args.mode ? { mode: args.mode } : {}),
        }));
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
