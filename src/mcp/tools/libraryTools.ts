/**
 * MCP tools for library search and ontology term promotion.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';

const LIBRARY_TYPES = ['material', 'labware', 'assay', 'reagent', 'buffer', 'cell_line', 'collection', 'context'] as const;

const LIBRARY_SCHEMA_IDS: Record<string, string> = {
  material: 'lab/material',
  labware: 'lab/labware',
  assay: 'lab/assay',
  reagent: 'lab/reagent',
  buffer: 'lab/buffer',
  cell_line: 'lab/cell-line',
  collection: 'core/collection',
  context: 'core/context',
};

export function registerLibraryTools(server: McpServer, ctx: AppContext, registry?: ToolRegistry): void {
  // library_search — Search library records
  dualRegister(server, registry,
    'library_search',
    `Search library records (materials, labware, assays, reagents, etc.). Valid types: ${LIBRARY_TYPES.join(', ')}`,
    {
      query: z.string().optional().describe('Search query (searches name, id, keywords)'),
      type: z.string().optional().describe('Library type to filter by'),
      limit: z.number().optional().describe('Maximum results (default 50)'),
    },
    async (args) => {
      try {
        const limit = args.limit ?? 50;
        const typeFilter = args.type;

        // Get schema IDs to query
        const schemaIds = typeFilter && LIBRARY_SCHEMA_IDS[typeFilter]
          ? [LIBRARY_SCHEMA_IDS[typeFilter]!]
          : Object.values(LIBRARY_SCHEMA_IDS);

        const allRecords = [];
        for (const schemaId of schemaIds) {
          try {
            const records = await ctx.store.list({ schemaId, limit: 1000 });
            allRecords.push(...records);
          } catch {
            // Schema may not exist
          }
        }

        // Filter by query if provided
        const query = (args.query ?? '').toLowerCase().trim();
        let results = allRecords;
        if (query.length > 0) {
          results = allRecords.filter((env) => {
            const payload = env.payload as Record<string, unknown>;
            const name = String(payload.name ?? payload.label ?? payload.title ?? '').toLowerCase();
            const id = env.recordId.toLowerCase();
            return name.includes(query) || id.includes(query);
          });
        }

        const items = results.slice(0, limit).map((env) => {
          const payload = env.payload as Record<string, unknown>;
          return {
            recordId: env.recordId,
            schemaId: env.schemaId,
            name: String(payload.name ?? payload.label ?? payload.title ?? env.recordId),
          };
        });

        return jsonResult({ results: items, total: items.length });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // library_promote — Promote an ontology term to a local library record
  dualRegister(server, registry,
    'library_promote',
    'Promote an ontology term to a local library record. Creates a new record from an ontology reference.',
    {
      ontologyRef: z.object({
        id: z.string().describe('Ontology term ID (CURIE, e.g., "CHEBI:16236")'),
        namespace: z.string().describe('Ontology namespace (e.g., "chebi")'),
        label: z.string().describe('Human-readable label'),
        uri: z.string().optional().describe('Full IRI (optional)'),
      }).describe('Source ontology reference'),
      type: z.string().describe(`Library type: ${LIBRARY_TYPES.join(', ')}`),
    },
    async (args) => {
      try {
        const { ontologyRef, type } = args;

        const schemaId = LIBRARY_SCHEMA_IDS[type];
        if (!schemaId) {
          return errorResult(`Invalid library type: ${type}. Valid types: ${LIBRARY_TYPES.join(', ')}`);
        }

        // Generate record ID
        const prefix = type.toUpperCase().slice(0, 3);
        const timestamp = Date.now().toString(36);
        const recordId = `${prefix}-${timestamp}`;

        const ontologyEntry: Record<string, unknown> = {
          kind: 'ontology',
          id: ontologyRef.id,
          namespace: ontologyRef.namespace,
          label: ontologyRef.label,
        };
        if (ontologyRef.uri) {
          ontologyEntry.uri = ontologyRef.uri;
        }

        const payload: Record<string, unknown> = {
          id: recordId,
          name: ontologyRef.label || ontologyRef.id,
          class: [ontologyEntry],
        };

        const result = await ctx.store.create({
          envelope: { recordId, schemaId, payload },
          message: `Promote ontology term ${ontologyRef.id} to local ${type}`,
        });

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
}
