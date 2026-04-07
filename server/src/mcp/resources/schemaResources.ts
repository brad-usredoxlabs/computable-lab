/**
 * MCP resources for schema discovery.
 */

import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';

export function registerSchemaResources(server: McpServer, ctx: AppContext): void {
  server.resource(
    'schema',
    new ResourceTemplate('schema://{schemaId}', {
      list: async () => {
        const ids = ctx.schemaRegistry.getAllIds();
        return {
          resources: ids.map((id) => ({
            uri: `schema://${encodeURIComponent(id)}`,
            name: id,
            mimeType: 'application/json',
          })),
        };
      },
    }),
    { description: 'JSON Schema definition' },
    async (uri, variables) => {
      const schemaId = decodeURIComponent(String(variables.schemaId));
      const entry = ctx.schemaRegistry.getById(schemaId);
      if (!entry) {
        return { contents: [] };
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(entry.schema, null, 2),
          },
        ],
      };
    }
  );
}
