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
    // GC-2 F: +6 FAME/FFA identity terms (fame-local.yaml, source manual).
    expect(manualTerms).toHaveLength(12);
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

  it('listBySource("manual") returns all 10 terms', () => {
    const terms = listBySource('manual');
    // 4 seed placeholders + 6 GC-2 FAME/FFA terms (fame-local.yaml).
    expect(terms).toHaveLength(12);
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
    expect(first.length).toBeGreaterThanOrEqual(30); // 4 manual + 6 FAME/FFA + ≥20 chebi
    registry.reload();
    const second = registry.list();
    // 4 manual + 6 FAME/FFA + ≥20 chebi
    expect(second.length).toBeGreaterThanOrEqual(30);
  });
});
