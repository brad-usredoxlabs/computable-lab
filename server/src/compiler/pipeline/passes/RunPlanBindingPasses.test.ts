/**
 * Tests for RunPlanBindingPasses.
 *
 * Covers each pass with ok and not-ok cases:
 * - resolve_local_protocol: happy path, missing planned-run
 * - resolve_policy_profile: fallback when not found
 * - resolve_material_bindings: happy path, unbound role
 * - resolve_labware_bindings: unbound role
 */

import { describe, it, expect } from 'vitest';
import {
  createResolveLocalProtocolPass,
  createResolvePolicyProfilePass,
  createResolveMaterialBindingsPass,
  createResolveLabwareBindingsPass,
} from './RunPlanBindingPasses.js';
import type { PipelineState } from '../types.js';
import type { RecordStore } from '../../../store/types.js';

// ---------------------------------------------------------------------------
// Helpers / Mocks
// ---------------------------------------------------------------------------

function makeMockRecordStore(
  records: Record<string, { recordId: string; payload: Record<string, unknown> }>,
): RecordStore {
  return {
    get: async (recordId: string) => {
      const r = records[recordId];
      if (!r) return null;
      return {
        recordId: r.recordId,
        schemaId: 'https://computable-lab.com/schema/computable-lab/test.schema.yaml',
        payload: r.payload,
      };
    },
    getByPath: async () => null,
    getWithValidation: async () => ({ success: false, error: 'not implemented' }),
    list: async () => [],
    create: async () => ({ success: false, error: 'not implemented' }),
    update: async () => ({ success: false, error: 'not implemented' }),
    delete: async () => ({ success: false, error: 'not implemented' }),
    validate: async () => ({ valid: true, errors: [] }),
    lint: async () => ({ ok: true, errors: [] }),
    exists: async () => true,
  } as unknown as RecordStore;
}

function makeMockState(
  input: Record<string, unknown> = {},
  outputs: Map<string, unknown> = new Map(),
): PipelineState {
  return {
    input,
    context: {},
    meta: {},
    outputs,
    diagnostics: [],
  };
}

// ---------------------------------------------------------------------------
// createResolveLocalProtocolPass tests
// ---------------------------------------------------------------------------

