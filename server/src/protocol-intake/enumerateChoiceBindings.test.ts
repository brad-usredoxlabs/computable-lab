import { describe, expect, it } from 'vitest';
import { slugify } from '../ingestion/vendor-protocol/deriveBranchAxes.js';
import { deriveDecisionTree, type DecisionTreeScaleOption } from './deriveDecisionTree.js';
import { enumerateChoiceBindings } from './enumerateChoiceBindings.js';

const SCALE: DecisionTreeScaleOption[] = [
  { level: 'manual_tubes' },
  { level: 'bench_plate_multichannel' },
  { level: 'robot_deck' },
];

function tree() {
  return deriveDecisionTree({
    documentId: 'd',
    steps: [
      { stepNumber: 1, branches: ['Bacterial DNA', 'Mammalian cell culture'] },
      { stepNumber: 2 },
      { stepNumber: 3, branches: ['500 ul kit version', '100 ul kit version'] },
    ],
    scaleOptions: SCALE,
    now: '2026-09-18T00:00:00.000Z',
  });
}

describe('enumerateChoiceBindings', () => {
  it('produces the full Cartesian product in axis/condition order', () => {
    const result = enumerateChoiceBindings(tree().axes, 100);
    expect(result.productSize).toBe(4);
    expect(result.truncated).toBe(false);
    expect(result.bindings).toHaveLength(4);

    expect(result.bindings[0].branchPath).toEqual([
      { axisId: 'branch-axis-step-001', conditionId: 'branch-1', label: 'Bacterial DNA' },
      { axisId: 'branch-axis-step-003', conditionId: 'branch-1', label: '500 ul kit version' },
    ]);
    const bs = result.bindings[0].choices.branchSelection as Record<string, unknown>;
    expect(bs['branch-axis-step-001']).toBe(slugify('Bacterial DNA'));
    expect(bs['branch-axis-step-003']).toBe(slugify('500 ul kit version'));

    // last binding = last condition of each axis
    const last = result.bindings[3];
    expect(last.branchPath.map((p) => p.conditionId)).toEqual(['branch-2', 'branch-2']);
    const lastBs = last.choices.branchSelection as Record<string, unknown>;
    expect(lastBs['branch-axis-step-001']).toBe(slugify('Mammalian cell culture'));
    expect(lastBs['branch-axis-step-003']).toBe(slugify('100 ul kit version'));
  });

  it('caps at maxBindings and flags truncation without distorting productSize', () => {
    const result = enumerateChoiceBindings(tree().axes, 3);
    expect(result.bindings).toHaveLength(3);
    expect(result.truncated).toBe(true);
    expect(result.productSize).toBe(4);
  });

  it('zero-condition axes pass through without multiplying the product', () => {
    const axes = [
      ...tree().axes,
      {
        axisId: 'empty-axis',
        question: 'Empty',
        choiceKey: 'branchSelection',
        origin: 'ai_suggested' as const,
        conditions: [],
      },
    ];
    const result = enumerateChoiceBindings(axes, 100);
    expect(result.productSize).toBe(4);
    expect(result.bindings).toHaveLength(4);
    expect(result.bindings[0].branchPath).toHaveLength(2);
  });

  it('falls back to "*" when a predicate value is not a string', () => {
    const axes = [
      {
        axisId: 'weird-axis',
        question: 'Weird',
        choiceKey: 'branchSelection',
        origin: 'ai_suggested' as const,
        conditions: [
          { id: 'branch-1', predicate: { op: 'exists', path: '$.branchSelection.weird-axis' } },
        ],
      },
    ];
    const result = enumerateChoiceBindings(axes, 10);
    expect(result.productSize).toBe(1);
    const bs = result.bindings[0].choices.branchSelection as Record<string, unknown>;
    expect(bs['weird-axis']).toBe('*');
  });

  it('seed-only result when no axes have conditions', () => {
    const result = enumerateChoiceBindings([], 10);
    expect(result.productSize).toBe(1);
    expect(result.bindings).toEqual([{ branchPath: [], choices: { branchSelection: {} } }]);
  });
});
