import { describe, expect, it } from 'vitest';
import { isBiologicalDomain, resolveBiologicalRule, refMaterialDomain, type BiologicalTypesRegistry } from './bioTypes.js';

const REGISTRY: BiologicalTypesRegistry = {
  version: 1,
  default: {
    id: 'default',
    label: 'Biological material (generic)',
    domains: [],
    termKinds: [],
    match: { labels: [], curies: [] },
    measures: { primary: 'count', units: ['count-per-well'], concentrationBasis: 'count_per_volume' },
    fields: [
      { key: 'count', label: 'Count per well', required: true },
      { key: 'volume', label: 'Final volume (µL)', required: true },
      { key: 'counterDensity', label: 'Source density (per µL)', required: false },
    ],
  },
  types: {
    'cell-line': {
      id: 'cell-line',
      label: 'Cell Line',
      domains: ['cell_line'],
      termKinds: ['organism'],
      match: { labels: ['HepaRG'], curies: ['CLO:0020273'] },
      measures: { primary: 'count', units: ['cells-per-well'], concentrationBasis: 'count_per_volume' },
      verification: { method: 'hoechst_nuclei', readModality: 'microscopy' },
      fields: [
        { key: 'count', label: 'Cells per well', required: true },
        { key: 'volume', label: 'Final volume (µL)', required: true },
        { key: 'counterDensity', label: 'Counter density (cells/µL)', required: false },
      ],
    },
    'c-elegans': {
      id: 'c-elegans',
      label: 'C. elegans',
      domains: ['organism'],
      termKinds: ['organism'],
      match: { labels: ['C. elegans', 'Caenorhabditis elegans'], curies: ['NCBITaxon:6239'] },
      measures: { primary: 'count', units: ['worms-per-well'], concentrationBasis: 'count_per_volume' },
      fields: [
        { key: 'count', label: 'Worms per well (L4)', required: true },
        { key: 'volume', label: 'Final volume (µL)', required: true },
        { key: 'counterDensity', label: 'Worm density (worms/µL)', required: false },
      ],
    },
  },
};

describe('bioTypes (frontend registry mirror)', () => {
  it('resolves a specific rule by label and curie', () => {
    expect(resolveBiologicalRule(REGISTRY, { domain: 'organism', label: 'C. elegans' })?.id).toBe('c-elegans');
    expect(resolveBiologicalRule(REGISTRY, { domain: 'organism', label: 'HepaRG' })?.id).toBe('cell-line');
    expect(resolveBiologicalRule(REGISTRY, { domain: 'organism', curie: 'NCBITaxon:6239' })?.id).toBe('c-elegans');
  });

  it('gates cell_line domain to the cell-line rule (count + volume)', () => {
    const rule = resolveBiologicalRule(REGISTRY, { domain: 'cell_line' });
    expect(rule?.id).toBe('cell-line');
    expect(rule?.fields.find((f) => f.key === 'count')).toMatchObject({ required: true });
    expect(rule?.fields.find((f) => f.key === 'volume')).toMatchObject({ required: true });
  });

  it('falls back to the generic count+volume default for an unknown organism', () => {
    const rule = resolveBiologicalRule(REGISTRY, { domain: 'organism', label: 'mystery-fungus' });
    expect(rule?.id).toBe('default');
    expect(rule?.fields.find((f) => f.key === 'count')).toMatchObject({ required: true });
  });

  it('returns null when the registry has not loaded yet', () => {
    expect(resolveBiologicalRule(null, { domain: 'cell_line' })).toBeNull();
  });

  it('isBiologicalDomain gates cell_line|organism', () => {
    expect(isBiologicalDomain('cell_line')).toBe(true);
    expect(isBiologicalDomain('organism')).toBe(true);
    expect(isBiologicalDomain('chemical')).toBe(false);
    expect(isBiologicalDomain(undefined)).toBe(false);
  });

  it('refMaterialDomain reads inline domain/namespace from an ontology ref', () => {
    expect(refMaterialDomain({ kind: 'ontology', id: 'CLO:1', namespace: 'CL', label: 'x', domain: 'cell_line' })).toBe('cell_line');
    // no inline domain → infer from namespace
    expect(refMaterialDomain({ kind: 'ontology', id: 'NCBITaxon:1', namespace: 'NCBITaxon', label: 'x' })).toBe('organism');
    expect(refMaterialDomain({ kind: 'record', id: 'MINST-1', label: 'x' })).toBeUndefined();
  });
});