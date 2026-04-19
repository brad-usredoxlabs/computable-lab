/**
 * Tests for PipelineRunner: topological execution of passes with depends_on and when-conditions.
 */

import { describe, it, expect } from 'vitest';
import { runPipeline, DEFAULT_WHEN_EVALUATOR, type PipelineSpec, type PassStatus } from './PipelineRunner.js';
import { PassRegistry } from './PassRegistry.js';
import type { Pass, PassResult, PipelineState, CompilerDiagnosticOutcome } from './types.js';

/**
 * Creates a stub pass that returns a fixed result.
 */
function createStubPass(
  id: string,
  result: PassResult,
  sideEffect?: (state: PipelineState) => void,
): Pass {
  return {
    id,
    family: 'validate',
    run: async ({ pass_id, state }) => {
      if (sideEffect) {
        sideEffect(state);
      }
      return result;
    },
  };
}

/**
 * Creates a stub pass that records its execution order.
 */
function createOrderingPass(id: string, log: string[]): Pass {
  return {
    id,
    family: 'validate',
    run: async () => {
      log.push(id);
      return { ok: true, output: { executed: id } };
    },
  };
}

/**
 * Creates a stub pass that fails.
 */
function createFailingPass(id: string, message = 'Intentional failure'): Pass {
  return {
    id,
    family: 'validate',
    run: async () => ({
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'TEST_FAILURE',
          message,
          pass_id: id,
        },
      ],
    }),
  };
}

/**
 * Creates a stub pass that succeeds with output.
 */
function createSuccessPass(id: string, output: unknown): Pass {
  return {
    id,
    family: 'validate',
    run: async () => ({
      ok: true,
      output,
    }),
  };
}

/**
 * Creates an async stub pass that resolves after a delay.
 */
function createAsyncPass(id: string, output: unknown, delayMs = 10): Pass {
  return {
    id,
    family: 'validate',
    run: async () => {
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return { ok: true, output };
    },
  };
}

