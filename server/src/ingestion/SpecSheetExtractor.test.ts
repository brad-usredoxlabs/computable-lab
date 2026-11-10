// @vitest-environment node
/**
 * L2-SPEC-SHEET-INGEST-1 unit 2 — SpecSheetExtractor tests.
 *
 * Tests the extraction engine: pure extractProposals, typed not-configured
 * degradation, fetch-blocked records, and loud throws for unmapped kinds.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SpecSheetFieldMap } from './SpecSheetFieldMaps.js';
import { extractProposals, extractFromUrl, EXA_FETCH_BLOCKED } from './SpecSheetExtractor.js';

/* ------------------------------------------------------------------ */
/* Arm (a) — Pure extraction: vendor-product field map + fixed text    */
/* ------------------------------------------------------------------ */

describe('extractProposals — happy path', () => {
  it('extracts vendor, catalog_number, name, package_size with sourceUrl and passage', () => {
    const fieldMap: SpecSheetFieldMap = {
      recordKind: 'vendor-product',
      fieldMappings: [
        { targetField: 'vendor', source: 'Vendor / Manufacturer name from the sheet' },
        { targetField: 'catalog_number', source: 'Catalog number / Product number from the sheet' },
        { targetField: 'name', source: 'Product name / Chemical name from the sheet' },
        { targetField: 'package_size', source: 'Package size / Quantity as stated on the sheet', transform: 'parse_volume', unit: 'mL' },
        { targetField: 'grade', source: 'Grade / Purity / Quality specification from the sheet' },
      ],
    };

    const doc = {
      url: 'https://example.com/product-12345',
      text: `Vendor: Sigma-Aldrich
Catalog Number: S8270
Product Name: Sodium Chloride
Package Size: 100 g
Product specifications and handling information.`,
    };

    const result = extractProposals(fieldMap, doc);

    // Verify each extracted field
    expect(result.length).toBeGreaterThanOrEqual(4);

    const vendors = result.filter((p) => p.targetField === 'vendor');
    expect(vendors).toHaveLength(1);
    expect(vendors[0].value).toBe('Sigma-Aldrich');
    expect(vendors[0].sourceUrl).toBe('https://example.com/product-12345');
    expect(typeof vendors[0].passage).toBe('string');
    expect(vendors[0].passage.length).toBeGreaterThan(0);
    expect(doc.text).toContain(vendors[0].passage);

    const catalogs = result.filter((p) => p.targetField === 'catalog_number');
    expect(catalogs).toHaveLength(1);
    expect(catalogs[0].value).toBe('S8270');
    expect(catalogs[0].sourceUrl).toBe(doc.url);
    expect(doc.text).toContain(catalogs[0].passage);

    const names = result.filter((p) => p.targetField === 'name');
    expect(names).toHaveLength(1);
    expect(names[0].value).toBe('Sodium Chloride');
    expect(doc.text).toContain(names[0].passage);

    const packages = result.filter((p) => p.targetField === 'package_size');
    expect(packages).toHaveLength(1);
    expect(packages[0].value).toBe('100 g');
    expect(doc.text).toContain(packages[0].passage);

    // grade should be ABSENT (no line contains the grade keywords)
    const grades = result.filter((p) => p.targetField === 'grade');
    expect(grades).toHaveLength(0);

    // Verify no field has passage that doesn't appear verbatim in text
    for (const proposal of result) {
      expect(doc.text).toContain(proposal.passage);
    }
  });

  it('passage is present in every proposal (attribution)', () => {
    const fieldMap: SpecSheetFieldMap = {
      recordKind: 'vendor-product',
      fieldMappings: [
        { targetField: 'vendor', source: 'Vendor name from the sheet' },
      ],
    };
    const doc = {
      url: 'https://example.com/test',
      text: 'Vendor: Thermo Fisher Scientific\nProduct details.',
    };

    const result = extractProposals(fieldMap, doc);
    for (const proposal of result) {
      expect(proposal).toHaveProperty('passage');
      expect(typeof proposal.passage).toBe('string');
      expect(proposal.passage.length).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Arm (b) — Unmapped kind throws loudly                              */
/* ------------------------------------------------------------------ */

describe('extractFromUrl — unmapped kind throws', () => {
  it('throws naming the unknown record kind', async () => {
    await expect(extractFromUrl('nonexistent-kind', 'https://example.com/foo')).rejects.toThrow(
      '[spec-sheet] no field map for record type "nonexistent-kind"',
    );
  });
});

/* ------------------------------------------------------------------ */
/* Arm (c) — Not-configured arm                                       */
/* ------------------------------------------------------------------ */

describe('extractFromUrl — not-configured', () => {
  it('returns typed not-configured result when Exa config is absent', async () => {
    const { resolveExaConfig: orig } = await import('../integrations/exa.js');
    vi.spyOn(await import('../integrations/exa.js'), 'resolveExaConfig').mockReturnValue(null);

    const result = await extractFromUrl('vendor-product', 'https://example.com/foo');

    expect(result.configured).toBe(false);
    expect(result.reason).toBe('not_configured');
    expect(result.proposals).toEqual([]);

    // Restore
    vi.restoreAllMocks();
  });
});

/* ------------------------------------------------------------------ */
/* Arm (d) — Honest config is threaded through to resolveExaConfig    */
/* ------------------------------------------------------------------ */

describe('extractFromUrl — threads the caller app config to resolveExaConfig', () => {
  it('passes the exact app config object into resolveExaConfig', async () => {
    const exaMod = await import('../integrations/exa.js');
    const spy = vi.spyOn(exaMod, 'resolveExaConfig').mockReturnValue(null);
    const cfg = {
      integrations: { exa: { apiKey: 'test-key', enabled: true } },
    } as unknown as Parameters<typeof extractFromUrl>[2];

    const result = await extractFromUrl('vendor-product', 'https://example.com/foo', cfg);

    expect(spy).toHaveBeenCalledWith(cfg);
    expect(result.configured).toBe(false);
    expect(result.reason).toBe('not_configured');

    vi.restoreAllMocks();
  });
});


/* ------------------------------------------------------------------ */
/* Arm (e) — Multi-segment line segmentation (D4)                    */
/* ------------------------------------------------------------------ */

describe('extractProposals — multi-segment line segmentation', () => {
  it('segments vendor at next label boundary and extracts capacity separately', () => {
    const fieldMap: SpecSheetFieldMap = {
      recordKind: 'labware',
      fieldMappings: [
        { targetField: 'vendor', source: 'Vendor / Manufacturer from the spec sheet' },
        { targetField: 'capacity.max_well_volume_uL', source: 'Max well volume / Reservoir capacity as stated on the sheet', transform: 'parse_volume', unit: 'uL' },
      ],
    };

    const doc = {
      url: 'https://example.com/reservoir',
      text: `Vendor: Polypropylene (PP) ◉ Reservoir Format: Single well ◉ Reservoir Capacity: 195 mL, 185 mL
Catalog: 25200056`,
    };

    const result = extractProposals(fieldMap, doc);

    // Vendor must stop at the next label boundary
    const vendors = result.filter((p) => p.targetField === 'vendor');
    expect(vendors).toHaveLength(1);
    expect(vendors[0].value).toBe('Polypropylene (PP)');
    expect(vendors[0].value).not.toContain('Reservoir');

    // Capacity must be a separate proposal with the actual value
    const capacities = result.filter((p) => p.targetField === 'capacity.max_well_volume_uL');
    expect(capacities).toHaveLength(1);
    expect(capacities[0].value).toBe('195 mL, 185 mL');
  });

  it('extracts vendor from pipe-separated colon-less segment (real receipt pattern)', () => {
    const fieldMap: SpecSheetFieldMap = {
      recordKind: 'labware',
      fieldMappings: [
        { targetField: 'vendor', source: 'Vendor / Manufacturer from the spec sheet' },
        { targetField: 'capacity.max_well_volume_uL', source: 'Max well volume / Reservoir capacity as stated on the sheet', transform: 'parse_volume', unit: 'uL' },
      ],
    };

    // Real receipt line: colon-less segments separated by pipe
    const doc = {
      url: 'https://example.com/reservoir',
      text: `Manufacturer | OEM/ODM Supplier | Polypropylene (PP), 25 mL | Reservoir Capacity: 195 mL, 185 mL`,
    };

    const result = extractProposals(fieldMap, doc);

    // Vendor should match "Manufacturer" keyword against colon-less segment
    const vendors = result.filter((p) => p.targetField === 'vendor');
    expect(vendors).toHaveLength(1);
    expect(vendors[0].value).toBe('Manufacturer');
    expect(vendors[0].value).not.toContain('OEM');

    // Capacity from colon segment
    const capacities = result.filter((p) => p.targetField === 'capacity.max_well_volume_uL');
    expect(capacities).toHaveLength(1);
    expect(capacities[0].value).toBe('195 mL, 185 mL');
  });

  it('does not truncate values containing middle-dot, bullet, or semicolon', () => {
    const fieldMap: SpecSheetFieldMap = {
      recordKind: 'labware',
      fieldMappings: [
        { targetField: 'vendor', source: 'Vendor / Manufacturer from the spec sheet' },
        { targetField: 'display_name', source: 'Display name / Product name from the spec sheet' },
      ],
    };

    // Values with punctuation should not be truncated
    const doc = {
      url: 'https://example.com/product',
      text: `Vendor: Acme·Corp
Display Name: Model A; Model B`,
    };

    const result = extractProposals(fieldMap, doc);
    const vendors = result.filter((p) => p.targetField === 'vendor');
    expect(vendors).toHaveLength(1);
    expect(vendors[0].value).toBe('Acme·Corp');

    const names = result.filter((p) => p.targetField === 'display_name');
    expect(names).toHaveLength(1);
    expect(names[0].value).toBe('Model A; Model B');
  });

  it('splits pipe-separated multi-field line (mutation check for pipe separator)', () => {
    const fieldMap: SpecSheetFieldMap = {
      recordKind: 'labware',
      fieldMappings: [
        { targetField: 'vendor', source: 'Vendor / Manufacturer from the spec sheet' },
        { targetField: 'capacity.max_well_volume_uL', source: 'Max well volume / Reservoir capacity as stated on the sheet', transform: 'parse_volume', unit: 'uL' },
      ],
    };

    const doc = {
      url: 'https://example.com/reservoir',
      text: `Vendor: Acme | Reservoir Capacity: 25 mL`,
    };

    const result = extractProposals(fieldMap, doc);

    // Vendor and capacity should be separate, not the whole blob
    const vendors = result.filter((p) => p.targetField === 'vendor');
    expect(vendors).toHaveLength(1);
    expect(vendors[0].value).toBe('Acme');
    expect(vendors[0].value).not.toContain('Reservoir');

    const capacities = result.filter((p) => p.targetField === 'capacity.max_well_volume_uL');
    expect(capacities).toHaveLength(1);
    expect(capacities[0].value).toBe('25 mL');
    expect(capacities[0].value).not.toContain('Acme');
  });
});

/* ------------------------------------------------------------------ */
/* Block record on fetch failure                                      */
/* ------------------------------------------------------------------ */

describe('extractFromUrl — fetch-blocked', () => {
  let exaMod: typeof import('../integrations/exa.js');

  beforeEach(async () => {
    exaMod = await import('../integrations/exa.js');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns typed block record when Exa fetch fails', async () => {
    vi.spyOn(exaMod, 'resolveExaConfig').mockReturnValue({
      apiKey: 'test-key',
      baseUrl: 'https://api.exa.ai',
      defaultSearchType: 'auto',
      defaultContentMode: 'highlights',
      defaultMaxCharacters: 4000,
      timeoutMs: 20000,
    });
    vi.spyOn(exaMod, 'exaGetContents').mockRejectedValue(new Error('Exa contents fetch failed'));

    const result = await extractFromUrl('vendor-product', 'https://example.com/foo');

    expect(result.configured).toBe(true);
    expect(result.blocked).toBeDefined();
    expect(result.blocked.url).toBe('https://example.com/foo');
    expect(result.blocked.reason).toBe(EXA_FETCH_BLOCKED);
    expect(result.proposals).toEqual([]);
  });
});
