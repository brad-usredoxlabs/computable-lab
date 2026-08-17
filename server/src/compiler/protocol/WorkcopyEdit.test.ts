/**
 * WorkcopyEdit — unit tests (Plan 1, F4): delete/merge/split cascade.
 */

import { describe, it, expect } from 'vitest';
import { deleteStep, mergeSteps, splitStep } from './WorkcopyEdit.js';
import type { WorkcopyDoc } from './WorkcopyEdit.js';

const DOC: WorkcopyDoc = {
  steps: [
    { stepId: 'step-001', kind: 'add_material', label: 'Lyse' },
    { stepId: 'step-002', kind: 'mix', label: 'Shake 10 min' },
    { stepId: 'step-003', kind: 'incubate', label: 'Incubate' },
  ],
  overrides: {
    bindings: [
      { stepId: 'step-002', equipmentRef: { kind: 'record', id: 'EQP-shaker-1', type: 'equipment' } },
      { stepId: 'step-003', equipmentRef: { kind: 'record', id: 'EQP-inc-1', type: 'equipment' } },
    ],
    substitutions: [{ role: 'buffer', material_ref: { kind: 'record', id: 'MAT-our-buffer', type: 'material' } }],
  },
  branch_axes: [
    {
      axisId: 'sample-type',
      label: 'Starting sample',
      shared_stepIds: ['step-001'],
      conditions: [
        { id: 'bacterial', predicate: { op: 'equals', path: '$.sampleType', value: 'bacterial dna' }, then_stepIds: ['step-002'] },
        { id: 'mammalian', predicate: { op: 'equals', path: '$.sampleType', value: 'mammalian' }, then_stepIds: ['step-003'] },
      ],
    },
  ],
};

describe('deleteStep', () => {
  it('removes the step, its equipment binding, and its branch then_stepIds entry', () => {
    const next = deleteStep(DOC, 'step-002');
    expect(next.steps.map((s) => s.stepId)).toEqual(['step-001', 'step-003']);
    expect(next.overrides?.bindings?.map((b) => b.stepId)).toEqual(['step-003']);
    // branch: "mammalian" condition keeps step-003; "bacterial" empties and is dropped
    expect(next.branch_axes![0].conditions.map((c) => c.id)).toEqual(['mammalian']);
  });

  it("deleting a shared step removes it from shared_stepIds; never mutates input", () => {
    const next = deleteStep(DOC, 'step-001');
    expect(next.branch_axes![0].shared_stepIds).toEqual([]);
    expect(DOC.steps.map((s) => s.stepId)).toEqual(['step-001', 'step-002', 'step-003']); // input unchanged
  });

  it("deleting the last step of an axis removes that axis", () => {
    const doc: WorkcopyDoc = {
      steps: [{ stepId: 'step-001', kind: 'mix' }],
      branch_axes: [{ axisId: 'solo', label: 'Solo', conditions: [{ id: 'x', predicate: { op: 'exists', path: '$.a' }, then_stepIds: ['step-001'] }] }],
    };
    const next = deleteStep(doc, 'step-001');
    expect(next.steps).toEqual([]);
    expect(next.branch_axes).toEqual([]);
  });
});

describe('mergeSteps', () => {
  it('auto-concats actions into one logical step and rewrites branch entries', () => {
    const doc: WorkcopyDoc = {
      steps: [
        { stepId: 'precip-1', kind: 'add_material', label: 'Add salt', actions: [{ actionKind: 'add' }] },
        { stepId: 'precip-2', kind: 'add_material', label: 'Add ethanol', actions: [{ actionKind: 'add' }] },
      ],
      branch_axes: [{ axisId: 'a', label: 'A', conditions: [{ id: 'b', predicate: { op: 'exists', path: '$.x' }, then_stepIds: ['precip-1', 'precip-2'] }] }],
    };
    const merged = mergeSteps(doc, ['precip-1', 'precip-2']);
    expect(merged.steps).toHaveLength(1);
    expect(merged.steps[0].stepId).toBe('precip-1');
    expect((merged.steps[0].actions as unknown[]).length).toBe(2);
    expect(merged.branch_axes![0].conditions[0].then_stepIds).toEqual(['precip-1']);
  });

  it('ignores a merge with fewer than 2 steps or unknown ids', () => {
    expect(mergeSteps(DOC, ['step-001'])).toBe(DOC);
    expect(mergeSteps(DOC, ['nope', 'missing'])).toBe(DOC);
  });
});

describe('splitStep', () => {
  it('divides actions at a boundary into two steps', () => {
    const doc: WorkcopyDoc = {
      steps: [{ stepId: 's1', kind: 'other', actions: [{ a: 1 }, { a: 2 }, { a: 3 }] }],
    };
    const next = splitStep(doc, 's1', 1);
    expect(next.steps).toHaveLength(2);
    expect(next.steps[0].stepId).toBe('s1');
    expect((next.steps[0].actions as unknown[]).length).toBe(1);
    expect(next.steps[1].stepId).toBe('s1-2');
    expect((next.steps[1].actions as unknown[]).length).toBe(2);
  });

  it('refuses invalid boundaries', () => {
    const doc: WorkcopyDoc = { steps: [{ stepId: 's1', actions: [{ a: 1 }] }] };
    expect(splitStep(doc, 's1', 0)).toBe(doc);
    expect(splitStep(doc, 's1', 5)).toBe(doc);
  });
});