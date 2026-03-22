import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { initializeApp, type AppContext } from '../../server.js';
import { ToolRegistry } from '../../ai/ToolRegistry.js';
import { registerAiPlanningTools } from './aiPlanningTools.js';

const MATERIAL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material.schema.yaml';
const MATERIAL_SPEC_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml';
const RECIPE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/recipe.schema.yaml';
const ALIQUOT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/aliquot.schema.yaml';
const VENDOR_PRODUCT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml';

describe('ai planning MCP tools', () => {
  let ctx: AppContext;
  let registry: ToolRegistry;
  const repoRoot = resolve(process.cwd());
  const recordsDir = resolve(repoRoot, 'tmp/ai-planning-tools-test/records');

  beforeAll(async () => {
    await mkdir(recordsDir, { recursive: true });

    ctx = await initializeApp(repoRoot, {
      recordsDir: 'tmp/ai-planning-tools-test/records',
      logLevel: 'silent',
    });

    await ctx.store.create({
      envelope: {
        recordId: 'MAT-PR9-TEST-CLO',
        schemaId: MATERIAL_SCHEMA_ID,
        payload: {
          kind: 'material',
          id: 'MAT-PR9-TEST-CLO',
          name: 'Clofibrate',
          domain: 'chemical',
        },
      },
      skipLint: true,
    });

    await ctx.store.create({
      envelope: {
        recordId: 'MAT-PR9-TEST-DMSO',
        schemaId: MATERIAL_SCHEMA_ID,
        payload: {
          kind: 'material',
          id: 'MAT-PR9-TEST-DMSO',
          name: 'DMSO',
          domain: 'chemical',
        },
      },
      skipLint: true,
    });

    await ctx.store.create({
      envelope: {
        recordId: 'MSP-PR9-TEST-CLO-1MM',
        schemaId: MATERIAL_SPEC_SCHEMA_ID,
        payload: {
          kind: 'material-spec',
          id: 'MSP-PR9-TEST-CLO-1MM',
          name: '1 mM Clofibrate in DMSO',
          material_ref: { kind: 'record', id: 'MAT-PR9-TEST-CLO', type: 'material', label: 'Clofibrate' },
          formulation: {
            concentration: { value: 1, unit: 'mM', basis: 'molar' },
            solvent_ref: { kind: 'record', id: 'MAT-PR9-TEST-DMSO', type: 'material', label: 'DMSO' },
            composition: [
              {
                component_ref: { kind: 'record', id: 'MAT-PR9-TEST-CLO', type: 'material', label: 'Clofibrate' },
                role: 'solute',
                concentration: { value: 1, unit: 'mM', basis: 'molar' },
              },
              {
                component_ref: { kind: 'record', id: 'MAT-PR9-TEST-DMSO', type: 'material', label: 'DMSO' },
                role: 'solvent',
              },
            ],
          },
        },
      },
      skipLint: true,
    });

    await ctx.store.create({
      envelope: {
        recordId: 'RCP-PR9-TEST-CLO-1MM',
        schemaId: RECIPE_SCHEMA_ID,
        payload: {
          kind: 'recipe',
          id: 'RCP-PR9-TEST-CLO-1MM',
          name: 'Prepare 1 mM Clofibrate in DMSO',
          input_roles: [
            {
              role_id: 'solute',
              role_type: 'solute',
              material_ref: { kind: 'record', id: 'MAT-PR9-TEST-CLO', type: 'material', label: 'Clofibrate' },
              quantity: { value: 1, unit: 'mg' },
            },
            {
              role_id: 'solvent',
              role_type: 'solvent',
              material_ref: { kind: 'record', id: 'MAT-PR9-TEST-DMSO', type: 'material', label: 'DMSO' },
              quantity: { value: 1, unit: 'mL' },
            },
          ],
          output_material_spec_ref: { kind: 'record', id: 'MSP-PR9-TEST-CLO-1MM', type: 'material-spec', label: '1 mM Clofibrate in DMSO' },
          output: {
            concentration: { value: 1, unit: 'mM', basis: 'molar' },
            solvent_ref: { kind: 'record', id: 'MAT-PR9-TEST-DMSO', type: 'material', label: 'DMSO' },
            composition: [
              {
                component_ref: { kind: 'record', id: 'MAT-PR9-TEST-CLO', type: 'material', label: 'Clofibrate' },
                role: 'solute',
                concentration: { value: 1, unit: 'mM', basis: 'molar' },
              },
              {
                component_ref: { kind: 'record', id: 'MAT-PR9-TEST-DMSO', type: 'material', label: 'DMSO' },
                role: 'solvent',
              },
            ],
          },
          steps: [
            {
              order: 1,
              instruction: 'Dissolve clofibrate in DMSO.',
            },
          ],
        },
      },
      skipLint: true,
    });

    await ctx.store.create({
      envelope: {
        recordId: 'VPR-PR9-TEST-RPMI',
        schemaId: VENDOR_PRODUCT_SCHEMA_ID,
        payload: {
          kind: 'vendor-product',
          id: 'VPR-PR9-TEST-RPMI',
          name: 'RPMI 1640 medium',
          vendor: 'Test Vendor',
          catalog_number: 'RPMI-1640',
          material_ref: { kind: 'record', id: 'MAT-PR9-TEST-DMSO', type: 'material', label: 'DMSO' },
          declared_composition: [
            {
              component_ref: { kind: 'record', id: 'MAT-PR9-TEST-GLUCOSE', type: 'material', label: 'Glucose' },
              role: 'solute',
              concentration: { value: 2, unit: 'g/L', basis: 'mass_per_volume' },
            },
            {
              component_ref: { kind: 'record', id: 'MAT-PR9-TEST-BICARB', type: 'material', label: 'Sodium bicarbonate' },
              role: 'buffer_component',
            },
          ],
        },
      },
      skipLint: true,
    });

    await ctx.store.create({
      envelope: {
        recordId: 'ALQ-PR9-TEST-CLO-001',
        schemaId: ALIQUOT_SCHEMA_ID,
        payload: {
          kind: 'aliquot',
          id: 'ALQ-PR9-TEST-CLO-001',
          name: 'Clofibrate stock tube',
          material_spec_ref: { kind: 'record', id: 'MSP-PR9-TEST-CLO-1MM', type: 'material-spec', label: '1 mM Clofibrate in DMSO' },
          volume: { value: 500, unit: 'uL' },
          status: 'available',
          lot: {
            vendor: 'Sigma',
            catalog_number: 'C123',
            lot_number: 'LOT-1',
          },
        },
      },
      skipLint: true,
    });

    registry = new ToolRegistry();
    const mcp = new McpServer({ name: 'test', version: '0.0.0' });
    registerAiPlanningTools(mcp, ctx, registry);
  });

  afterAll(async () => {
    await rm(resolve(repoRoot, 'tmp/ai-planning-tools-test'), { recursive: true, force: true });
  });

  it('formulations_summary returns concentration-bearing output details', async () => {
    const tool = registry.get('formulations_summary');
    expect(tool).toBeDefined();
    const result = await tool!.handler({ query: 'clofibrate' });
    const text = result.content[0];
    expect(text.type).toBe('text');
    const body = JSON.parse(text.text);
    const item = body.items.find((entry: { recipeId: string }) => entry.recipeId === 'RCP-PR9-TEST-CLO-1MM');
    expect(item).toBeDefined();
    const formulation = item as NonNullable<typeof item>;
    expect(formulation.outputSpec.concentration).toMatchObject({ value: 1, unit: 'mM', basis: 'molar' });
    expect(formulation.outputSpec.composition).toHaveLength(2);
    expect(formulation.outputSpec.solventRef).toMatchObject({ id: 'MAT-PR9-TEST-DMSO', label: 'DMSO' });
  });

  it('material_composition_get resolves inherited aliquot concentration details', async () => {
    const tool = registry.get('material_composition_get');
    expect(tool).toBeDefined();
    const result = await tool!.handler({ aliquotId: 'ALQ-PR9-TEST-CLO-001' });
    const text = result.content[0];
    expect(text.type).toBe('text');
    const body = JSON.parse(text.text);
    expect(body.recordType).toBe('aliquot');
    expect(body.concentration).toMatchObject({ value: 1, unit: 'mM', basis: 'molar' });
    expect(body.composition).toHaveLength(2);
    expect(body.solventRef).toMatchObject({ id: 'MAT-PR9-TEST-DMSO', label: 'DMSO' });
    expect(body.materialSpec).toMatchObject({ id: 'MSP-PR9-TEST-CLO-1MM' });
  });

  it('material_composition_get returns vendor-product composition details', async () => {
    const tool = registry.get('material_composition_get');
    expect(tool).toBeDefined();
    const result = await tool!.handler({ recordId: 'VPR-PR9-TEST-RPMI' });
    const text = result.content[0];
    expect(text.type).toBe('text');
    const body = JSON.parse(text.text);
    expect(body.recordType).toBe('vendor-product');
    expect(body.composition).toHaveLength(2);
    expect(body.composition[0]).toMatchObject({
      role: 'solute',
      concentration: { value: 2, unit: 'g/L', basis: 'mass_per_volume' },
    });
  });
});
