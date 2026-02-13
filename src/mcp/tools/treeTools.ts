/**
 * MCP tools for navigating the study/experiment/run hierarchy.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import { jsonResult, errorResult } from '../helpers.js';

export function registerTreeTools(server: McpServer, ctx: AppContext): void {
  // tree_studies — Get the full study hierarchy
  server.tool(
    'tree_studies',
    'Get the study/experiment/run hierarchy tree. Shows all studies with nested experiments and runs, including record counts per run.',
    {},
    async () => {
      try {
        const studies = await ctx.indexManager.getStudyTree();
        return jsonResult({ studies });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // tree_records_for_run — Get all records linked to a run
  server.tool(
    'tree_records_for_run',
    'Get all records linked to a specific run.',
    { runId: z.string().describe('The run record ID') },
    async (args) => {
      try {
        const records = await ctx.indexManager.getByRunId(args.runId);
        return jsonResult({ records, total: records.length });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // tree_inbox — Get unfiled records
  server.tool(
    'tree_inbox',
    'Get records in the inbox (unfiled records not yet linked to a run).',
    {},
    async () => {
      try {
        const records = await ctx.indexManager.getInbox();
        return jsonResult({ records, total: records.length });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // tree_file_record — File a record from inbox into a run
  server.tool(
    'tree_file_record',
    'File a record from the inbox into a specific run. Updates the record links and status.',
    {
      recordId: z.string().describe('The record to file'),
      runId: z.string().describe('The run to file the record into'),
    },
    async (args) => {
      try {
        const record = await ctx.store.get(args.recordId);
        if (!record) {
          return errorResult(`Record not found: ${args.recordId}`);
        }

        const runEntry = await ctx.indexManager.getByRecordId(args.runId);
        if (!runEntry) {
          return errorResult(`Run not found: ${args.runId}`);
        }

        const payload = record.payload as Record<string, unknown>;
        const updatedPayload = {
          ...payload,
          links: {
            studyId: runEntry.links?.studyId,
            experimentId: runEntry.links?.experimentId,
            runId: args.runId,
          },
          status: 'filed',
        };

        const result = await ctx.store.update({
          envelope: { ...record, payload: updatedPayload },
          message: `File ${args.recordId} into run ${args.runId}`,
        });

        if (!result.success) {
          return errorResult(result.error || 'Failed to file record');
        }

        // Update the index
        const currentEntry = await ctx.indexManager.getByRecordId(args.recordId);
        if (currentEntry) {
          await ctx.indexManager.updateEntry({
            ...currentEntry,
            status: 'filed',
            links: {
              ...(runEntry.links?.studyId ? { studyId: runEntry.links.studyId } : {}),
              ...(runEntry.links?.experimentId ? { experimentId: runEntry.links.experimentId } : {}),
              runId: args.runId,
            },
          });
        }

        return jsonResult({ success: true, newPath: result.envelope?.meta?.path });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );
}
