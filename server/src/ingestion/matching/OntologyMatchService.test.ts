import { afterEach, describe, expect, it, vi } from 'vitest';
import { OntologyMatchService } from './OntologyMatchService.js';

describe('OntologyMatchService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ranks preferred ontology exact matches first', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        response: {
          docs: [
            {
              obo_id: 'NCIT:C111',
              label: 'Apigenin',
              iri: 'https://example.org/ncit/C111',
              ontology_name: 'ncit',
              description: ['NCIT Apigenin'],
            },
            {
              obo_id: 'CHEBI:12345',
              label: 'Apigenin',
              iri: 'https://example.org/chebi/CHEBI_12345',
              ontology_name: 'chebi',
              description: ['ChEBI Apigenin'],
              synonym: ['4′,5,7-trihydroxyflavone'],
            },
          ],
        },
      }),
    })) as typeof fetch);

    const service = new OntologyMatchService();
    const matches = await service.findMatches('Apigenin', ['chebi', 'ncit']);

    expect(matches[0]?.id).toBe('CHEBI:12345');
    expect(matches[0]?.namespace).toBe('CHEBI');
    expect(matches[0]?.description).toBe('ChEBI Apigenin');
    expect(matches[0]?.synonyms).toContain('4′,5,7-trihydroxyflavone');
  });

  it('returns an empty list when ontology search fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network unavailable');
    }) as typeof fetch);

    const service = new OntologyMatchService();
    await expect(service.findMatches('Apigenin', ['chebi'])).resolves.toEqual([]);
  });
});
