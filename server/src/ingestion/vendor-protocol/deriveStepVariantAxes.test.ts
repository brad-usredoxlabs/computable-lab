/**
 * The first step of the DNeasy "Purification of Total DNA from Animal Blood or
 * Cells (Spin-Column Protocol)", verbatim as the extraction sees it, and the
 * variant steps it dispatches to.
 */

import { describe, expect, it } from 'vitest';
import { deriveStepVariantAxes } from './deriveStepVariantAxes.js';

const SECTION = 'section-purification-of-total-dna-from-animal-blood-or-cells-spin-column-protocol';

const STEP_1_TEXT = `For blood with non-nucleated erythrocytes, follow step 1a; for blood with nucleated
erythrocytes, follow step 1b; for cultured cells, follow step 1c. Blood from mammals
contains non-nucleated erythrocytes.`;

const DNEASY_STEPS = [
  { id: 'step-1', stepNumber: 1, sectionId: SECTION, sourceText: STEP_1_TEXT },
  { id: 'step-2', stepNumber: 1, substep: 'a', sectionId: SECTION, sourceText: 'Non-nucleated: Pipet 20 µl Proteinase K into a tube.' },
  { id: 'step-3', stepNumber: 1, substep: 'b', sectionId: SECTION, sourceText: 'Nucleated: Pipet 20 µl Proteinase K and add 5–10 µl blood.' },
  { id: 'step-4', stepNumber: 1, substep: 'c', sectionId: SECTION, sourceText: 'Cultured cells: Centrifuge the cells and resuspend in PBS.' },
  { id: 'step-5', stepNumber: 2, sectionId: SECTION, sourceText: 'Add 200 µl Buffer AL and incubate at 56°C.' },
];

describe('deriveStepVariantAxes', () => {
  it('turns the dispatch sentence into one question with an option per variant', () => {
    const axes = deriveStepVariantAxes(DNEASY_STEPS);

    expect(axes).toHaveLength(1);
    const axis = axes[0]!;
    expect(axis.axisId).toBe('axis-step-1-variant');
    expect(axis.question).toBe('Which variant applies for step 1?');
    expect(axis.conditions.map((condition) => condition.label)).toEqual([
      'blood with non-nucleated erythrocytes',
      'blood with nucleated erythrocytes',
      'cultured cells',
    ]);
  });

  it('gates each variant step, not the dispatching step', () => {
    const axis = deriveStepVariantAxes(DNEASY_STEPS)[0]!;

    expect(axis.conditions.map((condition) => condition.then_stepIds)).toEqual([
      ['step-2'],
      ['step-3'],
      ['step-4'],
    ]);
    expect(axis.conditions[0]?.predicate).toEqual({
      op: 'equals',
      path: '$.branchSelection',
      value: 'blood-with-non-nucleated-erythrocytes',
    });
  });

  it('ignores a step that merely cross-references one step (no choice)', () => {
    const axes = deriveStepVariantAxes([
      { id: 'step-1', stepNumber: 1, sectionId: SECTION, sourceText: 'Continue with step 2 when the pellet is dissolved.' },
      { id: 'step-2', stepNumber: 2, sectionId: SECTION, sourceText: 'Add 200 µl Buffer AL.' },
    ]);

    expect(axes).toEqual([]);
  });

  it('refuses a dispatch whose target step cannot be found', () => {
    const axes = deriveStepVariantAxes([
      { id: 'step-1', stepNumber: 1, sectionId: SECTION, sourceText: STEP_1_TEXT },
      // 1a and 1c exist; 1b was never extracted.
      { id: 'step-2', stepNumber: 1, substep: 'a', sectionId: SECTION, sourceText: 'Non-nucleated: Pipet 20 µl Proteinase K.' },
      { id: 'step-4', stepNumber: 1, substep: 'c', sectionId: SECTION, sourceText: 'Cultured cells: Centrifuge.' },
    ]);

    // A question whose option points at nothing is worse than no question.
    expect(axes).toEqual([]);
  });

  it('reads the vendor’s own typo — "follow step1a" with no space (DNeasy 96 protocol)', () => {
    // The DNeasy 96 protocol prints exactly this, and requiring a space after
    // "step" silently dropped that option: the axis kept two of three variants.
    const axes = deriveStepVariantAxes([
      {
        id: 'step-20',
        stepNumber: 1,
        sectionId: SECTION,
        sourceText:
          'For blood with non-nucleated erythrocytes, follow step1a; for blood with nucleated erythrocytes, follow step 1b; for cultured cells, follow step 1c.',
      },
      { id: 'step-21', stepNumber: 1, substep: 'a', sectionId: SECTION, sourceText: 'Non-nucleated: Pipet 20 µl Proteinase K.' },
      { id: 'step-22', stepNumber: 1, substep: 'b', sectionId: SECTION, sourceText: 'Nucleated: Pipet 20 µl Proteinase K.' },
      { id: 'step-23', stepNumber: 1, substep: 'c', sectionId: SECTION, sourceText: 'Cultured cells: Centrifuge.' },
    ]);

    expect(axes[0]?.conditions.map((condition) => condition.then_stepIds)).toEqual([
      ['step-21'],
      ['step-22'],
      ['step-23'],
    ]);
  });

  it('refuses the axis when a variant the document prints is not offered', () => {
    // Three variant steps exist but the sentence only names two of them: the
    // reader who matches the third would find no branch.
    const axes = deriveStepVariantAxes([
      {
        id: 'step-1',
        stepNumber: 1,
        sectionId: SECTION,
        sourceText: 'For blood with nucleated erythrocytes, follow step 1b; for cultured cells, follow step 1c.',
      },
      { id: 'step-2', stepNumber: 1, substep: 'a', sectionId: SECTION, sourceText: 'Non-nucleated: Pipet 20 µl Proteinase K.' },
      { id: 'step-3', stepNumber: 1, substep: 'b', sectionId: SECTION, sourceText: 'Nucleated: Pipet 20 µl Proteinase K.' },
      { id: 'step-4', stepNumber: 1, substep: 'c', sectionId: SECTION, sourceText: 'Cultured cells: Centrifuge.' },
    ]);

    expect(axes).toEqual([]);
  });

  it('resolves "step 2" to step 2 of the SAME protocol, not of another one', () => {
    const axes = deriveStepVariantAxes([
      { id: 'step-1', stepNumber: 1, sectionId: SECTION, sourceText: 'For fresh blood, follow step 2; for frozen blood, follow step 3.' },
      { id: 'step-2', stepNumber: 2, sectionId: SECTION, sourceText: 'Fresh blood: use 100 µl.' },
      { id: 'step-9', stepNumber: 2, sectionId: 'section-other-protocol', sourceText: 'A different protocol’s step 2.' },
      { id: 'step-3', stepNumber: 3, sectionId: SECTION, sourceText: 'Frozen blood: thaw first.' },
    ]);

    const axis = axes[0]!;
    expect(axis.conditions.map((condition) => condition.then_stepIds)).toEqual([['step-2'], ['step-3']]);
  });
});
