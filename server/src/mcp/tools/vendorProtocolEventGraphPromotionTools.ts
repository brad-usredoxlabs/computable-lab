import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';
import { promoteVendorProtocolEventGraph } from '../../ingestion/vendor-protocol/VendorProtocolEventGraphPromotionService.js';
import type { VendorProtocolEventGraphDraftResult } from '../../ingestion/vendor-protocol/VendorProtocolEventGraphDraftService.js';

export function registerVendorProtocolEventGraphPromotionTools(
  server: McpServer,
  ctx: AppContext,
  registry?: ToolRegistry,
): void {
  dualRegister(
    server,
    registry,
    'vendor_protocol_promote_event_graph',
    'Promote a vendor protocol draft event graph artifact into a canonical event-graph YAML record. Writes a provenance sidecar and blocks incomplete/empty/invalid drafts unless explicitly allowed.',
    {
      draftPath: z.string().optional().describe('Path returned by vendor_protocol_draft_event_graph; must be under artifacts/foundry/protocol-event-graph-drafts'),
      draft: z.any().optional().describe('Inline vendor-protocol-event-graph-draft object'),
      recordId: z.string().optional().describe('Optional event-graph recordId override'),
      outputDir: z.string().optional().describe('Workspace-relative output directory; default records/event-graph'),
      overwrite: z.boolean().optional().describe('Replace an existing YAML file for the same recordId/path; default false'),
      allowIncompleteCompile: z.boolean().optional().describe('Allow promotion when compileStatus is not complete; default false'),
      allowEmptyEvents: z.boolean().optional().describe('Allow promotion of a draft with zero events; default false'),
      writeInvalid: z.boolean().optional().describe('Write YAML even if schema validation or lint fails; default false'),
    },
    async (args) => {
      try {
        return jsonResult(await promoteVendorProtocolEventGraph({
          workspaceRoot: ctx.workspaceRoot,
          ...(args.draftPath ? { draftPath: args.draftPath } : {}),
          ...(args.draft ? { draft: args.draft as VendorProtocolEventGraphDraftResult } : {}),
          ...(args.recordId ? { recordId: args.recordId } : {}),
          ...(args.outputDir ? { outputDir: args.outputDir } : {}),
          ...(args.overwrite !== undefined ? { overwrite: args.overwrite } : {}),
          ...(args.allowIncompleteCompile !== undefined ? { allowIncompleteCompile: args.allowIncompleteCompile } : {}),
          ...(args.allowEmptyEvents !== undefined ? { allowEmptyEvents: args.allowEmptyEvents } : {}),
          ...(args.writeInvalid !== undefined ? { writeInvalid: args.writeInvalid } : {}),
          validator: ctx.validator,
          lintEngine: ctx.lintEngine,
        }));
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
