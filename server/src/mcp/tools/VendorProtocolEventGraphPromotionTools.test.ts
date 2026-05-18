import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolRegistry } from '../../ai/ToolRegistry.js';
import { DEFAULT_CONFIG } from '../../config/types.js';
import type { AppContext } from '../../server.js';
import { registerVendorProtocolEventGraphPromotionTools } from './vendorProtocolEventGraphPromotionTools.js';

function createContext(workspaceRoot: string): AppContext {
  return {
    schemaRegistry: {} as AppContext['schemaRegistry'],
    validator: {
      validate: () => ({ valid: true, errors: [] }),
    } as AppContext['validator'],
    lintEngine: {
      lint: () => ({ valid: true, violations: [], summary: { total: 0, passed: 0, failed: 0, skipped: 0, errors: 0, warnings: 0, info: 0 } }),
    } as AppContext['lintEngine'],
    repoAdapter: {} as AppContext['repoAdapter'],
    store: {} as AppContext['store'],
    indexManager: {} as AppContext['indexManager'],
    uiSpecLoader: {} as AppContext['uiSpecLoader'],
    platformRegistry: {} as AppContext['platformRegistry'],
    lifecycleEngine: {} as AppContext['lifecycleEngine'],
    policyBundleService: {} as AppContext['policyBundleService'],
    workspaceRoot,
    recordsDir: join(workspaceRoot, 'records'),
    schemaDir: join(workspaceRoot, 'schema'),
    appConfig: DEFAULT_CONFIG,
  };
}

describe('vendor protocol event graph promotion MCP tools', () => {
  it('registers a ToolRegistry tool that promotes an inline draft', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'vendor-protocol-promotion-tool-'));
    try {
      const registry = new ToolRegistry();
      const mcp = new McpServer({ name: 'test', version: '0.0.0' });
      registerVendorProtocolEventGraphPromotionTools(mcp, createContext(workspaceRoot), registry);

      const tool = registry.get('vendor_protocol_promote_event_graph');
      expect(tool).toBeDefined();
      const result = await tool!.handler({
        draft: {
          kind: 'vendor-protocol-event-graph-draft',
          sourceProtocolRef: { documentId: 'doc-tool-protocol', title: 'Tool Protocol' },
          candidateSummary: { stepCount: 1, materialCount: 0, labwareCount: 0, equipmentCount: 0 },
          compilePrompt: 'Protocol: Tool Protocol',
          compileStatus: 'complete',
          eventGraph: {
            kind: 'event-graph',
            id: 'vendor-protocol-draft-doc-tool-protocol',
            name: 'Tool Protocol Draft Event Graph',
            description: 'Draft event graph generated from vendor protocol candidate doc-tool-protocol.',
            status: 'draft',
            sourceProtocolRef: { documentId: 'doc-tool-protocol', title: 'Tool Protocol' },
            events: [{
              eventId: 'evt-tool-1',
              event_type: 'add_material',
              details: { material: 'buffer' },
            }],
            labwares: [],
            tags: ['vendor-protocol', 'draft'],
          },
        },
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].type).toBe('text');
      const body = JSON.parse(result.content[0].text);
      expect(body.status).toBe('promoted');
      expect(body.outputPath).toMatch(/^records\/event-graph\//);
      expect(body.validation.valid).toBe(true);
      expect(body.lint.valid).toBe(true);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
