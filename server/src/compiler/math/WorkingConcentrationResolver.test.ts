/**
 * WorkingConcentrationResolver — unit tests.
 *
 * The grade-F example: fenofibrate target 10 nM final in a 100 uL well.
 * Whether the stock is 1 mM, 1 uM, 100 nM, or "100X", V_stock auto-scales and the
 * 10 nM target never changes (C1V1 = C2V2). Also covers the bakery-by-weight
 * batch scaling (sampleCount changes batch total, not per-well concentration).
 */

import { describe, it, expect } from 'vitest';
import { resolveWorkingConcentration } from './WorkingConcentrationResolver.js';

const WELL_UL = 100;
const TEN_NM = { value: 10, unit: 'nM', basis: 'molar' };

function result() {
  return resolveWorkingConcentration({
    workingConcentration: TEN_NM,
    stockConcentration: { value: 1, unit: 'mM', basis: 'molar' },
    wellVolumeUl: WELL_UL,
    sampleCount: 1,
  });
}

describe('fenofibrate month-star: 10 nM final, any stock', () => {
  it('1 mM stock → 0.001 uL stock per 100 uL well', () => {
    const r = result();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 10 nM / 1 mM = 1e-5; 100 uL × 1e-5 = 1e-3 uL
    expect(r.vStockUl).toBeCloseTo(0.001, 6);
    expect(r.vDiluentUl).toBeCloseTo(99.999, 2);
    expect(r.stockFraction).toBeCloseTo(1e-5, 10);
  });

  it('1 uM stock → 0.001... 1 uL stock (10nM/1uM = 0.01, 100uL×0.01=1uL)', () => {
    const r = resolveWorkingConcentration({
      workingConcentration: TEN_NM,
      stockConcentration: { value: 1, unit: 'uM', basis: 'molar' },
      wellVolumeUl: WELL_UL,
      sampleCount: 1,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.vStockUl).toBeCloseTo(1, 2);
  });

  it('100 nM stock → 10 uL stock (10nM/100nM=0.1, 100×0.1=10uL)', () => {
    const r = resolveWorkingConcentration({
      workingConcentration: TEN_NM,
      stockConcentration: { value: 100, unit: 'nM', basis: 'molar' },
      wellVolumeUl: WELL_UL,
      sampleCount: 1,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.vStockUl).toBeCloseTo(10, 2);
    expect(r.vDiluentUl).toBeCloseTo(90, 2);
  });

  it('a 10 nM stock IS the working concentration → 100 uL stock, 0 diluent', () => {
    const r = resolveWorkingConcentration({
      workingConcentration: TEN_NM,
      stockConcentration: TEN_NM,
      wellVolumeUl: WELL_UL,
      sampleCount: 1,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.vStockUl).toBeCloseTo(100, 2);
    expect(r.vDiluentUl).toBeCloseTo(0, 2);
  });
});

describe('batch scaling is a run property (bakery-by-weight)', () => {
  it('96 samples scale the batch 96× but keep the per-well 10 nM', () => {
    const one = resolveWorkingConcentration({
      workingConcentration: TEN_NM,
      stockConcentration: { value: 100, unit: 'nM', basis: 'molar' },
      wellVolumeUl: WELL_UL,
      sampleCount: 1,
    });
    const many = resolveWorkingConcentration({
      workingConcentration: TEN_NM,
      stockConcentration: { value: 100, unit: 'nM', basis: 'molar' },
      wellVolumeUl: WELL_UL,
      sampleCount: 96,
    });
    expect(one.ok && many.ok).toBe(true);
    if (!one.ok || !many.ok) return;
    expect(one.vStockUl).toBeCloseTo(many.vStockUl, 9); // per-well unchanged
    expect(many.batchStockUl).toBeCloseTo(one.vStockUl * 96, 2);
  });

  it('dead volume is added to the batch total, not per-well concentration', () => {
    const r = resolveWorkingConcentration({
      workingConcentration: TEN_NM,
      stockConcentration: { value: 1, unit: 'uM', basis: 'molar' },
      wellVolumeUl: WELL_UL,
      sampleCount: 4,
      deadVolumeUl: 250,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.vStockUl).toBeCloseTo(1, 6); // per-well 1 uL
    expect(r.batchStockUl).toBeCloseTo(1 * 4 + 250, 2); // 254 uL
  });
});

describe('blocked cases (never silently resolve)', () => {
  it('no stock concentration → blocked with a naming gap', () => {
    const r = resolveWorkingConcentration({
      workingConcentration: TEN_NM,
      stockConcentration: undefined,
      wellVolumeUl: WELL_UL,
      sampleCount: 1,
    });
    expect(r.ok).toBe(false);
  });

  it('ferrous stock and a molar target → blocked (basis mismatch)', () => {
    const r = resolveWorkingConcentration({
      workingConcentration: TEN_NM,
      stockConcentration: { value: 1, unit: 'mg/mL', basis: 'mass_per_volume' },
      wellVolumeUl: WELL_UL,
      sampleCount: 1,
    });
    expect(r.ok).toBe(false);
  });

  it('target MORE concentrated than stock (can not concentrate by dilution) → blocked', () => {
    const r = resolveWorkingConcentration({
      workingConcentration: { value: 1, unit: 'mM', basis: 'molar' },
      stockConcentration: { value: 100, unit: 'nM', basis: 'molar' },
      wellVolumeUl: WELL_UL,
      sampleCount: 1,
    });
    expect(r.ok).toBe(false);
  });

  it('non-integer / zero sample count → blocked', () => {
    const r = resolveWorkingConcentration({
      workingConcentration: TEN_NM,
      stockConcentration: { value: 100, unit: 'nM', basis: 'molar' },
      wellVolumeUl: WELL_UL,
      sampleCount: 0,
    });
    expect(r.ok).toBe(false);
  });
});

describe('mass/activity/count bases work like molar', () => {
  it('mass-per-volume: target 10 ng/mL in a 100 uL well from 1 mg/mL stock', () => {
    const r = resolveWorkingConcentration({
      workingConcentration: { value: 10, unit: 'ng/mL', basis: 'mass_per_volume' },
      stockConcentration: { value: 1, unit: 'mg/mL', basis: 'mass_per_volume' },
      wellVolumeUl: WELL_UL,
      sampleCount: 1,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 10 ng/mL / 1 mg/mL = 10e-9/1e-3 = 1e-5; 100 uL × 1e-5 = 1e-3 uL
    expect(r.vStockUl).toBeCloseTo(0.001, 4);
  });

  it('volume-fraction: 5% v/v in 200 uL well from 100% stock → 10 uL', () => {
    const r = resolveWorkingConcentration({
      workingConcentration: { value: 5, unit: '% v/v', basis: 'volume_fraction' },
      stockConcentration: { value: 100, unit: '% v/v', basis: 'volume_fraction' },
      wellVolumeUl: 200,
      sampleCount: 1,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.vStockUl).toBeCloseTo(10, 2);
  });
});