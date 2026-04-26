import { describe, it, expect, beforeEach } from 'vitest';
import { getOntologyTermRegistry, listBySource } from './OntologyTermRegistry.js';

describe('ChebiSeedSmoke', () => {
  let registry: ReturnType<typeof getOntologyTermRegistry>;

  beforeEach(() => {
    registry = getOntologyTermRegistry();
    registry.reload();
  });

  it('listBySource("chebi") returns ≥ 20 terms', () => {
    const terms = listBySource('chebi');
    expect(terms.length).toBeGreaterThanOrEqual(20);
  });

  it('get("CHEBI:15377") returns water', () => {
    const term = registry.get('CHEBI:15377');
    expect(term).toBeDefined();
    expect(term!.id).toBe('CHEBI:15377');
    expect(term!.source).toBe('chebi');
    expect(term!.label).toBe('water');
  });

  it('get("CHEBI:16236") returns ethanol', () => {
    const term = registry.get('CHEBI:16236');
    expect(term).toBeDefined();
    expect(term!.label).toBe('ethanol');
  });

  it('get("CHEBI:17234") returns glucose', () => {
    const term = registry.get('CHEBI:17234');
    expect(term).toBeDefined();
    expect(term!.label).toBe('glucose');
  });

  it('chebi terms have valid IDs matching ^CHEBI:\\d+$', () => {
    const terms = listBySource('chebi');
    const idRegex = /^CHEBI:\d+$/;
    for (const term of terms) {
      expect(term.id).toMatch(idRegex);
    }
  });

  it('chebi terms have non-empty labels', () => {
    const terms = listBySource('chebi');
    for (const term of terms) {
      expect(term.label.length).toBeGreaterThan(0);
    }
  });

  it('chebi terms are sorted by id', () => {
    const terms = listBySource('chebi');
    const ids = terms.map((t) => t.id);
    const sorted = [...ids].sort((a, b) => a.localeCompare(b));
    expect(ids).toEqual(sorted);
  });

  it('reload() picks up chebi.yaml', () => {
    const first = listBySource('chebi');
    expect(first.length).toBeGreaterThanOrEqual(20);
    registry.reload();
    const second = listBySource('chebi');
    expect(second.length).toBeGreaterThanOrEqual(20);
  });
});
