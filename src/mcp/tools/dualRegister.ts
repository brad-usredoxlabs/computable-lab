/**
 * Dual-registration helper that registers a tool with both the MCP server
 * and the AI agent's ToolRegistry in a single call.
 *
 * This keeps the two registries in sync without modifying every tool file's
 * handler logic — just swap `server.tool(...)` for `dualRegister(...)`.
 */

import { z } from 'zod';
import type { McpServer, ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';

type ZodShape = Record<string, z.ZodTypeAny>;

/**
 * Register a tool with the MCP server and optionally with the ToolRegistry.
 *
 * When `registry` is undefined (e.g. stdio mode without AI), this is
 * equivalent to a plain `server.tool()` call.
 */
export function dualRegister<T extends ZodShape>(
  server: McpServer,
  registry: ToolRegistry | undefined,
  name: string,
  description: string,
  zodShape: T,
  handler: ToolCallback<T>,
): void {
  // Register with MCP server (always)
  server.tool(name, description, zodShape, handler);

  // Register with ToolRegistry (when present)
  if (registry) {
    const jsonSchema = z.toJSONSchema(z.object(zodShape));
    registry.register({
      name,
      description,
      inputSchema: jsonSchema as Record<string, unknown>,
      handler: async (args) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await handler(args as any, {} as never);
        return result;
      },
    });
  }
}
