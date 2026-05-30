/**
 * Factory function for creating the MCP server with all tools, resources, and prompts.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../server.js';
import type { ToolRegistry } from '../ai/ToolRegistry.js';
import { registerAllTools } from './tools/index.js';
import { registerAllResources } from './resources/index.js';
import { registerAllPrompts } from './prompts/index.js';
import { registerToolPlugins } from './toolPlugin.js';

/**
 * Create and configure an MCP server bound to the given AppContext.
 *
 * When a `toolRegistry` is provided, tools are dual-registered into it
 * so the AI agent orchestrator can call them in-process.
 *
 * Async because external tool plugins listed in `CLA_MCP_TOOL_PLUGINS`
 * are dynamically imported after the built-in tool set is registered.
 */
export async function createMcpServer(ctx: AppContext, toolRegistry?: ToolRegistry): Promise<McpServer> {
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

  registerAllTools(server, ctx, toolRegistry);
  registerAllResources(server, ctx);
  registerAllPrompts(server, ctx);
  await registerToolPlugins(server, ctx, toolRegistry);

  return server;
}
