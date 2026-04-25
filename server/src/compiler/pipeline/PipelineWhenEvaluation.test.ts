/**
 * Tests for when-clause evaluation in the pipeline runner.
 *
 * Verifies that DEFAULT_WHEN_EVALUATOR correctly resolves dotted paths
 * through state.outputs and treats truthy/non-empty values as 'run'
 * and falsy/empty values as 'skip with info diagnostic'.
 *
 * See spec-041-pipeline-yaml-when-gates.
 */

import { describe, it, expect } from 'vitest';
import { runPipeline, DEFAULT_WHEN_EVALUATOR, type PipelineSpec } from './PipelineRunner.js';
import { PassRegistry } from './PassRegistry.js';
import type { Pass, PassResult, PipelineState } from './types.js';

/**
 * Creates a stub pass that records whether it was called.
 */
function createRecordPass(id: string, called: { value: boolean }): Pass {
  return {
    id,
    family: 'validate',
    run: async () => {
      called.value = true;
      return { ok: true, output: { executed: id } };
    },
  };
}

/**
 * Creates a stub pass that always succeeds with a fixed output.
 */
function createSuccessPass(id: string, output: unknown): Pass {
  return {
    id,
    family: 'validate',
    run: async () => ({ ok: true, output }),
  };
}

describe('PipelineWhenEvaluation', () => {
  describe('when clause evaluation', () => {
    it('runs pass when outputs.a.x is truthy', async () => {
      const called = { value: false };
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-when-truthy',
        entrypoint: 'chatbot-compile',
        passes: [
          { id: 'a', family: 'parse' },
          { id: 'b', family: 'expand', depends_on: ['a'], when: 'outputs.a.x' },
        ],
      };

      registry.register(createSuccessPass('a', { x: 42 }));
      registry.register(createRecordPass('b', called));

      const result = await runPipeline(spec, registry, {}, DEFAULT_WHEN_EVALUATOR);

      expect(result.ok).toBe(true);
      expect(called.value).toBe(true);
      expect(result.outputs.has('a')).toBe(true);
      expect(result.outputs.has('b')).toBe(true);
      // No skip diagnostic
      expect(result.diagnostics.some(d => d.code === 'pass_skipped_by_when')).toBe(false);
    });

    it('skips pass when outputs.a.x is falsy (undefined)', async () => {
      const called = { value: false };
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-when-falsy',
        entrypoint: 'chatbot-compile',
        passes: [
          { id: 'a', family: 'parse' },
          { id: 'b', family: 'expand', depends_on: ['a'], when: 'outputs.a.x' },
        ],
      };

      // Pass A returns output without 'x' field
      registry.register(createSuccessPass('a', { y: 99 }));
      registry.register(createRecordPass('b', called));

      const result = await runPipeline(spec, registry, {}, DEFAULT_WHEN_EVALUATOR);

      expect(result.ok).toBe(true);
      expect(called.value).toBe(false);
      expect(result.outputs.has('a')).toBe(true);
      expect(result.outputs.has('b')).toBe(false);
      // Should have a skip diagnostic
      const skipDiag = result.diagnostics.find(d => d.code === 'pass_skipped_by_when');
      expect(skipDiag).toBeDefined();
      expect(skipDiag!.severity).toBe('info');
      expect(skipDiag!.message).toContain('b');
      expect(skipDiag!.message).toContain('outputs.a.x');
    });

    it('skips pass when outputs.a.x is an empty array', async () => {
      const called = { value: false };
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-when-empty-array',
        entrypoint: 'chatbot-compile',
        passes: [
          { id: 'a', family: 'parse' },
          { id: 'b', family: 'expand', depends_on: ['a'], when: 'outputs.a.items' },
        ],
      };

      registry.register(createSuccessPass('a', { items: [] }));
      registry.register(createRecordPass('b', called));

      const result = await runPipeline(spec, registry, {}, DEFAULT_WHEN_EVALUATOR);

      expect(result.ok).toBe(true);
      expect(called.value).toBe(false);
      expect(result.outputs.has('b')).toBe(false);
      const skipDiag = result.diagnostics.find(d => d.code === 'pass_skipped_by_when');
      expect(skipDiag).toBeDefined();
    });

    it('runs pass when outputs.a.items is a non-empty array', async () => {
      const called = { value: false };
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-when-nonempty-array',
        entrypoint: 'chatbot-compile',
        passes: [
          { id: 'a', family: 'parse' },
          { id: 'b', family: 'expand', depends_on: ['a'], when: 'outputs.a.items' },
        ],
      };

      registry.register(createSuccessPass('a', { items: ['one', 'two'] }));
      registry.register(createRecordPass('b', called));

      const result = await runPipeline(spec, registry, {}, DEFAULT_WHEN_EVALUATOR);

      expect(result.ok).toBe(true);
      expect(called.value).toBe(true);
      expect(result.outputs.has('b')).toBe(true);
    });

    it('skips pass when outputs.a is undefined (pass not in outputs)', async () => {
      const called = { value: false };
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-when-missing-pass',
        entrypoint: 'chatbot-compile',
        passes: [
          { id: 'b', family: 'expand', when: 'outputs.a.x' },
        ],
      };

      registry.register(createRecordPass('b', called));

      const result = await runPipeline(spec, registry, {}, DEFAULT_WHEN_EVALUATOR);

      expect(result.ok).toBe(true);
      expect(called.value).toBe(false);
      expect(result.outputs.has('b')).toBe(false);
    });

    it('runs pass when no when clause is present', async () => {
      const called = { value: false };
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-when-none',
        entrypoint: 'chatbot-compile',
        passes: [
          { id: 'a', family: 'parse' },
          { id: 'b', family: 'expand', depends_on: ['a'] },
        ],
      };

      registry.register(createSuccessPass('a', { x: 1 }));
      registry.register(createRecordPass('b', called));

      const result = await runPipeline(spec, registry, {}, DEFAULT_WHEN_EVALUATOR);

      expect(result.ok).toBe(true);
      expect(called.value).toBe(true);
      expect(result.outputs.has('b')).toBe(true);
    });

    it('skips pass when outputs.a.x is an empty object', async () => {
      const called = { value: false };
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-when-empty-object',
        entrypoint: 'chatbot-compile',
        passes: [
          { id: 'a', family: 'parse' },
          { id: 'b', family: 'expand', depends_on: ['a'], when: 'outputs.a.meta' },
        ],
      };

      registry.register(createSuccessPass('a', { meta: {} }));
      registry.register(createRecordPass('b', called));

      const result = await runPipeline(spec, registry, {}, DEFAULT_WHEN_EVALUATOR);

      expect(result.ok).toBe(true);
      expect(called.value).toBe(false);
      expect(result.outputs.has('b')).toBe(false);
    });

    it('runs pass when outputs.a.meta has keys', async () => {
      const called = { value: false };
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-when-object-with-keys',
        entrypoint: 'chatbot-compile',
        passes: [
          { id: 'a', family: 'parse' },
          { id: 'b', family: 'expand', depends_on: ['a'], when: 'outputs.a.meta' },
        ],
      };

      registry.register(createSuccessPass('a', { meta: { branch: 'main' } }));
      registry.register(createRecordPass('b', called));

      const result = await runPipeline(spec, registry, {}, DEFAULT_WHEN_EVALUATOR);

      expect(result.ok).toBe(true);
      expect(called.value).toBe(true);
      expect(result.outputs.has('b')).toBe(true);
    });

    it('skips pass when outputs.a.x is null', async () => {
      const called = { value: false };
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-when-null',
        entrypoint: 'chatbot-compile',
        passes: [
          { id: 'a', family: 'parse' },
          { id: 'b', family: 'expand', depends_on: ['a'], when: 'outputs.a.x' },
        ],
      };

      registry.register(createSuccessPass('a', { x: null }));
      registry.register(createRecordPass('b', called));

      const result = await runPipeline(spec, registry, {}, DEFAULT_WHEN_EVALUATOR);

      expect(result.ok).toBe(true);
      expect(called.value).toBe(false);
      expect(result.outputs.has('b')).toBe(false);
    });

    it('skips pass when outputs.a.x is 0 (falsy number)', async () => {
      const called = { value: false };
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-when-zero',
        entrypoint: 'chatbot-compile',
        passes: [
          { id: 'a', family: 'parse' },
          { id: 'b', family: 'expand', depends_on: ['a'], when: 'outputs.a.count' },
        ],
      };

      registry.register(createSuccessPass('a', { count: 0 }));
      registry.register(createRecordPass('b', called));

      const result = await runPipeline(spec, registry, {}, DEFAULT_WHEN_EVALUATOR);

      expect(result.ok).toBe(true);
      expect(called.value).toBe(false);
      expect(result.outputs.has('b')).toBe(false);
    });

    it('runs pass when outputs.a.count is 1 (truthy number)', async () => {
      const called = { value: false };
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-when-one',
        entrypoint: 'chatbot-compile',
        passes: [
          { id: 'a', family: 'parse' },
          { id: 'b', family: 'expand', depends_on: ['a'], when: 'outputs.a.count' },
        ],
      };

      registry.register(createSuccessPass('a', { count: 1 }));
      registry.register(createRecordPass('b', called));

      const result = await runPipeline(spec, registry, {}, DEFAULT_WHEN_EVALUATOR);

      expect(result.ok).toBe(true);
      expect(called.value).toBe(true);
      expect(result.outputs.has('b')).toBe(true);
    });

    it('skips pass when outputs.a.x is empty string', async () => {
      const called = { value: false };
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-when-empty-string',
        entrypoint: 'chatbot-compile',
        passes: [
          { id: 'a', family: 'parse' },
          { id: 'b', family: 'expand', depends_on: ['a'], when: 'outputs.a.label' },
        ],
      };

      registry.register(createSuccessPass('a', { label: '' }));
      registry.register(createRecordPass('b', called));

      const result = await runPipeline(spec, registry, {}, DEFAULT_WHEN_EVALUATOR);

      expect(result.ok).toBe(true);
      expect(called.value).toBe(false);
      expect(result.outputs.has('b')).toBe(false);
    });

    it('runs pass when outputs.a.label is non-empty string', async () => {
      const called = { value: false };
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-when-nonempty-string',
        entrypoint: 'chatbot-compile',
        passes: [
          { id: 'a', family: 'parse' },
          { id: 'b', family: 'expand', depends_on: ['a'], when: 'outputs.a.label' },
        ],
      };

      registry.register(createSuccessPass('a', { label: 'hello' }));
      registry.register(createRecordPass('b', called));

      const result = await runPipeline(spec, registry, {}, DEFAULT_WHEN_EVALUATOR);

      expect(result.ok).toBe(true);
      expect(called.value).toBe(true);
      expect(result.outputs.has('b')).toBe(true);
    });

    it('skips pass when outputs.a.b.c path is too deep (intermediate undefined)', async () => {
      const called = { value: false };
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-when-deep-missing',
        entrypoint: 'chatbot-compile',
        passes: [
          { id: 'a', family: 'parse' },
          { id: 'b', family: 'expand', depends_on: ['a'], when: 'outputs.a.b.c' },
        ],
      };

      // a has no 'b' field
      registry.register(createSuccessPass('a', { x: 1 }));
      registry.register(createRecordPass('b', called));

      const result = await runPipeline(spec, registry, {}, DEFAULT_WHEN_EVALUATOR);

      expect(result.ok).toBe(true);
      expect(called.value).toBe(false);
      expect(result.outputs.has('b')).toBe(false);
    });

    it('runs pass when outputs.a.b.c path exists', async () => {
      const called = { value: false };
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-when-deep-exists',
        entrypoint: 'chatbot-compile',
        passes: [
          { id: 'a', family: 'parse' },
          { id: 'b', family: 'expand', depends_on: ['a'], when: 'outputs.a.b.c' },
        ],
      };

      registry.register(createSuccessPass('a', { b: { c: 'deep value' } }));
      registry.register(createRecordPass('b', called));

      const result = await runPipeline(spec, registry, {}, DEFAULT_WHEN_EVALUATOR);

      expect(result.ok).toBe(true);
      expect(called.value).toBe(true);
      expect(result.outputs.has('b')).toBe(true);
    });

    it('skips pass when outputs.a.b.c is an empty array (deep)', async () => {
      const called = { value: false };
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-when-deep-empty-array',
        entrypoint: 'chatbot-compile',
        passes: [
          { id: 'a', family: 'parse' },
          { id: 'b', family: 'expand', depends_on: ['a'], when: 'outputs.a.b.items' },
        ],
      };

      registry.register(createSuccessPass('a', { b: { items: [] } }));
      registry.register(createRecordPass('b', called));

      const result = await runPipeline(spec, registry, {}, DEFAULT_WHEN_EVALUATOR);

      expect(result.ok).toBe(true);
      expect(called.value).toBe(false);
      expect(result.outputs.has('b')).toBe(false);
    });

    it('skipped pass does not add output to state.outputs', async () => {
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-when-skip-no-output',
        entrypoint: 'chatbot-compile',
        passes: [
          { id: 'a', family: 'parse' },
          { id: 'b', family: 'expand', depends_on: ['a'], when: 'outputs.a.missingField' },
        ],
      };

      registry.register(createSuccessPass('a', { x: 1 }));
      registry.register(createSuccessPass('b', { shouldNotAppear: true }));

      const result = await runPipeline(spec, registry, {}, DEFAULT_WHEN_EVALUATOR);

      expect(result.ok).toBe(true);
      expect(result.outputs.has('a')).toBe(true);
      expect(result.outputs.has('b')).toBe(false);
    });

    it('downstream pass sees undefined for skipped upstream pass', async () => {
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-when-downstream-sees-undefined',
        entrypoint: 'chatbot-compile',
        passes: [
          { id: 'a', family: 'parse' },
          { id: 'b', family: 'expand', depends_on: ['a'], when: 'outputs.a.missing' },
          { id: 'c', family: 'validate', depends_on: ['b'] },
        ],
      };

      registry.register(createSuccessPass('a', { x: 1 }));
      registry.register(createRecordPass('b', { value: false }));
      registry.register(createRecordPass('c', { value: false }));

      const result = await runPipeline(spec, registry, {}, DEFAULT_WHEN_EVALUATOR);

      expect(result.ok).toBe(true);
      // b was skipped (when=false), so c depends on b and is also skipped
      expect(result.pass_statuses.find(s => s.pass_id === 'b')?.status).toBe('skipped');
      expect(result.pass_statuses.find(s => s.pass_id === 'c')?.status).toBe('skipped');
      // Neither b nor c added output
      expect(result.outputs.has('b')).toBe(false);
      expect(result.outputs.has('c')).toBe(false);
    });

    it('multiple when-gated passes: only truthy ones run', async () => {
      const called = new Map<string, boolean>();
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-when-multiple',
        entrypoint: 'chatbot-compile',
        passes: [
          { id: 'a', family: 'parse' },
          { id: 'b', family: 'expand', depends_on: ['a'], when: 'outputs.a.hasB' },
          { id: 'c', family: 'expand', depends_on: ['a'], when: 'outputs.a.hasC' },
          { id: 'd', family: 'validate', depends_on: ['b', 'c'] },
        ],
      };

      registry.register({
        id: 'a',
        family: 'parse',
        run: async () => ({ ok: true, output: { hasB: true, hasC: false } }),
      });
      registry.register({
        id: 'b',
        family: 'expand',
        run: async () => { called.set('b', true); return { ok: true, output: { b: 1 } }; },
      });
      registry.register({
        id: 'c',
        family: 'expand',
        run: async () => { called.set('c', true); return { ok: true, output: { c: 2 } }; },
      });
      registry.register({
        id: 'd',
        family: 'validate',
        run: async () => { called.set('d', true); return { ok: true, output: { d: 3 } }; },
      });

      const result = await runPipeline(spec, registry, {}, DEFAULT_WHEN_EVALUATOR);

      expect(result.ok).toBe(true);
      // b should run (hasB is true)
      expect(called.get('b')).toBe(true);
      // c should be skipped (hasC is false) - never called, so undefined
      expect(called.has('c')).toBe(false);
      // d depends on c which was skipped, so d should also be skipped
      expect(called.has('d')).toBe(false);
      // Check statuses
      expect(result.pass_statuses.find(s => s.pass_id === 'b')?.status).toBe('ok');
      expect(result.pass_statuses.find(s => s.pass_id === 'c')?.status).toBe('skipped');
      expect(result.pass_statuses.find(s => s.pass_id === 'd')?.status).toBe('skipped');
    });
  });
});
