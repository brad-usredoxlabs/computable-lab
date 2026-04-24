import { describe, it, expect } from 'vitest';
import { getCompoundClassRegistry } from './CompoundClassRegistry.js';

describe('CompoundClassRegistry', () => {
  it('loads all 4 seed entries and list() returns them sorted by id', () => {
    const registry = getCompoundClassRegistry();
    const entries = registry.list();

    expect(entries).toHaveLength(4);

    const ids = entries.map((e) => e.id);
    expect(ids).toEqual([
      'AhR-activator',
      'AhR-antagonist',
      'PPARa-activator',
      'PPARa-antagonist',
    ]);
  });

  it('each entry has all required fields', () => {
    const registry = getCompoundClassRegistry();
    const entries = registry.list();

    for (const entry of entries) {
      expect(entry.id).toBeDefined();
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.name).toBeDefined();
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.candidates).toBeDefined();
      expect(Array.isArray(entry.candidates)).toBe(true);
      expect(entry.candidates.length).toBeGreaterThan(0);
      for (const candidate of entry.candidates) {
        expect(candidate.compoundId).toBeDefined();
        expect(candidate.name).toBeDefined();
      }
    }
  });

  it('IDs match filenames (without .yaml)', () => {
    const registry = getCompoundClassRegistry();
    const entries = registry.list();

    const expectedIds = [
      'AhR-activator',
      'AhR-antagonist',
      'PPARa-activator',
      'PPARa-antagonist',
    ];

    for (const id of expectedIds) {
      const entry = registry.get(id);
      expect(entry).toBeDefined();
      expect(entry!.id).toBe(id);
    }
  });

  it('get("AhR-activator") returns correct candidates', () => {
    const registry = getCompoundClassRegistry();
    const entry = registry.get('AhR-activator');

    expect(entry).toBeDefined();
    expect(entry!.id).toBe('AhR-activator');
    expect(entry!.name).toBe('AhR activator');
    expect(entry!.candidates.length).toBeGreaterThanOrEqual(3);
    expect(entry!.candidates.map((c) => c.compoundId)).toContain('TCDD');
    expect(entry!.candidates.map((c) => c.compoundId)).toContain('FICZ');
  });

  it('get("PPARa-activator") returns correct candidates', () => {
    const registry = getCompoundClassRegistry();
    const entry = registry.get('PPARa-activator');

    expect(entry).toBeDefined();
    expect(entry!.id).toBe('PPARa-activator');
    expect(entry!.name).toBe('PPARa activator');
    expect(entry!.candidates.length).toBe(3);
  });

  it('get("AhR-antagonist") returns correct candidates', () => {
    const registry = getCompoundClassRegistry();
    const entry = registry.get('AhR-antagonist');

    expect(entry).toBeDefined();
    expect(entry!.id).toBe('AhR-antagonist');
    expect(entry!.name).toBe('AhR antagonist');
    expect(entry!.candidates.length).toBe(2);
  });

  it('get("PPARa-antagonist") returns correct candidates', () => {
    const registry = getCompoundClassRegistry();
    const entry = registry.get('PPARa-antagonist');

    expect(entry).toBeDefined();
    expect(entry!.id).toBe('PPARa-antagonist');
    expect(entry!.name).toBe('PPARa antagonist');
    expect(entry!.candidates.length).toBe(1);
  });
});
