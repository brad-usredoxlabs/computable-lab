/**
 * MCP tools for record CRUD operations.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';
import { createEnvelope } from '../../types/RecordEnvelope.js';
import type { RecordFilter, CreateRecordOptions, UpdateRecordOptions } from '../../store/types.js';

export function registerRecordTools(server: McpServer, ctx: AppContext, registry?: ToolRegistry): void {
  // record_get — Retrieve a single record by ID
  dualRegister(server, registry,
    'record_get',
    'Get a record by its recordId. Returns the full RecordEnvelope with payload and metadata.',
    { recordId: z.string().describe('The record identifier (e.g., "STU-000001")') },
    async (args) => {
      try {
        const envelope = await ctx.store.get(args.recordId);
        if (!envelope) {
          return errorResult(`Record not found: ${args.recordId}`);
        }
        return jsonResult(envelope);
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // record_list — List records with optional filters
  dualRegister(server, registry,
    'record_list',
    'List records with optional filters. Returns an array of RecordEnvelopes.',
    {
      kind: z.string().optional().describe('Filter by record kind (e.g., "study", "experiment", "run")'),
      schemaId: z.string().optional().describe('Filter by schema ID'),
      limit: z.number().optional().describe('Maximum records to return (default 50)'),
      offset: z.number().optional().describe('Offset for pagination'),
    },
    async (args) => {
      try {
        const filter: RecordFilter = { limit: args.limit ?? 50 };
        if (args.kind !== undefined) filter.kind = args.kind;
        if (args.schemaId !== undefined) filter.schemaId = args.schemaId;
        if (args.offset !== undefined) filter.offset = args.offset;
        const records = await ctx.store.list(filter);
        return jsonResult({ records, total: records.length });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // record_create — Create a new record (returns validation + lint inline)
  dualRegister(server, registry,
    'record_create',
    'Create a new record. Provide schemaId and payload. Returns the created record plus validation and lint results for self-correction.',
    {
      schemaId: z.string().describe('Schema ID to validate against'),
      payload: z.record(z.string(), z.unknown()).describe('Record payload (must include recordId or id field)'),
      message: z.string().optional().describe('Commit message (optional)'),
    },
    async (args) => {
      try {
        const envelope = createEnvelope(args.payload, args.schemaId);
        if (!envelope) {
          return errorResult('Cannot extract recordId from payload. Payload must contain a "recordId" or "id" field.');
        }

        const opts: CreateRecordOptions = { envelope };
        if (args.message !== undefined) opts.message = args.message;
        const result = await ctx.store.create(opts);

        return jsonResult({
          success: result.success,
          envelope: result.envelope,
          validation: result.validation,
          lint: result.lint,
          error: result.error,
        });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // record_update — Update an existing record (returns validation + lint inline)
  dualRegister(server, registry,
    'record_update',
    'Update an existing record. Provide recordId and new payload. Returns validation and lint results for self-correction.',
    {
      recordId: z.string().describe('The record identifier to update'),
      payload: z.record(z.string(), z.unknown()).describe('Updated record payload'),
      message: z.string().optional().describe('Commit message (optional)'),
    },
    async (args) => {
      try {
        const existing = await ctx.store.get(args.recordId);
        if (!existing) {
          return errorResult(`Record not found: ${args.recordId}`);
        }

        const opts: UpdateRecordOptions = {
          envelope: {
            recordId: args.recordId,
            schemaId: existing.schemaId,
            payload: args.payload,
          },
        };
        if (args.message !== undefined) opts.message = args.message;
        const result = await ctx.store.update(opts);

        return jsonResult({
          success: result.success,
          envelope: result.envelope,
          validation: result.validation,
          lint: result.lint,
          error: result.error,
        });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // record_delete — Delete a record
  dualRegister(server, registry,
    'record_delete',
    'Delete a record by its recordId.',
    { recordId: z.string().describe('The record identifier to delete') },
    async (args) => {
      try {
        const result = await ctx.store.delete({ recordId: args.recordId });
        return jsonResult({ success: result.success, error: result.error });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // record_search — Full-text search across records
  dualRegister(server, registry,
    'record_search',
    'Search records by query string. Searches across recordId, title, kind, and path. Returns results sorted by relevance.',
    {
      query: z.string().describe('Search query string'),
      limit: z.number().optional().describe('Maximum results to return (default 50)'),
    },
    async (args) => {
      try {
        const results = await ctx.indexManager.search(args.query, args.limit ?? 50);
        return jsonResult({ results, total: results.length });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );
}
