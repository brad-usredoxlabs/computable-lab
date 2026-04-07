/**
 * Parallel tool registry for the AI agent.
 *
 * Stores tool metadata and handlers alongside (but independent of)
 * the MCP server's internal registry. This allows the agent orchestrator
 * to enumerate tools and call handlers in-process without going through
 * the MCP protocol.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * A registered tool entry.
 */
export interface ToolEntry {
  name: string;
  description: string;
  /** JSON Schema for the tool's input parameters. */
  inputSchema: Record<string, unknown>;
  /** The async handler function (same implementation as the MCP tool). */
  handler: (args: Record<string, unknown>) => Promise<CallToolResult>;
}

/**
 * Simple parallel registry for tool entries.
 */
export class ToolRegistry {
  private tools = new Map<string, ToolEntry>();

  /** Register a tool entry. Overwrites if name already exists. */
  register(entry: ToolEntry): void {
    this.tools.set(entry.name, entry);
  }

  /** Get a tool entry by name. */
  get(name: string): ToolEntry | undefined {
    return this.tools.get(name);
  }

  /** List all registered tool entries. */
  list(): ToolEntry[] {
    return Array.from(this.tools.values());
  }

  /** List all registered tool names. */
  listNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /** Number of registered tools. */
  get size(): number {
    return this.tools.size;
  }
}
