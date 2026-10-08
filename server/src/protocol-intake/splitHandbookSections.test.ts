import { describe, expect, it } from 'vitest';
import { childCandidateFrom, splitHandbookSections } from './splitHandbookSections.js';
import type {
  ProtocolCandidate,
  ProtocolStepCandidate,
} from '../ingestion/vendor-protocol/types.js';

const provenance = { documentId: 'doc-1', pageStart: 1 };

function step(
  id: string,
  stepNumber: number,
  sectionId: string | undefined,
  sourceText: string,
): ProtocolStepCandidate {
  return {
    id,
    stepNumber,
    ...(sectionId !== undefined ? { sectionId } : {}),
    sourceText,
    actions: [],
    conditions: {},
    materials: [],
    labware: [],
    equipment: [],
    notes: [],
    branches: [],
    provenance,
    confidence: 1,
  };
}

function candidate(overrides: {
  sections: ProtocolCandidate['sections'];
  steps: ProtocolStepCandidate[];
}): ProtocolCandidate {
  return {
    kind: 'vendor-protocol-candidate',
    source: { documentId: 'doc-1', filename: 'handbook.pdf', pageCount: 10 },
    title: 'DNeasy Handbook',
    sections: overrides.sections,
    materials: [],
    equipment: [],
    labware: [],
    steps: overrides.steps,
    tables: [],
    notes: [],
    outputs: [],
    diagnostics: [],
  };
}

describe('splitHandbookSections', () => {
  it('splits a two-protocol handbook and attaches the mentioned pretreatment appendix to the mentioning child', () => {
    const c = candidate({
      sections: [
        { id: 'sec-cover', kind: 'cover', title: 'Cover', provenance },
        { id: 'sec-blood', kind: 'protocol', title: 'Blood', provenance },
        { id: 'sec-tissue', kind: 'protocol', title: 'Tissue', provenance },
        {
          id: 'sec-pre',
          kind: 'appendix',
          title: 'Pretreatment for gram-positive bacteria',
          provenance,
        },
      ],
      steps: [
        step('step-1', 1, 'sec-blood', 'Draw blood into the tube.'),
        step(
          'step-2',
          2,
          'sec-blood',
          'Perform the\n  pretreatment for Gram-positive bacteria  first',
        ),
        step('step-3', 3, 'sec-blood', 'Add Buffer ATL.'),
        step('step-4', 1, 'sec-tissue', 'Homogenize tissue.'),
        step('step-5', 2, 'sec-tissue', 'Add Buffer ATL.'),
      ],
    });

    const children = splitHandbookSections(c);
    expect(children).toHaveLength(2);

    const [blood, tissue] = children as [
      (typeof children)[number],
      (typeof children)[number],
    ];
    expect(blood.sectionId).toBe('sec-blood');
    expect(blood.sectionTitle).toBe('Blood');
    expect(blood.slug).toBe('blood');
    expect(blood.stepIds).toEqual(['step-1', 'step-2', 'step-3']);
    expect(blood.attachedSectionIds).toEqual(['sec-pre']);

    expect(tissue.sectionId).toBe('sec-tissue');
    expect(tissue.slug).toBe('tissue');
    expect(tissue.stepIds).toEqual(['step-4', 'step-5']);
    expect(tissue.attachedSectionIds).toEqual([]);

    // Determinism: same input, same output across calls.
    expect(splitHandbookSections(c)).toEqual(children);
  });

  it('returns [] for a single-protocol document (not a handbook)', () => {
    const c = candidate({
      sections: [{ id: 'sec-p', kind: 'protocol', title: 'Blood', provenance }],
      steps: [step('step-1', 1, 'sec-p', 'Draw blood.')],
    });
    expect(splitHandbookSections(c)).toEqual([]);
  });

  it('emits a child with empty stepIds for a protocol section with no steps', () => {
    const c = candidate({
      sections: [
        { id: 'sec-a', kind: 'protocol', title: 'Cells', provenance },
        { id: 'sec-b', kind: 'protocol', title: 'Tissue', provenance },
      ],
      steps: [step('step-1', 1, 'sec-b', 'Homogenize tissue.')],
    });
    const children = splitHandbookSections(c);
    expect(children).toHaveLength(2);
    expect(children[0]).toMatchObject({ sectionId: 'sec-a', stepIds: [] });
  });

  it('leaves an unmentioned attachment candidate out of every child', () => {
    const c = candidate({
      sections: [
        { id: 'sec-a', kind: 'protocol', title: 'Blood', provenance },
        { id: 'sec-b', kind: 'protocol', title: 'Tissue', provenance },
        { id: 'sec-orphan', kind: 'appendix', title: 'Guarantee terms', provenance },
      ],
      steps: [
        step('step-1', 1, 'sec-a', 'Draw blood.'),
        step('step-2', 1, 'sec-b', 'Homogenize tissue.'),
      ],
    });
    const children = splitHandbookSections(c);
    expect(children).toHaveLength(2);
    for (const child of children) {
      expect(child.attachedSectionIds).not.toContain('sec-orphan');
    }
  });

  it('keeps a printed pretreatment as a selectable entry path', () => {
    const c = candidate({
      sections: [
        { id: 'sec-a', kind: 'protocol', title: 'Blood Spin', provenance },
        { id: 'sec-b', kind: 'protocol', title: 'Tissue Spin', provenance },
        { id: 'sec-gram', kind: 'protocol', title: 'Pretreatment for Gram-Positive Bacteria', provenance },
      ],
      steps: [
        step('step-1', 1, 'sec-a', 'Draw blood. For Gram-positive bacteria, see Pretreatment for Gram-Positive Bacteria.'),
        step('step-2', 1, 'sec-b', 'Homogenize tissue.'),
        step('step-3', 1, 'sec-gram', 'Lyse cell wall with lysozyme.'),
      ],
    });
    const children = splitHandbookSections(c);
    expect(children.map((ch) => ch.sectionId)).toEqual(['sec-a', 'sec-b', 'sec-gram']);
    expect(children[0]!.attachedSectionIds).toEqual([]);
    expect(children[1]!.attachedSectionIds).toEqual([]);
    expect(children[0]!.stepIds).toEqual(['step-1']);
  });

  it('does not discard a handbook containing only pretreatments', () => {
    const c = candidate({
      sections: [
        { id: 'sec-p1', kind: 'protocol', title: 'Pretreatment for Paraffin', provenance },
        { id: 'sec-p2', kind: 'protocol', title: 'Pretreatment for FFPE', provenance },
      ],
      steps: [
        step('step-1', 1, 'sec-p1', 'Deparaffinize.'),
        step('step-2', 1, 'sec-p2', 'Deparaffinize twice.'),
      ],
    });
    expect(splitHandbookSections(c)).toHaveLength(2);
  });
});


