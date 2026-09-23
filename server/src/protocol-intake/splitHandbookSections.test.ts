import { describe, expect, it } from 'vitest';
import { splitHandbookSections } from './splitHandbookSections.js';
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

  it('a pretreatment section filed as kind:protocol attaches — never fans out as a child', () => {
    // The DNeasy case: the literal extractor filed "Pretreatment for
    // Gram-Positive Bacteria" under kind:'protocol'. A pretreatment is
    // auxiliary: it must attach to the protocols that mention it, not become
    // a fifth standalone document.
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
    expect(children.map((ch) => ch.sectionId)).toEqual(['sec-a', 'sec-b']);
    expect(children[0]!.attachedSectionIds).toEqual(['sec-gram']);
    expect(children[1]!.attachedSectionIds).toEqual([]);
    // The pretreatment's steps ride the attaching child's step set? No —
    // stepIds carries the CHILD's own section steps; attachments ride via
    // attachedSectionIds (the scoping fn pulls their steps in at scope time).
    expect(children[0]!.stepIds).toEqual(['step-1']);
  });

  it('two pretreatment-kind sections do NOT count as a handbook (no split on pretreatments alone)', () => {
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
    // Only pretreatments, zero real protocols -> caller keeps whole-document
    // behavior rather than fabricating a two-way protocol choice.
    expect(splitHandbookSections(c)).toEqual([]);
  });
});
