import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildVendorProtocolCompilePrompt,
  draftVendorProtocolEventGraph,
} from './VendorProtocolEventGraphDraftService.js';
import type { ExtractedCandidateItem, ProtocolCandidate, ProtocolStepCandidate } from './types.js';

const DOC_ID = 'doc-active-steps';

const BLOOD_1 = 'Pipette 200 ul of blood into a microcentrifuge tube.';
const BLOOD_2 = 'Add 20 ul proteinase K and 200 ul Buffer ATL, vortex, incubate 15 min at 30 C.';
const BLOOD_3 = 'Add 200 ul Buffer B, mix, incubate 3 min at room temperature.';
const TISSUE_1 = 'Grind 25 mg tissue with a tissue grinder in Buffer ATL.';
const TISSUE_2 = 'Add lysozyme to the homogenate and incubate 1 h at 37 C.';

function item(id: string, label: string, sectionId: string): ExtractedCandidateItem {
  return {
    id,
    label,
    sourceText: label,
    provenance: { documentId: DOC_ID, pageStart: 1, sectionId },
    confidence: 0.9,
  };
}

function step(
  id: string,
  stepNumber: number,
  sectionId: string,
  sourceText: string,
  materials: string[],
  labware: string[],
): ProtocolStepCandidate {
  return {
    id,
    stepNumber,
    sectionId,
    sourceText,
    actions: [{ actionKind: 'other', sourceText, provenance: { documentId: DOC_ID, pageStart: 1, sectionId } }],
    conditions: {},
    materials,
    labware,
    equipment: [],
    notes: [],
    branches: [],
    provenance: { documentId: DOC_ID, pageStart: 1, sectionId },
    confidence: 0.9,
  };
}

function candidate(): ProtocolCandidate {
  return {
    kind: 'vendor-protocol-candidate',
    source: {
      documentId: DOC_ID,
      filename: 'two-sections.txt',
      title: 'Two Section Protocol',
      pageCount: 2,
    },
    title: 'Two Section Protocol',
    sections: [],
    materials: [
      item('mat-atl-blood', 'Buffer ATL', 'sec-blood'),
      item('mat-proteinase-blood', 'proteinase K', 'sec-blood'),
      item('mat-bufferb-blood', 'Buffer B', 'sec-blood'),
      item('mat-atl-tissue', 'Buffer ATL', 'sec-tissue'),
      item('mat-lysozyme-tissue', 'lysozyme', 'sec-tissue'),
    ],
    equipment: [],
    labware: [
      item('lw-tube-blood', 'microcentrifuge tube', 'sec-blood'),
      item('lw-grinder-tissue', 'tissue grinder', 'sec-tissue'),
    ],
    steps: [
      step('blood-1', 1, 'sec-blood', BLOOD_1, [], ['microcentrifuge tube']),
      step('blood-2', 2, 'sec-blood', BLOOD_2, ['Buffer ATL', 'proteinase K'], ['microcentrifuge tube']),
      step('blood-3', 3, 'sec-blood', BLOOD_3, ['Buffer B', 'Buffer ATL'], ['microcentrifuge tube']),
      step('tissue-1', 1, 'sec-tissue', TISSUE_1, ['Buffer ATL'], ['tissue grinder']),
      step('tissue-2', 2, 'sec-tissue', TISSUE_2, ['lysozyme'], ['tissue grinder']),
    ],
    tables: [],
    notes: [],
    outputs: [],
    diagnostics: [],
  };
}

const bloodStepIds = ['blood-1', 'blood-2', 'blood-3'];

describe('buildVendorProtocolCompilePrompt active step filtering', () => {
  it('includes only active-section steps and their referenced materials/labware', () => {
    const prompt = buildVendorProtocolCompilePrompt(candidate(), bloodStepIds);

    // Active steps present, sorted.
    expect(prompt).toContain(`1. ${BLOOD_1}`);
    expect(prompt).toContain(`2. ${BLOOD_2}`);
    expect(prompt).toContain(`3. ${BLOOD_3}`);

    // Materials/labware referenced by (or declared in) active steps are present.
    expect(prompt).toContain('Buffer ATL');
    expect(prompt).toContain('proteinase K');
    expect(prompt).toContain('Buffer B');
    expect(prompt).toContain('microcentrifuge tube');

    // Other-section steps and their exclusive entities are excluded.
    expect(prompt).not.toContain(TISSUE_1);
    expect(prompt).not.toContain(TISSUE_2);
    expect(prompt).not.toContain('lysozyme');
    expect(prompt).not.toContain('tissue grinder');
  });

  it('without activeStepIds yields the full whole-document prompt (pinned regression boundary)', () => {
    const prompt = buildVendorProtocolCompilePrompt(candidate());

    // All 5 step lines appear (both sections; step numbers repeat per section).
    expect(prompt).toContain(`1. ${BLOOD_1}`);
    expect(prompt).toContain(`2. ${BLOOD_2}`);
    expect(prompt).toContain(`3. ${BLOOD_3}`);
    expect(prompt).toContain(`1. ${TISSUE_1}`);
    expect(prompt).toContain(`2. ${TISSUE_2}`);

    // All entity labels appear.
    expect(prompt).toContain('Buffer ATL');
    expect(prompt).toContain('proteinase K');
    expect(prompt).toContain('Buffer B');
    expect(prompt).toContain('lysozyme');
    expect(prompt).toContain('microcentrifuge tube');
    expect(prompt).toContain('tissue grinder');
  });

  it('draftVendorProtocolEventGraph threads activeStepIds into compilePrompt; omitted means whole-document', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'vendor-protocol-active-steps-'));
    try {
      const filtered = await draftVendorProtocolEventGraph({
        workspaceRoot,
        candidate: candidate(),
        activeStepIds: bloodStepIds,
        compile: false,
        persist: false,
      });
      expect(filtered.compilePrompt).toBe(buildVendorProtocolCompilePrompt(candidate(), bloodStepIds));
      expect(filtered.compilePrompt).not.toContain('lysozyme');
      // candidateSummary stays whole-document.
      expect(filtered.candidateSummary.stepCount).toBe(5);

      const whole = await draftVendorProtocolEventGraph({
        workspaceRoot,
        candidate: candidate(),
        compile: false,
        persist: false,
      });
      expect(whole.compilePrompt).toBe(buildVendorProtocolCompilePrompt(candidate()));
      expect(whole.compilePrompt).toContain('lysozyme');
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
