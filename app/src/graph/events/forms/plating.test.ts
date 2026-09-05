import { describe, expect, it } from 'vitest';
import { computePlating } from './plating.js';

describe('computePlating (count-first derived volumes)', () => {
  it('derives suspension = count/density and top-up = final − suspension', () => {
    const r = computePlating({ count: 50000, densityPerUl: 2500, finalVolumeUl: 100 });
    expect(r.suspensionUl).toBeCloseTo(20, 6);
    expect(r.topUpUl).toBeCloseTo(80, 6);
  });

  it('works for worms/organoids (parameterized by unit)', () => {
    // 200 worms/well, density 2 worms/uL, final 300 uL
    const r = computePlating({ count: 200, densityPerUl: 2, finalVolumeUl: 300 });
    expect(r.suspensionUl).toBeCloseTo(100, 6);
    expect(r.topUpUl).toBeCloseTo(200, 6);
  });

  it('returns empty when count is missing (no invariant, no derivation)', () => {
    expect(computePlating({ count: undefined, densityPerUl: 2, finalVolumeUl: 100 })).toEqual({});
  });

  it('returns empty when density is absent (generic count+volume path has nothing to derive)', () => {
    expect(computePlating({ count: 50000, densityPerUl: undefined, finalVolumeUl: 100 })).toEqual({});
  });

  it('returns empty when density is zero or negative', () => {
    expect(computePlating({ count: 50000, densityPerUl: 0, finalVolumeUl: 100 })).toEqual({});
    expect(computePlating({ count: 50000, densityPerUl: -3, finalVolumeUl: 100 })).toEqual({});
  });

  it('surfaces (does not silently clamp) a top-up larger than the well — a density under-estimate', () => {
    // density too low ⇒ suspension (200 uL) exceeds final (100 uL) ⇒ top-up negative
    const r = computePlating({ count: 50000, densityPerUl: 250, finalVolumeUl: 100 });
    expect(r.suspensionUl).toBeCloseTo(200, 6);
    expect(r.topUpUl).toBeCloseTo(-100, 6);
  });

  it('returns empty for a non-positive final volume', () => {
    expect(computePlating({ count: 50000, densityPerUl: 2500, finalVolumeUl: 0 })).toEqual({});
  });
});