import { describe, it, expect, beforeEach } from 'vitest';
import { getOntologyTermRegistry, listBySource } from './OntologyTermRegistry.js';

describe('OntologyMultiSourceSmoke', () => {
  let registry: ReturnType<typeof getOntologyTermRegistry>;

  beforeEach(() => {
    registry = getOntologyTermRegistry();
    registry.reload();
  });

  it('cell-ontology seed loaded with ≥ 15 terms', () => {
    const cl = listBySource('cell-ontology');
    expect(cl.length).toBeGreaterThanOrEqual(15);
  });

  it('cell-ontology canonical lookup CL:0000182 (hepatocyte)', () => {
    const hep = registry.get('CL:0000182');
    expect(hep).toBeDefined();
    expect(hep!.label).toMatch(/hepatocyte/i);
  });

  it('ncbi-taxon seed loaded with ≥ 15 terms', () => {
    const nt = listBySource('ncbi-taxon');
    expect(nt.length).toBeGreaterThanOrEqual(15);
  });

  it('ncbi-taxon canonical lookup NCBITaxon:9606 (Homo sapiens)', () => {
    const hs = registry.get('NCBITaxon:9606');
    expect(hs).toBeDefined();
    expect(hs!.label).toMatch(/homo sapiens/i);
  });

  it('gene-ontology seed loaded with ≥ 15 terms', () => {
    const go = listBySource('gene-ontology');
    expect(go.length).toBeGreaterThanOrEqual(15);
  });

  it('gene-ontology canonical lookup GO:0006915 (apoptotic process)', () => {
    const ap = registry.get('GO:0006915');
    expect(ap).toBeDefined();
    expect(ap!.label).toMatch(/apoptotic process/i);
  });
});
