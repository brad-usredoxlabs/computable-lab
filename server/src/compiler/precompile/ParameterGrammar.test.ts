import { describe, it, expect } from 'vitest';
import {
  extractVolumes,
  extractCounts,
  extractWellAddresses,
  extractDurations,
} from './ParameterGrammar.js';

// ===========================================================================
// extractVolumes
// ===========================================================================

describe('extractVolumes', () => {
  it('extracts µL and mL from a single sentence', () => {
    const input = 'transfer 5 µL from A to B, then 10 mL waste';
    const result = extractVolumes(input);
    expect(result).toHaveLength(2);
    // "5 µL" starts at index 9, is 4 chars → span [9, 13]
    expect(result[0]).toEqual({
      value: 5,
      unit: 'uL',
      span: [9, 13],
      raw: '5 µL',
    });
    // "10 mL" starts at index 32, is 5 chars → span [32, 37]
    expect(result[1]).toEqual({
      value: 10000,
      unit: 'uL',
      span: [32, 37],
      raw: '10 mL',
    });
  });

  it('returns [] for empty input', () => {
    expect(extractVolumes('')).toEqual([]);
  });

  it('extracts multiple volumes including liters and microliters', () => {
    const input = 'add 2.5 mL then 500 microliters and 1 liter';
    const result = extractVolumes(input);
    expect(result).toHaveLength(3);
    // "2.5 mL" starts at 4, is 6 chars → span [4, 10]
    expect(result[0]).toEqual({
      value: 2500,
      unit: 'uL',
      span: [4, 10],
      raw: '2.5 mL',
    });
    // "500 microliters" starts at 16, is 15 chars → span [16, 31]
    expect(result[1]).toEqual({
      value: 500,
      unit: 'uL',
      span: [16, 31],
      raw: '500 microliters',
    });
    // "1 liter" starts at 36, is 7 chars → span [36, 43]
    expect(result[2]).toEqual({
      value: 1_000_000,
      unit: 'uL',
      span: [36, 43],
      raw: '1 liter',
    });
  });
});

// ===========================================================================
// extractCounts
// ===========================================================================

describe('extractCounts', () => {
  it('extracts digit counts from text', () => {
    const input = 'add 5 samples and 3 replicates';
    const result = extractCounts(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      value: 5,
      span: [4, 5],
      raw: '5',
    });
    expect(result[1]).toEqual({
      value: 3,
      span: [18, 19],
      raw: '3',
    });
  });

  it('returns [] for empty input', () => {
    expect(extractCounts('')).toEqual([]);
  });

  it('extracts English number words', () => {
    const input = 'incubate for one hour then add two more';
    const result = extractCounts(input);
    expect(result).toHaveLength(2);
    // "one" starts at 13, is 3 chars → span [13, 16]
    expect(result[0]).toEqual({
      value: 1,
      span: [13, 16],
      raw: 'one',
    });
    // "two" starts at 31, is 3 chars → span [31, 34]
    expect(result[1]).toEqual({
      value: 2,
      span: [31, 34],
      raw: 'two',
    });
  });
});

// ===========================================================================
// extractWellAddresses
// ===========================================================================

describe('extractWellAddresses', () => {
  it('extracts a well list', () => {
    const input = 'wells A1, A3, A5';
    const result = extractWellAddresses(input);
    // Should only return the list match, not individual cells
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      wells: ['A1', 'A3', 'A5'],
      kind: 'list',
      span: [0, 16],
      raw: 'wells A1, A3, A5',
    });
  });

  it('returns [] for empty input', () => {
    expect(extractWellAddresses('')).toEqual([]);
  });

  it('extracts a row label', () => {
    const input = 'row B';
    const result = extractWellAddresses(input);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('row');
    expect(result[0].wells).toEqual([
      'B1', 'B2', 'B3', 'B4', 'B5', 'B6',
      'B7', 'B8', 'B9', 'B10', 'B11', 'B12',
    ]);
    expect(result[0].span).toEqual([0, 5]);
    expect(result[0].raw).toBe('row B');
  });
});

// ===========================================================================
// extractDurations
// ===========================================================================

describe('extractDurations', () => {
  it('extracts minutes, overnight, and hours from a single sentence', () => {
    const input = 'incubate 30 min then overnight then 1 hr more';
    const result = extractDurations(input);
    expect(result).toHaveLength(3);
    // "30 min" starts at 9, is 6 chars → span [9, 15]
    expect(result[0]).toEqual({
      value_seconds: 1800,
      span: [9, 15],
      raw: '30 min',
    });
    // "overnight" starts at 21, is 9 chars → span [21, 30]
    expect(result[1]).toEqual({
      value_seconds: 43200,
      span: [21, 30],
      raw: 'overnight',
    });
    // "1 hr" starts at 36, is 4 chars → span [36, 40]
    expect(result[2]).toEqual({
      value_seconds: 3600,
      span: [36, 40],
      raw: '1 hr',
    });
  });

  it('returns [] for empty input', () => {
    expect(extractDurations('')).toEqual([]);
  });

  it('extracts seconds and days', () => {
    const input = 'heat at 90 s then cool for 2 days';
    const result = extractDurations(input);
    expect(result).toHaveLength(2);
    // "90 s" starts at 8, is 4 chars → span [8, 12]
    expect(result[0]).toEqual({
      value_seconds: 90,
      span: [8, 12],
      raw: '90 s',
    });
    // "2 days" starts at 27, is 6 chars → span [27, 33]
    expect(result[1]).toEqual({
      value_seconds: 172800,
      span: [27, 33],
      raw: '2 days',
    });
  });
});
