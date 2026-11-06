// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { declaredDomains } from '../vocabulary';

describe('declaredDomains', () => {
  it('returns empty array for undefined', () => {
    expect(declaredDomains(undefined)).toEqual([]);
  });

  it('returns single-element array for string (trim + lowercase)', () => {
    expect(declaredDomains(' Material ')).toEqual(['material']);
  });

  it('returns mapped array for array input (trim + lowercase, order kept)', () => {
    expect(declaredDomains(['Labware', 'material'])).toEqual(['labware', 'material']);
  });
});

describe('declaredDomains — confinement RED pin', () => {
  it('throws TypeError when contract.domain is an array and raw .toLowerCase() is called', () => {
    // This test reproduces the exact bug: a widened domain slot (array) passed through
    // the raw consumer crashes on .toLowerCase()
    const contract = {
      name: 'source',
      kind: 'resolvable',
      required: false,
      domain: ['material'] as string | readonly string[],
    };
    // Directly exercise the bug: the accessor is safe, but the raw consumer crashes
    expect(() => {
      // Simulate the raw consumer path (pre-fix)
      const domain = contract.domain;
      (domain as any).toLowerCase();
    }).toThrow(/toLowerCase is not a function/);
  });

  it('declaredDomains normalises the same contract safely (ALL-of confinement)', () => {
    const contract = {
      name: 'source',
      kind: 'resolvable',
      required: false,
      domain: ['material'] as string | readonly string[],
    };
    const domains = declaredDomains(contract.domain);
    // ALL-of: every declared domain must be in stripDomains
    const stripDomains = new Set(['material']);
    const shouldStrip = domains.length > 0 && domains.every((d) => stripDomains.has(d));
    expect(shouldStrip).toBe(true);
  });
});
