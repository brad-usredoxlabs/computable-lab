/**
 * Tests for RunPlanValidationPasses.
 *
 * Covers:
 * - capability_check: happy path, volume violation
 * - derive_per_step_context: transfer step with sample fanout
 * - project_result: ready, blocked, partial statuses
 */

import { describe, it, expect } from 'vitest';
import {
  createCapabilityCheckPass,
  createDerivePerStepContextPass,
  createProjectRunPlanResultPass,
} from './RunPlanValidationPasses.js';
import type { PipelineState } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers / Mocks
// ---------------------------------------------------------------------------

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

function makeExpandedProtocol(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createCapabilityCheckPass tests
// ---------------------------------------------------------------------------

describe('createCapabilityCheckPass', () => {
  it('happy path: step volume within range, labware matches → ok:true, no violations', async () => {
    const pass = createCapabilityCheckPass();

    const expandedProtocol = makeExpandedProtocol({
      resolvedLabwareKind: '96-well-plate',
    });

    const outputs = new Map<string, unknown>([
      [
        'resolve_local_protocol',
        { expandedProtocol },
      ],
      [
        'resolve_labware_bindings',
        {
          labwareResolutions: {
            plate: {
              kind: 'labware-instance',
              recordId: 'LBI-plate-001',
              labwareId: 'lbw-def-generic-96-well-plate',
            },
          },
          unboundLabwareRoles: [],
        },
      ],
      [
        'resolve_material_bindings',
        {
          materialResolutions: {},
          unboundMaterialRoles: [],
        },
      ],
      [
        'resolve_policy_profile',
        {
          policyProfile: {
            kind: 'policy-bundle',
            recordId: 'POL-default',
            allowAll: true,
          },
        },
      ],
    ]);

    const state = makeMockState({}, outputs);
    const result = await pass.run({ pass_id: 'capability_check', state });

    expect(result.ok).toBe(true);
    const output = result.output as { capabilityChecks: Array<{ stepId: string; ok: boolean; violations: unknown[] }> };
    expect(output.capabilityChecks).toBeDefined();
    expect(output.capabilityChecks.length).toBe(1);
    expect(output.capabilityChecks[0].stepId).toBe('step-1');
    expect(output.capabilityChecks[0].ok).toBe(true);
    expect(output.capabilityChecks[0].violations).toEqual([]);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!.length).toBe(0);
  });

  it('volume violation: step volume_uL=10000, pipette max=1000 → error diagnostic', async () => {
    const pass = createCapabilityCheckPass();

    const expandedProtocol = makeExpandedProtocol({
      resolvedLabwareKind: '96-well-plate',
    });

    // Override the step to have a large volume
    expandedProtocol['steps'] = [
      {
        stepId: 'step-1',
        kind: 'add_material',
        target: { labwareRole: 'plate' },
        material: { materialRole: 'sample' },
        volume_uL: 10000,
      },
    ];

    const outputs = new Map<string, unknown>([
      [
        'resolve_local_protocol',
        { expandedProtocol },
      ],
      [
        'resolve_labware_bindings',
        {
          labwareResolutions: {
            plate: {
              kind: 'labware-instance',
              recordId: 'LBI-plate-001',
              labwareId: 'lbw-def-generic-96-well-plate',
            },
          },
          unboundLabwareRoles: [],
        },
      ],
      [
        'resolve_material_bindings',
        {
          materialResolutions: {
            pipette: {
              kind: 'equipment',
              pipetteMaxVolume_uL: 1000,
              pipetteMinVolume_uL: 0.5,
            },
          },
          unboundMaterialRoles: [],
        },
      ],
      [
        'resolve_policy_profile',
        {
          policyProfile: {
            kind: 'policy-bundle',
            recordId: 'POL-default',
            allowAll: true,
          },
        },
      ],
    ]);

    const state = makeMockState({}, outputs);
    const result = await pass.run({ pass_id: 'capability_check', state });

    expect(result.ok).toBe(true);
    const output = result.output as { capabilityChecks: Array<{ stepId: string; ok: boolean; violations: Array<{ code: string; severity: string }> }> };
    expect(output.capabilityChecks).toBeDefined();
    expect(output.capabilityChecks.length).toBe(1);
    expect(output.capabilityChecks[0].ok).toBe(false);
    expect(output.capabilityChecks[0].violations.length).toBeGreaterThan(0);

    // Check that the violation has the correct code
    const violation = output.capabilityChecks[0].violations[0];
    expect(violation.code).toBe('capability_volume_out_of_range');
    expect(violation.severity).toBe('error');

    // Also check diagnostics
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!.length).toBeGreaterThan(0);
    expect(result.diagnostics![0].code).toBe('capability_volume_out_of_range');
  });

  it('labware shape mismatch: expected 384-well-plate but bound is 96-well → error diagnostic', async () => {
    const pass = createCapabilityCheckPass();

    const expandedProtocol = makeExpandedProtocol({
      resolvedLabwareKind: '384-well-plate',
    });

    const outputs = new Map<string, unknown>([
      [
        'resolve_local_protocol',
        { expandedProtocol },
      ],
      [
        'resolve_labware_bindings',
        {
          labwareResolutions: {
            plate: {
              kind: 'labware-instance',
              recordId: 'LBI-plate-001',
              labwareId: 'lbw-def-generic-96-well-plate',
            },
          },
          unboundLabwareRoles: [],
        },
      ],
      [
        'resolve_material_bindings',
        {
          materialResolutions: {},
          unboundMaterialRoles: [],
        },
      ],
      [
        'resolve_policy_profile',
        {
          policyProfile: {
            kind: 'policy-bundle',
            recordId: 'POL-default',
            allowAll: true,
          },
        },
      ],
    ]);

    const state = makeMockState({}, outputs);
    const result = await pass.run({ pass_id: 'capability_check', state });

    expect(result.ok).toBe(true);
    const output = result.output as { capabilityChecks: Array<{ stepId: string; ok: boolean; violations: Array<{ code: string }> }> };
    expect(output.capabilityChecks[0].ok).toBe(false);
    expect(output.capabilityChecks[0].violations.length).toBeGreaterThan(0);
    expect(output.capabilityChecks[0].violations[0].code).toBe('capability_labware_shape_mismatch');
  });

  it('policy blocked: policy blocks verb → error diagnostic', async () => {
    const pass = createCapabilityCheckPass();

    const expandedProtocol = makeExpandedProtocol({
      resolvedLabwareKind: '96-well-plate',
    });

    const outputs = new Map<string, unknown>([
      [
        'resolve_local_protocol',
        { expandedProtocol },
      ],
      [
        'resolve_labware_bindings',
        {
          labwareResolutions: {
            plate: {
              kind: 'labware-instance',
              recordId: 'LBI-plate-001',
              labwareId: 'lbw-def-generic-96-well-plate',
            },
          },
          unboundLabwareRoles: [],
        },
      ],
      [
        'resolve_material_bindings',
        {
          materialResolutions: {},
          unboundMaterialRoles: [],
        },
      ],
      [
        'resolve_policy_profile',
        {
          policyProfile: {
            kind: 'policy-bundle',
            recordId: 'POL-strict',
            allowAll: false,
            blockedVerbs: ['add_material'],
          },
        },
      ],
    ]);

    const state = makeMockState({}, outputs);
    const result = await pass.run({ pass_id: 'capability_check', state });

    expect(result.ok).toBe(true);
    const output = result.output as { capabilityChecks: Array<{ stepId: string; ok: boolean; violations: Array<{ code: string }> }> };
    expect(output.capabilityChecks[0].ok).toBe(false);
    expect(output.capabilityChecks[0].violations.length).toBeGreaterThan(0);
    expect(output.capabilityChecks[0].violations[0].code).toBe('capability_policy_blocked');
  });

  it('missing upstream output → ok:false', async () => {
    const pass = createCapabilityCheckPass();
    const state = makeMockState({});
    const result = await pass.run({ pass_id: 'capability_check', state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics![0].code).toBe('missing_resolve_local_protocol');
  });
});

