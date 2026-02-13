/**
 * Aggregator that registers all MCP tools on the server.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
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

export function registerAllTools(server: McpServer, ctx: AppContext): void {
  registerRecordTools(server, ctx);
  registerSchemaTools(server, ctx);
  registerValidationTools(server, ctx);
  registerTreeTools(server, ctx);
  registerLibraryTools(server, ctx);
  registerOntologyTools(server);
  registerGitTools(server, ctx);

  // External knowledge base tools
  registerNcbiTools(server);
  registerUniprotTools(server);
  registerPdbTools(server);
  registerReactomeTools(server);
  registerChemTools(server);
  registerEuropmcTools(server);
}