describe('explicit handbook continuations', () => {
  const tissue = 'Purification of Total DNA from Animal Tissues (Spin-Column Protocol)';
  function handbook(reference: string) {
    return candidate({
      sections: [
        { id: 'tissue', kind: 'protocol', title: tissue, provenance },
        { id: 'bacteria', kind: 'protocol', title: 'Pretreatment for Gram-Positive Bacteria', provenance },
      ],
      steps: [
        step('step-1', 1, 'tissue', 'Prepare tissue.'),
        step('step-2', 4, 'tissue', 'Bind DNA.'),
        step('step-3', 5, 'tissue', 'Elute DNA.'),
        step('step-4', 1, 'bacteria', 'Lyse bacteria.'),
        step('step-5', 7, 'bacteria', reference),
      ],
    });
  }
  it('joins the real DNeasy Gram-positive cross-reference at step 4, in execution order', () => {
    // The PDF drops an opening parenthesis and wraps Spin-Column across lines.
    const parent = handbook('Continue with step 4 of the protocol “Purification of Total DNA from Animal Tissues Spin-\nColumn Protocol)”, page 33.');
    const child = splitHandbookSections(parent)[1]!;
    expect(child.continuationStepIds).toEqual(['step-2', 'step-3']);
    const scoped = childCandidateFrom(parent, child, 'gram-positive');
    expect(scoped.steps.map((s) => s.id)).toEqual(['step-4', 'step-5', 'step-2', 'step-3']);
    expect(scoped.sections.map((s) => s.id)).toEqual(['bacteria']);
    expect(scoped.steps[2]!.sectionId).toBe('tissue');
    expect(parent.steps).toHaveLength(5);
  });
  it.each([
    'Continue with step 99 of the protocol “'+tissue+'”.',
    'Continue with step 4 of the protocol “Unknown purification”.',
    'See the protocol “'+tissue+'” for more information.',
  ])('does not guess a continuation for %s', (reference) => {
    expect(splitHandbookSections(handbook(reference))[1]!.continuationStepIds).toEqual([]);
  });
});
