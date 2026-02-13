/**
 * MCP stdio transport entry point.
 *
 * Enables local Claude Code usage via stdio (no HTTP server needed).
 * Usage: npx tsx src/mcp-stdio.ts [basePath]
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { initializeApp } from './server.js';
import { createMcpServer } from './mcp/index.js';

async function main() {
  const basePath = process.argv[2] || process.env.APP_BASE_PATH || process.cwd();

  // Redirect console output to stderr so stdout stays clean for MCP JSON-RPC
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = (...args: unknown[]) => originalLog.call(console, ...args.map(String));
  console.warn = (...args: unknown[]) => originalWarn.call(console, ...args.map(String));

  // Redirect all console to stderr
  console.log = (...args: unknown[]) => process.stderr.write(args.map(String).join(' ') + '\n');
  console.warn = (...args: unknown[]) => process.stderr.write(args.map(String).join(' ') + '\n');
  console.error = (...args: unknown[]) => process.stderr.write(args.map(String).join(' ') + '\n');

  console.log(`Initializing computable-lab MCP server (base: ${basePath})`);

  const ctx = await initializeApp(basePath);
  const mcpServer = createMcpServer(ctx);

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  console.log('MCP server connected via stdio');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
