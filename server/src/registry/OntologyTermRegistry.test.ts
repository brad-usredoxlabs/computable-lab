import { describe, it, expect, beforeEach } from 'vitest';
import { getOntologyTermRegistry, listBySource } from './OntologyTermRegistry.js';

describe('OntologyTermRegistry', () => {
  let registry: ReturnType<typeof getOntologyTermRegistry>;

  beforeEach(() => {
    registry = getOntologyTermRegistry();
    registry.reload();
  });

  it('loads all manual seed terms', () => {
    const manualTerms = listBySource('manual');
    expect(manualTerms).toHaveLength(4);
  });

  it('loads all chebi seed terms', () => {
    const chebiTerms = listBySource('chebi');
    expect(chebiTerms.length).toBeGreaterThanOrEqual(20);
  });

  it('get("MANUAL:chebi-example") returns the right term', () => {
    const term = registry.get('MANUAL:chebi-example');
    expect(term).toBeDefined();
    expect(term!.id).toBe('MANUAL:chebi-example');
    expect(term!.source).toBe('manual');
    expect(term!.label).toBe('ChEBI placeholder (replaced when download script runs)');
    expect(term!.meta).toEqual({ example_for: 'chebi' });
  });

  it('get("MANUAL:cl-example") returns the right term', () => {
    const term = registry.get('MANUAL:cl-example');
    expect(term).toBeDefined();
    expect(term!.id).toBe('MANUAL:cl-example');
    expect(term!.source).toBe('manual');
    expect(term!.label).toBe('Cell Ontology placeholder');
    expect(term!.meta).toEqual({ example_for: 'cell-ontology' });
  });

  it('get("MANUAL:ncbi-tax-example") returns the right term', () => {
    const term = registry.get('MANUAL:ncbi-tax-example');
    expect(term).toBeDefined();
    expect(term!.id).toBe('MANUAL:ncbi-tax-example');
    expect(term!.source).toBe('manual');
    expect(term!.label).toBe('NCBI Taxon placeholder');
    expect(term!.meta).toEqual({ example_for: 'ncbi-taxon' });
  });

  it('get("MANUAL:go-example") returns the right term', () => {
    const term = registry.get('MANUAL:go-example');
    expect(term).toBeDefined();
    expect(term!.id).toBe('MANUAL:go-example');
    expect(term!.source).toBe('manual');
    expect(term!.label).toBe('Gene Ontology placeholder');
    expect(term!.meta).toEqual({ example_for: 'gene-ontology' });
  });

  it('get("UNKNOWN") returns undefined', () => {
    const term = registry.get('UNKNOWN');
    expect(term).toBeUndefined();
  });

  it('listBySource("manual") returns all 4 terms', () => {
    const terms = listBySource('manual');
    expect(terms).toHaveLength(4);
  });

  it('listBySource("chebi") returns ≥ 20 terms', () => {
    const terms = listBySource('chebi');
    expect(terms.length).toBeGreaterThanOrEqual(20);
  });

  it('list() returns terms sorted by id', () => {
    const entries = registry.list();
    const ids = entries.map((e) => e.id);
    // Verify sorted order
    const sorted = [...ids].sort((a, b) => a.localeCompare(b));
    expect(ids).toEqual(sorted);
  });

  it('reload() clears cache and re-reads', () => {
    const first = registry.list();
    expect(first.length).toBeGreaterThanOrEqual(24); // 4 manual + ≥20 chebi
    registry.reload();
    const second = registry.list();
    expect(second.length).toBeGreaterThanOrEqual(24);
  });
});
