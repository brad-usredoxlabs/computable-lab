/**
 * Tests for DeriveContextPass
 * 
 * Uses a stub DerivationEngine and a tiny DerivationModel of the spec-009 DSL.
 */

import { describe, it, expect } from 'vitest';
import { createDeriveContextPass, DeriveContextPassArgs } from './DeriveContextPass.js';
import type { DerivationEngine, DerivationModel, WorkingValue, DerivationOutcome, DerivationProvenanceEntry } from '../../derive/DerivationEngine.js';
import type { PipelineState, PassRunArgs } from '../types.js';

/**
 * Stub DerivationEngine for testing
 */
class StubDerivationEngine implements DerivationEngine {
  private outcome: DerivationOutcome;

  constructor(outcome: DerivationOutcome) {
    this.outcome = outcome;
  }

  run(
    model: DerivationModel,
    inputs: Readonly<Record<string, WorkingValue>>,
  ): DerivationOutcome {
    return this.outcome;
  }
}

/**
 * Helper to create a minimal test model
 */
function createTestModel(
  id: string = 'DM-test',
  version: number = 1,
): DerivationModel {
  return {
    kind: 'derivation-model',
    id,
    name: 'test-model',
    version,
    inputs: [
      { name: 'x', type: 'number', required: true },
    ],
    output: { name: 'y', type: 'number' },
    steps: [
      { op: 'echo', from: 'x', into: 'y' },
    ],
  };
}

/**
 * Helper to create a minimal test state
 */
function createTestState(
  context: Record<string, unknown> = {},
  meta: Record<string, unknown> = {},
): PipelineState {
  return {
    input: {},
    context,
    meta,
    outputs: new Map(),
    diagnostics: [],
  };
}

/**
 * Helper to create pass run args
 */
function createRunArgs(state: PipelineState): PassRunArgs {
  return {
    pass_id: 'test-pass',
    state,
  };
}

