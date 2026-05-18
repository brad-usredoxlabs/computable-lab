import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolRegistry } from '../../ai/ToolRegistry.js';
import { DEFAULT_CONFIG } from '../../config/types.js';
import type { AppContext } from '../../server.js';
import { registerLabwareSpecCandidateTools } from './labwareSpecCandidateTools.js';

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

describe('labware spec candidate MCP tools', () => {
  it('registers a ToolRegistry tool that extracts a labware-definition draft from text', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'labware-spec-tool-'));
    try {
      const registry = new ToolRegistry();
      const mcp = new McpServer({ name: 'test', version: '0.0.0' });
      registerLabwareSpecCandidateTools(mcp, createContext(workspaceRoot), registry);

      const tool = registry.get('labware_spec_extract_candidate');
      expect(tool).toBeDefined();
      const result = await tool!.handler({
        vendor: 'Thermo Fisher',
        text: [
          'Thermo Fisher 12345 96-well PCR plate',
          'Cat. No. AB12345',
          '96 well 8 x 12 polypropylene plate',
          'Maximum well volume: 200 uL',
          'well diameter 5.5 mm',
        ].join('\n'),
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].type).toBe('text');
      const body = JSON.parse(result.content[0].text);
      expect(body.extracted.vendor).toBe('Thermo Fisher');
      expect(body.extracted.wellCount).toBe(96);
      expect(body.extracted.physicalGeometry).toMatchObject({
        mainMaterial: 'polypropylene',
        wellDiameterMm: 5.5,
      });
      expect(body.draftDefinition.kind).toBe('labware-definition');
      expect(body.candidatePath).toMatch(/^artifacts\/foundry\/labware-spec-candidates\//);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
