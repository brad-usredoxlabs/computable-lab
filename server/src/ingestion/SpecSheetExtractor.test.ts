// @vitest-environment node
/**
 * L2-SPEC-SHEET-INGEST-1 unit 2 — SpecSheetExtractor tests.
 *
 * Tests the extraction engine: pure extractProposals, typed not-configured
 * degradation, fetch-blocked records, loud throws for unmapped kinds,
 * and typed no-proposals outcomes when zero fields match.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SpecSheetFieldMap } from './SpecSheetFieldMaps.js';
import { getSpecSheetFieldMap, reload } from './SpecSheetFieldMaps.js';
import { readFile, writeFile } from 'node:fs/promises';
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
      integrations: { exa: { apiKey: 'mock-key', enabled: true } },
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

  it('does not extract a vendor from pipe-separated colon-less segment (real receipt pattern)', () => {
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
      text: `Manufacturer | OEM/ODM Supplier | Wholesale Factory Price ◉ Reservoir Material: Polypropylene (PP) ◉ Reservoir Format: Single well ◉ Reservoir Capacity: 195 mL, 185 mL ◉ Reservoir Color: Clear ◉ Reservoir Surface: Hydrophobic, low-retention ◉ Bottom Type: 96/384 diamond bottom troughs ◉ Dimensions (L x W x H): 127.8 x 85.5 x 31.5 mm ◉ Sterility: Sterile / Non-sterile ◉ Autoclavable: Yes ◉ Packaging: 5 pcs/bag, 10 bags/case ◉ Purity Grade: RNase/DNase free, non-pyrogenic ◉ Free Sample: 1-5pcs ◉ Compatibility: Multichannel pipettes & automated pipetting systems`,
    };

    const result = extractProposals(fieldMap, doc);

    // gate g4 D2: "Manufacturer | OEM/ODM Supplier" is navigation/label chrome,
    // not a field value — a colon-less segment (label === value) must NOT be
    // proposed as the vendor.
    const vendors = result.filter((p) => p.targetField === 'vendor');
    expect(vendors).toHaveLength(0);

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
      text: `Vendor: Acme·Corp•Build 2
Display Name: Model A; Model B`,
    };

    const result = extractProposals(fieldMap, doc);
    const vendors = result.filter((p) => p.targetField === 'vendor');
    expect(vendors).toHaveLength(1);
    expect(vendors[0].value).toBe('Acme·Corp•Build 2');

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
/* Arm (f) — Table header rows must not produce label-as-value        */
/* ------------------------------------------------------------------ */