describe('PipelineRunner', () => {
  describe('Linear 3-pass happy path', () => {
    it('executes A → B → C and returns ok: true with all outputs', async () => {
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-pipeline',
        entrypoint: 'main',
        passes: [
          { id: 'A', family: 'parse' },
          { id: 'B', family: 'normalize' },
          { id: 'C', family: 'validate' },
        ],
      };

      registry.register(createSuccessPass('A', { a: 1 }));
      registry.register(createSuccessPass('B', { b: 2 }));
      registry.register(createSuccessPass('C', { c: 3 }));

      const result = await runPipeline(spec, registry, {});

      expect(result.ok).toBe(true);
      expect(result.outputs.get('A')).toEqual({ a: 1 });
      expect(result.outputs.get('B')).toEqual({ b: 2 });
      expect(result.outputs.get('C')).toEqual({ c: 3 });
      expect(result.pass_statuses).toHaveLength(3);
      expect(result.pass_statuses.every(s => s.status === 'ok')).toBe(true);
    });
  });

  describe('Topo respects depends_on order', () => {
    it('executes in dependency order even when declared out of order', async () => {
      const executionOrder: string[] = [];
      const registry = new PassRegistry();
      
      // Declare passes out of order: C depends on B, B depends on A
      const spec: PipelineSpec = {
        pipelineId: 'test-pipeline',
        entrypoint: 'main',
        passes: [
          { id: 'C', family: 'validate', depends_on: ['B'] },
          { id: 'A', family: 'parse' },
          { id: 'B', family: 'normalize', depends_on: ['A'] },
        ],
      };

      registry.register(createOrderingPass('A', executionOrder));
      registry.register(createOrderingPass('B', executionOrder));
      registry.register(createOrderingPass('C', executionOrder));

      await runPipeline(spec, registry, {});

      // Should execute in order: A, then B, then C
      expect(executionOrder).toEqual(['A', 'B', 'C']);
    });
  });

  describe('Failure cascades as skip', () => {
    it('skips C when B fails and C depends on B', async () => {
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-pipeline',
        entrypoint: 'main',
        passes: [
          { id: 'A', family: 'parse' },
          { id: 'B', family: 'normalize', depends_on: ['A'] },
          { id: 'C', family: 'validate', depends_on: ['B'] },
        ],
      };

      registry.register(createSuccessPass('A', { a: 1 }));
      registry.register(createFailingPass('B', 'B failed intentionally'));
      registry.register(createSuccessPass('C', { c: 3 }));

      const result = await runPipeline(spec, registry, {});

      expect(result.ok).toBe(false);
      
      const statusA = result.pass_statuses.find(s => s.pass_id === 'A');
      const statusB = result.pass_statuses.find(s => s.pass_id === 'B');
      const statusC = result.pass_statuses.find(s => s.pass_id === 'C');

      expect(statusA?.status).toBe('ok');
      expect(statusB?.status).toBe('failed');
      expect(statusC?.status).toBe('skipped');
      expect(statusC?.reason).toContain('B');
    });
  });

  describe('when=false skips', () => {
    it('skips pass with when="never" using DEFAULT_WHEN_EVALUATOR', async () => {
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-pipeline',
        entrypoint: 'main',
        passes: [
          { id: 'A', family: 'parse' },
          { id: 'B', family: 'normalize', when: 'never' },
          { id: 'C', family: 'validate' },
        ],
      };

      registry.register(createSuccessPass('A', { a: 1 }));
      registry.register(createSuccessPass('B', { b: 2 }));
      registry.register(createSuccessPass('C', { c: 3 }));

      const result = await runPipeline(spec, registry, {}, DEFAULT_WHEN_EVALUATOR);

      const statusB = result.pass_statuses.find(s => s.pass_id === 'B');
      expect(statusB?.status).toBe('skipped');
      expect(statusB?.reason).toBe('when=false');
      
      // A and C should still run
      expect(result.outputs.has('A')).toBe(true);
      expect(result.outputs.has('C')).toBe(true);
      expect(result.outputs.has('B')).toBe(false);
    });
  });

  describe('Missing pass in registry', () => {
    it('fails fast with error diagnostic when pass is not registered', async () => {
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-pipeline',
        entrypoint: 'main',
        passes: [
          { id: 'A', family: 'parse' },
          { id: 'B', family: 'normalize' },
          { id: 'C', family: 'validate' },
        ],
      };

      // Only register A and B, not C
      registry.register(createSuccessPass('A', { a: 1 }));
      registry.register(createSuccessPass('B', { b: 2 }));

      const result = await runPipeline(spec, registry, {});

      expect(result.ok).toBe(false);
      expect(result.diagnostics.some(d => 
        d.severity === 'error' && 
        d.code === 'PIPELINE_MISSING_PASS' &&
        d.message.includes('C')
      )).toBe(true);
      expect(result.pass_statuses).toHaveLength(0); // No passes executed
    });
  });

  describe('Cycle detection', () => {
    it('detects cycle when A depends on B and B depends on A', async () => {
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-pipeline',
        entrypoint: 'main',
        passes: [
          { id: 'A', family: 'parse', depends_on: ['B'] },
          { id: 'B', family: 'normalize', depends_on: ['A'] },
        ],
      };

      registry.register(createSuccessPass('A', { a: 1 }));
      registry.register(createSuccessPass('B', { b: 2 }));

      const result = await runPipeline(spec, registry, {});

      expect(result.ok).toBe(false);
      expect(result.diagnostics.some(d => 
        d.severity === 'error' && 
        d.code === 'PIPELINE_CYCLE' &&
        d.message.includes('cycle in pipeline')
      )).toBe(true);
      expect(result.pass_statuses).toHaveLength(0); // No passes executed
    });
  });

  describe('Async pass', () => {
    it('handles async passes that return Promises', async () => {
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-pipeline',
        entrypoint: 'main',
        passes: [
          { id: 'A', family: 'parse' },
          { id: 'B', family: 'normalize' },
        ],
      };

      registry.register(createAsyncPass('A', { a: 1 }, 50));
      registry.register(createAsyncPass('B', { b: 2 }, 30));

      const result = await runPipeline(spec, registry, {});

      expect(result.ok).toBe(true);
      expect(result.outputs.get('A')).toEqual({ a: 1 });
      expect(result.outputs.get('B')).toEqual({ b: 2 });
    });
  });

  describe('Custom whenEvaluator', () => {
    it('runs pass when custom evaluator returns true based on state', async () => {
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-pipeline',
        entrypoint: 'main',
        passes: [
          { id: 'process_pdf', family: 'parse', when: 'has_pdf' },
        ],
      };

      registry.register(createSuccessPass('process_pdf', { pages: 10 }));

      // Custom evaluator that checks for pdf in input
      const customEvaluator = (_condition: string, state: PipelineState): boolean => {
        return !!state.input.pdf;
      };

      // With pdf in input, pass should run
      const resultWithPdf = await runPipeline(spec, registry, { pdf: 'some-data' }, customEvaluator);
      expect(resultWithPdf.ok).toBe(true);
      expect(resultWithPdf.outputs.has('process_pdf')).toBe(true);

      // Without pdf in input, pass should be skipped
      const resultWithoutPdf = await runPipeline(spec, registry, {}, customEvaluator);
      expect(resultWithoutPdf.ok).toBe(true); // Still ok because skip is not failure
      const status = resultWithoutPdf.pass_statuses.find(s => s.pass_id === 'process_pdf');
      expect(status?.status).toBe('skipped');
      expect(status?.reason).toBe('when=false');
    });
  });

  describe('Additional edge cases', () => {
    it('handles pass that throws exception as failed with diagnostic', async () => {
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-pipeline',
        entrypoint: 'main',
        passes: [
          { id: 'A', family: 'parse' },
        ],
      };

      const throwingPass: Pass = {
        id: 'A',
        family: 'parse',
        run: async () => {
          throw new Error('Unexpected error in pass A');
        },
      };
      registry.register(throwingPass);

      const result = await runPipeline(spec, registry, {});

      expect(result.ok).toBe(false);
      expect(result.pass_statuses.find(s => s.pass_id === 'A')?.status).toBe('failed');
      expect(result.diagnostics.some(d => 
        d.severity === 'error' && 
        d.message.includes('Unexpected error in pass A')
      )).toBe(true);
    });

    it('accumulates diagnostics from all passes regardless of success', async () => {
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-pipeline',
        entrypoint: 'main',
        passes: [
          { id: 'A', family: 'parse' },
          { id: 'B', family: 'normalize' },
        ],
      };

      const passWithWarnings: Pass = {
        id: 'A',
        family: 'parse',
        run: async () => ({
          ok: true,
          output: { data: 'ok' },
          diagnostics: [
            { severity: 'warning', code: 'WARN_1', message: 'Warning from A', pass_id: 'A' },
          ],
        }),
      };

      const passWithErrors: Pass = {
        id: 'B',
        family: 'normalize',
        run: async () => ({
          ok: false,
          diagnostics: [
            { severity: 'error', code: 'ERR_1', message: 'Error from B', pass_id: 'B' },
          ],
        }),
      };

      registry.register(passWithWarnings);
      registry.register(passWithErrors);

      const result = await runPipeline(spec, registry, {});

      expect(result.ok).toBe(false);
      expect(result.diagnostics).toHaveLength(2);
      expect(result.diagnostics.some(d => d.code === 'WARN_1')).toBe(true);
      expect(result.diagnostics.some(d => d.code === 'ERR_1')).toBe(true);
    });

    it('independent passes continue running after a failure', async () => {
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-pipeline',
        entrypoint: 'main',
        passes: [
          { id: 'A', family: 'parse' },
          { id: 'B', family: 'normalize', depends_on: ['A'] },
          { id: 'C', family: 'validate' }, // Independent of A and B
        ],
      };

      registry.register(createSuccessPass('A', { a: 1 }));
      registry.register(createFailingPass('B', 'B failed'));
      registry.register(createSuccessPass('C', { c: 3 }));

      const result = await runPipeline(spec, registry, {});

      expect(result.ok).toBe(false);
      expect(result.pass_statuses.find(s => s.pass_id === 'A')?.status).toBe('ok');
      expect(result.pass_statuses.find(s => s.pass_id === 'B')?.status).toBe('failed');
      // C should still run because it doesn't depend on B
      expect(result.pass_statuses.find(s => s.pass_id === 'C')?.status).toBe('ok');
      expect(result.outputs.has('C')).toBe(true);
    });
  });

  describe('PipelineState context and meta merge semantics', () => {
    it('context patch merges: next pass sees merged context', async () => {
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-pipeline',
        entrypoint: 'main',
        passes: [
          { id: 'A', family: 'parse' },
          { id: 'B', family: 'normalize', depends_on: ['A'] },
        ],
      };

      // Pass A returns a context patch
      const passA: Pass = {
        id: 'A',
        family: 'parse',
        run: async () => ({
          ok: true,
          output: { context: { well: { id: 'A1' } } },
        }),
      };

      // Pass B checks that it sees the merged context
      const passB: Pass = {
        id: 'B',
        family: 'normalize',
        run: async ({ state }) => {
          expect(state.context.well).toEqual({ id: 'A1' });
          return { ok: true, output: { processed: true } };
        },
      };

      registry.register(passA);
      registry.register(passB);

      const result = await runPipeline(spec, registry, {});

      expect(result.ok).toBe(true);
    });

    it('meta scalar patch merges with last-write-wins', async () => {
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-pipeline',
        entrypoint: 'main',
        passes: [
          { id: 'A', family: 'parse' },
          { id: 'B', family: 'normalize', depends_on: ['A'] },
        ],
      };

      // Pass A sets meta.branch to 'context'
      const passA: Pass = {
        id: 'A',
        family: 'parse',
        run: async () => ({
          ok: true,
          output: { meta: { branch: 'context' } },
        }),
      };

      // Pass B overwrites meta.branch to 'extraction'
      const passB: Pass = {
        id: 'B',
        family: 'normalize',
        run: async ({ state }) => {
          // B sees 'context' from A
          expect(state.meta.branch).toBe('context');
          return {
            ok: true,
            output: { meta: { branch: 'extraction' } },
          };
        },
      };

      registry.register(passA);
      registry.register(passB);

      const result = await runPipeline(spec, registry, {});

      expect(result.ok).toBe(true);
      // After both passes, meta.branch should be 'extraction' (last-write-wins)
      expect(result.outputs.get('A')).toEqual({ meta: { branch: 'context' } });
      expect(result.outputs.get('B')).toEqual({ meta: { branch: 'extraction' } });
    });

    it('meta array patch concatenates', async () => {
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-pipeline',
        entrypoint: 'main',
        passes: [
          { id: 'A', family: 'parse' },
          { id: 'B', family: 'normalize', depends_on: ['A'] },
          { id: 'C', family: 'validate', depends_on: ['B'] },
        ],
      };

      // Pass A adds first provenance entry
      const passA: Pass = {
        id: 'A',
        family: 'parse',
        run: async () => ({
          ok: true,
          output: { meta: { derivation_provenance: [{ step_index: 0 }] } },
        }),
      };

      // Pass B adds second provenance entry
      const passB: Pass = {
        id: 'B',
        family: 'normalize',
        run: async ({ state }) => {
          // B sees the first entry from A
          expect(state.meta.derivation_provenance).toEqual([{ step_index: 0 }]);
          return {
            ok: true,
            output: { meta: { derivation_provenance: [{ step_index: 1 }] } },
          };
        },
      };

      // Pass C reads the merged state and returns it for verification
      const passC: Pass = {
        id: 'C',
        family: 'validate',
        run: async ({ state }) => ({
          ok: true,
          output: { merged_meta: state.meta },
        }),
      };

      registry.register(passA);
      registry.register(passB);
      registry.register(passC);

      const result = await runPipeline(spec, registry, {});

      expect(result.ok).toBe(true);
      // After both passes, derivation_provenance should have both entries concatenated
      // Verify via pass C's output which captured the merged state
      const mergedMeta = (result.outputs.get('C') as Record<string, unknown>).merged_meta as Record<string, unknown>;
      expect(mergedMeta.derivation_provenance).toEqual([{ step_index: 0 }, { step_index: 1 }]);
    });

    it('raw output still accessible via state.outputs even when context/meta patches present', async () => {
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-pipeline',
        entrypoint: 'main',
        passes: [
          { id: 'A', family: 'parse' },
        ],
      };

      const passA: Pass = {
        id: 'A',
        family: 'parse',
        run: async () => ({
          ok: true,
          output: { context: { x: 1 }, foo: 'bar' },
        }),
      };

      registry.register(passA);

      const result = await runPipeline(spec, registry, {});

      expect(result.ok).toBe(true);
      // Full output object is retained, including both context and foo
      expect(result.outputs.get('A')).toEqual({ context: { x: 1 }, foo: 'bar' });
      // But foo is directly accessible
      expect((result.outputs.get('A') as Record<string, unknown>).foo).toBe('bar');
    });

    it('invalid context patch emits diagnostic but does not fail pipeline', async () => {
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-pipeline',
        entrypoint: 'main',
        passes: [
          { id: 'A', family: 'parse' },
          { id: 'B', family: 'normalize', depends_on: ['A'] },
        ],
      };

      // Pass A returns invalid context patch (string instead of object)
      const passA: Pass = {
        id: 'A',
        family: 'parse',
        run: async () => ({
          ok: true,
          output: { context: 'not an object' },
        }),
      };

      // Pass B should still run
      const passB: Pass = {
        id: 'B',
        family: 'normalize',
        run: async () => ({
          ok: true,
          output: { processed: true },
        }),
      };

      registry.register(passA);
      registry.register(passB);

      const result = await runPipeline(spec, registry, {});

      expect(result.ok).toBe(true);
      // Diagnostic should contain invalid_context_patch code and mention non-object
      expect(result.diagnostics.some(d => 
        d.severity === 'warning' && 
        d.code === 'invalid_context_patch' &&
        d.message.includes('non-object')
      )).toBe(true);
    });

    it('outcome field round-trips via pass_outcomes', async () => {
      const registry = new PassRegistry();
      const spec: PipelineSpec = {
        pipelineId: 'test-pipeline',
        entrypoint: 'main',
        passes: [
          { id: 'A', family: 'parse' },
          { id: 'B', family: 'normalize', depends_on: ['A'] },
        ],
      };

      const passA: Pass = {
        id: 'A',
        family: 'parse',
        run: async () => ({
          ok: true,
          output: { data: 'ok' },
          outcome: 'needs-missing-fact' as CompilerDiagnosticOutcome,
        }),
      };

      const passB: Pass = {
        id: 'B',
        family: 'normalize',
        run: async () => ({
          ok: true,
          output: { processed: true },
          outcome: 'auto-resolved' as CompilerDiagnosticOutcome,
        }),
      };

      registry.register(passA);
      registry.register(passB);

      const result = await runPipeline(spec, registry, {});

      expect(result.ok).toBe(true);
      expect(result.pass_outcomes.size).toBe(2);
      
      expect(result.pass_outcomes.get('A')).toBe('needs-missing-fact');
      expect(result.pass_outcomes.get('B')).toBe('auto-resolved');
    });
  });
});
