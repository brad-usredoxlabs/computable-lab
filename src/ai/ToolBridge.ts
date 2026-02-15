/**
 * Bridges the ToolRegistry to OpenAI-format tool definitions
 * and executes tool calls in-process for the agent orchestrator.
 */

import type { ToolRegistry } from './ToolRegistry.js';
import type { ToolBridge, ToolDefinition, ToolExecutionResult } from './types.js';

/**
 * Tools the agent is allowed to use (read-only + validation).
 * Write operations are explicitly excluded.
 */
export const AGENT_ALLOWED_TOOLS = [
  // Records (read-only)
  'record_get',
  'record_list',
  'record_search',
  // Schema
  'schema_get',
  // Validation
  'validate_payload',
  'lint_payload',
  // Library (read-only)
  'library_search',
  // Ontology
  'ontology_search',
  // Chemistry
  'chebi_search',
  'chebi_fetch',
  'pubchem_search',
  // Genomics
  'ncbi_gene_search',
  'uniprot_search',
  // Tree navigation
  'tree_studies',
  'tree_records_for_run',
] as const;

/**
 * Create a ToolBridge that filters the registry to an allowlist
 * and converts entries to OpenAI-compatible tool definitions.
 */
export function createToolBridge(
  registry: ToolRegistry,
  allowedTools: readonly string[] = AGENT_ALLOWED_TOOLS,
): ToolBridge {
  return {
    getToolDefinitions(): ToolDefinition[] {
      return allowedTools
        .map((name) => {
          const entry = registry.get(name);
          if (!entry) return null;
          return {
            type: 'function' as const,
            function: {
              name: entry.name,
              description: entry.description,
              parameters: entry.inputSchema,
            },
          };
        })
        .filter((d): d is ToolDefinition => d !== null);
    },

    async executeTool(
      name: string,
      args: Record<string, unknown>,
    ): Promise<ToolExecutionResult> {
      const start = performance.now();

      // Check allowlist
      if (!allowedTools.includes(name)) {
        return {
          success: false,
          content: JSON.stringify({ error: `Tool "${name}" is not allowed for the agent` }),
          durationMs: performance.now() - start,
        };
      }

      const entry = registry.get(name);
      if (!entry) {
        return {
          success: false,
          content: JSON.stringify({ error: `Tool "${name}" not found in registry` }),
          durationMs: performance.now() - start,
        };
      }

      try {
        const result = await entry.handler(args);
        const isError = result.isError === true;
        // Extract text content from CallToolResult
        const text = result.content
          .map((c) => ('text' in c ? c.text : ''))
          .join('\n');

        return {
          success: !isError,
          content: text,
          durationMs: performance.now() - start,
        };
      } catch (err) {
        return {
          success: false,
          content: JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
          }),
          durationMs: performance.now() - start,
        };
      }
    },
  };
}
