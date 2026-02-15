/**
 * Aggregator that registers all MCP tools on the server.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { registerRecordTools } from './recordTools.js';
import { registerSchemaTools } from './schemaTools.js';
import { registerValidationTools } from './validationTools.js';
import { registerTreeTools } from './treeTools.js';
import { registerLibraryTools } from './libraryTools.js';
import { registerOntologyTools } from './ontologyTools.js';
import { registerGitTools } from './gitTools.js';
import { registerNcbiTools } from './ncbiTools.js';
import { registerUniprotTools } from './uniprotTools.js';
import { registerPdbTools } from './pdbTools.js';
import { registerReactomeTools } from './reactomeTools.js';
import { registerChemTools } from './chemTools.js';
import { registerEuropmcTools } from './europmcTools.js';
import { registerProtocolTools } from './protocolTools.js';
import { registerExecutionTools } from './executionTools.js';

export function registerAllTools(server: McpServer, ctx: AppContext, registry?: ToolRegistry): void {
  registerRecordTools(server, ctx, registry);
  registerSchemaTools(server, ctx, registry);
  registerValidationTools(server, ctx, registry);
  registerTreeTools(server, ctx, registry);
  registerLibraryTools(server, ctx, registry);
  registerOntologyTools(server, registry);
  registerGitTools(server, ctx, registry);

  // External knowledge base tools
  registerNcbiTools(server, registry);
  registerUniprotTools(server, registry);
  registerPdbTools(server, registry);
  registerReactomeTools(server, registry);
  registerChemTools(server, registry);
  registerEuropmcTools(server, registry);

  // Protocol management & execution pipeline tools
  registerProtocolTools(server, ctx, registry);
  registerExecutionTools(server, ctx, registry);
}
