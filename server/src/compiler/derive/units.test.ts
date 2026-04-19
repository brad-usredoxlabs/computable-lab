import { describe, it, expect } from 'vitest';
import {
  parseUnit,
  multiplyUnits,
  divideUnits,
  powerUnit,
  unitsEqual,
  dimensionsEqual,
  convertTo,
  Unit,
} from './units';

describe('parseUnit', () => {
  it('parses primitive unit m', () => {
    const result = parseUnit('m');
    expect(result.base).toEqual({ m: 1 });
    expect(result.scale).toBe(1);
  });

  it('parses mol/L with correct base and scale', () => {
    const result = parseUnit('mol/L');
    expect(result.base).toEqual({ mol: 1, m: -3 });
    expect(result.scale).toBe(1000);
  });

  it('parses m^2 with correct power', () => {
    const result = parseUnit('m^2');
    expect(result.base).toEqual({ m: 2 });
    expect(result.scale).toBe(1);
  });

  it('parses mg*mL composition', () => {
    const result = parseUnit('mg*mL');
    // mg = 1e-6 kg, mL = 1e-6 m^3
    // mg*mL = 1e-12 kg*m^3
    expect(result.base).toEqual({ kg: 1, m: 3 });
    expect(result.scale).toBe(1e-12);
  });

  it('parses mL', () => {
    const result = parseUnit('mL');
    expect(result.base).toEqual({ m: 3 });
    expect(result.scale).toBe(1e-6);
  });

  it('parses µL', () => {
    const result = parseUnit('µL');
    expect(result.base).toEqual({ m: 3 });
    expect(result.scale).toBe(1e-9);
  });

  it('parses mM concentration', () => {
    const result = parseUnit('mM');
    expect(result.base).toEqual({ mol: 1, m: -3 });
    expect(result.scale).toBe(1);
  });

  it('parses µM concentration', () => {
    const result = parseUnit('µM');
    expect(result.base).toEqual({ mol: 1, m: -3 });
    expect(result.scale).toBe(1e-3);
  });

  it('parses nM concentration', () => {
    const result = parseUnit('nM');
    expect(result.base).toEqual({ mol: 1, m: -3 });
    expect(result.scale).toBe(1e-6);
  });

  it('parses M (molar) concentration', () => {
    const result = parseUnit('M');
    expect(result.base).toEqual({ mol: 1, m: -3 });
    expect(result.scale).toBe(1000);
  });

  it('parses min as 60 seconds', () => {
    const result = parseUnit('min');
    expect(result.base).toEqual({ s: 1 });
    expect(result.scale).toBe(60);
  });

  it('parses h as 3600 seconds', () => {
    const result = parseUnit('h');
    expect(result.base).toEqual({ s: 1 });
    expect(result.scale).toBe(3600);
  });

  it('parses °C with offset', () => {
    const result = parseUnit('°C');
    expect(result.base).toEqual({ K: 1 });
    expect(result.scale).toBe(1);
    expect(result.offset).toBe(273.15);
  });

  it('parses K (Kelvin)', () => {
    const result = parseUnit('K');
    expect(result.base).toEqual({ K: 1 });
    expect(result.scale).toBe(1);
    expect(result.offset).toBeUndefined();
  });

  it('parses cm', () => {
    const result = parseUnit('cm');
    expect(result.base).toEqual({ m: 1 });
    expect(result.scale).toBe(0.01);
  });

  it('parses mm', () => {
    const result = parseUnit('mm');
    expect(result.base).toEqual({ m: 1 });
    expect(result.scale).toBe(0.001);
  });

  it('parses g', () => {
    const result = parseUnit('g');
    expect(result.base).toEqual({ kg: 1 });
    expect(result.scale).toBe(1e-3);
  });

  it('parses mg', () => {
    const result = parseUnit('mg');
    expect(result.base).toEqual({ kg: 1 });
    expect(result.scale).toBe(1e-6);
  });

  it('parses µg', () => {
    const result = parseUnit('µg');
    expect(result.base).toEqual({ kg: 1 });
    expect(result.scale).toBe(1e-9);
  });

  it('throws on unknown unit', () => {
    expect(() => parseUnit('bogus')).toThrow('unknown unit: bogus');
  });

  it('throws on invalid power syntax', () => {
    expect(() => parseUnit('m^xyz')).toThrow('unknown unit: m^xyz');
  });
});

