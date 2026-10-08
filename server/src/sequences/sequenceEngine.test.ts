import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { fileURLToPath } from 'node:url';
import { normalizeSequence, reverseComplement, virtualPcr, type AlphabetSpec } from './sequenceEngine.js';
const alphabets = parse(await readFile(fileURLToPath(new URL('../../../config/sequence-analysis/alphabets.yaml', import.meta.url)), 'utf8')) as Record<string, AlphabetSpec>;
const dna = alphabets.iupac_dna!;
const params = { minLength: 8, maxLength: 200, maxMismatches: 0, exactThreePrime: 3, maxProducts: 100 };

describe('sequence input', () => {
  it('normalizes whitespace while preserving ambiguity and rejects unrecognized symbols', () => {
    expect(normalizeSequence(' acg\n tRY ', dna)).toBe('ACGTRY');
    expect(() => normalizeSequence('ACGT/56-FAM/', dna)).toThrow();
    expect(reverseComplement('ACGTRY', dna)).toBe('RYACGT');
  });
});
describe('virtual PCR', () => {
  const template = 'AACG' + 'T'.repeat(132) + 'TGCA';
  it('predicts a 140 bp product, oriented primer positions, and an internal probe', () => {
    const products = virtualPcr([{ id: 'ref', residues: template, topology: 'linear' }], 'AACG', 'TGCA', 'TTTTTT', params, dna);
    const p = products.find(x => x.strand === '+');
    expect(p).toMatchObject({ referenceId: 'ref', length: 140, start: 1, end: 140, strand: '+', residues: template });
    expect(p?.probeSites.length).toBeGreaterThan(0);
  });
  it('finds the same assay on the reverse strand', () => {
    const products = virtualPcr([{ id: 'ref', residues: reverseComplement(template, dna), topology: 'linear' }], 'AACG', 'TGCA', undefined, params, dna);
    expect(products.some(x => x.strand === '-' && x.length === 140 && x.residues === template)).toBe(true);
  });
  it('honors explicit mismatch and 3-prime constraints', () => {
    const ref = [{ id: 'ref', residues: 'TACGTTTTTGCA', topology: 'linear' }];
    expect(virtualPcr(ref, 'AACG', 'TGCA', undefined, params, dna)).toHaveLength(0);
    expect(virtualPcr(ref, 'AACG', 'TGCA', undefined, { ...params, maxMismatches: 1 }, dna).length).toBeGreaterThan(0);
    expect(virtualPcr(ref, 'TACA', 'TGCA', undefined, { ...params, maxMismatches: 1 }, dna)).toHaveLength(0);
  });
  it('finds products across a circular origin once', () => {
    const ref = [{ id: 'circle', residues: 'TTTTTGCAAAAACG', topology: 'circular' }];
    const hits = virtualPcr(ref, 'AACG', 'TGCA', undefined, params, dna).filter(x => x.strand === '+');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ start: 11, end: 8, wrapsOrigin: true, residues: 'AACGTTTTTGCA' });
  });
  it('fails visibly rather than returning a silently truncated result', () => {
    expect(() => virtualPcr([{ id: 'ref', residues: 'ACGTACGTACGTACGT', topology: 'linear' }], 'ACGT', 'ACGT', undefined, { ...params, maxProducts: 1 }, dna)).toThrow(/limit/i);
  });
});
