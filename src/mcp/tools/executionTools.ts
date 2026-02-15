/**
 * MCP tools for the robot execution pipeline and measurement ingest.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';
import type { RecordFilter } from '../../store/types.js';

export function registerExecutionTools(server: McpServer, ctx: AppContext, registry?: ToolRegistry): void {
  // planned_run_create — Create a planned run with bindings
  dualRegister(server, registry,
    'planned_run_create',
    'Create a planned run from a protocol or event graph. Binds abstract roles to concrete instances. TODO: full implementation pending.',
    {
      title: z.string().describe('Title for the planned run'),
      sourceType: z.enum(['protocol', 'event-graph']).describe('Source type'),
      sourceId: z.string().describe('Source record ID (protocol or event graph)'),
      bindings: z.record(z.string(), z.unknown()).optional().describe('Role bindings (labware, materials, instruments, parameters)'),
    },
    async () => {
      // TODO: Implement planned run creation with binding resolution
      return errorResult('Not yet implemented: planned run creation');
    }
  );

  // planned_run_compile — Compile to robot plan
  dualRegister(server, registry,
    'planned_run_compile',
    'Compile a planned run to a platform-specific robot plan. TODO: translator logic not yet implemented.',
    {
      plannedRunId: z.string().describe('Planned run recordId to compile'),
      targetPlatform: z.enum(['opentrons_ot2', 'opentrons_flex', 'integra_assist']).describe('Target robot platform'),
    },
    async () => {
      // TODO: Implement robot plan compilation
      return errorResult('Not yet implemented: robot plan compilation');
    }
  );

  // measurement_ingest — Ingest instrument data
  dualRegister(server, registry,
    'measurement_ingest',
    'Ingest instrument output and create a measurement record. TODO: parser implementations pending.',
    {
      instrumentRef: z.record(z.string(), z.unknown()).optional().describe('Instrument reference'),
      eventGraphRef: z.record(z.string(), z.unknown()).optional().describe('Event graph reference'),
      readEventRef: z.string().optional().describe('Read event ID within the event graph'),
      parserId: z.string().optional().describe('Parser identifier to use'),
    },
    async () => {
      // TODO: Implement measurement ingest with parsers
      return errorResult('Not yet implemented: measurement ingest');
    }
  );

  // measurement_query — Query measurement by well/channel
  dualRegister(server, registry,
    'measurement_query',
    'Query measurement data for specific wells and/or channels.',
    {
      measurementId: z.string().describe('Measurement recordId'),
      well: z.string().optional().describe('Well address to filter by (e.g., "A1")'),
      channelId: z.string().optional().describe('Channel ID to filter by'),
    },
    async (args) => {
      try {
        const envelope = await ctx.store.get(args.measurementId);
        if (!envelope) {
          return errorResult(`Measurement not found: ${args.measurementId}`);
        }

        const payload = envelope.payload as { data?: Array<{ well: string; channelId?: string }> };
        let data = payload.data ?? [];

        if (args.well !== undefined) {
          data = data.filter((d) => d.well === args.well);
        }
        if (args.channelId !== undefined) {
          data = data.filter((d) => d.channelId === args.channelId);
        }

        return jsonResult({ measurementId: args.measurementId, data, total: data.length });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // plate_map_export — Export plate map CSV
  dualRegister(server, registry,
    'plate_map_export',
    'Export a plate map as CSV from an event graph. TODO: export logic not yet implemented.',
    {
      eventGraphId: z.string().describe('Event graph ID to export'),
      labwareId: z.string().optional().describe('Specific labware to export (default: all)'),
      format: z.enum(['csv', 'tsv']).optional().describe('Export format (default: csv)'),
    },
    async () => {
      // TODO: Implement plate map CSV export
      return errorResult('Not yet implemented: plate map export');
    }
  );

  // planned_run_list — List planned runs
  dualRegister(server, registry,
    'planned_run_list',
    'List planned run records with optional state filter.',
    {
      state: z.string().optional().describe('Filter by state (draft, ready, executing, completed, failed)'),
      limit: z.number().optional().describe('Maximum records to return (default 50)'),
    },
    async (args) => {
      try {
        const filter: RecordFilter = {
          kind: 'planned-run',
          limit: args.limit ?? 50,
        };
        const records = await ctx.store.list(filter);
        // Client-side state filter (store doesn't support custom field filters)
        let filtered = records;
        if (args.state !== undefined) {
          filtered = records.filter((r) => {
            const payload = r.payload as { state?: string };
            return payload.state === args.state;
          });
        }
        return jsonResult({ records: filtered, total: filtered.length });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );
}
