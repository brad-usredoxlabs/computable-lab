import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';
import { extractLabwareSpecCandidate } from '../../ingestion/labware-spec/LabwareSpecCandidateService.js';

export function registerLabwareSpecCandidateTools(
  server: McpServer,
  ctx: AppContext,
  registry?: ToolRegistry,
): void {
  dualRegister(
    server,
    registry,
    'labware_spec_extract_candidate',
    'Extract a draft labware-definition candidate from a vendor labware specification PDF artifact, base64 PDF, or already-extracted text. Returns topology, capacity, vendor/catalog metadata, evidence, and review gaps.',
    {
      artifactPath: z.string().optional().describe('Path returned by vendor_pdf_download; must be under artifacts/foundry/pdfs'),
      contentBase64: z.string().optional().describe('Base64-encoded PDF content when no artifact path exists yet'),
      text: z.string().optional().describe('Already-extracted labware specification text'),
      fileName: z.string().optional().describe('Optional source file name'),
      vendor: z.string().optional().describe('Optional vendor/manufacturer override'),
      sourceUrl: z.string().optional().describe('Optional URL for provenance'),
      persist: z.boolean().optional().describe('Persist candidate JSON under artifacts/foundry/labware-spec-candidates; default true'),
    },
    async (args) => {
      try {
        return jsonResult(await extractLabwareSpecCandidate({
          workspaceRoot: ctx.workspaceRoot,
          ...(args.artifactPath ? { artifactPath: args.artifactPath } : {}),
          ...(args.contentBase64 ? { contentBase64: args.contentBase64 } : {}),
          ...(args.text ? { text: args.text } : {}),
          ...(args.fileName ? { fileName: args.fileName } : {}),
          ...(args.vendor ? { vendor: args.vendor } : {}),
          ...(args.sourceUrl ? { sourceUrl: args.sourceUrl } : {}),
          ...(args.persist !== undefined ? { persist: args.persist } : {}),
        }));
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
