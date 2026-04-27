/**
 * Tests for LocalProtocolPasses.
 *
 * Covers each pass with ok and not-ok cases:
 * - resolve_protocol_ref: happy path, missing input, missing ref, missing inherits_from
 * - validate_local_protocol: happy (no errors), failure (schema violations)
 * - expand_local_customizations: happy (customizations applied), missing inputs
 * - project_local_expanded_protocol: happy (verbatim + metadata)
 */

import { describe, it, expect } from 'vitest';
import {
  createResolveProtocolRefPass,
  createValidateLocalProtocolPass,
  createExpandLocalCustomizationsPass,
  createProjectLocalExpandedProtocolPass,
} from './LocalProtocolPasses.js';
import type { PipelineState } from '../types.js';
import type { RecordStore } from '../../../store/types.js';
import type { AjvValidator } from '../../../validation/AjvValidator.js';

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

function makeMockAjvValidator(
  errors: Array<{ path: string; message: string }>,
): AjvValidator {
  return {
    validate: () => ({
      valid: errors.length === 0,
      errors,
    }),
    validateWithSchema: () => ({ valid: true, errors: [] }),
    addSchema: () => {},
    addSchemas: () => {},
    removeSchema: () => {},
    hasSchema: () => true,
    getSchema: () => undefined,
    compile: () => () => true,
  } as unknown as AjvValidator;
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
// createResolveProtocolRefPass tests
// ---------------------------------------------------------------------------

describe('createResolveProtocolRefPass', () => {
  it('happy path: loads local-protocol and canonical protocol, returns both', async () => {
    const localProtocolPayload = {
      kind: 'local-protocol',
      recordId: 'LPR-test-001',
      title: 'Test Local Protocol',
      inherits_from: { kind: 'record', type: 'protocol', id: 'PRT-000001' },
      status: 'draft',
    };

    const canonicalProtocolPayload = {
      kind: 'protocol',
      recordId: 'PRT-000001',
      title: 'Test Protocol',
      steps: [
        { stepId: 'step-1', kind: 'add_material', target: { labwareRole: 'plate' }, wells: { kind: 'all' }, material: { materialRole: 'sample' }, volume_uL: 50 },
      ],
    };

    const recordStore = makeMockRecordStore({
      'LPR-test-001': { recordId: 'LPR-test-001', payload: localProtocolPayload },
      'PRT-000001': { recordId: 'PRT-000001', payload: canonicalProtocolPayload },
    });

    const pass = createResolveProtocolRefPass({ recordStore });

    const state = makeMockState({ localProtocolRef: 'LPR-test-001' });
    const result = await pass.run({ pass_id: 'resolve_protocol_ref', state });

    expect(result.ok).toBe(true);
    const output = result.output as { localProtocol: unknown; canonicalProtocol: unknown };
    expect(output.localProtocol).toBeDefined();
    expect(output.canonicalProtocol).toBeDefined();
    expect((output.localProtocol as { recordId: string }).recordId).toBe('LPR-test-001');
    expect((output.canonicalProtocol as { recordId: string }).recordId).toBe('PRT-000001');
  });

  it('missing input.localProtocolRef → ok:false', async () => {
    const recordStore = makeMockRecordStore({});
    const pass = createResolveProtocolRefPass({ recordStore });

    const state = makeMockState({});
    const result = await pass.run({ pass_id: 'resolve_protocol_ref', state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics![0]!.code).toBe('missing_local_protocol_ref');
  });

  it('local-protocol not found → ok:false', async () => {
    const recordStore = makeMockRecordStore({});
    const pass = createResolveProtocolRefPass({ recordStore });

    const state = makeMockState({ localProtocolRef: 'LPR-nonexistent' });
    const result = await pass.run({ pass_id: 'resolve_protocol_ref', state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics![0]!.code).toBe('local_protocol_not_found');
  });

  it('missing inherits_from.id → ok:false', async () => {
    const recordStore = makeMockRecordStore({
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
    const pass = createResolveProtocolRefPass({ recordStore });

    const state = makeMockState({ localProtocolRef: 'LPR-test-001' });
    const result = await pass.run({ pass_id: 'resolve_protocol_ref', state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics![0]!.code).toBe('missing_inherits_from');
  });

  it('canonical protocol not found → ok:false', async () => {
    const recordStore = makeMockRecordStore({
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
    const pass = createResolveProtocolRefPass({ recordStore });

    const state = makeMockState({ localProtocolRef: 'LPR-test-001' });
    const result = await pass.run({ pass_id: 'resolve_protocol_ref', state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics![0]!.code).toBe('canonical_protocol_not_found');
  });
});

// ---------------------------------------------------------------------------
// createValidateLocalProtocolPass tests
// ---------------------------------------------------------------------------

describe('createValidateLocalProtocolPass', () => {
  it('happy path: no validation errors → validationOk:true, zero diagnostics', async () => {
    const ajvValidator = makeMockAjvValidator([]);

    const localProtocolEnvelope = {
      recordId: 'LPR-test-001',
      schemaId: 'https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml',
      payload: {
        kind: 'local-protocol',
        recordId: 'LPR-test-001',
        title: 'Test',
        inherits_from: { kind: 'record', type: 'protocol', id: 'PRT-000001' },
        status: 'draft',
      },
    };

    const outputs = new Map<string, unknown>([
      ['resolve_protocol_ref', { localProtocol: localProtocolEnvelope }],
    ]);

    const pass = createValidateLocalProtocolPass({ ajvValidator });
    const state = makeMockState({}, outputs);
    const result = pass.run({ pass_id: 'validate_local_protocol', state });

    expect(result.ok).toBe(true);
    const output = result.output as { validationOk: boolean };
    expect(output.validationOk).toBe(true);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!.length).toBe(0);
  });

  it('validation failure: Ajv returns errors → validationOk:false, diagnostics emitted', async () => {
    const ajvValidator = makeMockAjvValidator([
      { path: '/kind', message: 'Must be one of: local-protocol' },
      { path: '/inherits_from', message: 'Missing required property: id' },
    ]);

    const localProtocolEnvelope = {
      recordId: 'LPR-test-001',
      schemaId: 'https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml',
      payload: {
        kind: 'wrong-kind',
        recordId: 'LPR-test-001',
        title: 'Test',
        status: 'draft',
      },
    };

    const outputs = new Map<string, unknown>([
      ['resolve_protocol_ref', { localProtocol: localProtocolEnvelope }],
    ]);

    const pass = createValidateLocalProtocolPass({ ajvValidator });
    const state = makeMockState({}, outputs);
    const result = pass.run({ pass_id: 'validate_local_protocol', state });

    expect(result.ok).toBe(true); // ok:true even on validation failures
    const output = result.output as { validationOk: boolean };
    expect(output.validationOk).toBe(false);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!.length).toBe(2);
    expect(result.diagnostics![0]!.code).toBe('local_protocol_schema_violation');
    expect(result.diagnostics![0]!.severity).toBe('error');
  });

  it('missing upstream output → ok:false', async () => {
    const ajvValidator = makeMockAjvValidator([]);
    const pass = createValidateLocalProtocolPass({ ajvValidator });
    const state = makeMockState({});
    const result = pass.run({ pass_id: 'validate_local_protocol', state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics![0]!.code).toBe('missing_resolve_output');
  });
});

// ---------------------------------------------------------------------------
// createExpandLocalCustomizationsPass tests
// ---------------------------------------------------------------------------

describe('createExpandLocalCustomizationsPass', () => {
  it('happy path: merges customizations onto canonical protocol, preserves steps', () => {
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
          phaseId: 'prep',
        },
        {
          stepId: 'step-2',
          kind: 'incubate',
          target: { labwareRole: 'plate' },
          duration_min: 30,
          phaseId: 'incubation',
        },
        {
          stepId: 'step-3',
          kind: 'read',
          target: { labwareRole: 'plate' },
          modality: 'fluorescence',
          phaseId: 'readout',
        },
      ],
      phases: [
        { id: 'prep', label: 'Preparation', ordinal: 1 },
        { id: 'incubation', label: 'Incubation', ordinal: 2 },
        { id: 'readout', label: 'Readout', ordinal: 3 },
      ],
    };

    const outputs = new Map<string, unknown>([
      [
        'resolve_protocol_ref',
        {
          localProtocol: { payload: localProtocolPayload },
          canonicalProtocol: { payload: canonicalProtocolPayload },
        },
      ],
    ]);

    const pass = createExpandLocalCustomizationsPass();
    const state = makeMockState({}, outputs);
    const result = pass.run({ pass_id: 'expand_local_customizations', state });

    expect(result.ok).toBe(true);
    const output = result.output as { expandedProtocol: Record<string, unknown> };
    const expanded = output.expandedProtocol;

    // Customizations applied at top level
    expect(expanded.resolvedLabwareKind).toBe('384-well-plate');
    expect(expanded.resolvedPlateCount).toBe(2);
    expect(expanded.resolvedSampleCount).toBe(192);

    // Steps preserved from canonical
    expect(expanded.steps).toBeDefined();
    expect(Array.isArray(expanded.steps)).toBe(true);
    expect(expanded.steps.length).toBe(3);

    // phaseId preserved on each step
    expect((expanded.steps[0] as { phaseId?: string }).phaseId).toBe('prep');
    expect((expanded.steps[1] as { phaseId?: string }).phaseId).toBe('incubation');
    expect((expanded.steps[2] as { phaseId?: string }).phaseId).toBe('readout');

    // Phases preserved
    expect(expanded.phases).toBeDefined();
    expect(Array.isArray(expanded.phases)).toBe(true);
    expect(expanded.phases.length).toBe(3);

    // Canonical fields preserved
    expect(expanded.kind).toBe('protocol');
    expect(expanded.recordId).toBe('PRT-000001');
    expect(expanded.title).toBe('Test Protocol');
  });

  it('missing localProtocol → ok:false', () => {
    const outputs = new Map<string, unknown>([
      ['resolve_protocol_ref', { canonicalProtocol: { payload: {} } }],
    ]);
    const pass = createExpandLocalCustomizationsPass();
    const state = makeMockState({}, outputs);
    const result = pass.run({ pass_id: 'expand_local_customizations', state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics![0]!.code).toBe('missing_local_protocol');
  });

  it('missing canonicalProtocol → ok:false', () => {
    const outputs = new Map<string, unknown>([
      ['resolve_protocol_ref', { localProtocol: { payload: {} } }],
    ]);
    const pass = createExpandLocalCustomizationsPass();
    const state = makeMockState({}, outputs);
    const result = pass.run({ pass_id: 'expand_local_customizations', state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics![0]!.code).toBe('missing_canonical_protocol');
  });
});

// ---------------------------------------------------------------------------
// createProjectLocalExpandedProtocolPass tests
// ---------------------------------------------------------------------------

describe('createProjectLocalExpandedProtocolPass', () => {
  it('happy path: emits expandedProtocol verbatim with metadata summary', () => {
    const expandedProtocol = {
      kind: 'protocol',
      recordId: 'PRT-000001',
      title: 'Test Protocol',
      steps: [
        { stepId: 'step-1', kind: 'add_material' },
        { stepId: 'step-2', kind: 'incubate' },
        { stepId: 'step-3', kind: 'read' },
      ],
      phases: [
        { id: 'prep', label: 'Prep', ordinal: 1 },
        { id: 'readout', label: 'Readout', ordinal: 2 },
      ],
      resolvedLabwareKind: '384-well-plate',
      resolvedPlateCount: 2,
      resolvedSampleCount: 192,
    };

    const outputs = new Map<string, unknown>([
      ['expand_local_customizations', { expandedProtocol }],
    ]);

    const pass = createProjectLocalExpandedProtocolPass();
    const state = makeMockState({}, outputs);
    const result = pass.run({ pass_id: 'project_local_expanded_protocol', state });

    expect(result.ok).toBe(true);
    const output = result.output as {
      expandedProtocol: Record<string, unknown>;
      metadata: Record<string, unknown>;
    };

    // expandedProtocol emitted verbatim
    expect(output.expandedProtocol).toEqual(expandedProtocol);

    // Metadata summary
    expect(output.metadata.stepCount).toBe(3);
    expect(output.metadata.phaseCount).toBe(2);
    expect(output.metadata.labwareKind).toBe('384-well-plate');
    expect(output.metadata.plateCount).toBe(2);
    expect(output.metadata.sampleCount).toBe(192);
  });

  it('missing expandedProtocol → ok:false', () => {
    const pass = createProjectLocalExpandedProtocolPass();
    const state = makeMockState({});
    const result = pass.run({ pass_id: 'project_local_expanded_protocol', state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics![0]!.code).toBe('missing_expanded_protocol');
  });
});
