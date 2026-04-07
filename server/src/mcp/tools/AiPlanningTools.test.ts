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
const OPERATION_TEMPLATE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/operation-template.schema.yaml';

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
          molecular_weight: { value: 242.27, unit: 'g/mol' },
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
        recordId: 'MAT-PR9-TEST-RPMI',
        schemaId: MATERIAL_SCHEMA_ID,
        payload: {
          kind: 'material',
          id: 'MAT-PR9-TEST-RPMI',
          name: 'RPMI 1640',
          domain: 'media',
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
        recordId: 'MSP-PR9-TEST-RPMI-1PCT-DMSO',
        schemaId: MATERIAL_SPEC_SCHEMA_ID,
        payload: {
          kind: 'material-spec',
          id: 'MSP-PR9-TEST-RPMI-1PCT-DMSO',
          name: 'RPMI + 1% DMSO',
          material_ref: { kind: 'record', id: 'MAT-PR9-TEST-RPMI', type: 'material', label: 'RPMI 1640' },
          formulation: {
            composition: [
              {
                component_ref: { kind: 'record', id: 'MAT-PR9-TEST-RPMI', type: 'material', label: 'RPMI 1640' },
                role: 'buffer_component',
              },
              {
                component_ref: { kind: 'record', id: 'MAT-PR9-TEST-DMSO', type: 'material', label: 'DMSO' },
                role: 'solvent',
                concentration: { value: 1, unit: '% v/v', basis: 'volume_fraction' },
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

    await ctx.store.create({
      envelope: {
        recordId: 'OPT-TRANSFER-MEDIA-V1',
        schemaId: OPERATION_TEMPLATE_SCHEMA_ID,
        payload: {
          kind: 'operation-template',
          id: 'OPT-TRANSFER-MEDIA-V1',
          name: 'Transfer media',
          version: 1,
          category: 'transfer',
          scope: 'program',
          visibility: 'team',
          status: 'active',
          base_event_type: 'transfer',
          semantic_defaults: {
            transfer_mode: 'transfer',
            volume: { value: 50, unit: 'uL' },
          },
          execution_defaults: {
            tip_policy: 'new_tip_each_transfer',
            post_mix: {
              enabled: true,
              cycles: 3,
              volume: { value: 30, unit: 'uL' },
            },
          },
          tags: ['media', 'wash'],
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

  it('operation_templates_list returns saved program details', async () => {
    const tool = registry.get('operation_templates_list');
    expect(tool).toBeDefined();
    const result = await tool!.handler({ query: 'media' });
    const text = result.content[0];
    expect(text.type).toBe('text');
    const body = JSON.parse(text.text);
    expect(body.items[0]).toMatchObject({
      id: 'OPT-TRANSFER-MEDIA-V1',
      name: 'Transfer media',
      baseEventType: 'transfer',
      status: 'active',
    });
  });

  it('operation_template_build_event returns a template-backed macro event', async () => {
    const tool = registry.get('operation_template_build_event');
    expect(tool).toBeDefined();
    const result = await tool!.handler({
      templateId: 'OPT-TRANSFER-MEDIA-V1',
      sourceLabwareId: 'SRC-1',
      targetLabwareId: 'DST-1',
      sourceWells: ['A1'],
      targetWells: ['B1'],
    });
    const text = result.content[0];
    expect(text.type).toBe('text');
    const body = JSON.parse(text.text);
    expect(body.event).toMatchObject({
      event_type: 'macro_program',
      details: {
        program: {
          kind: 'transfer_vignette',
          template_ref: {
            id: 'OPT-TRANSFER-MEDIA-V1',
          },
          params: {
            sourceLabwareId: 'SRC-1',
            targetLabwareId: 'DST-1',
            sourceWells: ['A1'],
            targetWells: ['B1'],
            volume: { value: 50, unit: 'uL' },
          },
        },
      },
    });
  });

  it('serial_dilution_build_event returns a v2 macro event with matched vehicle semantics', async () => {
    const tool = registry.get('serial_dilution_build_event');
    expect(tool).toBeDefined();
    const result = await tool!.handler({
      draft: {
        mode: 'prepare_then_transfer',
        sourceLabwareId: 'SRC-PLATE-1',
        targetLabwareId: 'ASSAY-PLATE-1',
        startWells: ['A1'],
        finalTargetStartWells: ['B1'],
        direction: 'down',
        steps: 4,
        dilutionFactor: 2,
        volumeModel: 'from_final',
        retainedVolume_uL: 200,
        diluentRef: { kind: 'record', id: 'MSP-PR9-TEST-RPMI-1PCT-DMSO', type: 'material-spec', label: 'RPMI + 1% DMSO' },
        startSourceKind: 'material_source',
        startMaterialRef: { kind: 'record', id: 'MSP-PR9-TEST-CLO-1MM', type: 'material-spec', label: '1 mM Clofibrate in DMSO' },
        solventPolicyMode: 'enforce_constant_vehicle',
        matchedDiluentRef: { kind: 'record', id: 'MSP-PR9-TEST-RPMI-1PCT-DMSO', type: 'material-spec', label: 'RPMI + 1% DMSO' },
      },
    });
    const text = result.content[0];
    expect(text.type).toBe('text');
    const body = JSON.parse(text.text);
    expect(body.event).toMatchObject({
      event_type: 'macro_program',
      details: {
        program: {
          kind: 'serial_dilution',
          params: {
            version: 2,
            mode: 'prepare_then_transfer',
            preparation: {
              transferIntoTargetAfterPreparation: true,
            },
            solventPolicy: {
              mode: 'enforce_constant_vehicle',
              matchedDiluentRef: {
                id: 'MSP-PR9-TEST-RPMI-1PCT-DMSO',
              },
            },
          },
        },
      },
    });
    expect(body.event.details.program.params.diluent.compositionSnapshot).toHaveLength(2);
    expect(body.event.details.program.params.lanes[0].finalTargets).toEqual(['B1', 'C1', 'D1', 'E1']);
  });

  it('serial_dilution_patch_event updates replicates and solvent policy without rebuilding manually', async () => {
    const tool = registry.get('serial_dilution_patch_event');
    expect(tool).toBeDefined();
    const result = await tool!.handler({
      event: {
        eventId: 'evt-serial-1',
        event_type: 'macro_program',
        details: {
          program: {
            kind: 'serial_dilution',
            params: {
              version: 2,
              mode: 'in_place',
              lanes: [
                {
                  laneId: 'lane-1',
                  targetLabwareId: 'PLATE-1',
                  startSource: { kind: 'existing_well', labwareId: 'PLATE-1', wellId: 'A1' },
                  path: ['A1', 'B1', 'C1', 'D1'],
                },
              ],
              dilution: {
                factor: 2,
                volumeModel: 'from_final',
                retainedVolume_uL: 200,
                resolvedTransferVolume_uL: 200,
                resolvedPrefillVolume_uL: 200,
                resolvedTopWellStartVolume_uL: 400,
              },
              diluent: {
                mode: 'material_ref',
                materialRef: { kind: 'record', id: 'MSP-PR9-TEST-RPMI-1PCT-DMSO', type: 'material-spec', label: 'RPMI + 1% DMSO' },
              },
              preparation: { topWellMode: 'external', receivingWellMode: 'generate' },
              mix: { cycles: 3, volume_uL: 80 },
              tipPolicy: 'change_each_step',
              endPolicy: 'discard_excess',
            },
          },
        },
      },
      changes: {
        replicateMode: 'pattern',
        replicateAxis: 'row',
        replicateCount: 3,
        replicateSpacing: 1,
        solventPolicyMode: 'warn_if_inconsistent',
      },
    });
    const text = result.content[0];
    expect(text.type).toBe('text');
    const body = JSON.parse(text.text);
    expect(body.event.eventId).toBe('evt-serial-1');
    expect(body.event.details.program.params.replicates).toMatchObject({
      mode: 'pattern',
      axis: 'row',
      count: 3,
    });
    expect(body.event.details.program.params.lanes).toHaveLength(3);
    expect(body.event.details.program.params.solventPolicy).toMatchObject({
      mode: 'warn_if_inconsistent',
    });
  });

  it('serial_dilution_draft_from_text returns a semantic serial dilution draft with assumptions', async () => {
    const tool = registry.get('serial_dilution_draft_from_text');
    expect(tool).toBeDefined();
    const result = await tool!.handler({
      prompt: 'Make this a 2-fold serial dilution down column 1 in triplicate and prepare in a source plate, then transfer into the assay plate using RPMI + 1% DMSO',
    });
    const text = result.content[0];
    expect(text.type).toBe('text');
    const body = JSON.parse(text.text);
    expect(body.event.details.program.params).toMatchObject({
      version: 2,
      mode: 'prepare_then_transfer',
      replicates: {
        mode: 'pattern',
        count: 3,
      },
    });
    expect(body.event.details.program.params.solventPolicy).toMatchObject({
      mode: 'enforce_constant_vehicle',
    });
    expect(body.event.details.program.params.lanes[0].path[0]).toBe('A1');
    expect(body.assumptions.length).toBeGreaterThan(0);
  });

  it('formulation_draft_from_text drafts a concentration-based formulation', async () => {
    const tool = registry.get('formulation_draft_from_text');
    expect(tool).toBeDefined();
    const result = await tool!.handler({ prompt: 'make 10 mL of 1 mM clofibrate in DMSO' });
    const text = result.content[0];
    expect(text.type).toBe('text');
    const body = JSON.parse(text.text);
    expect(body.draftPatch.totalProduced).toMatchObject({ value: 10, unit: 'mL' });
    expect(body.draftPatch.ingredients[0]).toMatchObject({
      roleType: 'solute',
      targetContribution: { value: 1, unit: 'mM', basis: 'molar' },
    });
    expect(body.draftPatch.ingredients[1]).toMatchObject({
      roleType: 'solvent',
      measureMode: 'qs_to_final',
    });
  });

  it('formulation_suggest_missing_fields computes a required amount from MW', async () => {
    const tool = registry.get('formulation_suggest_missing_fields');
    expect(tool).toBeDefined();
    const result = await tool!.handler({
      draft: {
        recipeName: '1 mM Clofibrate in DMSO',
        totalProduced: { value: 10, unit: 'mL' },
        ingredients: [
          {
            ref: { kind: 'record', id: 'MAT-PR9-TEST-CLO', type: 'material', label: 'Clofibrate' },
            roleType: 'solute',
            measureMode: 'target_concentration',
            sourceState: 'solid',
            targetContribution: { value: 1, unit: 'mM', basis: 'molar' },
            molecularWeight: { value: 242.27, unit: 'g/mol' },
          },
          {
            ref: { kind: 'record', id: 'MAT-PR9-TEST-DMSO', type: 'material', label: 'DMSO' },
            roleType: 'solvent',
            measureMode: 'qs_to_final',
            sourceState: 'liquid',
          },
        ],
      },
    });
    const text = result.content[0];
    expect(text.type).toBe('text');
    const body = JSON.parse(text.text);
    expect(body.draftPatch.ingredients[0].requiredAmount).toMatchObject({ unit: 'mg' });
    expect(body.outputComposition).toHaveLength(2);
  });

  it('formulation_flatten_composition returns recursive effective composition', async () => {
    const tool = registry.get('formulation_flatten_composition');
    expect(tool).toBeDefined();
    const result = await tool!.handler({
      draft: {
        totalProduced: { value: 10, unit: 'mL' },
        ingredients: [
          {
            ref: { kind: 'record', id: 'MSP-PR9-TEST-CLO-1MM', type: 'material-spec', label: '1 mM Clofibrate in DMSO' },
            roleType: 'solute',
            measureMode: 'target_concentration',
            sourceState: 'formulation',
            stockConcentration: { value: 1, unit: 'mM', basis: 'molar' },
            targetContribution: { value: 1, unit: 'uM', basis: 'molar' },
            requiredAmount: { value: 10, unit: 'uL' },
            compositionSnapshot: [
              {
                componentRef: { kind: 'record', id: 'MAT-PR9-TEST-CLO', type: 'material', label: 'Clofibrate' },
                role: 'solute',
                concentration: { value: 1, unit: 'mM', basis: 'molar' },
              },
              {
                componentRef: { kind: 'record', id: 'MAT-PR9-TEST-DMSO', type: 'material', label: 'DMSO' },
                role: 'solvent',
              },
            ],
          },
          {
            ref: { kind: 'record', id: 'VPR-PR9-TEST-RPMI', type: 'vendor-product', label: 'RPMI 1640 medium' },
            roleType: 'matrix',
            measureMode: 'qs_to_final',
            sourceState: 'liquid',
            requiredAmount: { value: 9.99, unit: 'mL' },
          },
        ],
      },
    });
    const text = result.content[0];
    expect(text.type).toBe('text');
    const body = JSON.parse(text.text);
    expect(body.outputComposition.some((entry: { componentRef: { id: string } }) => entry.componentRef.id === 'MAT-PR9-TEST-CLO')).toBe(true);
    expect(body.outputComposition.some((entry: { componentRef: { id: string } }) => entry.componentRef.id === 'MAT-PR9-TEST-DMSO')).toBe(true);
  });
});
