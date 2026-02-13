/**
 * Factory function for creating the MCP server with all tools, resources, and prompts.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../server.js';
import { registerAllTools } from './tools/index.js';
import { registerAllResources } from './resources/index.js';
import { registerAllPrompts } from './prompts/index.js';

/**
 * Create and configure an MCP server bound to the given AppContext.
 */
export function createMcpServer(ctx: AppContext): McpServer {
  const server = new McpServer(
    { name: 'computable-lab', version: '1.0.0' },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  registerAllTools(server, ctx);
  registerAllResources(server, ctx);
  registerAllPrompts(server, ctx);

  return server;
}
