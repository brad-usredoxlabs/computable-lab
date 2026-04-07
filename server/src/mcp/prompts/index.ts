/**
 * Aggregator that registers all MCP prompts on the server.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import { registerScientificPrompts } from './scientificPrompts.js';

export function registerAllPrompts(server: McpServer, ctx: AppContext): void {
  registerScientificPrompts(server, ctx);
}
