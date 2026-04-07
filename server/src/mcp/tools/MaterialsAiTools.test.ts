import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { initializeApp, type AppContext } from '../../server.js';
import { ToolRegistry } from '../../ai/ToolRegistry.js';
import { registerMaterialsAiTools } from './materialsAiTools.js';

const MATERIAL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material.schema.yaml';

describe('materials AI MCP tools', () => {
  let ctx: AppContext;
  let registry: ToolRegistry;
  const repoRoot = resolve(process.cwd());
  const recordsDir = resolve(repoRoot, 'tmp/materials-ai-tools-test/records');

  beforeAll(async () => {
    await mkdir(recordsDir, { recursive: true });

    ctx = await initializeApp(repoRoot, {
      recordsDir: 'tmp/materials-ai-tools-test/records',
      logLevel: 'silent',
    });

    await ctx.store.create({
      envelope: {
        recordId: 'MAT-TEST-DMSO',
        schemaId: MATERIAL_SCHEMA_ID,
        payload: {
          kind: 'material',
          id: 'MAT-TEST-DMSO',
          name: 'DMSO',
          domain: 'chemical',
        },
      },
      skipLint: true,
    });

    registry = new ToolRegistry();
    registerMaterialsAiTools(new McpServer({ name: 'test-materials', version: '1.0.0' }), ctx, registry);
  });

  afterAll(async () => {
    await rm(resolve(repoRoot, 'tmp/materials-ai-tools-test'), { recursive: true, force: true });
  });

  it('compiles a normalized material intent through the tool registry', async () => {
    const tool = registry.get('material_compile_intent');
    expect(tool).toBeDefined();

    const result = await tool!.handler({
      normalizedIntent: {
        domain: 'materials',
        intentId: 'intent-tool-1',
        version: '1',
        summary: 'Add 1 mM Fenofibrate in DMSO to B2',
        requiredFacts: ['targetRole', 'targetWell'],
        payload: {
          intentType: 'add_material_to_well',
          analyteName: 'Fenofibrate',
          solventName: 'DMSO',
          concentration: { value: 1, unit: 'mM', basis: 'molar' },
          targetRole: 'target_plate',
          targetWell: 'B2',
          quantity: { value: 10, unit: 'uL' },
        },
      },
      activeScope: {
        organizationId: 'org-1',
      },
      policyProfiles: [
        {
          id: 'org-default',
          scope: 'organization',
          scopeId: 'org-1',
          settings: {
            allowAutoCreate: 'allow',
            allowPlaceholders: 'allow',
            allowRemediation: 'allow',
          },
          materialSettings: {
            mode: 'semantic-planning',
          },
        },
      ],
      actor: 'tool-test',
    });

    const text = result.content[0] && 'text' in result.content[0] ? result.content[0].text : '';
    const parsed = JSON.parse(text);
    expect(parsed.resolved.analyte.recordId).toMatch(/^MAT-/);
    expect(parsed.resolved.analyte.label).toBe('Fenofibrate');
    expect(parsed.eventDraft.details.target_well).toBe('B2');
    expect(parsed.provenance.actor).toBe('tool-test');
  });
});
