import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';
import { extractVendorProtocolCandidateFromInput } from '../../ingestion/vendor-protocol/VendorProtocolCandidateService.js';

export function registerVendorProtocolCandidateTools(server: McpServer, ctx: AppContext, registry?: ToolRegistry): void {
  dualRegister(
    server,
    registry,
    'vendor_protocol_extract_candidate',
    'Extract a structured vendor protocol candidate from a stored PDF artifact, base64 PDF, or already-extracted protocol text. Returns sections, tables, steps, materials, labware, equipment, diagnostics, and provenance.',
    {
      artifactPath: z.string().optional().describe('Path returned by vendor_pdf_download; must be under artifacts/foundry/pdfs'),
      contentBase64: z.string().optional().describe('Base64-encoded PDF content when no artifact path exists yet'),
      text: z.string().optional().describe('Already-extracted vendor protocol text'),
      fileName: z.string().optional().describe('Optional source file name'),
      documentId: z.string().optional().describe('Optional stable source document id'),
      vendor: z.string().optional().describe('Optional vendor name'),
      persist: z.boolean().optional().describe('Persist candidate JSON under artifacts/foundry/protocol-candidates; default true'),
    },
    async (args) => {
      try {
        return jsonResult(await extractVendorProtocolCandidateFromInput({
          workspaceRoot: ctx.workspaceRoot,
          ...(args.artifactPath ? { artifactPath: args.artifactPath } : {}),
          ...(args.contentBase64 ? { contentBase64: args.contentBase64 } : {}),
          ...(args.text ? { text: args.text } : {}),
          ...(args.fileName ? { fileName: args.fileName } : {}),
          ...(args.documentId ? { documentId: args.documentId } : {}),
          ...(args.vendor ? { vendor: args.vendor } : {}),
          ...(args.persist !== undefined ? { persist: args.persist } : {}),
        }));
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
