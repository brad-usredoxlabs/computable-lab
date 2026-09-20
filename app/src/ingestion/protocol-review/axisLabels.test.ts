/**
 * The DNeasy handbook's eight protocol names, verbatim. Reading them as a list
 * is what makes the reviewer see a lump instead of "sample type × method".
 */

import { describe, expect, it } from 'vitest';
import { compactAxisLabels, isAxisVisible } from './axisLabels.js';

const DNEASY_PROTOCOLS = [
  'Purification of Total DNA from Animal Blood or Cells (Spin-Column Protocol)',
  'Purification of Total DNA from Animal Tissues (Spin-Column Protocol)',
  'Purification of Total DNA from Animal Blood or Cells (DNeasy 96 Protocol)',
  'Purification of Total DNA from Animal Tissues (DNeasy 96 Protocol)',
];

describe('compactAxisLabels', () => {
  it('strips the boilerplate so the two dimensions show', () => {
    // "Purification of Total DNA from Animal" is common to all four and goes;
    // what is left is the sample type and the method, which is the matrix.
    expect(compactAxisLabels(DNEASY_PROTOCOLS)).toEqual([
      'Blood or Cells (Spin-Column Protocol)',
      'Tissues (Spin-Column Protocol)',
      'Blood or Cells (DNeasy 96 Protocol)',
      'Tissues (DNeasy 96 Protocol)',
    ]);
  });

  it('also strips a trailing word shared by every option', () => {
    // "Rack" is filler in both; what distinguishes them is the tube vs rack form.
    expect(compactAxisLabels(['ZymoBIOMICS Lysis Rack', 'ZR Lysis Tubes Rack'])).toEqual([
      'ZymoBIOMICS Lysis',
      'ZR Lysis Tubes',
    ]);
  });

  it('leaves options that share nothing alone', () => {
    expect(compactAxisLabels(['Feces', 'Soil'])).toEqual(['Feces', 'Soil']);
  });

  it('never blanks an option — a repeated word beats an empty choice', () => {
    expect(compactAxisLabels(['Sample type', 'Sample type'])).toEqual(['Sample type', 'Sample type']);
  });

  it('keeps single options untouched', () => {
    expect(compactAxisLabels(['Only option'])).toEqual(['Only option']);
  });

  it('keeps a lone shared leading word — a fragment is not a choice', () => {
    // Trimming the single shared word would leave nothing but "with shield".
    expect(compactAxisLabels(['Feces', 'Feces with shield'])).toEqual(['Feces', 'Feces with shield']);
    expect(compactAxisLabels(['Blood', 'Blood cells'])).toEqual(['Blood', 'Blood cells']);
  });
});

describe('isAxisVisible — a nested question waits for its protocol', () => {
  const SPIN = 'section-purification-of-total-dna-from-animal-blood-or-cells-spin-column-protocol';
  const NINETY_SIX = 'section-purification-of-total-dna-from-animal-blood-or-cells-dneasy-96-protocol';

  it('shows every top-level question', () => {
    expect(isAxisVisible({ axisId: 'axis-sample-type' }, {}, [])).toBe(true);
  });

  it('hides a protocol’s own question until that protocol is chosen', () => {
    const nested = { axisId: 'axis-step-1-variant', sectionId: SPIN };

    expect(isAxisVisible(nested, {}, ['axis-protocol-choice'])).toBe(false);
    expect(isAxisVisible(nested, { 'axis-protocol-choice': NINETY_SIX }, ['axis-protocol-choice'])).toBe(false);
    expect(isAxisVisible(nested, { 'axis-protocol-choice': SPIN }, ['axis-protocol-choice'])).toBe(true);
  });
});

describe('compactAxisLabels — the handbook’s whole protocol list', () => {
  // All eight options of the DNeasy handbook. The two families ("Purification
  // of Total DNA from …" and "Pretreatment for …") share no common prefix, so
  // the boilerplate only disappears if each family is trimmed on its own.
  const EIGHT = [
    'Purification of Total DNA from Animal Blood or Cells (Spin-Column Protocol)',
    'Purification of Total DNA from Animal Tissues (Spin-Column Protocol)',
    'Purification of Total DNA from Animal Blood or Cells (DNeasy 96 Protocol)',
    'Purification of Total DNA from Animal Tissues (DNeasy 96 Protocol)',
    'Pretreatment for Paraffin-Embedded Tissue',
    'Pretreatment for Formalin-Fixed Tissue',
    'Pretreatment for Gram-Negative Bacteria',
    'Pretreatment for Gram-Positive Bacteria',
  ];

  it('reads as sample type × method, plus what each pretreatment is for', () => {
    expect(compactAxisLabels(EIGHT)).toEqual([
      'Blood or Cells (Spin-Column Protocol)',
      'Tissues (Spin-Column Protocol)',
      'Blood or Cells (DNeasy 96 Protocol)',
      'Tissues (DNeasy 96 Protocol)',
      'Paraffin-Embedded Tissue',
      'Formalin-Fixed Tissue',
      'Gram-Negative Bacteria',
      'Gram-Positive Bacteria',
    ]);
  });

  it('keeps every option non-empty', () => {
    expect(compactAxisLabels(EIGHT).every((label) => label.trim().length > 0)).toBe(true);
  });
});
