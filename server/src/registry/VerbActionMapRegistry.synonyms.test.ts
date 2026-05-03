/**
 * VerbActionMapRegistry synonyms tests — findVerbForToken and seed coverage.
 */

import { describe, it, expect } from 'vitest';
import { getVerbActionMap } from './VerbActionMapRegistry.js';

describe('VerbActionMapRegistry — findVerbForToken', () => {
  const registry = getVerbActionMap();

  it("findVerbForToken('mix') returns {verb: 'mix', source: 'canonical'}", () => {
    const result = registry.findVerbForToken('mix');
    expect(result).toBeDefined();
    expect(result!.verb).toBe('mix');
    expect(result!.source).toBe('canonical');
  });

  it("findVerbForToken('combine') returns {verb: 'mix', source: 'synonym'}", () => {
    const result = registry.findVerbForToken('combine');
    expect(result).toBeDefined();
    expect(result!.verb).toBe('mix');
    expect(result!.source).toBe('synonym');
  });

  it("findVerbForToken('MIX') returns canonical (case-insensitive)", () => {
    const result = registry.findVerbForToken('MIX');
    expect(result).toBeDefined();
    expect(result!.verb).toBe('mix');
    expect(result!.source).toBe('canonical');
  });

  it("findVerbForToken('zzz') returns undefined", () => {
    const result = registry.findVerbForToken('zzz');
    expect(result).toBeUndefined();
  });

  it('every one of the 26 canonical verbs has at least 1 synonym in the seed', () => {
    const allMappings = registry.list();
    expect(allMappings.length).toBe(26);
    for (const m of allMappings) {
      expect(m.synonyms).toBeDefined();
      expect(Array.isArray(m.synonyms)).toBe(true);
      expect(m.synonyms!.length).toBeGreaterThanOrEqual(1);
    }
  });
});
