import { describe, expect, it } from 'vitest';
import {
  canonicalLabelKey,
  labelHash,
  localMaterialIdForLabel,
  localMaterialIdForCurie,
} from './termId.js';

describe('termId — deterministic local term IDs', () => {
  it('produces a MAT-<slug>-<hash> id for a free-text label', () => {
    expect(localMaterialIdForLabel('DMSO')).toBe('MAT-dmso-ykg0');
  });

  it('is deterministic: same label → same id (idempotent re-mint)', () => {
    expect(localMaterialIdForLabel('fenofibrate')).toBe(localMaterialIdForLabel('fenofibrate'));
    expect(localMaterialIdForLabel('DMSO')).toBe('MAT-dmso-ykg0');
  });

  it('is case-insensitive (DMSO and dmso mint to the same id)', () => {
    expect(labelHash('DMSO')).toBe(labelHash('dmso'));
    expect(localMaterialIdForLabel('DMSO')).toBe(localMaterialIdForLabel('dmso'));
  });

  it('disambiguates labels that slugify alike via the hash suffix', () => {
    // "c d" vs "c-d" both slugify to "c-d", but hash differently → distinct ids.
    const a = localMaterialIdForLabel('c d');
    const b = localMaterialIdForLabel('c-d');
    expect(a.startsWith('MAT-c-d-')).toBe(true);
    expect(b.startsWith('MAT-c-d-')).toBe(true);
    expect(a).not.toBe(b);
  });

  it('locks the algorithm with a known long label', () => {
    expect(localMaterialIdForLabel('Copper sulfate')).toBe('MAT-copper-sulfate-1luf');
  });

  it('mints a MAT-<CURIE-SLUG> id for an ontology-grounded term', () => {
    expect(localMaterialIdForCurie('CHEBI:5001')).toBe('MAT-CHEBI-5001');
    expect(localMaterialIdForCurie('chebi:16236')).toBe('MAT-CHEBI-16236');
  });

  // CARD1-D3 (ruling §2, l2t1430): the canonicalLabelKey identity source.
  it('canonicalLabelKey: NFKC -> trim -> collapse inner whitespace -> toLowerCase("en")', () => {
    expect(canonicalLabelKey('  1 mM Clofibrate   in DMSO ')).toBe('1 mm clofibrate in dmso');
    // Punctuation stays verbatim (hyphen/slash/parens are never rewritten).
    expect(canonicalLabelKey('Trypsin-EDTA / DMEM (FBS-free)')).toBe(
      'trypsin-edta / dmem (fbs-free)',
    );
  });

  it('canonicalLabelKey is NFKC-sensitive (compatibility characters fold to ASCII)', () => {
    // Fullwidth "ＤＭＳＯ" NFKC-folds to "DMSO"; the identity key must agree.
    expect(canonicalLabelKey('ＤＭＳＯ')).toBe('dmso');
  });

  it('STAGE A collapse: case + inner-whitespace variants of one entity mint ONE id', () => {
    // The D3 red case — one char of case AND a double space used to mint TWO ids
    // (labelHash hashed the raw trim+lower string, keeping the double space).
    // The ruling: both variants collapse onto ONE recordId (STAGE A identity).
    const a = localMaterialIdForLabel('1 mM clofibrate in DMSO');
    const b = localMaterialIdForLabel('1 mM Clofibrate  in DMSO');
    expect(b).toBe(a);
    expect(labelHash('1 mM clofibrate in DMSO')).toBe(labelHash('1 mM Clofibrate  in DMSO'));
    // The two variants must still differ from a genuinely different label.
    expect(localMaterialIdForLabel('1 mM clofibrate in DMSO')).not.toBe(
      localMaterialIdForLabel('1 mM clofibrate in H2O'),
    );
  });
});
