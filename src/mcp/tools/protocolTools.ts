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

export function registerProtocolTools(server: McpServer, ctx: AppContext, registry?: ToolRegistry): void {
  // protocol_save_from_event_graph — Save event graph as protocol
  dualRegister(server, registry,
    'protocol_save_from_event_graph',
    'Save an event graph as a reusable protocol record. TODO: translator logic not yet implemented.',
    {
      eventGraphId: z.string().describe('ID of the event graph to save as protocol'),
      title: z.string().optional().describe('Optional title for the new protocol'),
      tags: z.array(z.string()).optional().describe('Optional tags'),
    },
    async () => {
      // TODO: Implement protocol extraction from event graph
      return errorResult('Not yet implemented: protocol save from event graph');
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
}
