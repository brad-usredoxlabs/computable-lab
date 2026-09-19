import { describe, expect, it } from 'vitest';
import { deriveBranchAxes, slugify } from '../ingestion/vendor-protocol/deriveBranchAxes.js';
import { deriveDecisionTree, type DecisionTreeScaleOption } from './deriveDecisionTree.js';

const STEPS = [
  { stepNumber: 1, branches: ['Bacterial DNA', 'Mammalian cell culture'] },
  { stepNumber: 2 },
  { stepNumber: 3, branches: ['500 ul kit version', '100 ul kit version'] },
];

const ALL_LEVELS: DecisionTreeScaleOption[] = [
  { level: 'manual_tubes' },
  { level: 'bench_plate_multichannel' },
  { level: 'robot_deck' },
];

describe('deriveDecisionTree', () => {
  it('derives one document_branch axis per branchy step', () => {
    const tree = deriveDecisionTree({
      documentId: 'd',
      steps: STEPS,
      scaleOptions: ALL_LEVELS,
      now: '2026-09-18T00:00:00.000Z',
    });

    expect(tree.kind).toBe('protocol-decision-tree');
    expect(tree.recordId).toBe('PDT-d');
    expect(tree.documentId).toBe('d');
    expect(tree.status).toBe('proposed');
    expect(tree.generatedAt).toBe('2026-09-18T00:00:00.000Z');
    expect(tree.axes).toHaveLength(2);
    expect(tree.axes[0].origin).toBe('document_branch');
    expect(tree.axes[1].origin).toBe('document_branch');
    expect(tree.axes[0].question).toContain('Bacterial DNA');
    expect(tree.axes[0].choiceKey).toBe('branchSelection');
  });

  it('rebinds every document-axis predicate path to the axis-scoped branchSelection path', () => {
    const tree = deriveDecisionTree({
      documentId: 'd',
      steps: STEPS,
      scaleOptions: ALL_LEVELS,
      now: '2026-09-18T00:00:00.000Z',
    });

    const axis0 = JSON.stringify(tree.axes[0].conditions);
    expect(axis0).toContain('"$.branchSelection.branch-axis-step-001"');
    expect(axis0).not.toContain('"$.branchSelection"');

    const axis1 = JSON.stringify(tree.axes[1].conditions);
    expect(axis1).toContain('"$.branchSelection.branch-axis-step-003"');
    expect(axis1).not.toContain('"$.branchSelection"');
  });

  it('preserves predicate value/step bindings while rewriting only the path', () => {
    const tree = deriveDecisionTree({
      documentId: 'd',
      steps: STEPS,
      scaleOptions: ALL_LEVELS,
      now: '2026-09-18T00:00:00.000Z',
    });
    const c = tree.axes[0].conditions[0];
    expect(c.id).toBe('branch-1');
    expect(c.label).toBe('Bacterial DNA');
    expect(c.then_stepIds).toEqual(['step-001']);
    expect(c.predicate).toEqual({
      op: 'equals',
      path: '$.branchSelection.branch-axis-step-001',
      value: slugify('Bacterial DNA'),
    });
  });

  it('scaleAxis options come from the caller, never hardcoded', () => {
    const full = deriveDecisionTree({
      documentId: 'd',
      steps: STEPS,
      scaleOptions: ALL_LEVELS,
      now: '2026-09-18T00:00:00.000Z',
    });
    expect(full.scaleAxis.options).toEqual(ALL_LEVELS);
    expect(full.scaleAxis.options.map((o) => o.level)).toEqual([
      'manual_tubes',
      'bench_plate_multichannel',
      'robot_deck',
    ]);

    const single = deriveDecisionTree({
      documentId: 'd',
      steps: STEPS,
      scaleOptions: [{ level: 'manual_tubes' }],
      now: '2026-09-18T00:00:00.000Z',
    });
    expect(single.scaleAxis.options).toEqual([{ level: 'manual_tubes' }]);
    expect(single.scaleAxis.options).toHaveLength(1);
  });

  it('appends ai_suggested axes, rewriting their predicate paths with the slugified axisId', () => {
    const tree = deriveDecisionTree({
      documentId: 'd',
      steps: STEPS,
      scaleOptions: ALL_LEVELS,
      aiQuestions: [
        {
          question: 'Which DNA source?',
          choiceKey: 'dnaSource',
          conditions: [
            {
              id: 'branch-1',
              label: 'Bacterial',
              predicate: { op: 'equals', path: '$.branchSelection', value: 'bacterial' },
            },
            {
              id: 'branch-2',
              label: 'Viral',
              predicate: { op: 'equals', path: '$.branchSelection', value: 'viral' },
            },
          ],
          evidence: [{ quote: 'Choose your DNA source', page: 2 }],
        },
      ],
      now: '2026-09-18T00:00:00.000Z',
    });

    expect(tree.axes).toHaveLength(3);
    const aiAxis = tree.axes[2];
    expect(aiAxis.origin).toBe('ai_suggested');
    expect(aiAxis.axisId).toBe(slugify('axis-dnaSource'));
    expect(aiAxis.question).toBe('Which DNA source?');
    expect(aiAxis.evidence).toEqual([{ quote: 'Choose your DNA source', page: 2 }]);

    const aiJson = JSON.stringify(aiAxis.conditions);
    const expectedPath = `$.branchSelection.${slugify('axis-dnaSource')}`;
    expect(aiJson).toContain(`"${expectedPath}"`);
    expect(aiJson).not.toContain('"$.branchSelection"');
  });

  it('skips aiQuestions whose choiceKey collides with an existing axis', () => {
    const tree = deriveDecisionTree({
      documentId: 'd',
      steps: STEPS,
      scaleOptions: ALL_LEVELS,
      aiQuestions: [
        {
          question: 'Colliding',
          choiceKey: 'branchSelection',
          conditions: [
            { id: 'branch-1', predicate: { op: 'equals', path: '$.branchSelection', value: 'x' } },
          ],
          evidence: [],
        },
      ],
      now: '2026-09-18T00:00:00.000Z',
    });
    expect(tree.axes).toHaveLength(2);
  });

  it('matches deriveBranchAxes axis ids 1:1 (axisId stability contract)', () => {
    const raw = deriveBranchAxes(STEPS);
    const tree = deriveDecisionTree({
      documentId: 'd',
      steps: STEPS,
      scaleOptions: ALL_LEVELS,
      now: '2026-09-18T00:00:00.000Z',
    });
    expect(tree.axes.map((a) => a.axisId)).toEqual(raw.map((a) => a.axisId));
  });

  it('omits sourcePdf/notes when absent, includes them when provided', () => {
    const bare = deriveDecisionTree({
      documentId: 'd',
      steps: STEPS,
      scaleOptions: ALL_LEVELS,
      now: '2026-09-18T00:00:00.000Z',
    });
    expect('sourcePdf' in bare).toBe(false);
    expect('notes' in bare).toBe(false);

    const rich = deriveDecisionTree({
      documentId: 'd',
      steps: STEPS,
      scaleOptions: ALL_LEVELS,
      sourcePdf: { file: 'x.pdf' },
      notes: 'hello',
      now: '2026-09-18T00:00:00.000Z',
    });
    expect(rich.sourcePdf).toEqual({ file: 'x.pdf' });
    expect(rich.notes).toBe('hello');
  });
});
