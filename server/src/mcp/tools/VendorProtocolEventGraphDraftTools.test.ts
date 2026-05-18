import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolRegistry } from '../../ai/ToolRegistry.js';
import { DEFAULT_CONFIG } from '../../config/types.js';
import type { AppContext } from '../../server.js';
import { registerVendorProtocolEventGraphDraftTools } from './vendorProtocolEventGraphDraftTools.js';

function createContext(workspaceRoot: string): AppContext {
  return {
    schemaRegistry: {} as AppContext['schemaRegistry'],
    validator: {} as AppContext['validator'],
    lintEngine: {} as AppContext['lintEngine'],
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

describe('vendor protocol event graph draft MCP tools', () => {
  it('registers a ToolRegistry tool that builds a draft compile prompt without compiling', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'vendor-protocol-draft-tool-'));
    try {
      const registry = new ToolRegistry();
      const mcp = new McpServer({ name: 'test', version: '0.0.0' });
      registerVendorProtocolEventGraphDraftTools(mcp, createContext(workspaceRoot), registry);

      const tool = registry.get('vendor_protocol_draft_event_graph');
      expect(tool).toBeDefined();
      const result = await tool!.handler({
        compile: false,
        candidate: {
          kind: 'vendor-protocol-candidate',
          source: {
            documentId: 'doc-tool-draft',
            filename: 'protocol.txt',
            title: 'Tool Draft Protocol',
            pageCount: 1,
          },
          title: 'Tool Draft Protocol',
          sections: [],
          materials: [],
          equipment: [],
          labware: [],
          steps: [{
            id: 'step-1',
            stepNumber: 1,
            sourceText: 'Add 100 ul Binding Buffer.',
            actions: [],
            conditions: {},
            materials: [],
            labware: [],
            equipment: [],
            notes: [],
            branches: [],
            provenance: { documentId: 'doc-tool-draft', pageStart: 1 },
            confidence: 0.8,
          }],
          tables: [],
          notes: [],
          outputs: [],
          diagnostics: [],
        },
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].type).toBe('text');
      const body = JSON.parse(result.content[0].text);
      expect(body.compileStatus).toBe('not_run');
      expect(body.compilePrompt).toContain('1. Add 100 ul Binding Buffer.');
      expect(body.eventGraph.events).toEqual([]);
      expect(body.draftPath).toMatch(/^artifacts\/foundry\/protocol-event-graph-drafts\//);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
