import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';
import { generateOpentronsLabwareDefinition } from '../../ingestion/labware-spec/OpentronsLabwareDefinitionService.js';
import type {
  LabwareDefinitionDraft,
  LabwareSpecCandidateResult,
} from '../../ingestion/labware-spec/LabwareSpecCandidateService.js';

export function registerOpentronsLabwareDefinitionTools(
  server: McpServer,
  ctx: AppContext,
  registry?: ToolRegistry,
): void {
  dualRegister(
    server,
    registry,
    'opentrons_labware_generate_definition',
    'Generate an Opentrons v2-style custom labware JSON definition from a labware-spec candidate, promoted labware-definition YAML path, inline labware-definition, or recordId. Returns blockers instead of guessing missing geometry.',
    {
      candidatePath: z.string().optional().describe('Path returned by labware_spec_extract_candidate; must be under artifacts/foundry/labware-spec-candidates'),
      candidate: z.any().optional().describe('Inline labware-spec-candidate-extraction object'),
      labwareDefinitionPath: z.string().optional().describe('Workspace-relative path to a promoted labware-definition YAML file'),
      labwareDefinition: z.any().optional().describe('Inline labware-definition object'),
      recordId: z.string().optional().describe('Existing recordId to load via RecordStore'),
      namespace: z.string().optional().describe('Optional Opentrons namespace; default derived from vendor'),
      version: z.number().int().positive().optional().describe('Optional Opentrons definition version; default 1'),
      loadName: z.string().optional().describe('Optional Opentrons loadName; default derived from alias/id/recordId'),
      persist: z.boolean().optional().describe('Persist JSON under artifacts/foundry/opentrons-labware-definitions; default true'),
    },
    async (args) => {
      try {
        const recordDefinition = args.recordId
          ? await loadLabwareDefinitionFromRecord(ctx, args.recordId)
          : undefined;
        return jsonResult(await generateOpentronsLabwareDefinition({
          workspaceRoot: ctx.workspaceRoot,
          ...(args.candidatePath ? { candidatePath: args.candidatePath } : {}),
          ...(args.candidate ? { candidate: args.candidate as LabwareSpecCandidateResult } : {}),
          ...(args.labwareDefinitionPath ? { labwareDefinitionPath: args.labwareDefinitionPath } : {}),
          ...(args.labwareDefinition ? { labwareDefinition: args.labwareDefinition as LabwareDefinitionDraft } : {}),
          ...(recordDefinition ? { labwareDefinition: recordDefinition } : {}),
          ...(args.namespace ? { namespace: args.namespace } : {}),
          ...(args.version !== undefined ? { version: args.version } : {}),
          ...(args.loadName ? { loadName: args.loadName } : {}),
          ...(args.persist !== undefined ? { persist: args.persist } : {}),
        }));
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  );
}

async function loadLabwareDefinitionFromRecord(
  ctx: AppContext,
  recordId: string,
): Promise<LabwareDefinitionDraft> {
  const envelope = await ctx.store.get(recordId);
  if (!envelope) {
    throw new Error(`Record not found: ${recordId}`);
  }
  const payload = envelope.payload as Record<string, unknown>;
  if (payload['kind'] !== 'labware-definition') {
    throw new Error(`Record ${recordId} is not a labware-definition`);
  }
  return payload as unknown as LabwareDefinitionDraft;
}
