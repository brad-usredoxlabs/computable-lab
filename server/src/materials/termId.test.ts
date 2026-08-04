import { describe, expect, it } from 'vitest';
import {
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
});
