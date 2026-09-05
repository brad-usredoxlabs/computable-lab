import { describe, it, expect } from 'vitest';
import { mapRowsToPlate, normalizeWell } from './plateMapping.js';

describe('normalizeWell', () => {
  it('upper-cases well ids', () => {
    expect(normalizeWell('a1')).toBe('A1');
    expect(normalizeWell(' b2 ')).toBe('B2');
  });
});

describe('mapRowsToPlate', () => {
  it('maps file wells that exist on the plate to a clean match', () => {
    const r = mapRowsToPlate(['a1', 'B1'], ['A1', 'B1', 'C1']);
    expect(r.ambiguous).toBe(false);
    expect(r.matched).toEqual(['A1', 'B1']);
    expect(r.missingInFile).toEqual(['C1']); // partial read is normal & informational
    expect(r.unmatchedInFile).toEqual([]);
  });

  it('flags as ambiguous when a file well is NOT on the plate', () => {
    const r = mapRowsToPlate(['A1', 'X9'], ['A1', 'B1']);
    expect(r.ambiguous).toBe(true);
    expect(r.unmatchedInFile).toEqual(['X9']);
    expect(r.reason).toContain('X9');
  });

  it('flags as ambiguous when the file has duplicate well content', () => {
    const r = mapRowsToPlate(['A1', 'A1', 'B1'], ['A1', 'B1']);
    expect(r.ambiguous).toBe(true);
    expect(r.reason).toContain('A1');
  });

  it('returns a clean empty match for a file with no wells (still ambiguous-free but empty)', () => {
    const r = mapRowsToPlate([], ['A1']);
    expect(r.ambiguous).toBe(false);
    expect(r.matched).toEqual([]);
    expect(r.missingInFile).toEqual(['A1']);
  });
});