describe('multiplyUnits', () => {
  it('multiplies m * m = m^2', () => {
    const a = parseUnit('m');
    const b = parseUnit('m');
    const result = multiplyUnits(a, b);
    expect(result.base).toEqual({ m: 2 });
    expect(result.scale).toBe(1);
  });

  it('multiplies m * s = m*s', () => {
    const a = parseUnit('m');
    const b = parseUnit('s');
    const result = multiplyUnits(a, b);
    expect(result.base).toEqual({ m: 1, s: 1 });
    expect(result.scale).toBe(1);
  });

  it('clears offset on multiplication', () => {
    const a = parseUnit('°C');
    const b = parseUnit('K');
    const result = multiplyUnits(a, b);
    expect(result.offset).toBeUndefined();
  });
});

describe('divideUnits', () => {
  it('divides m / s = m/s', () => {
    const a = parseUnit('m');
    const b = parseUnit('s');
    const result = divideUnits(a, b);
    expect(result.base).toEqual({ m: 1, s: -1 });
    expect(result.scale).toBe(1);
  });

  it('divides mol / L = mol/L (M)', () => {
    const a = parseUnit('mol');
    const b = parseUnit('L');
    const result = divideUnits(a, b);
    expect(result.base).toEqual({ mol: 1, m: -3 });
    expect(result.scale).toBe(1000);
  });

  it('clears offset on division', () => {
    const a = parseUnit('°C');
    const b = parseUnit('K');
    const result = divideUnits(a, b);
    expect(result.offset).toBeUndefined();
  });
});

describe('powerUnit', () => {
  it('raises m to power 2 = m^2', () => {
    const a = parseUnit('m');
    const result = powerUnit(a, 2);
    expect(result.base).toEqual({ m: 2 });
    expect(result.scale).toBe(1);
  });

  it('raises m to power -1 = m^-1', () => {
    const a = parseUnit('m');
    const result = powerUnit(a, -1);
    expect(result.base).toEqual({ m: -1 });
    expect(result.scale).toBe(1);
  });

  it('clears offset on power', () => {
    const a = parseUnit('°C');
    const result = powerUnit(a, 2);
    expect(result.offset).toBeUndefined();
  });
});

describe('unitsEqual', () => {
  it('returns true for identical units', () => {
    const a = parseUnit('m');
    const b = parseUnit('m');
    expect(unitsEqual(a, b)).toBe(true);
  });

  it('returns false for different scales', () => {
    const a = parseUnit('mL');
    const b = parseUnit('L');
    expect(unitsEqual(a, b)).toBe(false);
  });

  it('returns false for different dimensions', () => {
    const a = parseUnit('m');
    const b = parseUnit('s');
    expect(unitsEqual(a, b)).toBe(false);
  });

  it('returns false for different offsets', () => {
    const a = parseUnit('°C');
    const b = parseUnit('K');
    expect(unitsEqual(a, b)).toBe(false);
  });

  it('returns true for units with same scale within tolerance', () => {
    const a: Unit = { base: { m: 1 }, scale: 1.0 };
    const b: Unit = { base: { m: 1 }, scale: 1.0 + 1e-13 };
    expect(unitsEqual(a, b)).toBe(true);
  });
});

