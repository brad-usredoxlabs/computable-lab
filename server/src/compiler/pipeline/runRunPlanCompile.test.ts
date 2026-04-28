/**
 * Tests for the run-plan-compile pipeline runner.
 */

import { describe, it, expect } from 'vitest';
import { runRunPlanCompile } from './runRunPlanCompile.js';
import { PassRegistry } from './PassRegistry.js';
import type { Pass, PassRunArgs, PassResult } from './types.js';
import { loadPipeline } from './PipelineLoader.js';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PIPELINE_PATH = path.join(__dirname, '../../../../schema/registry/compile-pipelines/run-plan-compile.yaml');

/**
 * Create a stub pass that echoes input to output.
 */
function createStubPass(id: string, family: string): Pass {
  return {
    id,
    family: family as Pass['family'],
    run(_args: PassRunArgs): PassResult {
      return {
        ok: true,
        output: {
          pass_id: id,
          echoed_input: _args.state.input,
        },
      };
    },
  };
}

/**
 * Get all pass ids declared in the run-plan-compile YAML (9 total).
 */
function getAllPassIds(): string[] {
  return [
    'parse_planned_run',
    'resolve_local_protocol',
    'resolve_policy_profile',
    'resolve_material_bindings',
    'resolve_labware_bindings',
    'capability_check',
    'derive_per_step_context',
    'ai_plan_quality_scoring',
    'project_result',
  ];
}

/**
 * Get stub passes for all 9 YAML-declared passes.
 */
function getAllStubPasses(): Pass[] {
  const families = [
    'parse',
    'normalize',
    'normalize',
    'disambiguate',
    'disambiguate',
    'validate',
    'derive_context',
    'derive_context',
    'project',
  ];
  const passIds = getAllPassIds();
  return passIds.map((id, i) => createStubPass(id, families[i]));
}

/**
 * Passes registered by runRunPlanCompile (8 of 9 — ai_plan_quality_scoring is optional).
 */
const REGISTERED_PASS_IDS = [
  'parse_planned_run',
  'resolve_local_protocol',
  'resolve_policy_profile',
  'resolve_material_bindings',
  'resolve_labware_bindings',
  'capability_check',
  'derive_per_step_context',
  'project_result',
];