describe('DeriveContextPass', () => {
  describe('Happy path', () => {
    it('should invoke engine and write output to context', async () => {
      const model = createTestModel('DM-test', 1);
      const provenance: DerivationProvenanceEntry[] = [
        {
          step_index: 0,
          op: 'echo',
          reads: ['x'],
          writes: ['y'],
          step: { op: 'echo', from: 'x', into: 'y' },
        },
      ];
      
      const outcome: DerivationOutcome = {
        ok: true,
        output: 2,
        output_name: 'y',
        provenance,
        derivation_versions: { 'DM-test': 1 },
      };

      const engine = new StubDerivationEngine(outcome);
      
      const inputSelector = (context: Record<string, unknown>): Record<string, WorkingValue> | { ok: false; reason: string } => {
        return { x: 1 };
      };

      const outputWriter = (
        context: Record<string, unknown>,
        outputName: string,
        outputValue: WorkingValue,
      ): Record<string, unknown> => {
        return { ...context, [outputName]: outputValue };
      };

      const args: DeriveContextPassArgs = {
        passId: 'derive_y_from_x',
        model,
        engine,
        inputSelector,
        outputWriter,
      };

      const pass = createDeriveContextPass(args);
      const state = createTestState({ x: 1 }, {});
      const result = await pass.run(createRunArgs(state));

      expect(result.ok).toBe(true);
      expect(result.output).toBeDefined();
      
      const output = result.output as { context: Record<string, unknown>; meta: Record<string, unknown> };
      expect(output.context.y).toBe(2);
      expect(output.meta.derivation_versions['DM-test']).toBe(1);
      expect(output.meta.derivation_provenance.length).toBe(1);
    });
  });

  describe('Input selector fails', () => {
    it('should return ok:false with derive_context_input_missing diagnostic', async () => {
      const model = createTestModel();
      const engine = new StubDerivationEngine({
        ok: true,
        output: 2,
        output_name: 'y',
        provenance: [],
        derivation_versions: {},
      });

      const inputSelector = (_: Record<string, unknown>): Record<string, WorkingValue> | { ok: false; reason: string } => {
        return { ok: false, reason: 'missing required input x' };
      };

      const outputWriter = (
        context: Record<string, unknown>,
        outputName: string,
        outputValue: WorkingValue,
      ): Record<string, unknown> => {
        return { ...context, [outputName]: outputValue };
      };

      const args: DeriveContextPassArgs = {
        passId: 'derive_y_from_x',
        model,
        engine,
        inputSelector,
        outputWriter,
      };

      const pass = createDeriveContextPass(args);
      const state = createTestState({}, {});
      const result = await pass.run(createRunArgs(state));

      expect(result.ok).toBe(false);
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.length).toBe(1);
      expect(result.diagnostics?.[0].code).toBe('derive_context_input_missing');
      expect(result.diagnostics?.[0].message).toContain('missing');
      expect(result.outcome).toBe('needs-missing-fact');
    });
  });

  describe('Engine fails', () => {
    it('should return ok:false with derive_context_engine_failed diagnostic', async () => {
      const model = createTestModel();
      const engine = new StubDerivationEngine({
        ok: false,
        reason: 'stub engine failure',
        step_index: 0,
      });

      const inputSelector = (_: Record<string, unknown>): Record<string, WorkingValue> | { ok: false; reason: string } => {
        return { x: 1 };
      };

      const outputWriter = (
        context: Record<string, unknown>,
        outputName: string,
        outputValue: WorkingValue,
      ): Record<string, unknown> => {
        return { ...context, [outputName]: outputValue };
      };

      const args: DeriveContextPassArgs = {
        passId: 'derive_y_from_x',
        model,
        engine,
        inputSelector,
        outputWriter,
      };

      const pass = createDeriveContextPass(args);
      const state = createTestState({ x: 1 }, {});
      const result = await pass.run(createRunArgs(state));

      expect(result.ok).toBe(false);
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.length).toBe(1);
      expect(result.diagnostics?.[0].code).toBe('derive_context_engine_failed');
      expect(result.diagnostics?.[0].message).toContain('stub');
      expect(result.outcome).toBe('execution-blocked');
    });
  });

  describe('Family is derive_context', () => {
    it('should have family === derive_context', async () => {
      const model = createTestModel();
      const engine = new StubDerivationEngine({
        ok: true,
        output: 2,
        output_name: 'y',
        provenance: [],
        derivation_versions: {},
      });

      const inputSelector = (_: Record<string, unknown>): Record<string, WorkingValue> => {
        return { x: 1 };
      };

      const outputWriter = (
        context: Record<string, unknown>,
        outputName: string,
        outputValue: WorkingValue,
      ): Record<string, unknown> => {
        return { ...context, [outputName]: outputValue };
      };

      const args: DeriveContextPassArgs = {
        passId: 'derive_y_from_x',
        model,
        engine,
        inputSelector,
        outputWriter,
      };

      const pass = createDeriveContextPass(args);
      expect(pass.family).toBe('derive_context');
    });
  });

  describe('Multiple passes accumulate', () => {
    it('should accumulate derivation_versions and derivation_provenance across runs', async () => {
      // First run with DM-test-1
      const model1 = createTestModel('DM-test-1', 1);
      const provenance1: DerivationProvenanceEntry[] = [
        {
          step_index: 0,
          op: 'echo',
          reads: ['x'],
          writes: ['y'],
          step: { op: 'echo', from: 'x', into: 'y' },
        },
      ];
      
      const outcome1: DerivationOutcome = {
        ok: true,
        output: 2,
        output_name: 'y',
        provenance: provenance1,
        derivation_versions: { 'DM-test-1': 1 },
      };

      const engine1 = new StubDerivationEngine(outcome1);
      
      const inputSelector1 = (_: Record<string, unknown>): Record<string, WorkingValue> => {
        return { x: 1 };
      };

      const outputWriter1 = (
        context: Record<string, unknown>,
        outputName: string,
        outputValue: WorkingValue,
      ): Record<string, unknown> => {
        return { ...context, [outputName]: outputValue };
      };

      const pass1 = createDeriveContextPass({
        passId: 'derive_y_from_x',
        model: model1,
        engine: engine1,
        inputSelector: inputSelector1,
        outputWriter: outputWriter1,
      });

      let state = createTestState({ x: 1 }, {});
      let result1 = await pass1.run(createRunArgs(state));
      
      // Simulate PipelineRunner merging output back into state
      const output1 = result1.output as { context: Record<string, unknown>; meta: Record<string, unknown> };
      state = createTestState(
        { ...state.context, ...output1.context },
        { ...state.meta, ...output1.meta },
      );

      // Second run with DM-test-2
      const model2 = createTestModel('DM-test-2', 2);
      const provenance2: DerivationProvenanceEntry[] = [
        {
          step_index: 0,
          op: 'multiply',
          reads: ['y'],
          writes: ['z'],
          step: { op: 'multiply', lhs: 'y', rhs: 2, into: 'z' },
        },
      ];
      
      const outcome2: DerivationOutcome = {
        ok: true,
        output: 4,
        output_name: 'z',
        provenance: provenance2,
        derivation_versions: { 'DM-test-2': 2 },
      };

      const engine2 = new StubDerivationEngine(outcome2);
      
      const inputSelector2 = (_: Record<string, unknown>): Record<string, WorkingValue> => {
        return { y: 2 };
      };

      const outputWriter2 = (
        context: Record<string, unknown>,
        outputName: string,
        outputValue: WorkingValue,
      ): Record<string, unknown> => {
        return { ...context, [outputName]: outputValue };
      };

      const pass2 = createDeriveContextPass({
        passId: 'derive_z_from_y',
        model: model2,
        engine: engine2,
        inputSelector: inputSelector2,
        outputWriter: outputWriter2,
      });

      const result2 = await pass2.run(createRunArgs(state));
      
      expect(result2.ok).toBe(true);
      const output2 = result2.output as { context: Record<string, unknown>; meta: Record<string, unknown> };
      
      // Both versions should be present
      expect(output2.meta.derivation_versions['DM-test-1']).toBe(1);
      expect(output2.meta.derivation_versions['DM-test-2']).toBe(2);
      
      // Provenance should be accumulated
      expect(output2.meta.derivation_provenance.length).toBe(2);
    });
  });

  describe('Integer version in derivation_versions', () => {
    it('should store version as integer in derivation_versions', async () => {
      const model = createTestModel('DM-test', 1);
      const engine = new StubDerivationEngine({
        ok: true,
        output: 2,
        output_name: 'y',
        provenance: [],
        derivation_versions: { 'DM-test': 1 },
      });

      const inputSelector = (_: Record<string, unknown>): Record<string, WorkingValue> => {
        return { x: 1 };
      };

      const outputWriter = (
        context: Record<string, unknown>,
        outputName: string,
        outputValue: WorkingValue,
      ): Record<string, unknown> => {
        return { ...context, [outputName]: outputValue };
      };

      const args: DeriveContextPassArgs = {
        passId: 'derive_y_from_x',
        model,
        engine,
        inputSelector,
        outputWriter,
      };

      const pass = createDeriveContextPass(args);
      const state = createTestState({ x: 1 }, {});
      const result = await pass.run(createRunArgs(state));

      expect(result.ok).toBe(true);
      const output = result.output as { context: Record<string, unknown>; meta: Record<string, unknown> };
      
      const version = output.meta.derivation_versions['DM-test'];
      expect(typeof version).toBe('number');
      expect(Number.isInteger(version)).toBe(true);
    });
  });
});
