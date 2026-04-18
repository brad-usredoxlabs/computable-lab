/**
 * FourLayerCorrespondence.test.ts
 *
 * Tests for the checkFourLayerCorrespondence function.
 */

import { describe, expect, it } from 'vitest';
import { checkFourLayerCorrespondence, FourLayerInput } from './StructuralCorrespondencePass';

describe('checkFourLayerCorrespondence', () => {
  it('all four layers identical - all pairs pass', () => {
    const input: FourLayerInput = {
      global: ['create', 'mix', 'incubate'],
      local: ['create', 'mix', 'incubate'],
      planned: ['create', 'mix', 'incubate'],
      executed: ['create', 'mix', 'incubate'],
    };

    const result = checkFourLayerCorrespondence(input);

    expect(result.ok).toBe(true);
    expect(result.pairs).toHaveLength(3);
    expect(result.pairs[0].pair).toBe('global->local');
    expect(result.pairs[1].pair).toBe('local->planned');
    expect(result.pairs[2].pair).toBe('planned->executed');
    expect(result.pairs[0].ok).toBe(true);
    expect(result.pairs[1].ok).toBe(true);
    expect(result.pairs[2].ok).toBe(true);
    expect(result.pairs[0].mismatches).toBeUndefined();
    expect(result.pairs[1].mismatches).toBeUndefined();
    expect(result.pairs[2].mismatches).toBeUndefined();
  });

  it('global/local mismatch only - first pair fails', () => {
    const input: FourLayerInput = {
      global: ['a', 'b', 'c'],
      local: ['a', 'X', 'c'],
      planned: ['a', 'X', 'c'],
      executed: ['a', 'X', 'c'],
    };

    const result = checkFourLayerCorrespondence(input);

    expect(result.ok).toBe(false);
    expect(result.pairs).toHaveLength(3);
    
    // First pair has mismatch
    expect(result.pairs[0].pair).toBe('global->local');
    expect(result.pairs[0].ok).toBe(false);
    expect(result.pairs[0].mismatches).toHaveLength(1);
    expect(result.pairs[0].mismatches?.[0].position).toBe(1);
    expect(result.pairs[0].mismatches?.[0].upperVerb).toBe('b');
    expect(result.pairs[0].mismatches?.[0].lowerVerb).toBe('X');

    // Other pairs pass
    expect(result.pairs[1].ok).toBe(true);
    expect(result.pairs[2].ok).toBe(true);
  });

  it('executed missing - last pair skipped', () => {
    const input: FourLayerInput = {
      global: ['a', 'b'],
      local: ['a', 'b'],
      planned: ['a', 'b'],
      // executed is missing
    };

    const result = checkFourLayerCorrespondence(input);

    expect(result.ok).toBe(true); // non-skipped pairs are ok
    expect(result.pairs).toHaveLength(3);

    // First two pairs are checked and pass
    expect(result.pairs[0].pair).toBe('global->local');
    expect(result.pairs[0].skipped).toBe(false);
    expect(result.pairs[0].ok).toBe(true);

    expect(result.pairs[1].pair).toBe('local->planned');
    expect(result.pairs[1].skipped).toBe(false);
    expect(result.pairs[1].ok).toBe(true);

    // Last pair is skipped
    expect(result.pairs[2].pair).toBe('planned->executed');
    expect(result.pairs[2].skipped).toBe(true);
    expect(result.pairs[2].reason).toContain('executed');
  });

  it('only global provided - all pairs skipped, ok is vacuously true', () => {
    const input: FourLayerInput = {
      global: ['a', 'b', 'c'],
      // local, planned, executed all missing
    };

    const result = checkFourLayerCorrespondence(input);

    expect(result.ok).toBe(true); // vacuously true - all pairs skipped
    expect(result.pairs).toHaveLength(3);

    expect(result.pairs[0].pair).toBe('global->local');
    expect(result.pairs[0].skipped).toBe(true);
    expect(result.pairs[0].reason).toContain('local');

    expect(result.pairs[1].pair).toBe('local->planned');
    expect(result.pairs[1].skipped).toBe(true);
    expect(result.pairs[1].reason).toContain('local');

    expect(result.pairs[2].pair).toBe('planned->executed');
    expect(result.pairs[2].skipped).toBe(true);
    expect(result.pairs[2].reason).toContain('planned');
  });

  it('planned inserts a step relative to local - length mismatch', () => {
    const input: FourLayerInput = {
      local: ['a', 'b'],
      planned: ['a', 'b', 'c'],
    };

    const result = checkFourLayerCorrespondence(input);

    expect(result.ok).toBe(false);
    expect(result.pairs).toHaveLength(3);

    // First pair skipped (no global)
    expect(result.pairs[0].skipped).toBe(true);
    expect(result.pairs[0].reason).toContain('global');

    // Second pair fails due to length mismatch
    expect(result.pairs[1].pair).toBe('local->planned');
    expect(result.pairs[1].ok).toBe(false);
    expect(result.pairs[1].mismatches).toHaveLength(1);
    expect(result.pairs[1].mismatches?.[0].reason).toContain('Length mismatch');
    expect(result.pairs[1].mismatches?.[0].position).toBe(2);

    // Third pair skipped (no executed)
    expect(result.pairs[2].skipped).toBe(true);
    expect(result.pairs[2].reason).toContain('executed');
  });

  it('pair order is stable regardless of which layers are provided', () => {
    // Test with only local and executed
    const input: FourLayerInput = {
      local: ['a', 'b'],
      executed: ['a', 'b'],
    };

    const result = checkFourLayerCorrespondence(input);

    // Order must always be: global->local, local->planned, planned->executed
    expect(result.pairs[0].pair).toBe('global->local');
    expect(result.pairs[1].pair).toBe('local->planned');
    expect(result.pairs[2].pair).toBe('planned->executed');
  });
});
