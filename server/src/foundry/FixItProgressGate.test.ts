import { describe, expect, it } from 'vitest';
import { evaluateProgress, type FixtureVerification } from './FixItProgressGate.js';

function v(
  target: { missing: string[]; passed?: boolean } | null,
  suite: Array<{ name: string; passed: boolean }> = [],
): FixtureVerification {
  return {
    target: target
      ? {
          name: 'spec-fix-target',
          passed: target.passed ?? target.missing.length === 0,
          missing: target.missing,
          partial: [],
          matched: [],
        }
      : null,
    suite,
  };
}

describe('evaluateProgress', () => {
  it('PASS when the target fixture has no missing paths', () => {
    const baseline = v({ missing: ['a', 'b'] });
    const post = v({ missing: [] });
    expect(evaluateProgress(baseline, post)).toBe('pass');
  });

  it('PROGRESS when the target satisfies strictly more paths, no regression', () => {
    const baseline = v({ missing: ['a', 'b'] }, [{ name: 'other', passed: true }]);
    const post = v({ missing: ['b'] }, [
      { name: 'spec-fix-target', passed: false },
      { name: 'other', passed: true },
    ]);
    expect(evaluateProgress(baseline, post)).toBe('progress');
  });

  it('STUCK when nothing changed in the target', () => {
    const baseline = v({ missing: ['a', 'b'] });
    const post = v({ missing: ['a', 'b'] });
    expect(evaluateProgress(baseline, post)).toBe('stuck');
  });

  it('STUCK on a NEW miss in the target (within-target regression)', () => {
    const baseline = v({ missing: ['a'] });
    const post = v({ missing: ['b'] }); // resolved a, broke b → same count, but new miss
    expect(evaluateProgress(baseline, post)).toBe('stuck');
  });

  it('STUCK when a previously-passing suite fixture regresses', () => {
    const baseline = v({ missing: ['a', 'b'] }, [{ name: 'other', passed: true }]);
    const post = v({ missing: ['b'] }, [
      { name: 'spec-fix-target', passed: false },
      { name: 'other', passed: false }, // regression elsewhere
    ]);
    expect(evaluateProgress(baseline, post)).toBe('stuck');
  });

  it('STUCK when the target cannot be verified', () => {
    expect(evaluateProgress(v({ missing: ['a'] }), v(null))).toBe('stuck');
  });
});