describe('dimensionsEqual', () => {
  it('returns true for same dimensions regardless of scale', () => {
    const a = parseUnit('mL');
    const b = parseUnit('L');
    const result = dimensionsEqual(a, b);
    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('returns false for different dimensions', () => {
    const a = parseUnit('m');
    const b = parseUnit('s');
    const result = dimensionsEqual(a, b);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('dimension mismatch');
  });

  it('returns true for mol/L and M (same dimensions)', () => {
    const a = parseUnit('mol/L');
    const b = parseUnit('M');
    const result = dimensionsEqual(a, b);
    expect(result.ok).toBe(true);
  });
});

describe('convertTo', () => {
  it('converts 1 L to mL = 1000', () => {
    const result = convertTo(1, parseUnit('L'), parseUnit('mL'));
    expect(result).toBeCloseTo(1000, 6);
  });

  it('converts 1 mL to L = 0.001', () => {
    const result = convertTo(1, parseUnit('mL'), parseUnit('L'));
    expect(result).toBe(0.001);
  });

  it('converts 100 nM to µM = 0.1', () => {
    const result = convertTo(100, parseUnit('nM'), parseUnit('µM'));
    expect(result).toBe(0.1);
  });

  it('converts 25 °C to K = 298.15', () => {
    const result = convertTo(25, parseUnit('°C'), parseUnit('K'));
    expect(result).toBe(298.15);
  });

  it('converts 298.15 K to °C = 25', () => {
    const result = convertTo(298.15, parseUnit('K'), parseUnit('°C'));
    expect(Math.abs(result - 25)).toBeLessThan(1e-9);
  });

  it('converts 0 °C to K = 273.15', () => {
    const result = convertTo(0, parseUnit('°C'), parseUnit('K'));
    expect(result).toBe(273.15);
  });

  it('converts 100 °C to K = 373.15', () => {
    const result = convertTo(100, parseUnit('°C'), parseUnit('K'));
    expect(result).toBe(373.15);
  });

  it('converts mM to µM', () => {
    const result = convertTo(1, parseUnit('mM'), parseUnit('µM'));
    expect(result).toBe(1000);
  });

  it('converts µM to nM', () => {
    const result = convertTo(1, parseUnit('µM'), parseUnit('nM'));
    expect(result).toBeCloseTo(1000, 6);
  });

  it('converts min to s', () => {
    const result = convertTo(1, parseUnit('min'), parseUnit('s'));
    expect(result).toBe(60);
  });

  it('converts h to s', () => {
    const result = convertTo(1, parseUnit('h'), parseUnit('s'));
    expect(result).toBe(3600);
  });

  it('converts g to mg', () => {
    const result = convertTo(1, parseUnit('g'), parseUnit('mg'));
    expect(result).toBeCloseTo(1000, 6);
  });

  it('converts mg to µg', () => {
    const result = convertTo(1, parseUnit('mg'), parseUnit('µg'));
    expect(result).toBeCloseTo(1000, 6);
  });

  it('throws when converting incompatible dimensions', () => {
    expect(() => convertTo(1, parseUnit('m'), parseUnit('s')))
      .toThrow('cannot convert');
  });

  it('throws with reason mentioning the dimensions', () => {
    try {
      convertTo(1, parseUnit('m'), parseUnit('s'));
      fail('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('m');
      expect((e as Error).message).toContain('s');
    }
  });
});

describe('complex unit compositions', () => {
  it('parses and converts mol/L to mM', () => {
    const from = parseUnit('mol/L');
    const to = parseUnit('mM');
    // mol/L = 1000 mol/m^3, mM = 1 mol/m^3
    // So 1 mol/L = 1000 mM
    const result = convertTo(1, from, to);
    expect(result).toBe(1000);
  });

  it('handles m^2 * s^-1 (kinematic viscosity)', () => {
    const a = powerUnit(parseUnit('m'), 2);
    const b = powerUnit(parseUnit('s'), -1);
    const result = multiplyUnits(a, b);
    expect(result.base).toEqual({ m: 2, s: -1 });
  });

  it('handles complex composition mg*mL correctly', () => {
    const result = parseUnit('mg*mL');
    // mg = 1e-6 kg, mL = 1e-6 m^3
    expect(result.base).toEqual({ kg: 1, m: 3 });
    expect(result.scale).toBe(1e-12);
  });
});
