import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolRegistry } from '../../ai/ToolRegistry.js';
import { DEFAULT_CONFIG } from '../../config/types.js';
import type { AppContext } from '../../server.js';
import { extractLabwareSpecCandidate } from '../../ingestion/labware-spec/LabwareSpecCandidateService.js';
import { registerOpentronsLabwareDefinitionTools } from './opentronsLabwareDefinitionTools.js';

function createContext(workspaceRoot: string): AppContext {
  return {
    schemaRegistry: {} as AppContext['schemaRegistry'],
    validator: {} as AppContext['validator'],
    lintEngine: {} as AppContext['lintEngine'],
    repoAdapter: {} as AppContext['repoAdapter'],
    store: {
      get: async () => null,
    } as AppContext['store'],
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

describe('opentrons labware definition MCP tools', () => {
  it('registers a ToolRegistry tool that generates custom labware JSON from a candidate', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'opentrons-labware-tool-'));
    try {
      const candidate = await extractLabwareSpecCandidate({
        workspaceRoot,
        vendor: 'Corning',
        text: [
          'Corning 3595 96-well flat bottom plate',
          'Catalog No. 3595',
          '96 well 8 x 12 polystyrene clear plate',
          'Well volume capacity: 360 uL',
          'Pitch: 9 mm',
          'Dimensions: 127.8 x 85.5 x 14.4 mm',
          'Well diameter: 6.4 mm',
          'Well depth: 10.8 mm',
        ].join('\n'),
      });
      const registry = new ToolRegistry();
      const mcp = new McpServer({ name: 'test', version: '0.0.0' });
      registerOpentronsLabwareDefinitionTools(mcp, createContext(workspaceRoot), registry);

      const tool = registry.get('opentrons_labware_generate_definition');
      expect(tool).toBeDefined();
      const result = await tool!.handler({
        candidatePath: candidate.candidatePath,
        loadName: 'corning_3595_96_well_plate',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].type).toBe('text');
      const body = JSON.parse(result.content[0].text);
      expect(body.status).toBe('generated');
      expect(body.definition.parameters.loadName).toBe('corning_3595_96_well_plate');
      expect(body.definition.ordering[0][0]).toBe('A1');
      expect(body.artifactPath).toMatch(/^artifacts\/foundry\/opentrons-labware-definitions\//);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
