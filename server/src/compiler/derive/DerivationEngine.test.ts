/**
 * DerivationEngine tests.
 * 
 * Uses a stub OperatorRegistry that handles two ops:
 * - echo: {op:'echo', from:'<name>', into:'<name>'} — copies input name's value to output name.
 * - fail: returns {ok:false, reason:'stub failure'}.
 */

import { describe, it, expect } from 'vitest';
import { DerivationEngine } from './DerivationEngine.js';
import type { DerivationModel, DerivationStep, OperatorRegistry, WorkingState } from './DerivationEngine.js';

/**
 * Stub operator registry for testing.
 */
class StubOperatorRegistry implements OperatorRegistry {
  invoke(
    step: DerivationStep,
    state: WorkingState,
  ): { ok: true; result: { updates: Record<string, unknown> } } | { ok: false; reason: string } {
    const op = step.op;

    if (op === 'echo') {
      // echo: {op:'echo', from:'<name>', into:'<name>'}
      const from = step.from;
      const into = step.into;
      if (typeof from !== 'string' || typeof into !== 'string') {
        return { ok: false, reason: 'echo requires string "from" and "into" fields' };
      }
      const value = state.get(from);
      if (value === undefined) {
        return { ok: false, reason: `echo: source "${from}" not found in state` };
      }
      return {
        ok: true,
        result: {
          updates: { [into]: value },
        },
      };
    }

    if (op === 'fail') {
      return { ok: false, reason: 'stub failure' };
    }

    // Unknown op
    return { ok: false, reason: `unknown operator: ${op}` };
  }
}

/**
 * Helper to create a minimal derivation model.
 */
function makeModel(
  id: string,
  inputs: Array<{ name: string; type: string; required?: boolean }>,
  steps: DerivationStep[],
  outputName: string,
  version = 1,
): DerivationModel {
  return {
    kind: 'derivation-model',
    id,
    name: `Test ${id}`,
    version,
    inputs,
    output: { name: outputName, type: 'any' },
    steps,
  };
}

