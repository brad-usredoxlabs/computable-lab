import { describe, expect, it } from 'vitest';
import {
  expandWellPattern,
  formatWell,
  parseWell,
  WELL_PATTERN_NAMES,
  wellPatternFromDetails,
} from './wellPatterns.js';

describe('well patterns are composed, not enumerated', () => {
  it('checkerboard across A2:D8 keeps alternate wells, starting at the from well', () => {
    const wells = expandWellPattern({ pattern: 'checkerboard', from: 'A2', to: 'D8' });
    // 4 rows (A-D) x 7 columns (2-8) = 28 wells in the block; half are kept.
    expect(wells).toHaveLength(14);
    expect(wells).toContain('A2');   // the from well is always kept
    expect(wells).not.toContain('B2'); // its neighbour is not
    expect(wells).toContain('C2');
    expect(wells).toContain('B3');   // (row B=1 + col 3) even
  });

  it('every_other_row takes the first, third row of the block', () => {
    expect(expandWellPattern({ pattern: 'every_other_row', from: 'A1', to: 'D1' })).toEqual([
      'A1', 'C1',
    ]);
  });

  it('row / column are plain blocks', () => {
    expect(expandWellPattern({ pattern: 'row', from: 'A1', to: 'A3' })).toEqual(['A1', 'A2', 'A3']);
    expect(expandWellPattern({ pattern: 'row', from: 'A1', to: 'C1' })).toEqual(['A1', 'B1', 'C1']);
  });

  it('accepts reversed corners', () => {
    expect(expandWellPattern({ pattern: 'row', from: 'C1', to: 'A1' })).toEqual(['A1', 'B1', 'C1']);
  });

  it('returns nothing for an unparseable address — never a partial guess', () => {
    expect(expandWellPattern({ pattern: 'row', from: 'Z9', to: 'A1' })).toEqual([]);
    expect(expandWellPattern({ pattern: 'row', from: '', to: 'A1' })).toEqual([]);
  });

  it('names the four patterns the prompt advertises', () => {
    expect(WELL_PATTERN_NAMES).toEqual(['checkerboard', 'every_other_row', 'row', 'column']);
  });

  it('reads a wells_pattern from event details, and rejects junk', () => {
    expect(wellPatternFromDetails({ wells_pattern: { pattern: 'checkerboard', from: 'A2', to: 'D8' } }))
      .toEqual({ pattern: 'checkerboard', from: 'A2', to: 'D8' });
    expect(wellPatternFromDetails({ wells_pattern: { pattern: 'spiral', from: 'A2', to: 'D8' } })).toBeNull();
    expect(wellPatternFromDetails({ wells: ['A1'] })).toBeNull();
  });

  it('parses and formats well addresses', () => {
    expect(parseWell('A2')).toEqual({ row: 0, column: 2 });
    expect(parseWell('H12')).toEqual({ row: 7, column: 12 });
    expect(parseWell('I1')).toBeNull();
    expect(formatWell(0, 2)).toBe('A2');
  });
});
