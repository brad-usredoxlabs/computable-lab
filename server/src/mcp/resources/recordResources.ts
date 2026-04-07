/**
 * MCP resources for record access.
 */

import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';

export function registerRecordResources(server: McpServer, ctx: AppContext): void {
  server.resource(
    'record',
    new ResourceTemplate('record://{recordId}', {
      list: async () => {
        const records = await ctx.store.list({ limit: 100 });
        return {
          resources: records.map((env) => ({
            uri: `record://${encodeURIComponent(env.recordId)}`,
            name: env.recordId,
            mimeType: 'application/json',
          })),
        };
      },
    }),
    { description: 'Record envelope with payload and metadata' },
    async (uri, variables) => {
      const recordId = decodeURIComponent(String(variables.recordId));
      const envelope = await ctx.store.get(recordId);
      if (!envelope) {
        return { contents: [] };
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(envelope, null, 2),
          },
        ],
      };
    }
  );
}
