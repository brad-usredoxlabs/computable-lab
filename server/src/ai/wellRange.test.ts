import { describe, it, expect } from 'vitest';
import { expandWellTokens, expandEventWells, rowLabelToIndex, indexToRowLabel } from './wellRange.js';

describe('expandWellTokens (server)', () => {
  it('expands a 96-well block row-major', () => {
    const wells = expandWellTokens(['A1:H12']);
    expect(wells).toHaveLength(96);
    expect(wells[0]).toBe('A1');
    expect(wells[11]).toBe('A12');
    expect(wells[12]).toBe('B1');
    expect(wells[95]).toBe('H12');
  });

  it('handles rows, columns, reversed corners, .. separator, and 384', () => {
    expect(expandWellTokens(['A1:H1'])).toEqual(['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1']);
    expect(expandWellTokens(['H12:A1'])).toEqual(expandWellTokens(['A1:H12']));
    expect(expandWellTokens(['A1..B2'])).toEqual(['A1', 'A2', 'B1', 'B2']);
    expect(expandWellTokens(['A1:P24'])).toHaveLength(384);
  });

  it('mixes ranges/singletons, dedupes, and passes plain wells through', () => {
    expect(expandWellTokens(['A1:A2', 'A1', 'Z9'])).toEqual(['A1', 'A2', 'Z9']);
    expect(expandWellTokens(['A1', 'B2'])).toEqual(['A1', 'B2']);
  });

  it('round-trips bijective row labels', () => {
    expect(rowLabelToIndex('A')).toBe(0);
    expect(rowLabelToIndex('AA')).toBe(26);
    for (const i of [0, 7, 25, 26, 100]) expect(rowLabelToIndex(indexToRowLabel(i))).toBe(i);
  });
});

describe('expandEventWells (server)', () => {
  it('expands details.wells and transfer source/dest arrays', () => {
    const event = {
      event_type: 'transfer',
      details: { wells: ['A1:A2'], source_wells: ['B1:B2'], dest_wells: ['C1:C2'], source: { wells: ['D1:D2'] } },
    };
    const d = expandEventWells(event).details as Record<string, unknown>;
    expect(d.wells).toEqual(['A1', 'A2']);
    expect(d.source_wells).toEqual(['B1', 'B2']);
    expect(d.dest_wells).toEqual(['C1', 'C2']);
    expect((d.source as { wells: string[] }).wells).toEqual(['D1', 'D2']);
  });

  it('returns the same reference when nothing expands', () => {
    const event = { event_type: 'mix', details: { wells: ['A1', 'B2'] } };
    expect(expandEventWells(event)).toBe(event);
  });
});
