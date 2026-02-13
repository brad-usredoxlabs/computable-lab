/**
 * Aggregator that registers all MCP resources on the server.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import { registerSchemaResources } from './schemaResources.js';
import { registerRecordResources } from './recordResources.js';

export function registerAllResources(server: McpServer, ctx: AppContext): void {
  registerSchemaResources(server, ctx);
  registerRecordResources(server, ctx);
}