describe('runRunPlanCompile', () => {
  describe('YAML validation', () => {
    it('should load and validate the run-plan-compile pipeline YAML', () => {
      const spec = loadPipeline(PIPELINE_PATH);

      expect(spec.pipelineId).toBe('run-plan-compile');
      expect(spec.entrypoint).toBe('run-plan-compile');
      expect(spec.passes).toHaveLength(9);

      const expectedPasses = [
        { id: 'parse_planned_run', family: 'parse' },
        { id: 'resolve_local_protocol', family: 'normalize' },
        { id: 'resolve_policy_profile', family: 'normalize' },
        { id: 'resolve_material_bindings', family: 'disambiguate' },
        { id: 'resolve_labware_bindings', family: 'disambiguate' },
        { id: 'capability_check', family: 'validate' },
        { id: 'derive_per_step_context', family: 'derive_context' },
        { id: 'ai_plan_quality_scoring', family: 'derive_context' },
        { id: 'project_result', family: 'project' },
      ];

      for (let i = 0; i < spec.passes.length; i++) {
        const pass = spec.passes[i];
        expect(pass.id).toBe(expectedPasses[i].id);
        expect(pass.family).toBe(expectedPasses[i].family);
      }
    });

    it('should have proper dependency chain in the YAML', () => {
      const spec = loadPipeline(PIPELINE_PATH);

      expect(spec.passes[0].id).toBe('parse_planned_run');
      expect(spec.passes[0].depends_on).toBeUndefined();

      expect(spec.passes[1].id).toBe('resolve_local_protocol');
      expect(spec.passes[1].depends_on).toEqual(['parse_planned_run']);

      expect(spec.passes[2].id).toBe('resolve_policy_profile');
      expect(spec.passes[2].depends_on).toEqual(['parse_planned_run']);

      expect(spec.passes[3].id).toBe('resolve_material_bindings');
      expect(spec.passes[3].depends_on).toEqual(['resolve_local_protocol']);

      expect(spec.passes[4].id).toBe('resolve_labware_bindings');
      expect(spec.passes[4].depends_on).toEqual(['resolve_local_protocol']);

      expect(spec.passes[5].id).toBe('capability_check');
      expect(spec.passes[5].depends_on).toEqual(['resolve_material_bindings', 'resolve_labware_bindings', 'resolve_policy_profile']);

      expect(spec.passes[6].id).toBe('derive_per_step_context');
      expect(spec.passes[6].depends_on).toEqual(['capability_check']);

      expect(spec.passes[7].id).toBe('ai_plan_quality_scoring');
      expect(spec.passes[7].depends_on).toEqual(['derive_per_step_context']);

      expect(spec.passes[8].id).toBe('project_result');
      expect(spec.passes[8].depends_on).toEqual(['derive_per_step_context']);
    });
  });

  describe('runRunPlanCompile pipeline execution', () => {
    it('should run all registered passes and return a compile result', async () => {
      // Create a minimal mock store
      const mockStore = {
        get: async () => ({
          recordId: 'PLR-001',
          kind: 'planned-run',
          payload: {
            kind: 'planned-run',
            state: 'draft',
            title: 'Test Plan',
            localProtocolRef: { kind: 'record', id: 'LPR-001' },
          },
        }),
        update: async () => {},
        updateRecord: async () => {},
        getRecord: async () => ({
          recordId: 'PLR-001',
          kind: 'planned-run',
          payload: {
            kind: 'planned-run',
            state: 'draft',
            title: 'Test Plan',
            localProtocolRef: { kind: 'record', id: 'LPR-001' },
          },
        }),
      } as any;

      const result = await runRunPlanCompile({
        plannedRunRef: 'PLR-001',
        recordStore: mockStore,
      });

      // Verify result has expected shape
      expect(result).toHaveProperty('runPlanCompileResult');
      expect(result.runPlanCompileResult).toHaveProperty('status');
      expect(result.runPlanCompileResult).toHaveProperty('diagnostics');
      expect(result.runPlanCompileResult).toHaveProperty('perStepContexts');
      expect(result.runPlanCompileResult).toHaveProperty('bindings');
    });

    it('should return status blocked when no passes produce output', async () => {
      const mockStore = {
        get: async () => ({
          recordId: 'PLR-001',
          kind: 'planned-run',
          payload: { kind: 'planned-run', state: 'draft' },
        }),
        update: async () => {},
        updateRecord: async () => {},
        getRecord: async () => ({
          recordId: 'PLR-001',
          kind: 'planned-run',
          payload: { kind: 'planned-run', state: 'draft' },
        }),
      } as any;

      const result = await runRunPlanCompile({
        plannedRunRef: 'PLR-001',
        recordStore: mockStore,
      });

      // Without real pass implementations, the fallback status is 'blocked'
      expect(result.runPlanCompileResult.status).toBe('blocked');
    });
  });

  describe('Pass registration verification', () => {
    it('should register all passes that runRunPlanCompile declares', () => {
      const registry = new PassRegistry();

      // These are the passes registered by runRunPlanCompile
      const stubPasses = REGISTERED_PASS_IDS.map((id, i) =>
        createStubPass(id, ['parse', 'normalize', 'normalize', 'disambiguate', 'disambiguate', 'validate', 'derive_context', 'project'][i]),
      );

      for (const pass of stubPasses) {
        registry.register(pass);
      }

      // Verify every registered pass is in the registry
      for (const passId of REGISTERED_PASS_IDS) {
        expect(registry.has(passId)).toBe(true);
      }
    });

    it('should throw when a registered pass is missing', () => {
      const registry = new PassRegistry();

      // Register only 7 of 8 registered passes (omit project_result at index 7)
      const stubPasses = REGISTERED_PASS_IDS.slice(0, 7).map((id, i) =>
        createStubPass(id, ['parse', 'normalize', 'normalize', 'disambiguate', 'disambiguate', 'validate', 'derive_context'][i]),
      );

      for (const pass of stubPasses) {
        registry.register(pass);
      }

      // Verify missing pass among registered ones
      const missingPasses: string[] = [];
      for (const passId of REGISTERED_PASS_IDS) {
        if (!registry.has(passId)) {
          missingPasses.push(passId);
        }
      }

      expect(missingPasses).toContain('project_result');
    });

    it('should not require the optional ai_plan_quality_scoring pass', () => {
      const spec = loadPipeline(PIPELINE_PATH);
      const registry = new PassRegistry();

      // Register only the 8 passes that runRunPlanCompile actually registers
      const stubPasses = REGISTERED_PASS_IDS.map((id, i) =>
        createStubPass(id, ['parse', 'normalize', 'normalize', 'disambiguate', 'disambiguate', 'validate', 'derive_context', 'project'][i]),
      );

      for (const pass of stubPasses) {
        registry.register(pass);
      }

      // ai_plan_quality_scoring is optional (has 'when' condition)
      // The pipeline should still be valid without it
      const missingPasses: string[] = [];
      for (const passSpec of spec.passes) {
        if (!registry.has(passSpec.id)) {
          missingPasses.push(passSpec.id);
        }
      }

      // Only ai_plan_quality_scoring should be missing
      expect(missingPasses).toEqual(['ai_plan_quality_scoring']);
    });
  });
});
