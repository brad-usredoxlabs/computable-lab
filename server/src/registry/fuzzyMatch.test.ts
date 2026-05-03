import { describe, expect, it } from 'vitest';
import { fuzzyFindByName, levenshtein, normalize } from './fuzzyMatch';

interface Entry {
  id: string;
  name: string;
  aliases?: string[];
}

const entries: Entry[] = [
  { id: '12-well-reservoir', name: 'Generic 12-Well Reservoir', aliases: ['reservoir_12'] },
  { id: '96-well-plate', name: 'Generic 96-Well Plate', aliases: ['plate_96'] },
  { id: 'clofibrate', name: 'Clofibrate' },
  { id: 'AhR', name: 'AhR' },
];

function find(query: string, extraEntries: Entry[] = []) {
  return fuzzyFindByName({
    entries: [...entries, ...extraEntries],
    query,
    getKeys: (entry) => [entry.id, entry.name, ...(entry.aliases ?? [])],
  });
}

describe('fuzzyMatch', () => {
  it('normalizes surface-form punctuation and spacing', () => {
    expect(normalize('  Generic_12-Well   Reservoir. ')).toBe('generic12wellreservoir');
  });

  it('computes Levenshtein edit distance', () => {
    expect(levenshtein('clofibrate', 'colfibrate')).toBe(2);
    expect(levenshtein('plate', 'plate')).toBe(0);
  });

  it('returns exact raw key matches at distance 0', () => {
    const result = find('12-well-reservoir');

    expect(result).toMatchObject({
      match: entries[0],
      distance: 0,
      matchedKey: '12-well-reservoir',
      matchKind: 'exact',
    });
  });

  it('maps normalized labware surface forms at distance 0', () => {
    const result = find('12-well reservoir');

    expect(result).toMatchObject({
      match: entries[0],
      distance: 0,
      matchedKey: '12-well-reservoir',
      matchKind: 'normalized',
    });
  });

  it('accepts an unambiguous edit-distance match within the conservative bound', () => {
    const result = find('clofibrat');

    expect(result).toMatchObject({
      match: entries[2],
      distance: 1,
      matchedKey: 'clofibrate',
      matchKind: 'edit',
    });
  });

  it('requires exact normalized matches for short queries', () => {
    expect(find('AhR')).toMatchObject({ match: entries[3], matchKind: 'exact' });
    expect(find('AhX')).toBeUndefined();
  });

  it('returns unresolved on ties or weak margins', () => {
    const result = find('plate', [
      { id: 'plate-a', name: 'Plate A' },
      { id: 'plate-b', name: 'Plate B' },
    ]);

    expect(result).toBeUndefined();
  });
});
