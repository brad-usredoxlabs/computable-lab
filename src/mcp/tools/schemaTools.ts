/**
 * MCP tools for schema discovery and inspection.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import { jsonResult, errorResult } from '../helpers.js';

export function registerSchemaTools(server: McpServer, ctx: AppContext): void {
  // schema_list — List all available schemas
  server.tool(
    'schema_list',
    'List all registered schemas with their IDs, paths, and dependency counts.',
    {},
    async () => {
      try {
        const entries = ctx.schemaRegistry.getAll();
        const summaries = entries.map((entry) => ({
          id: entry.id,
          path: entry.path,
          dependencyCount: ctx.schemaRegistry.getDependencies(entry.id).length,
          dependentCount: ctx.schemaRegistry.getDependents(entry.id).length,
        }));
        return jsonResult({ schemas: summaries, total: summaries.length });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // schema_get — Get full schema definition by ID
  server.tool(
    'schema_get',
    'Get a full JSON Schema definition by its ID, including dependencies and dependents.',
    { schemaId: z.string().describe('The schema $id to look up') },
    async (args) => {
      try {
        const entry = ctx.schemaRegistry.getById(args.schemaId);
        if (!entry) {
          return errorResult(`Schema not found: ${args.schemaId}`);
        }

        return jsonResult({
          id: entry.id,
          path: entry.path,
          schema: entry.schema,
          dependencies: ctx.schemaRegistry.getDependencies(entry.id),
          dependents: ctx.schemaRegistry.getDependents(entry.id),
        });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );
}
