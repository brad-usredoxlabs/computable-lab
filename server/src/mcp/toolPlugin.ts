import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../server.js';
import type { ToolRegistry } from '../ai/ToolRegistry.js';

/**
 * Contract for external MCP tool plugins. A plugin is an ES module whose
 * default export (or a named `plugin` export) implements this interface.
 *
 * The host loads plugins listed in `CLA_MCP_TOOL_PLUGINS` (colon-separated
 * module specifiers or absolute file paths) after `registerAllTools` has
 * finished, so a plugin can replace or augment built-in tools.
 *
 * Plugins are the documented surface for AI overlays (e.g. the appliance,
 * or a third-party Hamilton overlay) to contribute additional tools to the
 * host's MCP server without forking the host.
 */
export interface McpToolPlugin {
  name: string
  register(
    server: McpServer,
    ctx: AppContext,
    registry?: ToolRegistry,
  ): void | Promise<void>
}

function parsePluginSpecs(envValue: string | undefined): string[] {
  if (!envValue) return []
  return envValue
    .split(':')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export async function registerToolPlugins(
  server: McpServer,
  ctx: AppContext,
  registry?: ToolRegistry,
): Promise<void> {
  const specs = parsePluginSpecs(process.env.CLA_MCP_TOOL_PLUGINS)
  for (const spec of specs) {
    try {
      const mod = (await import(spec)) as {
        default?: McpToolPlugin
        plugin?: McpToolPlugin
      }
      const plugin = mod.default ?? mod.plugin
      if (!plugin || typeof plugin.register !== 'function') {
        console.warn(
          `MCP plugin '${spec}' has no default or named 'plugin' export with register() — skipping`,
        )
        continue
      }
      console.log(`MCP plugin: registering '${plugin.name}' from ${spec}`)
      await plugin.register(server, ctx, registry)
    } catch (err) {
      console.error(`Failed to load MCP plugin '${spec}':`, err)
    }
  }
}