describe('createResolveLocalProtocolPass', () => {
  it('happy path: loads planned-run, local-protocol, canonical protocol, and expandedProtocol', async () => {
    const localProtocolPayload = {
      kind: 'local-protocol',
      recordId: 'LPR-test-001',
      title: 'Test Local Protocol',
      inherits_from: { kind: 'record', type: 'protocol', id: 'PRT-000001' },
      status: 'draft',
      notes: JSON.stringify({
        labContext: {
          labwareKind: '384-well-plate',
          plateCount: 2,
          sampleCount: 192,
        },
      }),
    };

    const canonicalProtocolPayload = {
      kind: 'protocol',
      recordId: 'PRT-000001',
      title: 'Test Protocol',
      steps: [
        {
          stepId: 'step-1',
          kind: 'add_material',
          target: { labwareRole: 'plate' },
          wells: { kind: 'all' },
          material: { materialRole: 'sample' },
          volume_uL: 50,
        },
        {
          stepId: 'step-2',
          kind: 'incubate',
          target: { labwareRole: 'plate' },
          duration_min: 30,
        },
      ],
      phases: [
        { id: 'prep', label: 'Preparation', ordinal: 1 },
        { id: 'incubation', label: 'Incubation', ordinal: 2 },
      ],
    };

    const plannedRunPayload = {
      kind: 'planned-run',
      recordId: 'PLR-test-001',
      title: 'Test Planned Run',
      localProtocolRef: 'LPR-test-001',
      sourceType: 'local-protocol',
      sourceRef: 'LPR-test-001',
      state: 'draft',
    };

    const recordStore = makeMockRecordStore({
      'PLR-test-001': { recordId: 'PLR-test-001', payload: plannedRunPayload },
      'LPR-test-001': { recordId: 'LPR-test-001', payload: localProtocolPayload },
      'PRT-000001': { recordId: 'PRT-000001', payload: canonicalProtocolPayload },
    });

    const pass = createResolveLocalProtocolPass({ recordStore });

    const state = makeMockState({ plannedRunRef: 'PLR-test-001' });
    const result = await pass.run({ pass_id: 'resolve_local_protocol', state });

    expect(result.ok).toBe(true);
    const output = result.output as {
      plannedRun: unknown;
      localProtocol: unknown;
      canonicalProtocol: unknown;
      expandedProtocol: Record<string, unknown>;
    };
    expect(output.plannedRun).toBeDefined();
    expect(output.localProtocol).toBeDefined();
    expect(output.canonicalProtocol).toBeDefined();
    expect(output.expandedProtocol).toBeDefined();

    // Expanded protocol should have customizations applied
    const expanded = output.expandedProtocol;
    expect(expanded.resolvedLabwareKind).toBe('384-well-plate');
    expect(expanded.resolvedPlateCount).toBe(2);
    expect(expanded.resolvedSampleCount).toBe(192);

    // Expanded protocol should have materialRoles and labwareRoles
    expect(expanded.materialRoles).toBeDefined();
    expect(Array.isArray(expanded.materialRoles)).toBe(true);
    expect(expanded.materialRoles.length).toBe(1);
    expect((expanded.materialRoles[0] as { roleId: string }).roleId).toBe('sample');

    expect(expanded.labwareRoles).toBeDefined();
    expect(Array.isArray(expanded.labwareRoles)).toBe(true);
    expect(expanded.labwareRoles.length).toBe(1);
    expect((expanded.labwareRoles[0] as { roleId: string }).roleId).toBe('plate');

    // Phases preserved
    expect(expanded.phases).toBeDefined();
    expect(Array.isArray(expanded.phases)).toBe(true);
    expect(expanded.phases.length).toBe(2);

    // Steps preserved
    expect(expanded.steps).toBeDefined();
    expect(Array.isArray(expanded.steps)).toBe(true);
    expect(expanded.steps.length).toBe(2);
  });

  it('missing planned-run → ok:false', async () => {
    const recordStore = makeMockRecordStore({});
    const pass = createResolveLocalProtocolPass({ recordStore });

    const state = makeMockState({ plannedRunRef: 'PLR-nonexistent' });
    const result = await pass.run({ pass_id: 'resolve_local_protocol', state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics![0]!.code).toBe('planned_run_not_found');
  });

  it('missing input.plannedRunRef → ok:false', async () => {
    const recordStore = makeMockRecordStore({});
    const pass = createResolveLocalProtocolPass({ recordStore });

    const state = makeMockState({});
    const result = await pass.run({ pass_id: 'resolve_local_protocol', state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics![0]!.code).toBe('missing_planned_run_ref');
  });

  it('missing localProtocolRef on planned-run → ok:false', async () => {
    const recordStore = makeMockRecordStore({
      'PLR-test-001': {
        recordId: 'PLR-test-001',
        payload: {
          kind: 'planned-run',
          recordId: 'PLR-test-001',
          title: 'Test',
          sourceType: 'local-protocol',
          sourceRef: 'LPR-test-001',
          state: 'draft',
          // No localProtocolRef
        },
      },
    });
    const pass = createResolveLocalProtocolPass({ recordStore });

    const state = makeMockState({ plannedRunRef: 'PLR-test-001' });
    const result = await pass.run({ pass_id: 'resolve_local_protocol', state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics![0]!.code).toBe('missing_local_protocol_ref');
  });

  it('missing local-protocol → ok:false', async () => {
    const recordStore = makeMockRecordStore({
      'PLR-test-001': {
        recordId: 'PLR-test-001',
        payload: {
          kind: 'planned-run',
          recordId: 'PLR-test-001',
          title: 'Test',
          localProtocolRef: 'LPR-nonexistent',
          sourceType: 'local-protocol',
          state: 'draft',
        },
      },
    });
    const pass = createResolveLocalProtocolPass({ recordStore });

    const state = makeMockState({ plannedRunRef: 'PLR-test-001' });
    const result = await pass.run({ pass_id: 'resolve_local_protocol', state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics![0]!.code).toBe('local_protocol_not_found');
  });

  it('missing inherits_from.id → ok:false', async () => {
    const recordStore = makeMockRecordStore({
      'PLR-test-001': {
        recordId: 'PLR-test-001',
        payload: {
          kind: 'planned-run',
          recordId: 'PLR-test-001',
          title: 'Test',
          localProtocolRef: 'LPR-test-001',
          sourceType: 'local-protocol',
          state: 'draft',
        },
      },
      'LPR-test-001': {
        recordId: 'LPR-test-001',
        payload: {
          kind: 'local-protocol',
          recordId: 'LPR-test-001',
          title: 'Test',
          status: 'draft',
          // No inherits_from
        },
      },
    });
    const pass = createResolveLocalProtocolPass({ recordStore });

    const state = makeMockState({ plannedRunRef: 'PLR-test-001' });
    const result = await pass.run({ pass_id: 'resolve_local_protocol', state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics![0]!.code).toBe('missing_inherits_from');
  });

  it('missing canonical protocol → ok:false', async () => {
    const recordStore = makeMockRecordStore({
      'PLR-test-001': {
        recordId: 'PLR-test-001',
        payload: {
          kind: 'planned-run',
          recordId: 'PLR-test-001',
          title: 'Test',
          localProtocolRef: 'LPR-test-001',
          sourceType: 'local-protocol',
          state: 'draft',
        },
      },
      'LPR-test-001': {
        recordId: 'LPR-test-001',
        payload: {
          kind: 'local-protocol',
          recordId: 'LPR-test-001',
          title: 'Test',
          inherits_from: { kind: 'record', type: 'protocol', id: 'PRT-nonexistent' },
          status: 'draft',
        },
      },
    });
    const pass = createResolveLocalProtocolPass({ recordStore });

    const state = makeMockState({ plannedRunRef: 'PLR-test-001' });
    const result = await pass.run({ pass_id: 'resolve_local_protocol', state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics![0]!.code).toBe('canonical_protocol_not_found');
  });
});

// ---------------------------------------------------------------------------
// createResolvePolicyProfilePass tests
// ---------------------------------------------------------------------------

describe('createResolvePolicyProfilePass', () => {
  it('happy path: loads policy-profile from input ref', async () => {
    const policyProfilePayload = {
      kind: 'policy-bundle',
      id: 'POL-NOTEBOOK',
      label: 'Notebook Policy',
      level: 1,
      settings: {
        allowAutoCreate: 'allow',
        allowSubstitutions: 'confirm',
      },
    };

    const recordStore = makeMockRecordStore({
      'POL-NOTEBOOK': { recordId: 'POL-NOTEBOOK', payload: policyProfilePayload },
    });

    const pass = createResolvePolicyProfilePass({ recordStore });

    const state = makeMockState({ policyProfileRef: 'POL-NOTEBOOK' });
    const result = await pass.run({ pass_id: 'resolve_policy_profile', state });

    expect(result.ok).toBe(true);
    const output = result.output as { policyProfile: unknown };
    expect(output.policyProfile).toBeDefined();
    expect((output.policyProfile as { recordId: string }).recordId).toBe('POL-NOTEBOOK');
  });

  it('fallback: policy-profile not found → ok:true with permissive default', async () => {
    const recordStore = makeMockRecordStore({});

    const pass = createResolvePolicyProfilePass({ recordStore });

    const state = makeMockState({ policyProfileRef: 'POL-nonexistent' });
    const result = await pass.run({ pass_id: 'resolve_policy_profile', state });

    expect(result.ok).toBe(true);
    const output = result.output as { policyProfile: unknown };
    expect(output.policyProfile).toBeDefined();
    const profile = output.policyProfile as Record<string, unknown>;
    expect(profile.allowAll).toBe(true);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!.length).toBeGreaterThan(0);
    expect(result.diagnostics![0]!.code).toBe('policy_profile_not_found');
    expect(result.diagnostics![0]!.severity).toBe('warning');
  });

  it('fallback: no policyProfileRef in input → ok:true with permissive default', async () => {
    const recordStore = makeMockRecordStore({});

    const pass = createResolvePolicyProfilePass({ recordStore });

    const state = makeMockState({});
    const result = await pass.run({ pass_id: 'resolve_policy_profile', state });

    expect(result.ok).toBe(true);
    const output = result.output as { policyProfile: unknown };
    expect(output.policyProfile).toBeDefined();
    const profile = output.policyProfile as Record<string, unknown>;
    expect(profile.allowAll).toBe(true);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics![0]!.code).toBe('policy_profile_not_found');
  });
});

// ---------------------------------------------------------------------------
// createResolveMaterialBindingsPass tests
// ---------------------------------------------------------------------------

describe('createResolveMaterialBindingsPass', () => {
  it('happy path: resolves all material roles from bindings', async () => {
    const plannedRunPayload = {
      kind: 'planned-run',
      recordId: 'PLR-test-001',
      title: 'Test',
      bindings: {
        materials: [
          { roleId: 'sample', materialRef: 'MINST-sample-001' },
          { roleId: 'reagent', materialRef: 'MINST-reagent-001' },
        ],
      },
    };

    const expandedProtocol = {
      kind: 'protocol',
      recordId: 'PRT-000001',
      title: 'Test Protocol',
      steps: [
        {
          stepId: 'step-1',
          kind: 'add_material',
          target: { labwareRole: 'plate' },
          material: { materialRole: 'sample' },
          volume_uL: 50,
        },
        {
          stepId: 'step-2',
          kind: 'add_material',
          target: { labwareRole: 'plate' },
          material: { materialRole: 'reagent' },
          volume_uL: 100,
        },
      ],
      materialRoles: [
        { roleId: 'sample' },
        { roleId: 'reagent' },
      ],
      labwareRoles: [{ roleId: 'plate' }],
    };

    const materialInstancePayload1 = {
      kind: 'material-instance',
      id: 'MINST-sample-001',
      name: 'Sample A',
      status: 'available',
    };

    const materialInstancePayload2 = {
      kind: 'material-instance',
      id: 'MINST-reagent-001',
      name: 'Reagent B',
      status: 'available',
    };

    const recordStore = makeMockRecordStore({
      'MINST-sample-001': { recordId: 'MINST-sample-001', payload: materialInstancePayload1 },
      'MINST-reagent-001': { recordId: 'MINST-reagent-001', payload: materialInstancePayload2 },
    });

    const outputs = new Map<string, unknown>([
      [
        'resolve_local_protocol',
        {
          plannedRun: { payload: plannedRunPayload },
          expandedProtocol,
        },
      ],
    ]);

    const pass = createResolveMaterialBindingsPass({ recordStore });
    const state = makeMockState({}, outputs);
    const result = await pass.run({ pass_id: 'resolve_material_bindings', state });

    expect(result.ok).toBe(true);
    const output = result.output as {
      materialResolutions: Record<string, unknown>;
      unboundMaterialRoles: string[];
    };
    expect(output.materialResolutions).toBeDefined();
    expect(Object.keys(output.materialResolutions).length).toBe(2);
    expect(output.materialResolutions['sample']).toBeDefined();
    expect(output.materialResolutions['reagent']).toBeDefined();
    expect(output.unboundMaterialRoles).toEqual([]);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!.length).toBe(0);
  });

  it('unbound role: missing binding emits error diagnostic but ok:true', async () => {
    const plannedRunPayload = {
      kind: 'planned-run',
      recordId: 'PLR-test-001',
      title: 'Test',
      bindings: {
        materials: [
          { roleId: 'sample', materialRef: 'MINST-sample-001' },
        ],
      },
    };

    const expandedProtocol = {
      kind: 'protocol',
      recordId: 'PRT-000001',
      title: 'Test Protocol',
      steps: [
        {
          stepId: 'step-1',
          kind: 'add_material',
          target: { labwareRole: 'plate' },
          material: { materialRole: 'sample' },
          volume_uL: 50,
        },
        {
          stepId: 'step-2',
          kind: 'add_material',
          target: { labwareRole: 'plate' },
          material: { materialRole: 'reagent' },
          volume_uL: 100,
        },
      ],
      materialRoles: [
        { roleId: 'sample' },
        { roleId: 'reagent' },
      ],
      labwareRoles: [{ roleId: 'plate' }],
    };

    const materialInstancePayload = {
      kind: 'material-instance',
      id: 'MINST-sample-001',
      name: 'Sample A',
      status: 'available',
    };

    const recordStore = makeMockRecordStore({
      'MINST-sample-001': { recordId: 'MINST-sample-001', payload: materialInstancePayload },
    });

    const outputs = new Map<string, unknown>([
      [
        'resolve_local_protocol',
        {
          plannedRun: { payload: plannedRunPayload },
          expandedProtocol,
        },
      ],
    ]);

    const pass = createResolveMaterialBindingsPass({ recordStore });
    const state = makeMockState({}, outputs);
    const result = await pass.run({ pass_id: 'resolve_material_bindings', state });

    expect(result.ok).toBe(true);
    const output = result.output as {
      materialResolutions: Record<string, unknown>;
      unboundMaterialRoles: string[];
    };
    expect(Object.keys(output.materialResolutions).length).toBe(1);
    expect(output.materialResolutions['sample']).toBeDefined();
    expect(output.unboundMaterialRoles).toEqual(['reagent']);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!.length).toBe(1);
    expect(result.diagnostics![0]!.code).toBe('unbound_material_role');
    expect(result.diagnostics![0]!.severity).toBe('error');
    expect((result.diagnostics![0]!.details as { roleId: string }).roleId).toBe('reagent');
  });

  it('missing upstream output → ok:false', async () => {
    const recordStore = makeMockRecordStore({});
    const pass = createResolveMaterialBindingsPass({ recordStore });
    const state = makeMockState({});
    const result = await pass.run({ pass_id: 'resolve_material_bindings', state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics![0]!.code).toBe('missing_resolve_local_protocol');
  });
});

// ---------------------------------------------------------------------------
// createResolveLabwareBindingsPass tests
// ---------------------------------------------------------------------------

describe('createResolveLabwareBindingsPass', () => {
  it('happy path: resolves all labware roles from bindings', async () => {
    const plannedRunPayload = {
      kind: 'planned-run',
      recordId: 'PLR-test-001',
      title: 'Test',
      bindings: {
        labware: [
          { roleId: 'plate', labwareInstanceRef: 'LBI-plate-001' },
        ],
      },
    };

    const expandedProtocol = {
      kind: 'protocol',
      recordId: 'PRT-000001',
      title: 'Test Protocol',
      steps: [
        {
          stepId: 'step-1',
          kind: 'add_material',
          target: { labwareRole: 'plate' },
          material: { materialRole: 'sample' },
          volume_uL: 50,
        },
      ],
      materialRoles: [{ roleId: 'sample' }],
      labwareRoles: [{ roleId: 'plate' }],
    };

    const labwareInstancePayload = {
      kind: 'labware-instance',
      recordId: 'LBI-plate-001',
      labwareId: 'LABWARE-384-WELL',
      label: 'Plate A',
      state: 'available',
    };

    const recordStore = makeMockRecordStore({
      'LBI-plate-001': { recordId: 'LBI-plate-001', payload: labwareInstancePayload },
    });

    const outputs = new Map<string, unknown>([
      [
        'resolve_local_protocol',
        {
          plannedRun: { payload: plannedRunPayload },
          expandedProtocol,
        },
      ],
    ]);

    const pass = createResolveLabwareBindingsPass({ recordStore });
    const state = makeMockState({}, outputs);
    const result = await pass.run({ pass_id: 'resolve_labware_bindings', state });

    expect(result.ok).toBe(true);
    const output = result.output as {
      labwareResolutions: Record<string, unknown>;
      unboundLabwareRoles: string[];
    };
    expect(output.labwareResolutions).toBeDefined();
    expect(Object.keys(output.labwareResolutions).length).toBe(1);
    expect(output.labwareResolutions['plate']).toBeDefined();
    expect(output.unboundLabwareRoles).toEqual([]);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!.length).toBe(0);
  });

  it('unbound role: missing binding emits error diagnostic but ok:true', async () => {
    const plannedRunPayload = {
      kind: 'planned-run',
      recordId: 'PLR-test-001',
      title: 'Test',
      bindings: {
        labware: [], // No bindings at all
      },
    };

    const expandedProtocol = {
      kind: 'protocol',
      recordId: 'PRT-000001',
      title: 'Test Protocol',
      steps: [
        {
          stepId: 'step-1',
          kind: 'add_material',
          target: { labwareRole: 'plate' },
          material: { materialRole: 'sample' },
          volume_uL: 50,
        },
        {
          stepId: 'step-2',
          kind: 'incubate',
          target: { labwareRole: 'incubator' },
          duration_min: 30,
        },
      ],
      materialRoles: [{ roleId: 'sample' }],
      labwareRoles: [
        { roleId: 'plate' },
        { roleId: 'incubator' },
      ],
    };

    const recordStore = makeMockRecordStore({});

    const outputs = new Map<string, unknown>([
      [
        'resolve_local_protocol',
        {
          plannedRun: { payload: plannedRunPayload },
          expandedProtocol,
        },
      ],
    ]);

    const pass = createResolveLabwareBindingsPass({ recordStore });
    const state = makeMockState({}, outputs);
    const result = await pass.run({ pass_id: 'resolve_labware_bindings', state });

    expect(result.ok).toBe(true);
    const output = result.output as {
      labwareResolutions: Record<string, unknown>;
      unboundLabwareRoles: string[];
    };
    expect(Object.keys(output.labwareResolutions).length).toBe(0);
    expect(output.unboundLabwareRoles).toEqual(['plate', 'incubator']);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!.length).toBe(2);
    expect(result.diagnostics![0]!.code).toBe('unbound_labware_role');
    expect(result.diagnostics![0]!.severity).toBe('error');
    expect((result.diagnostics![0]!.details as { roleId: string }).roleId).toBe('plate');
    expect((result.diagnostics![1]!.details as { roleId: string }).roleId).toBe('incubator');
  });

  it('missing upstream output → ok:false', async () => {
    const recordStore = makeMockRecordStore({});
    const pass = createResolveLabwareBindingsPass({ recordStore });
    const state = makeMockState({});
    const result = await pass.run({ pass_id: 'resolve_labware_bindings', state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics![0]!.code).toBe('missing_resolve_local_protocol');
  });
});
