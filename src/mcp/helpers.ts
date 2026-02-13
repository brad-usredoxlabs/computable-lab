/**
 * MCP response helpers.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Create a text content result.
 */
export function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

/**
 * Create a JSON content result.
 */
export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/**
 * Create an error result.
 */
export function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}
