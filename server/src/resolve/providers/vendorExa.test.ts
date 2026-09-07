import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVendorExaProvider } from './vendorExa.js';
import { exaSearch, resolveExaConfig } from '../../integrations/exa.js';

vi.mock('../../integrations/exa.js', () => ({
  resolveExaConfig: vi.fn(),
  exaSearch: vi.fn(),
}));

function signal(): AbortSignal {
  return new AbortController().signal;
}

describe('createVendorExaProvider (tier-4 vendor)', () => {
  beforeEach(() => {
    vi.mocked(resolveExaConfig).mockReset();
    vi.mocked(exaSearch).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns vendor CURIE-typed candidates tagged source vendor via the spine', async () => {
    vi.mocked(resolveExaConfig).mockReturnValue({
      apiKey: 'exa-test-key',
      baseUrl: 'https://api.exa.ai',
      defaultSearchType: 'auto',
      defaultContentMode: 'highlights',
      defaultMaxCharacters: 4000,
      timeoutMs: 1000,
    });
    vi.mocked(exaSearch).mockResolvedValue({
      results: [
        {
          id: 'exa-1',
          title: 'Cayman 1.0 mM DMSO rotenone',
          url: 'https://example.com/10506',
          highlights: ['rotenone mitochondrial inhibitor'],
          score: 0.9,
        },
      ],
    });

    const provider = createVendorExaProvider(() => ({}));
    const hits = await provider('rotenone', 6, signal());

    expect(hits.length).toBeGreaterThanOrEqual(1);
    const hit = hits[0]!;
    expect(hit.label).toBe('Cayman 1.0 mM DMSO rotenone');
    expect(hit.uri).toBe('https://example.com/10506');
    expect(hit.curie).toMatch(/^local:vendor-catalog-/);
    expect(hit.definition).toContain('rotenone');
    // Tier-4 vendor candidates surface with source 'vendor' from the spine.
    expect(exaSearch).toHaveBeenCalledTimes(3); // catalog + labware + equipment
  });

  it('returns an empty result and does not throw when Exa is not configured', async () => {
    vi.mocked(resolveExaConfig).mockReturnValue(null);
    const provider = createVendorExaProvider(() => ({}));
    const hits = await provider('rotenone', 6, signal());
    expect(hits).toEqual([]);
    expect(exaSearch).not.toHaveBeenCalled();
  });

  it('isolates a single category failure to an empty result for that category', async () => {
    vi.mocked(resolveExaConfig).mockReturnValue({
      apiKey: 'exa-test-key',
      baseUrl: 'https://api.exa.ai',
      defaultSearchType: 'auto',
      defaultContentMode: 'highlights',
      defaultMaxCharacters: 4000,
      timeoutMs: 1000,
    });
    // First category (catalog) returns a hit; the labware/equipment calls throw.
    vi.mocked(exaSearch)
      .mockResolvedValueOnce({
        results: [
          { id: 'exa-1', title: 'Rotenone', url: 'https://example.com/r', highlights: ['mitochondrial complex I'] },
        ],
      })
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('boom'));

    const provider = createVendorExaProvider(() => ({}));
    const hits = await provider('rotenone', 6, signal());
    // The catalog hit survives the two category failures.
    expect(hits.some((h) => h.label === 'Rotenone')).toBe(true);
  });
});