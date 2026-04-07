import { describe, expect, it } from 'vitest';
import { inferConcentrationBasis, parseConcentration, toStoredConcentration } from './concentration.js';

describe('concentration helpers', () => {
  it('infers basis from supported units', () => {
    expect(inferConcentrationBasis('mM')).toBe('molar');
    expect(inferConcentrationBasis('mg/mL')).toBe('mass_per_volume');
    expect(inferConcentrationBasis('U/mL')).toBe('activity_per_volume');
  });

  it('normalizes legacy micro symbol units', () => {
    expect(parseConcentration({ value: 1, unit: 'µM' })).toEqual({
      value: 1,
      unit: 'uM',
      basis: 'molar',
    });
  });

  it('stores typed concentration when basis is known', () => {
    expect(toStoredConcentration({ value: 1, unit: 'mM' })).toEqual({
      value: 1,
      unit: 'mM',
      basis: 'molar',
    });
  });

  it('preserves legacy shape when basis cannot be inferred', () => {
    expect(toStoredConcentration({ value: 1, unit: 'X' })).toEqual({
      value: 1,
      unit: 'X',
    });
  });
});
