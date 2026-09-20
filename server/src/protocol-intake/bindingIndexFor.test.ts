/**
 * bindingIndexFor — the on-demand counterpart of the eager enumeration.
 *
 * The reviewer answers the tree's questions; only the combination they actually
 * run is drafted. Its id must be the SAME id the eager pass would have used, or
 * the same branch ends up drafted twice — so the index is the position in the
 * product as enumerateChoiceBindings expands it, independent of any cap.
 */

import { describe, expect, it } from 'vitest';
import { enumerateChoiceBindings, bindingIndexFor, relevantChoices } from './enumerateChoiceBindings.js';
import type { DecisionTreeAxis } from './deriveDecisionTree.js';

function axis(axisId: string, values: string[]): DecisionTreeAxis {
  return {
    axisId,
    question: `Which ${axisId}?`,
    choiceKey: 'branchSelection',
    origin: 'document_table',
    conditions: values.map((value) => ({
      id: value,
      label: value,
      predicate: { op: 'equals', path: `$.branchSelection.${axisId}`, value },
      then_stepIds: ['step-1'],
    })),
  };
}

// The ZymoBIOMICS shape the reviewer hit: 2 answers, then 10.
const AXES = [axis('axis-a', ['a1', 'a2']), axis('axis-b', ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9', 'b10'])];

describe('bindingIndexFor', () => {
  it('agrees with the eager enumeration for every combination', () => {
    const { bindings, productSize } = enumerateChoiceBindings(AXES, 1000);
    expect(productSize).toBe(20);

    for (const [position, binding] of bindings.entries()) {
      const answers: Record<string, string> = {};
      for (const step of binding.branchPath) answers[step.axisId] = step.conditionId;
      expect(bindingIndexFor(AXES, answers)).toBe(position);
    }
  });

  it('gives the SAME index for a combination the cap excluded', () => {
    // The eager pass stops at 12; combination (a2, b10) is index 19 and was
    // never enumerated. It must still land on the id it would have had.
    const { bindings, truncated } = enumerateChoiceBindings(AXES, 12);
    expect(truncated).toBe(true);
    expect(bindings).toHaveLength(12);

    expect(bindingIndexFor(AXES, { 'axis-a': 'a2', 'axis-b': 'b10' })).toBe(19);
    // …and it is stable: asking twice cannot drift.
    expect(bindingIndexFor(AXES, { 'axis-a': 'a2', 'axis-b': 'b10' })).toBe(19);
  });

  it('refuses when nothing usable was answered', () => {
    expect(bindingIndexFor(AXES, {})).toBeNull();
  });

  it('refuses an answer that is not one of the tree’s options', () => {
    expect(bindingIndexFor(AXES, { 'axis-a': 'nope' })).toBeNull();
  });

  it('gives a PARTIAL answer set an index no complete set can reach', () => {
    // A nested question is only asked once its protocol is chosen, so the
    // reviewer answers a subset of the axes. That subset must not collide with
    // any complete combination (or the wrong branch would be reused).
    const { productSize } = enumerateChoiceBindings(AXES, 1000);
    const partialA = bindingIndexFor(AXES, { 'axis-a': 'a1' })!;
    const partialB = bindingIndexFor(AXES, { 'axis-b': 'b1' })!;
    const complete = bindingIndexFor(AXES, { 'axis-a': 'a1', 'axis-b': 'b1' })!;

    expect(partialA).toBeGreaterThanOrEqual(productSize);
    expect(partialB).toBeGreaterThanOrEqual(productSize);
    expect(new Set([partialA, partialB, complete]).size).toBe(3);
    // …and a partial set is stable across calls (same id every time).
    expect(bindingIndexFor(AXES, { 'axis-a': 'a1' })).toBe(partialA);
  });

  it('ignores axes with no conditions (they do not multiply)', () => {
    const withEmpty = [...AXES, axis('axis-empty', [])];
    const { bindings } = enumerateChoiceBindings(withEmpty, 1000);
    const answers: Record<string, string> = {};
    for (const step of bindings[5]!.branchPath) answers[step.axisId] = step.conditionId;

    expect(bindingIndexFor(withEmpty, answers)).toBe(5);
  });
});

describe('relevantChoices — a nested question belongs to its protocol', () => {
  const protocolAxis = axis('axis-protocol-choice', ['sec-spin', 'sec-96']);
  const spin = { ...axis('axis-step-1-variant', ['a', 'b']), sectionId: 'sec-spin' };
  const ninetySix = { ...axis('axis-step-20-variant', ['a', 'b']), sectionId: 'sec-96' };
  const sampleType = axis('axis-sample-type', ['feces', 'soil']);
  const AXES = [protocolAxis, sampleType, spin, ninetySix];

  it('drops the nested answers of protocols that were not chosen', () => {
    // The reviewer chose the spin-column protocol: the 96 protocol's own
    // question was answered earlier in the session and must NOT ride along —
    // it would union that protocol's steps into this branch.
    const answers = relevantChoices(AXES, {
      'axis-protocol-choice': 'sec-spin',
      'axis-sample-type': 'feces',
      'axis-step-1-variant': 'a',
      'axis-step-20-variant': 'b',
    });

    expect(answers).toEqual({
      'axis-protocol-choice': 'sec-spin',
      'axis-sample-type': 'feces',
      'axis-step-1-variant': 'a',
    });
  });

  it('keeps every answer when no protocol is chosen yet', () => {
    const answers = relevantChoices(AXES, { 'axis-sample-type': 'soil' });
    expect(answers).toEqual({ 'axis-sample-type': 'soil' });
  });
});
