import { describe, it, expect } from 'vitest';
import { segmentClauses } from './TextSegmenter.js';

describe('segmentClauses', () => {
  it('splits on sentence terminator (period)', () => {
    const input = 'add labwares a, b, c. transfer 5 uL from A to B';
    const clauses = segmentClauses(input);
    expect(clauses).toHaveLength(2);
    expect(clauses[0].text).toBe('add labwares a, b, c');
    expect(clauses[0].span).toEqual([0, 20]);
    expect(clauses[0].tokens).toEqual(['add', 'labwares', 'a', 'b', 'c']);
    expect(clauses[1].text).toBe('transfer 5 uL from A to B');
    expect(clauses[1].span).toEqual([22, 47]);
    expect(clauses[1].tokens).toEqual(['transfer', '5', 'ul', 'from', 'a', 'to', 'b']);
  });

  it('splits on bare " then "', () => {
    const input = 'incubate at 37 C for 30 min then read';
    const clauses = segmentClauses(input);
    expect(clauses).toHaveLength(2);
    expect(clauses[0].text).toBe('incubate at 37 C for 30 min');
    expect(clauses[0].span).toEqual([0, 27]);
    expect(clauses[1].text).toBe('then read');
    expect(clauses[1].span).toEqual([28, 37]);
    expect(clauses[1].tokens).toEqual(['then', 'read']);
  });

  it('returns [] for empty input', () => {
    expect(segmentClauses('')).toEqual([]);
  });

  it('returns [] for whitespace-only input', () => {
    expect(segmentClauses('   \t  \n  ')).toEqual([]);
  });

  it('lowercases and tokenizes "transfer 5 uL"', () => {
    const clauses = segmentClauses('transfer 5 uL');
    expect(clauses).toHaveLength(1);
    expect(clauses[0].text).toBe('transfer 5 uL');
    expect(clauses[0].tokens).toEqual(['transfer', '5', 'ul']);
  });

  it('span round-trip: text.slice(span[0], span[1]) === clause.text', () => {
    const input = 'add a, b, c. incubate at 37 C; then mix well, and read at 600 nm.';
    const clauses = segmentClauses(input);
    expect(clauses.length).toBeGreaterThan(0);
    for (const c of clauses) {
      expect(input.slice(c.span[0], c.span[1])).toBe(c.text);
    }
  });

  it('handles unicode (µ, em-dash, smart quotes) without crashing', () => {
    const input = 'transfer 5 µL — sample "A" then read';
    const clauses = segmentClauses(input);
    expect(clauses.length).toBeGreaterThan(0);
    for (const c of clauses) {
      expect(input.slice(c.span[0], c.span[1])).toBe(c.text);
    }
  });
});