describe('extractProposals — table header rows', () => {
  it('does not propose label text as value from header-only pipe-separated line', () => {
    const fieldMap: SpecSheetFieldMap = {
      recordKind: 'labware',
      fieldMappings: [
        { targetField: 'catalog_number', source: 'Catalog Number / Cat No' },
        { targetField: 'package_size', source: 'Package Size / Quantity' },
      ],
    };

    // A table header row followed by a data row — the header should be skipped
    const doc = {
      url: 'https://example.com/product',
      text: 'Catalog Number | Quantity\n25200056 | 100 mL',
    };

    const result = extractProposals(fieldMap, doc);

    // No proposal should use the header label text as a value
    for (const p of result) {
      expect(p.value).not.toBe('Catalog Number');
      expect(p.value).not.toBe('Quantity');
    }

    // The data row should still produce valid proposals
    const catalogs = result.filter((p) => p.targetField === 'catalog_number');
    expect(catalogs).toHaveLength(1);
    expect(catalogs[0].value).toBe('25200056');

    const packages = result.filter((p) => p.targetField === 'package_size');
    expect(packages).toHaveLength(1);
    expect(packages[0].value).toBe('100 mL');
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

/* ------------------------------------------------------------------ */
/* No-proposals arm — zero matches after successful fetch             */
/* ------------------------------------------------------------------ */

describe('extractFromUrl — zero proposals returns typed no-proposals', () => {
  let exaMod: typeof import('../integrations/exa.js');

  beforeEach(async () => {
    exaMod = await import('../integrations/exa.js');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns noProposals with reason no_field_match when text has no matching Key:Value lines', async () => {
    vi.spyOn(exaMod, 'resolveExaConfig').mockReturnValue({
      apiKey: 'test-key',
      baseUrl: 'https://api.exa.ai',
      defaultSearchType: 'auto',
      defaultContentMode: 'highlights',
      defaultMaxCharacters: 4000,
      timeoutMs: 20000,
    });
    vi.spyOn(exaMod, 'exaGetContents').mockResolvedValue({
      results: [{
        text: 'Polypropylene reagent reservoir. Single well format, sterile, individually wrapped. Designed for high-throughput applications with reliable liquid delivery.',
      }],
    });

    const result = await extractFromUrl('labware', 'https://example.com/reservoir-abc');

    expect(result.configured).toBe(true);
    expect(result.proposals).toEqual([]);
    expect((result as any).noProposals).toBeDefined();
    expect((result as any).noProposals.url).toBe('https://example.com/reservoir-abc');
    expect((result as any).noProposals.reason).toBe('no_field_match');
    const declared = (await getSpecSheetFieldMap('labware')).fieldMappings.map((m) => m.targetField);
    const outcomes = (result as any).fieldOutcomes as Array<{ targetField: string; status: string; passage?: string }>;
    expect(outcomes.map((o) => o.targetField)).toEqual(declared); // every declared field, YAML order
    expect(outcomes.every((o) => o.status === 'not_present')).toBe(true);
    expect(outcomes.every((o) => !('passage' in o))).toBe(true); // no empty-string / guessed passage
  });

  it('returns noProposals with reason empty_document when fetched text is empty', async () => {
    vi.spyOn(exaMod, 'resolveExaConfig').mockReturnValue({
      apiKey: 'test-key',
      baseUrl: 'https://api.exa.ai',
      defaultSearchType: 'auto',
      defaultContentMode: 'highlights',
      defaultMaxCharacters: 4000,
      timeoutMs: 20000,
    });
    vi.spyOn(exaMod, 'exaGetContents').mockResolvedValue({
      results: [{ text: '' }],
    });

    const result = await extractFromUrl('labware', 'https://example.com/empty-page');

    expect(result.configured).toBe(true);
    expect(result.proposals).toEqual([]);
    expect((result as any).noProposals).toBeDefined();
    expect((result as any).noProposals.url).toBe('https://example.com/empty-page');
    expect((result as any).noProposals.reason).toBe('empty_document');
    const declared = (await getSpecSheetFieldMap('labware')).fieldMappings.map((m) => m.targetField);
    const outcomes = (result as any).fieldOutcomes as Array<{ targetField: string; status: string; passage?: string }>;
    expect(outcomes.map((o) => o.targetField)).toEqual(declared); // every declared field, YAML order
    expect(outcomes.every((o) => o.status === 'not_present')).toBe(true);
    expect(outcomes.every((o) => !('passage' in o))).toBe(true); // no empty-string / guessed passage
  });
});

/* ------------------------------------------------------------------ */
/* uE1hdrowfix-c2 — Per-table positional extraction (defects 1 & 2)   */
/* ------------------------------------------------------------------ */

describe('extractProposals — positional extraction scoped per table', () => {
  it('does not fabricate values from a markdown separator row (defect 1)', () => {
    const fieldMap: SpecSheetFieldMap = {
      recordKind: 'vendor-product',
      fieldMappings: [
        { targetField: 'catalog_number', source: 'Catalog Number / Cat No' },
        { targetField: 'package_size', source: 'Package Size / Volume' },
      ],
    };

    // Header + markdown separator row + actual data
    const doc = {
      url: 'https://example.com/sep',
      text: 'Catalog Number | Volume\n--- | ---\n25200056 | 100 mL',
    };

    const result = extractProposals(fieldMap, doc);

    // No proposal should have a separator value like "---"
    for (const p of result) {
      expect(p.value).not.toBe('---');
    }

    // Exactly one catalog_number proposal with the real value
    const catalogs = result.filter((p) => p.targetField === 'catalog_number');
    expect(catalogs).toHaveLength(1);
    expect(catalogs[0].value).toBe('25200056');
  });

  it('does not fabricate values from an em-dash separator row (D1 — unicode)', () => {
    const fieldMap: SpecSheetFieldMap = {
      recordKind: 'vendor-product',
      fieldMappings: [
        { targetField: 'catalog_number', source: 'Catalog Number / Cat No' },
        { targetField: 'package_size', source: 'Package Size / Volume' },
      ],
    };

    // Header + em-dash separator row (PDF/HTML rule rows) + actual data
    const doc = {
      url: 'https://example.com/ems',
      text: 'Catalog Number | Volume\n\u2014 | \u2014\n25200056 | 100 mL',
    };

    const result = extractProposals(fieldMap, doc);

    // No proposal should have an em-dash separator value
    for (const p of result) {
      expect(p.value).not.toBe('\u2014');
    }

    // Exactly one catalog_number proposal with the real value
    const catalogs = result.filter((p) => p.targetField === 'catalog_number');
    expect(catalogs).toHaveLength(1);
    expect(catalogs[0].value).toBe('25200056');
  });

  it('pins to the last header layout (D2 — two-table document shape)', () => {
    // D2 reality: the per-field loop resets lastHeader per mapping, so each
    // mapping independently walks all lines. With two headers in swapped order
    // followed by one data row, the second header layout wins for BOTH fields.
    //
    // IN:  "Catalog Number | Volume"  (header1: Cat@0, Vol@1)
    //       "Volume | Catalog Number"  (header2: Vol@0, Cat@1)
    //       "10 mL | X9"               (data)
    // OUT: catalog_number = 'X9'  (position 1 from header2)
    //       package_size   = '10 mL' (position 0 from header2)
    //
    // Both fields are extractable because each mapping independently
    // scans all lines and pins to the last header that defines its keyword.
    const fieldMap: SpecSheetFieldMap = {
      recordKind: 'vendor-product',
      fieldMappings: [
        { targetField: 'catalog_number', source: 'Catalog Number / Cat No' },
        { targetField: 'package_size', source: 'Package Size / Volume' },
      ],
    };

    // Two headers with swapped column order, data after the last header
    const doc = {
      url: 'https://example.com/swap',
      text: 'Catalog Number | Volume\nVolume | Catalog Number\n10 mL | X9',
    };

    const result = extractProposals(fieldMap, doc);

    // catalog_number at position 1 (from second header), not 0
    const catalogs = result.filter((p) => p.targetField === 'catalog_number');
    expect(catalogs).toHaveLength(1);
    expect(catalogs[0].value).toBe('X9');

    // package_size at position 0 (from second header)
    const packages = result.filter((p) => p.targetField === 'package_size');
    expect(packages).toHaveLength(1);
    expect(packages[0].value).toBe('10 mL');
  });
});

/* ------------------------------------------------------------------ */
/* u6colonless — gate g4 D1 + D2: colon-less segments are not values  */
/* ------------------------------------------------------------------ */

describe('extractProposals — colon-less segments never accepted as values (g4 D1+D2)', () => {
  it('D1: a table header cell "Number of Wells" yields no topology proposal (nest pages)', () => {
    // Sources verbatim from schema/ingestion/spec-sheet.labware.yaml:53-56
    const fieldMap: SpecSheetFieldMap = {
      recordKind: 'labware',
      fieldMappings: [
        { targetField: 'topology.rows', source: 'Number of rows for grid addressing' },
        { targetField: 'topology.columns', source: 'Number of columns for grid addressing' },
      ],
    };

    // Real nest labware page: pipe-separated header chrome, no other matching line
    const doc = {
      url: 'https://example.com/nest-plate',
      text: '| Number of Wells | Single Channel |',
    };

    const result = extractProposals(fieldMap, doc);

    expect(result.filter((p) => p.targetField === 'topology.rows')).toHaveLength(0);
    expect(result.filter((p) => p.targetField === 'topology.columns')).toHaveLength(0);
  });

  it('D2: a colon-less nav label "Manufacturer" yields no vendor proposal (cotaus page)', () => {
    // The flipped pin at :206-210 covers the full cotaus fixture; this leg
    // isolates the chrome line alone so the assertion cannot ride another
    // field's proposal count.
    const fieldMap: SpecSheetFieldMap = {
      recordKind: 'labware',
      fieldMappings: [
        { targetField: 'vendor', source: 'Vendor / Manufacturer from the spec sheet' },
      ],
    };

    const doc = {
      url: 'https://example.com/cotaus',
      text: 'Manufacturer | OEM/ODM Supplier | Wholesale Factory Price',
    };

    const result = extractProposals(fieldMap, doc);

    expect(result.filter((p) => p.targetField === 'vendor')).toHaveLength(0);
  });

  it('guard: a colon-less data cell reached positionally under a real header still arrives', () => {
    // Anti-regression for the positional arm (:244-256) — colon-less cells are
    // legitimate table VALUES when reached under a header, only the
    // label-matching arm must reject them.
    const fieldMap: SpecSheetFieldMap = {
      recordKind: 'labware',
      fieldMappings: [
        { targetField: 'color', source: 'Color of the reservoir' },
        { targetField: 'capacity.max_well_volume_uL', source: 'Capacity of the reservoir', transform: 'parse_volume', unit: 'uL' },
      ],
    };

    const doc = {
      url: 'https://example.com/reservoir-table',
      text: '| Color | Capacity |\n| Clear | 195 mL |',
    };

    const result = extractProposals(fieldMap, doc);

    const colors = result.filter((p) => p.targetField === 'color');
    expect(colors).toHaveLength(1);
    expect(colors[0].value).toBe('Clear');

    const capacities = result.filter((p) => p.targetField === 'capacity.max_well_volume_uL');
    expect(capacities).toHaveLength(1);
    expect(capacities[0].value).toBe('195 mL');
  });
});

/* ------------------------------------------------------------------ */
/* L2-NOUN-FROM-DOC-1 unit 1 — fieldOutcomes (RED pin)                 */
/* ------------------------------------------------------------------ */

describe('extractFromUrl — fieldOutcomes accounts for every declared field', () => {
  let exaMod: typeof import('../integrations/exa.js');

  beforeEach(async () => {
    exaMod = await import('../integrations/exa.js');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('success payload carries an outcome for all 9 declared fields: 2 extracted, 7 not_present', async () => {
    vi.spyOn(exaMod, 'resolveExaConfig').mockReturnValue({
      apiKey: 'test-key',
      baseUrl: 'https://api.exa.ai',
      defaultSearchType: 'auto',
      defaultContentMode: 'highlights',
      defaultMaxCharacters: 4000,
      timeoutMs: 20000,
    });
    const docText = 'Vendor: Thermo\nCatalog Number: 25200056';
    vi.spyOn(exaMod, 'exaGetContents').mockResolvedValue({
      results: [{ text: docText }],
    });

    const cfg = {
      integrations: { exa: { apiKey: 'test-key', enabled: true } },
    } as unknown as Parameters<typeof extractFromUrl>[2];
    const result = await extractFromUrl('vendor-product', 'https://example.com/partial-doc', cfg);

    expect(result.configured).toBe(true);
    expect(result.proposals).toHaveLength(2);

    // Every declared field is accounted for, in YAML declaration order (no sort)
    const fieldMap = await getSpecSheetFieldMap('vendor-product');
    expect(fieldMap.fieldMappings).toHaveLength(9);
    expect(result.fieldOutcomes).toHaveLength(9);
    expect(result.fieldOutcomes.map((o) => o.targetField)).toEqual(
      fieldMap.fieldMappings.map((m) => m.targetField),
    );

    const extracted = result.fieldOutcomes.filter((o) => o.status === 'extracted');
    const notPresent = result.fieldOutcomes.filter((o) => o.status === 'not_present');
    expect(extracted).toHaveLength(2);
    expect(notPresent).toHaveLength(7);

    // extracted: passage is a verbatim substring of the document text
    for (const o of extracted) {
      expect(o.passage).toBeTypeOf('string');
      expect(docText).toContain(o.passage!);
    }
    // not_present: NO passage key at all — never an empty string, never a guess
    for (const o of notPresent) {
      expect('passage' in o).toBe(false);
      expect(o.passage).toBeUndefined();
    }
    // not_present fields never appear in proposals (proposals = evidence found)
    expect(result.proposals.map((p) => p.targetField).sort()).toEqual(['catalog_number', 'vendor']);
  });

  it('AC3: outcome list length tracks the YAML fieldMappings (swap + reload, no TS edit)', async () => {
    const yamlPath = new URL('../../../schema/ingestion/spec-sheet.vendor-product.yaml', import.meta.url);
    const original = await readFile(yamlPath, 'utf-8');
    try {
      const swapped = original.replace(
        '      - targetField: synonyms',
        '      - targetField: ac3_probe_field\n        source: "AC3 transient probe field"\n      - targetField: synonyms',
      );
      expect(swapped).not.toBe(original); // the swap anchor must have matched
      await writeFile(yamlPath, swapped, 'utf-8');
      await reload();
      vi.spyOn(exaMod, 'resolveExaConfig').mockReturnValue({
        apiKey: 'k', baseUrl: 'b', defaultSearchType: 'auto', defaultContentMode: 'highlights', defaultMaxCharacters: 1, timeoutMs: 1,
      });
      vi.spyOn(exaMod, 'exaGetContents').mockResolvedValue({ results: [{ text: 'Vendor: Thermo\nCatalog Number: 25200056' }] });
      const r = await extractFromUrl('vendor-product', 'https://example.com/ac3');
      const outcomes = (r as { fieldOutcomes?: Array<{ targetField: string; status: string }> }).fieldOutcomes;
      expect(outcomes).toHaveLength(10); // 9 declared + 1 added, with zero TypeScript edits
      expect(outcomes?.some((o) => o.targetField === 'ac3_probe_field')).toBe(true);
      expect(outcomes?.filter((o) => o.status === 'extracted')).toHaveLength(2);
    } finally {
      await writeFile(yamlPath, original, 'utf-8');
      await reload();
    }
    expect((await getSpecSheetFieldMap('vendor-product')).fieldMappings).toHaveLength(9); // restored
  });
});