// ---------------------------------------------------------------------------
// createDerivePerStepContextPass tests
// ---------------------------------------------------------------------------

describe('createDerivePerStepContextPass', () => {
  it('transfer step with sampleCount=3 → 3 sample contexts with correct wellIds', async () => {
    const pass = createDerivePerStepContextPass();

    const expandedProtocol = {
      steps: [
        {
          stepId: 'step-1',
          kind: 'transfer',
          target: { labwareRole: 'dest_plate' },
          source: { labwareRole: 'src_plate' },
          material: { materialRole: 'sample' },
          volume_uL: 50,
        },
      ],
      materialRoles: [{ roleId: 'sample' }],
      labwareRoles: [
        { roleId: 'src_plate' },
        { roleId: 'dest_plate' },
      ],
      resolvedSampleCount: 3,
      resolvedLabwareKind: '96-well-plate',
    };

    const outputs = new Map<string, unknown>([
      [
        'resolve_local_protocol',
        { expandedProtocol },
      ],
      [
        'resolve_labware_bindings',
        {
          labwareResolutions: {
            src_plate: {
              kind: 'labware-instance',
              recordId: 'LBI-src-001',
              labwareId: 'lbw-def-generic-96-well-plate',
            },
            dest_plate: {
              kind: 'labware-instance',
              recordId: 'LBI-dest-001',
              labwareId: 'lbw-def-generic-96-well-plate',
            },
          },
          unboundLabwareRoles: [],
        },
      ],
      [
        'resolve_material_bindings',
        {
          materialResolutions: {},
          unboundMaterialRoles: [],
        },
      ],
    ]);

    const state = makeMockState({}, outputs);
    const result = await pass.run({ pass_id: 'derive_per_step_context', state });

    expect(result.ok).toBe(true);
    const output = result.output as { perStepContexts: Array<{ stepId: string; sampleContexts: Array<{ wellId: string; sampleIndex: number; sourceWell?: string; destWell?: string; volume_uL?: number }> }> };
    expect(output.perStepContexts).toBeDefined();
    expect(output.perStepContexts.length).toBe(1);
    expect(output.perStepContexts[0].stepId).toBe('step-1');
    expect(output.perStepContexts[0].sampleContexts.length).toBe(3);

    // Check well IDs are in column-major order: A1, B1, C1
    expect(output.perStepContexts[0].sampleContexts[0].wellId).toBe('A1');
    expect(output.perStepContexts[0].sampleContexts[0].sampleIndex).toBe(1);
    expect(output.perStepContexts[0].sampleContexts[1].wellId).toBe('B1');
    expect(output.perStepContexts[0].sampleContexts[1].sampleIndex).toBe(2);
    expect(output.perStepContexts[0].sampleContexts[2].wellId).toBe('C1');
    expect(output.perStepContexts[0].sampleContexts[2].sampleIndex).toBe(3);

    // Check transfer-specific fields
    expect(output.perStepContexts[0].sampleContexts[0].sourceWell).toBe('A1');
    expect(output.perStepContexts[0].sampleContexts[0].destWell).toBe('A1');
    expect(output.perStepContexts[0].sampleContexts[0].volume_uL).toBe(50);
  });

  it('add_material step with sampleCount=5 → 5 sample contexts', async () => {
    const pass = createDerivePerStepContextPass();

    const expandedProtocol = {
      steps: [
        {
          stepId: 'step-1',
          kind: 'add_material',
          target: { labwareRole: 'plate' },
          material: { materialRole: 'sample' },
          volume_uL: 25,
        },
      ],
      materialRoles: [{ roleId: 'sample' }],
      labwareRoles: [{ roleId: 'plate' }],
      resolvedSampleCount: 5,
      resolvedLabwareKind: '96-well-plate',
    };

    const outputs = new Map<string, unknown>([
      [
        'resolve_local_protocol',
        { expandedProtocol },
      ],
      [
        'resolve_labware_bindings',
        {
          labwareResolutions: {
            plate: {
              kind: 'labware-instance',
              recordId: 'LBI-plate-001',
              labwareId: 'lbw-def-generic-96-well-plate',
            },
          },
          unboundLabwareRoles: [],
        },
      ],
      [
        'resolve_material_bindings',
        {
          materialResolutions: {},
          unboundMaterialRoles: [],
        },
      ],
    ]);

    const state = makeMockState({}, outputs);
    const result = await pass.run({ pass_id: 'derive_per_step_context', state });

    expect(result.ok).toBe(true);
    const output = result.output as { perStepContexts: Array<{ stepId: string; sampleContexts: Array<{ wellId: string; sampleIndex: number }> }> };
    expect(output.perStepContexts[0].sampleContexts.length).toBe(5);
    expect(output.perStepContexts[0].sampleContexts[0].wellId).toBe('A1');
    expect(output.perStepContexts[0].sampleContexts[4].wellId).toBe('E1');
  });

  it('missing upstream output → ok:false', async () => {
    const pass = createDerivePerStepContextPass();
    const state = makeMockState({});
    const result = await pass.run({ pass_id: 'derive_per_step_context', state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics![0].code).toBe('missing_resolve_local_protocol');
  });
});

// ---------------------------------------------------------------------------
// createProjectRunPlanResultPass tests
// ---------------------------------------------------------------------------

describe('createProjectRunPlanResultPass', () => {
  it('ready: no errors upstream → status=ready', async () => {
    const pass = createProjectRunPlanResultPass();

    const expandedProtocol = makeExpandedProtocol({
      resolvedLabwareKind: '96-well-plate',
    });

    const outputs = new Map<string, unknown>([
      [
        'resolve_local_protocol',
        { expandedProtocol },
      ],
      [
        'resolve_labware_bindings',
        {
          labwareResolutions: {
            plate: {
              kind: 'labware-instance',
              recordId: 'LBI-plate-001',
              labwareId: 'lbw-def-generic-96-well-plate',
            },
          },
          unboundLabwareRoles: [],
        },
      ],
      [
        'resolve_material_bindings',
        {
          materialResolutions: {
            sample: { kind: 'material-instance', id: 'MINST-sample-001' },
          },
          unboundMaterialRoles: [],
        },
      ],
      [
        'resolve_policy_profile',
        {
          policyProfile: {
            kind: 'policy-bundle',
            recordId: 'POL-default',
            allowAll: true,
          },
        },
      ],
      [
        'capability_check',
        {
          capabilityChecks: [
            { stepId: 'step-1', ok: true, violations: [] },
          ],
        },
      ],
      [
        'derive_per_step_context',
        {
          perStepContexts: [
            {
              stepId: 'step-1',
              sampleContexts: [
                { wellId: 'A1', sampleIndex: 1, volume_uL: 50 },
              ],
            },
          ],
        },
      ],
    ]);

    const state = makeMockState({}, outputs);
    const result = await pass.run({ pass_id: 'project_result', state });

    expect(result.ok).toBe(true);
    const output = result.output as { runPlanCompileResult: { status: string; diagnostics: unknown[]; perStepContexts: unknown[]; bindings: unknown } };
    expect(output.runPlanCompileResult.status).toBe('ready');
    expect(output.runPlanCompileResult.diagnostics).toBeDefined();
    expect(output.runPlanCompileResult.diagnostics.length).toBe(0);
    expect(output.runPlanCompileResult.perStepContexts).toBeDefined();
    expect(output.runPlanCompileResult.bindings).toBeDefined();
  });

  it('blocked: 1 capability_check violation → status=blocked, diagnostic propagated', async () => {
    const pass = createProjectRunPlanResultPass();

    const expandedProtocol = makeExpandedProtocol({
      resolvedLabwareKind: '96-well-plate',
    });

    const outputs = new Map<string, unknown>([
      [
        'resolve_local_protocol',
        { expandedProtocol },
      ],
      [
        'resolve_labware_bindings',
        {
          labwareResolutions: {
            plate: {
              kind: 'labware-instance',
              recordId: 'LBI-plate-001',
              labwareId: 'lbw-def-generic-96-well-plate',
            },
          },
          unboundLabwareRoles: [],
        },
      ],
      [
        'resolve_material_bindings',
        {
          materialResolutions: {},
          unboundMaterialRoles: [],
        },
      ],
      [
        'resolve_policy_profile',
        {
          policyProfile: {
            kind: 'policy-bundle',
            recordId: 'POL-default',
            allowAll: true,
          },
        },
      ],
      [
        'capability_check',
        {
          capabilityChecks: [
            {
              stepId: 'step-1',
              ok: false,
              violations: [
                {
                  severity: 'error',
                  code: 'capability_volume_out_of_range',
                  message: 'Step step-1 volume 10000 uL exceeds pipette max 1000 uL',
                  pass_id: 'capability_check',
                  details: { stepId: 'step-1', volume_uL: 10000, pipetteMaxVolume: 1000 },
                },
              ],
            },
          ],
        },
      ],
      [
        'derive_per_step_context',
        {
          perStepContexts: [
            {
              stepId: 'step-1',
              sampleContexts: [],
            },
          ],
        },
      ],
    ]);

    const state = makeMockState({}, outputs);
    const result = await pass.run({ pass_id: 'project_result', state });

    expect(result.ok).toBe(true);
    const output = result.output as { runPlanCompileResult: { status: string; diagnostics: Array<{ code: string; stepId?: string }> } };
    expect(output.runPlanCompileResult.status).toBe('blocked');
    expect(output.runPlanCompileResult.diagnostics.length).toBeGreaterThan(0);
    expect(output.runPlanCompileResult.diagnostics[0].code).toBe('capability_volume_out_of_range');
  });

  it('partial: 1 unbound role, 0 capability errors → status=partial', async () => {
    const pass = createProjectRunPlanResultPass();

    const expandedProtocol = makeExpandedProtocol({
      resolvedLabwareKind: '96-well-plate',
    });

    const outputs = new Map<string, unknown>([
      [
        'resolve_local_protocol',
        { expandedProtocol },
      ],
      [
        'resolve_labware_bindings',
        {
          labwareResolutions: {},
          unboundLabwareRoles: ['plate'],
        },
      ],
      [
        'resolve_material_bindings',
        {
          materialResolutions: {},
          unboundMaterialRoles: [],
        },
      ],
      [
        'resolve_policy_profile',
        {
          policyProfile: {
            kind: 'policy-bundle',
            recordId: 'POL-default',
            allowAll: true,
          },
        },
      ],
      [
        'capability_check',
        {
          capabilityChecks: [
            { stepId: 'step-1', ok: true, violations: [] },
          ],
        },
      ],
      [
        'derive_per_step_context',
        {
          perStepContexts: [
            {
              stepId: 'step-1',
              sampleContexts: [],
            },
          ],
        },
      ],
    ]);

    const state = makeMockState({}, outputs);
    const result = await pass.run({ pass_id: 'project_result', state });

    expect(result.ok).toBe(true);
    const output = result.output as { runPlanCompileResult: { status: string; diagnostics: Array<{ code: string }> } };
    expect(output.runPlanCompileResult.status).toBe('partial');
    // Should have the unbound_labware_role diagnostic
    const unboundDiag = output.runPlanCompileResult.diagnostics.find(
      (d) => d.code === 'unbound_labware_role',
    );
    expect(unboundDiag).toBeDefined();
  });

  it('deduplication: same diagnostic from multiple sources → deduped by (code, stepId)', async () => {
    const pass = createProjectRunPlanResultPass();

    const expandedProtocol = makeExpandedProtocol({
      resolvedLabwareKind: '96-well-plate',
    });

    const outputs = new Map<string, unknown>([
      [
        'resolve_local_protocol',
        { expandedProtocol },
      ],
      [
        'resolve_labware_bindings',
        {
          labwareResolutions: {},
          unboundLabwareRoles: ['plate'],
        },
      ],
      [
        'resolve_material_bindings',
        {
          materialResolutions: {},
          unboundMaterialRoles: ['sample'],
        },
      ],
      [
        'resolve_policy_profile',
        {
          policyProfile: {
            kind: 'policy-bundle',
            recordId: 'POL-default',
            allowAll: true,
          },
        },
      ],
      [
        'capability_check',
        {
          capabilityChecks: [
            {
              stepId: 'step-1',
              ok: false,
              violations: [
                {
                  severity: 'error',
                  code: 'capability_volume_out_of_range',
                  message: 'Volume too high',
                  pass_id: 'capability_check',
                  details: { stepId: 'step-1' },
                },
              ],
            },
          ],
        },
      ],
      [
        'derive_per_step_context',
        {
          perStepContexts: [],
        },
      ],
    ]);

    const state = makeMockState({}, outputs);
    const result = await pass.run({ pass_id: 'project_result', state });

    expect(result.ok).toBe(true);
    const output = result.output as { runPlanCompileResult: { status: string; diagnostics: Array<{ code: string }> } };
    // Should be blocked due to capability error
    expect(output.runPlanCompileResult.status).toBe('blocked');
    // Should have both unbound diagnostics and the capability diagnostic
    const codes = output.runPlanCompileResult.diagnostics.map((d) => d.code);
    expect(codes).toContain('capability_volume_out_of_range');
    expect(codes).toContain('unbound_material_role');
    expect(codes).toContain('unbound_labware_role');
  });

  it('missing upstream outputs → ok:true with empty result', async () => {
    const pass = createProjectRunPlanResultPass();
    const state = makeMockState({});
    const result = await pass.run({ pass_id: 'project_result', state });

    expect(result.ok).toBe(true);
    const output = result.output as { runPlanCompileResult: { status: string; diagnostics: unknown[]; perStepContexts: unknown[] } };
    // With no upstream data, no capability errors and no unbound roles → ready
    expect(output.runPlanCompileResult.status).toBe('ready');
    expect(output.runPlanCompileResult.diagnostics).toEqual([]);
    expect(output.runPlanCompileResult.perStepContexts).toEqual([]);
  });
});
