import { describe, expect, it } from 'vitest';
import { parseDeclaredConcentrationText } from './VendorSearchHandlers.js';

describe('VendorSearchHandlers', () => {
  it('parses declared concentration from vendor text', () => {
    expect(parseDeclaredConcentrationText('Clofibrate sodium salt solution, 100 mM')).toEqual({
      concentration: {
        value: 100,
        unit: 'mM',
        basis: 'molar',
      },
      sourceText: 'Clofibrate sodium salt solution, 100 mM',
    });
  });

  it('normalizes percent volume fractions', () => {
    expect(parseDeclaredConcentrationText('Triton X-100, 0.1% v/v in PBS')).toEqual({
      concentration: {
        value: 0.1,
        unit: '% v/v',
        basis: 'volume_fraction',
      },
      sourceText: 'Triton X-100, 0.1% v/v in PBS',
    });
  });

  it('returns null when no supported concentration is present', () => {
    expect(parseDeclaredConcentrationText('Dimethyl sulfoxide, molecular biology grade')).toBeNull();
  });
});
