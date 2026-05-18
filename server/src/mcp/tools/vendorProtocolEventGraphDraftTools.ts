import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';
import { createLabwareLookup } from '../../ai/compiler/labwareLookup.js';
import { runChatbotCompile } from '../../ai/runChatbotCompile.js';
import { draftVendorProtocolEventGraph } from '../../ingestion/vendor-protocol/VendorProtocolEventGraphDraftService.js';
import type { ProtocolCandidate } from '../../ingestion/vendor-protocol/types.js';

export function registerVendorProtocolEventGraphDraftTools(
  server: McpServer,
  ctx: AppContext,
  registry?: ToolRegistry,
): void {
  dualRegister(
    server,
    registry,
    'vendor_protocol_draft_event_graph',
    'Build a compiler prompt from a vendor protocol candidate and optionally run the deterministic compiler to produce a draft event graph artifact. Accepts a persisted candidatePath from vendor_protocol_extract_candidate or an inline candidate object.',
    {
      candidatePath: z.string().optional().describe('Path returned by vendor_protocol_extract_candidate; must be under artifacts/foundry/protocol-candidates'),
      candidate: z.any().optional().describe('Inline vendor-protocol-candidate object when no candidatePath exists yet'),
      compile: z.boolean().optional().describe('Run chatbot-compile after building the prompt. Defaults to true when the server compiler runtime is available, otherwise false.'),
      deterministicOnly: z.boolean().optional().describe('Force deterministic compiler mode. Defaults to true.'),
      persist: z.boolean().optional().describe('Persist draft JSON under artifacts/foundry/protocol-event-graph-drafts; default true'),
    },
    async (args) => {
      try {
        const shouldCompile = args.compile ?? Boolean(ctx.extractionRunner);
        if (shouldCompile && !ctx.extractionRunner) {
          throw new Error('Compiler runtime is unavailable in this server context');
        }

        return jsonResult(await draftVendorProtocolEventGraph({
          workspaceRoot: ctx.workspaceRoot,
          ...(args.candidatePath ? { candidatePath: args.candidatePath } : {}),
          ...(args.candidate ? { candidate: args.candidate as ProtocolCandidate } : {}),
          compile: shouldCompile,
          deterministicOnly: args.deterministicOnly ?? true,
          ...(args.persist !== undefined ? { persist: args.persist } : {}),
          ...(shouldCompile && ctx.extractionRunner ? {
            compileRunner: ({ prompt, deterministicOnly }) => runChatbotCompile({
              prompt,
              deterministicOnly,
              deps: {
                extractionService: ctx.extractionRunner!,
                llmClient: null,
                searchLabwareByHint: createLabwareLookup(ctx.store),
              },
            }),
          } : {}),
        }));
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
