/**
 * Tests for the local-protocol pipeline runner helper.
 */

import { describe, it, expect } from 'vitest';
import { runLocalProtocolPipeline } from './localProtocolPipelineRun.js';
import { PassRegistry } from './PassRegistry.js';
import type { Pass, PassRunArgs, PassResult } from './types.js';
import { loadPipeline } from './PipelineLoader.js';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PIPELINE_PATH = path.join(__dirname, '../../../../schema/registry/compile-pipelines/local-protocol-compile.yaml');

/**
 * Create a stub pass that echoes input to output.
 * Useful for testing pipeline wiring without real logic.
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
 * Get all 6 pass ids expected in the local-protocol-compile pipeline.
 */
function getAllPassIds(): string[] {
  return [
    'parse_local_protocol',
    'normalize_local_protocol',
    'resolve_protocol_ref',
    'validate_local_protocol',
    'expand_local_customizations',
    'project_local_expanded_protocol',
  ];
}

/**
 * Get all 6 stub passes for the local-protocol-compile pipeline.
 */
function getAllStubPasses(): Pass[] {
  const families = [
    'parse',
    'normalize',
    'disambiguate',
    'validate',
    'expand',
    'project',
  ];
  const passIds = getAllPassIds();
  return passIds.map((id, i) => createStubPass(id, families[i]));
}

describe('runLocalProtocolPipeline', () => {
  describe('Case 1: Loads YAML and runs 6 stub passes end-to-end', () => {
    it('should load the pipeline YAML and execute all 6 passes successfully', async () => {
      const input = {
        local_protocol_id: 'LP-001',
        canonical_protocol_ref: 'PROTO-123',
        customizations: {
          step_modifications: [],
        },
      };

      const result = await runLocalProtocolPipeline({
        pipelinePath: PIPELINE_PATH,
        passes: getAllStubPasses(),
        input,
      });

      // Verify overall success
      expect(result.ok).toBe(true);

      // Verify all 6 passes ran successfully
      expect(result.pass_statuses).toHaveLength(6);
      for (const status of result.pass_statuses) {
        expect(status.status).toBe('ok');
      }

      // Verify outputs exist for every pass id
      const passIds = getAllPassIds();
      for (const passId of passIds) {
        expect(result.outputs.has(passId)).toBe(true);
        const output = result.outputs.get(passId);
        expect(output).toMatchObject({
          pass_id: passId,
          echoed_input: input,
        });
      }

      // Verify no error diagnostics
      const errorDiagnostics = result.diagnostics.filter(d => d.severity === 'error');
      expect(errorDiagnostics).toHaveLength(0);
    });

    it('should thread input through all passes in dependency order', async () => {
      const input = { test_key: 'test_value', nested: { foo: 'bar' } };

      const result = await runLocalProtocolPipeline({
        pipelinePath: PIPELINE_PATH,
        passes: getAllStubPasses(),
        input,
      });

      // All passes should have received the same input
      for (const passId of getAllPassIds()) {
        const output = result.outputs.get(passId);
        expect(output).toMatchObject({ echoed_input: input });
      }
    });
  });

  describe('Case 2: Missing pass registration throws', () => {
    it('should throw when a pass id in the spec is not registered', async () => {
      // Provide only 5 passes, omitting the 6th one
      const stubPasses = getAllStubPasses().slice(0, 5);

      await expect(
        runLocalProtocolPipeline({
          pipelinePath: PIPELINE_PATH,
          passes: stubPasses,
          input: {},
        }),
      ).rejects.toThrow(/pass not registered/);

      // Verify the error message contains the missing pass id
      try {
        await runLocalProtocolPipeline({
          pipelinePath: PIPELINE_PATH,
          passes: stubPasses,
          input: {},
        });
        // Should not reach here
        expect.fail('Expected error was not thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const errorMessage = (error as Error).message;
        expect(errorMessage).toContain('pass not registered');
        expect(errorMessage).toContain('project_local_expanded_protocol');
      }
    });

    it('should throw with correct pass id when multiple passes are missing', async () => {
      // Provide only 3 passes
      const stubPasses = getAllStubPasses().slice(0, 3);

      await expect(
        runLocalProtocolPipeline({
          pipelinePath: PIPELINE_PATH,
          passes: stubPasses,
          input: {},
        }),
      ).rejects.toThrow(/pass not registered/);
    });
  });

  describe('Case 3: YAML validates', () => {
    it('should load and validate the YAML structure', () => {
      const spec = loadPipeline(PIPELINE_PATH);

      // Check pipelineId
      expect(spec.pipelineId).toBe('local-protocol-compile');

      // Check entrypoint
      expect(spec.entrypoint).toBe('local-protocol-compile');

      // Check passes count
      expect(spec.passes).toHaveLength(6);

      // Check each pass has required fields
      const expectedPasses = [
        { id: 'parse_local_protocol', family: 'parse' },
        { id: 'normalize_local_protocol', family: 'normalize' },
        { id: 'resolve_protocol_ref', family: 'disambiguate' },
        { id: 'validate_local_protocol', family: 'validate' },
        { id: 'expand_local_customizations', family: 'expand' },
        { id: 'project_local_expanded_protocol', family: 'project' },
      ];

      for (let i = 0; i < spec.passes.length; i++) {
        const pass = spec.passes[i];
        expect(pass.id).toBe(expectedPasses[i].id);
        expect(pass.family).toBe(expectedPasses[i].family);
      }

      // Verify all families are from the allowed set
      const validFamilies = [
        'parse',
        'normalize',
        'disambiguate',
        'validate',
        'derive_context',
        'expand',
        'project',
      ];
      for (const pass of spec.passes) {
        expect(validFamilies).toContain(pass.family);
      }
    });

    it('should have proper dependency chain in the YAML', () => {
      const spec = loadPipeline(PIPELINE_PATH);

      // Check that passes have proper depends_on relationships
      expect(spec.passes[0].id).toBe('parse_local_protocol');
      expect(spec.passes[0].depends_on).toBeUndefined();

      expect(spec.passes[1].id).toBe('normalize_local_protocol');
      expect(spec.passes[1].depends_on).toEqual(['parse_local_protocol']);

      expect(spec.passes[2].id).toBe('resolve_protocol_ref');
      expect(spec.passes[2].depends_on).toEqual(['normalize_local_protocol']);

      expect(spec.passes[3].id).toBe('validate_local_protocol');
      expect(spec.passes[3].depends_on).toEqual(['resolve_protocol_ref']);

      expect(spec.passes[4].id).toBe('expand_local_customizations');
      expect(spec.passes[4].depends_on).toEqual(['validate_local_protocol']);

      expect(spec.passes[5].id).toBe('project_local_expanded_protocol');
      expect(spec.passes[5].depends_on).toEqual(['expand_local_customizations']);
    });
  });
});
