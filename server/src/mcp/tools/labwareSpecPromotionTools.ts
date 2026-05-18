import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';
import { promoteLabwareSpecCandidate } from '../../ingestion/labware-spec/LabwareSpecPromotionService.js';
import type { LabwareSpecCandidateResult } from '../../ingestion/labware-spec/LabwareSpecCandidateService.js';

export function registerLabwareSpecPromotionTools(
  server: McpServer,
  ctx: AppContext,
  registry?: ToolRegistry,
): void {
  dualRegister(
    server,
    registry,
    'labware_spec_promote_candidate',
    'Promote a labware-spec candidate into a canonical labware-definition YAML record. Writes to records/seed/labware-definition by default, refuses overwrites unless requested, and returns validation/lint plus a provenance sidecar path.',
    {
      candidatePath: z.string().optional().describe('Path returned by labware_spec_extract_candidate; must be under artifacts/foundry/labware-spec-candidates'),
      candidate: z.any().optional().describe('Inline labware-spec-candidate-extraction object when no candidatePath exists yet'),
      recordId: z.string().optional().describe('Optional recordId override for the promoted labware-definition'),
      outputDir: z.string().optional().describe('Workspace-relative output directory; default records/seed/labware-definition'),
      overwrite: z.boolean().optional().describe('Replace an existing YAML file for the same recordId; default false'),
      allowErrorGaps: z.boolean().optional().describe('Allow promotion even if the candidate has error-severity gaps; default false'),
      writeInvalid: z.boolean().optional().describe('Write YAML even if schema validation or lint fails; default false'),
    },
    async (args) => {
      try {
        return jsonResult(await promoteLabwareSpecCandidate({
          workspaceRoot: ctx.workspaceRoot,
          ...(args.candidatePath ? { candidatePath: args.candidatePath } : {}),
          ...(args.candidate ? { candidate: args.candidate as LabwareSpecCandidateResult } : {}),
          ...(args.recordId ? { recordId: args.recordId } : {}),
          ...(args.outputDir ? { outputDir: args.outputDir } : {}),
          ...(args.overwrite !== undefined ? { overwrite: args.overwrite } : {}),
          ...(args.allowErrorGaps !== undefined ? { allowErrorGaps: args.allowErrorGaps } : {}),
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
