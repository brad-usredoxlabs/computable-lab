import { describe, expect, it } from 'vitest';
import { closestMatch, levenshtein } from './closestMatch.js';

describe('levenshtein', () => {
  it('is zero for equal strings', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
  });
  it('counts single edits', () => {
    expect(levenshtein('abc', 'abd')).toBe(1); // substitution
    expect(levenshtein('abc', 'ab')).toBe(1); // deletion
    expect(levenshtein('ab', 'abc')).toBe(1); // insertion
  });
  it('handles empty strings', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });
});

describe('closestMatch', () => {
  const verbs = ['transfer', 'aliquot', 'thermocycle', 'incubate'];

  it('finds the nearest candidate for a typo (case-insensitive)', () => {
    expect(closestMatch('Transferr', verbs)).toBe('transfer');
    expect(closestMatch('incubatte', verbs)).toBe('incubate');
  });

  it('returns undefined when nothing is close enough', () => {
    expect(closestMatch('centrifuge', verbs)).toBeUndefined();
  });

  it('returns undefined for empty input or candidates', () => {
    expect(closestMatch('', verbs)).toBeUndefined();
    expect(closestMatch('transfer', [])).toBeUndefined();
  });

  it('respects an explicit maxDistance', () => {
    expect(closestMatch('xfer', verbs, 1)).toBeUndefined();
    expect(closestMatch('transfe', verbs, 1)).toBe('transfer');
  });
});
