/**
 * Tests for StandardOperatorRegistry
 */

import { StandardOperatorRegistry, ConstantsTable } from './operators.js';
import { parseUnit } from './units.js';
import { DerivationStep, WorkingState, Quantity } from './DerivationEngine.js';

/**
 * Simple WorkingState implementation for tests.
 */
class TestWorkingState implements WorkingState {
  private bindings: Map<string, unknown>;

  constructor(initial?: Record<string, unknown>) {
    this.bindings = new Map(Object.entries(initial ?? {}));
  }

  get(name: string): unknown {
    return this.bindings.get(name);
  }

  has(name: string): boolean {
    return this.bindings.has(name);
  }

  snapshot(): Readonly<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of this.bindings.entries()) {
      result[key] = value;
    }
    return result;
  }

  set(name: string, value: unknown): void {
    this.bindings.set(name, value);
  }
}

/**
 * Helper to create a step with given properties.
 */
function makeStep(props: Record<string, unknown>): DerivationStep {
  return props as DerivationStep;
}

describe('StandardOperatorRegistry', () => {
  describe('assign operator', () => {
    it('assign numeric', () => {
      const registry = new StandardOperatorRegistry();
      const state = new TestWorkingState({ x: 5 });
      const step = makeStep({ op: 'assign', from: 'x', into: 'y' });

      const result = registry.invoke(step, state);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.updates).toEqual({ y: 5 });
      }
    });

    it('assign Quantity', () => {
      const registry = new StandardOperatorRegistry();
      const qty: Quantity = { value: 2, unit: parseUnit('m') };
      const state = new TestWorkingState({ x: qty });
      const step = makeStep({ op: 'assign', from: 'x', into: 'y' });

      const result = registry.invoke(step, state);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.updates.y).toEqual(qty);
      }
    });

    it('assign missing from - unbound name', () => {
      const registry = new StandardOperatorRegistry();
      const state = new TestWorkingState({ z: 10 });
      const step = makeStep({ op: 'assign', from: 'x', into: 'y' });

      const result = registry.invoke(step, state);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/unbound/);
      }
    });
  });

  describe('sum operator', () => {
    it('sum numeric', () => {
      const registry = new StandardOperatorRegistry();
      const state = new TestWorkingState({ a: 2, b: 3 });
      const step = makeStep({ op: 'sum', lhs: 'a', rhs: 'b', into: 'c' });

      const result = registry.invoke(step, state);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.updates.c).toBe(5);
      }
    });

    it('sum Quantity matched - 1 m + 200 cm = 3 m', () => {
      const registry = new StandardOperatorRegistry();
      const state = new TestWorkingState({
        a: { value: 1, unit: parseUnit('m') },
        b: { value: 200, unit: parseUnit('cm') },
      });
      const step = makeStep({ op: 'sum', lhs: 'a', rhs: 'b', into: 'c' });

      const result = registry.invoke(step, state);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.updates.c).toEqual({ value: 3, unit: parseUnit('m') });
      }
    });

    it('sum Quantity mismatch - m + s', () => {
      const registry = new StandardOperatorRegistry();
      const state = new TestWorkingState({
        a: { value: 1, unit: parseUnit('m') },
        b: { value: 1, unit: parseUnit('s') },
      });
      const step = makeStep({ op: 'sum', lhs: 'a', rhs: 'b', into: 'c' });

      const result = registry.invoke(step, state);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/dimension/);
      }
    });
  });

  describe('subtract operator', () => {
    it('subtract numeric 10 - 3 = 7', () => {
      const registry = new StandardOperatorRegistry();
      const state = new TestWorkingState({ a: 10, b: 3 });
      const step = makeStep({ op: 'subtract', lhs: 'a', rhs: 'b', into: 'c' });

      const result = registry.invoke(step, state);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.updates.c).toBe(7);
      }
    });
  });

  describe('divide operator', () => {
    it('divide Quantity - 10 mol / 2 L = 5 mol/L', () => {
      const registry = new StandardOperatorRegistry();
      const state = new TestWorkingState({
        a: { value: 10, unit: parseUnit('mol') },
        b: { value: 2, unit: parseUnit('L') },
      });
      const step = makeStep({ op: 'divide', lhs: 'a', rhs: 'b', into: 'c' });

      const result = registry.invoke(step, state);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.updates.c).toEqual({ value: 5, unit: parseUnit('mol/L') });
      }
    });

    it('divide by zero', () => {
      const registry = new StandardOperatorRegistry();
      const state = new TestWorkingState({ a: 10, b: 0 });
      const step = makeStep({ op: 'divide', lhs: 'a', rhs: 'b', into: 'c' });

      const result = registry.invoke(step, state);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/non-finite/);
      }
    });
  });

  describe('multiply operator', () => {
    it('multiply Quantity - 3 m × 4 s = 12 m*s', () => {
      const registry = new StandardOperatorRegistry();
      const state = new TestWorkingState({
        a: { value: 3, unit: parseUnit('m') },
        b: { value: 4, unit: parseUnit('s') },
      });
      const step = makeStep({ op: 'multiply', lhs: 'a', rhs: 'b', into: 'c' });

      const result = registry.invoke(step, state);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.updates.c).toEqual({ value: 12, unit: parseUnit('m*s') });
      }
    });
  });

  describe('clamp operator', () => {
    it('clamp numeric in range - value=50, min=0, max=100', () => {
      const registry = new StandardOperatorRegistry();
      const state = new TestWorkingState({ x: 50 });
      const step = makeStep({ op: 'clamp', value: 'x', min: 0, max: 100, into: 'y' });

      const result = registry.invoke(step, state);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.updates.y).toBe(50);
      }
    });

    it('clamp low - value=-5, min=0, max=10', () => {
      const registry = new StandardOperatorRegistry();
      const state = new TestWorkingState({ x: -5 });
      const step = makeStep({ op: 'clamp', value: 'x', min: 0, max: 10, into: 'y' });

      const result = registry.invoke(step, state);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.updates.y).toBe(0);
      }
    });

    it('clamp Quantity with unit - 500K clamped to 373.15 K', () => {
      const registry = new StandardOperatorRegistry();
      const state = new TestWorkingState({
        x: { value: 500, unit: parseUnit('K') },
      });
      const step = makeStep({ op: 'clamp', value: 'x', min: 0, max: 373.15, unit: 'K', into: 'y' });

      const result = registry.invoke(step, state);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.updates.y).toEqual({ value: 373.15, unit: parseUnit('K') });
      }
    });
  });

  describe('weighted_average operator', () => {
    it('weighted_average same unit - [2, 4, 6] mM with weights [1,1,2] = 4.5 mM', () => {
      const registry = new StandardOperatorRegistry();
      const state = new TestWorkingState({
        a: { value: 2, unit: parseUnit('mM') },
        b: { value: 4, unit: parseUnit('mM') },
        c: { value: 6, unit: parseUnit('mM') },
      });
      const step = makeStep({
        op: 'weighted_average',
        values: ['a', 'b', 'c'],
        weights: [1, 1, 2],
        into: 'result',
      });

      const result = registry.invoke(step, state);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // (2*1 + 4*1 + 6*2) / 4 = (2 + 4 + 12) / 4 = 18 / 4 = 4.5
        expect(result.result.updates.result).toEqual({ value: 4.5, unit: parseUnit('mM') });
      }
    });

    it('weighted_average mismatch - one mM, one s', () => {
      const registry = new StandardOperatorRegistry();
      const state = new TestWorkingState({
        a: { value: 2, unit: parseUnit('mM') },
        b: { value: 4, unit: parseUnit('s') },
      });
      const step = makeStep({
        op: 'weighted_average',
        values: ['a', 'b'],
        weights: [1, 1],
        into: 'result',
      });

      const result = registry.invoke(step, state);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/dimension/);
      }
    });
  });

  describe('lookup_constant operator', () => {
    it('lookup_constant hit - avogadro constant', () => {
      const constants: ConstantsTable = {
        get(id: string): Quantity | number | undefined {
          if (id === 'avogadro') {
            return { value: 6.022e23, unit: parseUnit('mol^-1') };
          }
          return undefined;
        },
      };
      const registry = new StandardOperatorRegistry(constants);
      const state = new TestWorkingState({});
      const step = makeStep({ op: 'lookup_constant', id: 'avogadro', into: 'n' });

      const result = registry.invoke(step, state);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.updates.n).toEqual({ value: 6.022e23, unit: parseUnit('mol^-1') });
      }
    });

    it('lookup_constant miss - unknown id', () => {
      const constants: ConstantsTable = {
        get(id: string): Quantity | number | undefined {
          return undefined;
        },
      };
      const registry = new StandardOperatorRegistry(constants);
      const state = new TestWorkingState({});
      const step = makeStep({ op: 'lookup_constant', id: 'unknown', into: 'n' });

      const result = registry.invoke(step, state);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/unknown constant/);
      }
    });
  });

  describe('unknown operator', () => {
    it('unknown op - nope', () => {
      const registry = new StandardOperatorRegistry();
      const state = new TestWorkingState({ x: 5 });
      const step = makeStep({ op: 'nope', lhs: 'x', into: 'y' });

      const result = registry.invoke(step, state);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/unknown operator: nope/);
      }
    });
  });
});
