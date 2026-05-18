import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolRegistry } from '../../ai/ToolRegistry.js';
import { DEFAULT_CONFIG } from '../../config/types.js';
import type { AppContext } from '../../server.js';
import { extractLabwareSpecCandidate } from '../../ingestion/labware-spec/LabwareSpecCandidateService.js';
import { registerLabwareSpecPromotionTools } from './labwareSpecPromotionTools.js';

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

describe('labware spec promotion MCP tools', () => {
  it('registers a ToolRegistry tool that promotes a candidate path', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'labware-spec-promotion-tool-'));
    try {
      const candidate = await extractLabwareSpecCandidate({
        workspaceRoot,
        vendor: 'Corning',
        text: [
          'Corning 3595 96-well flat bottom plate',
          'Catalog No. 3595',
          '96 well 8 x 12 polystyrene clear plate',
          'Well volume capacity: 360 uL',
        ].join('\n'),
      });
      const registry = new ToolRegistry();
      const mcp = new McpServer({ name: 'test', version: '0.0.0' });
      registerLabwareSpecPromotionTools(mcp, createContext(workspaceRoot), registry);

      const tool = registry.get('labware_spec_promote_candidate');
      expect(tool).toBeDefined();
      const result = await tool!.handler({ candidatePath: candidate.candidatePath });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].type).toBe('text');
      const body = JSON.parse(result.content[0].text);
      expect(body.status).toBe('promoted');
      expect(body.outputPath).toMatch(/^records\/seed\/labware-definition\//);
      expect(body.sidecarPath).toMatch(/\.promotion\.json$/);
      expect(body.validation.valid).toBe(true);
      expect(body.lint.valid).toBe(true);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
