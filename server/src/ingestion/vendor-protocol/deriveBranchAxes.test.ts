/**
 * deriveBranchAxes — unit tests (Task 3).
 * Lifts vendor step `branches[]` into schema-valid, resolver-usable branch_axes.
 */

import { describe, it, expect } from 'vitest';
import { deriveBranchAxes, slugify } from './deriveBranchAxes.js';

describe('slugify', () => {
  it('produces stable lowercase dashed slugs', () => {
    expect(slugify('Bacterial DNA')).toBe('bacterial-dna');
    expect(slugify('96-well plate')).toBe('96-well-plate');
    expect(slugify('  tubes in rack!  ')).toBe('tubes-in-rack');
  });
  it('falls back for empty/whitespace input', () => {
    expect(slugify('###')).toBe('branch');
  });
});

describe('deriveBranchAxes', () => {
  it('returns [] for steps without >= 2 distinct branches', () => {
    expect(deriveBranchAxes([{ stepId: 's1', branches: ['a. single'] }])).toEqual([]);
    expect(deriveBranchAxes([{ stepId: 's1', branches: [] }])).toEqual([]);
    expect(deriveBranchAxes([])).toEqual([]);
  });

  it('lifts a branchy step into one axis with a condition per branch', () => {
    const axes = deriveBranchAxes([
      {
        stepNumber: 1,
        branches: ['a. If using BashingBead rack: 200 uL lysis', 'b. If using a 96-well plate: 600 uL lysis'],
      },
    ]);
    expect(axes).toHaveLength(1);
    const axis = axes[0];
    expect(axis.axisId).toBe('branch-axis-step-001');
    expect(axis.conditions).toHaveLength(2);
    // each condition targets the step and reuses the PredicateEvaluator equals op
    expect(axis.conditions[0]).toMatchObject({
      id: 'branch-1',
      predicate: { op: 'equals', path: '$.branchSelection', value: 'a-if-using-bashingbead-rack-200-ul-lysis' },
      then_stepIds: ['step-001'],
    });
    expect(axis.conditions[1]).toMatchObject({
      id: 'branch-2',
      then_stepIds: ['step-001'],
    });
    // unique branch labels preserved as labels
    expect(axis.conditions.map((c) => c.label)).toContain('a. If using BashingBead rack: 200 uL lysis');
  });

  it('dedupes repeated branch text', () => {
    const axes = deriveBranchAxes([
      { stepId: 's1', branches: ['a. X', 'b. Y', 'a. X'] },
    ]);
    expect(axes[0].conditions).toHaveLength(2);
  });

  it('the produced axes are resolver-usable (branchSelection matching selects the branch)', async () => {
    const { resolveBranchAxes } = await import('../../protocol/BranchResolver.js');
    const axes = deriveBranchAxes([
      { stepId: 'step-1', branches: ['Bacterial DNA: lyse 200uL', 'Mammalian: lyse+grind 200uL'] },
    ]);
    const ok = resolveBranchAxes({ branchAxes: axes, choices: { branchSelection: 'mammalian-lyse-grind-200ul' } });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.activeStepIds).toEqual(['step-1']);
      expect(ok.resolutions[0].branchIds).toEqual(['branch-2']);
    }
  });
});