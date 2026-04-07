/**
 * MCP tools for protocol management.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';
import type { RecordFilter } from '../../store/types.js';
import { ExecutionOrchestrator, ExecutionError } from '../../execution/ExecutionOrchestrator.js';
import { ProtocolExtractionService, ProtocolExtractionError } from '../../protocol/ProtocolExtractionService.js';

export function registerProtocolTools(server: McpServer, ctx: AppContext, registry?: ToolRegistry): void {
  const orchestrator = new ExecutionOrchestrator(ctx);
  const extraction = new ProtocolExtractionService(ctx);

  // protocol_save_from_event_graph — Save event graph as protocol
  dualRegister(server, registry,
    'protocol_save_from_event_graph',
    'Save an event graph as a reusable protocol record.',
    {
      eventGraphId: z.string().describe('ID of the event graph to save as protocol'),
      title: z.string().optional().describe('Optional title for the new protocol'),
      tags: z.array(z.string()).optional().describe('Optional tags'),
    },
    async (args) => {
      try {
        const saved = await extraction.saveFromEventGraph({
          eventGraphId: args.eventGraphId,
          ...(args.title !== undefined ? { title: args.title } : {}),
          ...(args.tags !== undefined ? { tags: args.tags } : {}),
        });
        return jsonResult({ success: true, recordId: saved.recordId });
      } catch (err) {
        if (err instanceof ProtocolExtractionError) {
          return errorResult(`${err.code}: ${err.message}`);
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // protocol_load — Load protocol for editing
  dualRegister(server, registry,
    'protocol_load',
    'Load a protocol record for editing. Returns the protocol in event graph shape for the editor.',
    {
      protocolId: z.string().describe('Protocol recordId to load'),
    },
    async (args) => {
      try {
        const envelope = await ctx.store.get(args.protocolId);
        if (!envelope) {
          return errorResult(`Protocol not found: ${args.protocolId}`);
        }
        return jsonResult(envelope);
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // protocol_list — List available protocols
  dualRegister(server, registry,
    'protocol_list',
    'List available protocol records.',
    {
      limit: z.number().optional().describe('Maximum records to return (default 50)'),
      offset: z.number().optional().describe('Offset for pagination'),
    },
    async (args) => {
      try {
        const filter: RecordFilter = {
          kind: 'protocol',
          limit: args.limit ?? 50,
        };
        if (args.offset !== undefined) filter.offset = args.offset;
        const records = await ctx.store.list(filter);
        return jsonResult({ records, total: records.length });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // protocol_bind — Bind protocol roles and create planned run
  dualRegister(server, registry,
    'protocol_bind',
    'Bind protocol roles and parameters to concrete entities and create a planned-run record.',
    {
      protocolId: z.string().describe('Protocol recordId to bind'),
      bindings: z.record(z.string(), z.unknown()).optional().describe('Bindings object (labware/materials/instruments/parameters)'),
      title: z.string().optional().describe('Optional planned run title'),
    },
    async (args) => {
      try {
        const protocol = await ctx.store.get(args.protocolId);
        if (!protocol) {
          return errorResult(`Protocol not found: ${args.protocolId}`);
        }
        const protocolTitle = ((protocol.payload as Record<string, unknown>)['title'] as string | undefined) ?? args.protocolId;
        const planned = await orchestrator.createPlannedRun({
          title: args.title ?? `${protocolTitle} bound run`,
          sourceType: 'protocol',
          sourceRef: { kind: 'record', id: args.protocolId, type: 'protocol' },
          bindings: args.bindings,
        });
        return jsonResult({ success: true, plannedRunId: planned.recordId });
      } catch (err) {
        if (err instanceof ExecutionError) {
          return errorResult(`${err.code}: ${err.message}`);
        }
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );
}
