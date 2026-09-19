/**
 * The DNeasy handbook in miniature: eight protocols headed
 * "Protocol: Purification of Total DNA from Animal Blood or Cells (…)".
 * The choice between them is the document's own if/then logic.
 */

import { describe, expect, it } from 'vitest';
import { deriveProtocolChoiceAxis } from './deriveProtocolChoiceAxis.js';

const SECTIONS = [
  { id: 'section-purification-…-spin-column-protocol', kind: 'protocol', title: 'Purification of Total DNA from Animal Blood or Cells (Spin-Column Protocol)' },
  { id: 'section-purification-…-tissues-spin-column-protocol', kind: 'protocol', title: 'Purification of Total DNA from Animal Tissues (Spin-Column Protocol)' },
  { id: 'section-purification-…-dneasy-96-protocol', kind: 'protocol', title: 'Purification of Total DNA from Animal Blood or Cells (DNeasy 96 Protocol)' },
  { id: 'section-pretreatment-for-formalin-fixed-tissue', kind: 'protocol', title: 'Pretreatment for Formalin-Fixed Tissue' },
  { id: 'section-troubleshooting', kind: 'troubleshooting', title: 'Troubleshooting' },
];

const STEPS = [
  { id: 'step-1', stepNumber: 1, sectionId: SECTIONS[0]!.id },
  { id: 'step-2', stepNumber: 1, substep: 'a', sectionId: SECTIONS[0]!.id },
  { id: 'step-3', stepNumber: 1, substep: 'b', sectionId: SECTIONS[0]!.id },
  { id: 'step-4', stepNumber: 2, sectionId: SECTIONS[0]!.id },
  { id: 'step-5', stepNumber: 1, sectionId: SECTIONS[1]!.id },
  { id: 'step-6', stepNumber: 1, sectionId: SECTIONS[2]!.id },
  { id: 'step-7', stepNumber: 1, sectionId: SECTIONS[3]!.id },
];

describe('deriveProtocolChoiceAxis', () => {
  it('asks which protocol applies, one option per protocol the document prints', () => {
    const { axis } = deriveProtocolChoiceAxis({ protocolSections: SECTIONS, steps: STEPS });

    expect(axis?.axisId).toBe('axis-protocol-choice');
    expect(axis?.question).toBe('Which protocol applies?');
    expect(axis?.conditions.map((condition) => condition.label)).toEqual([
      'Purification of Total DNA from Animal Blood or Cells (Spin-Column Protocol)',
      'Purification of Total DNA from Animal Tissues (Spin-Column Protocol)',
      'Purification of Total DNA from Animal Blood or Cells (DNeasy 96 Protocol)',
      'Pretreatment for Formalin-Fixed Tissue',
    ]);
    // Non-protocol sections (troubleshooting) are not protocols to choose.
    expect(axis?.conditions.some((condition) => condition.label === 'Troubleshooting')).toBe(false);
  });

  it('gates each protocol’s OWN steps, in the order the reader walks them', () => {
    const { axis } = deriveProtocolChoiceAxis({ protocolSections: SECTIONS, steps: STEPS });
    const spinColumn = axis?.conditions[0];

    expect(spinColumn?.then_stepIds).toEqual(['step-1', 'step-2', 'step-3', 'step-4']);
    expect(spinColumn?.predicate).toEqual({
      op: 'equals',
      path: '$.branchSelection',
      value: 'purification-of-total-dna-from-animal-blood-or-cells-spin-column-protocol',
    });
    expect(axis?.conditions[1]?.then_stepIds).toEqual(['step-5']);
  });

  it('refuses when the document prints a single protocol — that is not a choice', () => {
    const { axis, reason } = deriveProtocolChoiceAxis({
      protocolSections: [SECTIONS[0]!],
      steps: STEPS,
    });

    expect(axis).toBeUndefined();
    expect(reason).toBe('single_protocol');
  });

  it('refuses when the steps cannot be attributed to a protocol', () => {
    const { axis, reason } = deriveProtocolChoiceAxis({
      protocolSections: SECTIONS,
      steps: STEPS.map(({ id, stepNumber }) => ({ id, stepNumber })),
    });

    expect(axis).toBeUndefined();
    expect(reason).toBe('steps_not_attributed');
  });

  it('refuses when a protocol the document prints has no attributable steps', () => {
    // "Pretreatment for Gram-Positive Bacteria" is in the handbook but its
    // steps did not parse: offering only the other protocols would hide the one
    // the reader who needs a pretreatment is looking for.
    const { axis, reason } = deriveProtocolChoiceAxis({
      protocolSections: [
        ...SECTIONS,
        {
          id: 'section-pretreatment-for-gram-positive-bacteria',
          kind: 'protocol',
          title: 'Pretreatment for Gram-Positive Bacteria',
        },
      ],
      steps: STEPS,
    });

    expect(axis).toBeUndefined();
    expect(reason).toBe('steps_not_attributed');
  });

  it('refuses two protocols that print the same name — the choice would be ambiguous', () => {
    const twins = [
      { id: 'section-a', kind: 'protocol', title: 'Purification of Total DNA' },
      { id: 'section-b', kind: 'protocol', title: 'Purification of Total DNA' },
    ];
    const { axis, reason } = deriveProtocolChoiceAxis({
      protocolSections: twins,
      steps: [
        { id: 'step-1', stepNumber: 1, sectionId: 'section-a' },
        { id: 'step-2', stepNumber: 1, sectionId: 'section-b' },
      ],
    });

    expect(axis).toBeUndefined();
    expect(reason).toBe('unnamed_protocols');
  });
});