describe('DerivationEngine', () => {
  describe('single-step echo', () => {
    it('copies input value to output', () => {
      const registry = new StubOperatorRegistry();
      const engine = new DerivationEngine(registry);

      const model = makeModel(
        'test-echo',
        [{ name: 'x', type: 'number' }],
        [{ op: 'echo', from: 'x', into: 'y' }],
        'y',
      );

      const outcome = engine.run(model, { x: 42 });

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.output).toBe(42);
        expect(outcome.output_name).toBe('y');
      }
    });
  });

  describe('missing required input', () => {
    it('fails when required input is not provided', () => {
      const registry = new StubOperatorRegistry();
      const engine = new DerivationEngine(registry);

      const model = makeModel(
        'test-missing',
        [{ name: 'x', type: 'number', required: true }],
        [{ op: 'echo', from: 'x', into: 'y' }],
        'y',
      );

      const outcome = engine.run(model, {});

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.reason).toMatch(/missing input: x/);
      }
    });
  });

  describe('optional input missing', () => {
    it('succeeds when optional input is not provided and not used', () => {
      const registry = new StubOperatorRegistry();
      const engine = new DerivationEngine(registry);

      const model = makeModel(
        'test-optional',
        [
          { name: 'x', type: 'number', required: true },
          { name: 'z', type: 'number', required: false },
        ],
        [{ op: 'echo', from: 'x', into: 'y' }],
        'y',
      );

      const outcome = engine.run(model, { x: 10 });

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.output).toBe(10);
      }
    });
  });

  describe('operator failure', () => {
    it('propagates operator failure with step_index', () => {
      const registry = new StubOperatorRegistry();
      const engine = new DerivationEngine(registry);

      const model = makeModel(
        'test-fail',
        [{ name: 'x', type: 'number' }],
        [{ op: 'fail' }],
        'y',
      );

      const outcome = engine.run(model, { x: 42 });

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.step_index).toBe(0);
        expect(outcome.reason).toContain('stub failure');
      }
    });
  });

  describe('multi-step chain', () => {
    it('chains multiple echo operations', () => {
      const registry = new StubOperatorRegistry();
      const engine = new DerivationEngine(registry);

      const model = makeModel(
        'test-chain',
        [{ name: 'x', type: 'number' }],
        [
          { op: 'echo', from: 'x', into: 'y' },
          { op: 'echo', from: 'y', into: 'z' },
        ],
        'z',
      );

      const outcome = engine.run(model, { x: 99 });

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.output).toBe(99);
        expect(outcome.output_name).toBe('z');
      }
    });
  });

  describe('unbound output', () => {
    it('fails when output name is never written', () => {
      const registry = new StubOperatorRegistry();
      const engine = new DerivationEngine(registry);

      const model = makeModel(
        'test-unbound',
        [{ name: 'x', type: 'number' }],
        [{ op: 'echo', from: 'x', into: 'y' }],
        'z', // z is never written
      );

      const outcome = engine.run(model, { x: 42 });

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.reason).toMatch(/model output not produced: z/);
      }
    });
  });

  describe('derivation_versions', () => {
    it('populates derivation_versions with model id and version', () => {
      const registry = new StubOperatorRegistry();
      const engine = new DerivationEngine(registry);

      const model = makeModel(
        'DM-test',
        [{ name: 'x', type: 'number' }],
        [{ op: 'echo', from: 'x', into: 'y' }],
        'y',
        1,
      );

      const outcome = engine.run(model, { x: 42 });

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.derivation_versions['DM-test']).toBe(1);
      }
    });

    it('uses correct version number', () => {
      const registry = new StubOperatorRegistry();
      const engine = new DerivationEngine(registry);

      const model = makeModel(
        'DM-version-test',
        [{ name: 'x', type: 'number' }],
        [{ op: 'echo', from: 'x', into: 'y' }],
        'y',
        5,
      );

      const outcome = engine.run(model, { x: 42 });

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.derivation_versions['DM-version-test']).toBe(5);
      }
    });
  });

  describe('provenance', () => {
    it('records provenance for each step', () => {
      const registry = new StubOperatorRegistry();
      const engine = new DerivationEngine(registry);

      const model = makeModel(
        'test-prov',
        [{ name: 'x', type: 'number' }],
        [
          { op: 'echo', from: 'x', into: 'y' },
          { op: 'echo', from: 'y', into: 'z' },
        ],
        'z',
      );

      const outcome = engine.run(model, { x: 42 });

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.provenance.length).toBe(2);

        // First step
        expect(outcome.provenance[0]!.step_index).toBe(0);
        expect(outcome.provenance[0]!.op).toBe('echo');
        expect(outcome.provenance[0]!.writes).toEqual(['y']);

        // Second step
        expect(outcome.provenance[1]!.step_index).toBe(1);
        expect(outcome.provenance[1]!.op).toBe('echo');
        expect(outcome.provenance[1]!.writes).toEqual(['z']);
      }
    });

    it('includes step record in provenance entry', () => {
      const registry = new StubOperatorRegistry();
      const engine = new DerivationEngine(registry);

      const model = makeModel(
        'test-prov-step',
        [{ name: 'x', type: 'number' }],
        [{ op: 'echo', from: 'x', into: 'y' }],
        'y',
      );

      const outcome = engine.run(model, { x: 42 });

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.provenance[0]!.step).toEqual({ op: 'echo', from: 'x', into: 'y' });
      }
    });
  });

  describe('reads tracking', () => {
    it('tracks reads from step fields that match state keys', () => {
      const registry = new StubOperatorRegistry();
      const engine = new DerivationEngine(registry);

      const model = makeModel(
        'test-reads',
        [{ name: 'x', type: 'number' }, { name: 'y', type: 'number' }],
        [{ op: 'echo', from: 'x', into: 'y' }],
        'y',
      );

      const outcome = engine.run(model, { x: 42, y: 100 });

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        // 'from' field has value 'x' which is in state, so it should be tracked as a read
        expect(outcome.provenance[0]!.reads).toContain('x');
      }
    });
  });

  describe('Quantity values', () => {
    it('handles Quantity objects through the working state', () => {
      const registry = new StubOperatorRegistry();
      const engine = new DerivationEngine(registry);

      const quantity = { value: 5, unit: { base: { m: 1 }, scale: 1 } };

      const model = makeModel(
        'test-quantity',
        [{ name: 'q', type: 'quantity' }],
        [{ op: 'echo', from: 'q', into: 'result' }],
        'result',
      );

      const outcome = engine.run(model, { q: quantity });

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.output).toBe(quantity);
      }
    });
  });
});
