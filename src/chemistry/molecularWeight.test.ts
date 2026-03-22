import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeMolecularWeightFromFormula, resolveOntologyMolecularWeight } from './molecularWeight.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('molecular weight resolution', () => {
  it('computes a molecular weight from a chemical formula', () => {
    expect(computeMolecularWeightFromFormula('C15H10O5')).toBeCloseTo(270.24, 2);
    expect(computeMolecularWeightFromFormula('MgCl2·6H2O')).toBeCloseTo(203.3, 1);
  });

  it('prefers a direct ChEBI mass when available', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        label: 'Apigenin',
        annotation: {
          formula: ['C15H10O5'],
          monoisotopicmass: ['270.0528'],
        },
      }),
    })) as typeof fetch);

    const result = await resolveOntologyMolecularWeight({
      namespace: 'CHEBI',
      id: 'CHEBI:1722',
      label: 'apigenin',
    });

    expect(result).toMatchObject({
      resolved: true,
      source: 'chebi',
      formula: 'C15H10O5',
      chebiId: 'CHEBI:1722',
    });
    expect(result.molecularWeight).toBeCloseTo(270.0528, 4);
  });

  it('falls back to PubChem direct molecular weight when ChEBI lacks one', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/ols4/api/ontologies/chebi/terms/')) {
        return {
          ok: true,
          json: async () => ({
            label: 'Apigenin',
            annotation: {
              formula: ['C15H10O5'],
            },
          }),
        };
      }
      if (url.includes('/compound/name/')) {
        return {
          ok: true,
          json: async () => ({
            IdentifierList: { CID: [5280443] },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          PropertyTable: {
            Properties: [{
              CID: 5280443,
              IUPACName: '5,7-dihydroxy-2-(4-hydroxyphenyl)-4H-chromen-4-one',
              MolecularFormula: 'C15H10O5',
              MolecularWeight: 270.24,
            }],
          },
        }),
      };
    }) as typeof fetch);

    const result = await resolveOntologyMolecularWeight({
      namespace: 'CHEBI',
      id: 'CHEBI:1722',
      label: 'apigenin',
    });

    expect(result).toMatchObject({
      resolved: true,
      source: 'pubchem',
      formula: 'C15H10O5',
      pubchemCid: 5280443,
    });
    expect(result.molecularWeight).toBeCloseTo(270.24, 2);
  });

  it('falls back to local formula computation when direct lookups lack a weight', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/ols4/api/ontologies/chebi/terms/')) {
        return {
          ok: true,
          json: async () => ({
            label: 'Apigenin',
            annotation: {
              formula: ['C15H10O5'],
            },
          }),
        };
      }
      if (url.includes('/compound/name/')) {
        return {
          ok: true,
          json: async () => ({
            IdentifierList: { CID: [5280443] },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          PropertyTable: {
            Properties: [{
              CID: 5280443,
              IUPACName: 'apigenin',
              MolecularFormula: 'C15H10O5',
            }],
          },
        }),
      };
    }) as typeof fetch);

    const result = await resolveOntologyMolecularWeight({
      namespace: 'CHEBI',
      id: 'CHEBI:1722',
      label: 'apigenin',
    });

    expect(result).toMatchObject({
      resolved: true,
      source: 'formula',
      formula: 'C15H10O5',
    });
    expect(result.molecularWeight).toBeCloseTo(270.24, 2);
  });
});
