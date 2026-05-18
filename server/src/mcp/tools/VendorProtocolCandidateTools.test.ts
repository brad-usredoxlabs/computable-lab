import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolRegistry } from '../../ai/ToolRegistry.js';
import { DEFAULT_CONFIG } from '../../config/types.js';
import type { AppContext } from '../../server.js';
import { registerVendorProtocolCandidateTools } from './vendorProtocolCandidateTools.js';

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

describe('vendor protocol candidate MCP tools', () => {
  it('registers a ToolRegistry tool that extracts candidate protocol steps from text', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'vendor-protocol-tool-'));
    try {
      const registry = new ToolRegistry();
      const mcp = new McpServer({ name: 'test', version: '0.0.0' });
      registerVendorProtocolCandidateTools(mcp, createContext(workspaceRoot), registry);

      const tool = registry.get('vendor_protocol_extract_candidate');
      expect(tool).toBeDefined();
      const result = await tool!.handler({
        text: 'Example\n\nProtocol\n1. Add 100 ul ZymoBIOMICS MagBinding Buffer.\n2. Mix for 5 minutes.',
        documentId: 'doc-tool-example',
      });
      expect(result.isError).not.toBe(true);
      expect(result.content[0].type).toBe('text');
      const body = JSON.parse(result.content[0].text);
      expect(body.candidate.steps).toHaveLength(2);
      expect(body.candidate.steps[0].actions[0].actionKind).toBe('add');
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
