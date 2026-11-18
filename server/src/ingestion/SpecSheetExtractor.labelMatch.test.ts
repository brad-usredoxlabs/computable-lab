// @vitest-environment node
/**
 * uD5form — Label-anchoring tests for SpecSheetExtractor.
 *
 * Verifies that keyword matching is ANCHORED to the start of the label
 * (before the first colon), preventing prose blobs from matching and
 * ensuring that "Catalog" correctly matches the sheet label "Catalog: 25200056".
 */

import { describe, it, expect } from 'vitest';
import { extractProposals } from './SpecSheetExtractor.js';
import { getSpecSheetFieldMap, reload } from './SpecSheetFieldMaps.js';
import type { SpecSheetFieldMap } from './SpecSheetFieldMaps.js';

/* ------------------------------------------------------------------ */
/* (a) DATA PATH — real vendor-product YAML + trypsin-EDTA fixture    */
/* ------------------------------------------------------------------ */

describe('uD5form — anchored label matching', () => {
  it('rejects prose blob for formulation and extracts catalog_number from "Catalog: 25200056"', async () => {
    const fieldMap = await getSpecSheetFieldMap('vendor-product');

    const doc = {
      url: 'https://thermofisher.com/order/catalog/product/25200056',
      text: [
        'This liquid formulation of trypsin contains EDTA and phenol red. The trypsin concentration required for dissociation varies with cell type and experimental requirements. This trypsin solution is modified as follows: With • EDTA • Phenol Red The complete formulation is available.',
        'Catalog: 25200056',
      ].join('\n'),
    };

    const proposals = extractProposals(fieldMap, doc);

    // formulation must NOT match the prose blob — it should be absent
    const formulationProps = proposals.filter((p) => p.targetField === 'formulation');
    expect(formulationProps).toHaveLength(0);

    // catalog_number must match the explicit "Catalog:" line
    const catalogProps = proposals.filter((p) => p.targetField === 'catalog_number');
    expect(catalogProps).toHaveLength(1);
    expect(catalogProps[0].value).toBe('25200056');
  });
});

/* ------------------------------------------------------------------ */
/* (b) GENERIC ANCHOR — inline fieldMap proves anchoring behavior    */
/* ------------------------------------------------------------------ */

describe('label anchoring — generic keyword test', () => {
  it('does not match prose containing the keyword mid-sentence', () => {
    const fieldMap: SpecSheetFieldMap = {
      recordKind: 'vendor-product',
      fieldMappings: [
        { targetField: 'formulation', source: 'Formulation' },
      ],
    };

    // Prose that contains "formulation" mid-sentence
    const doc = {
      url: 'https://example.com/prose',
      text: 'This liquid formulation of trypsin contains EDTA and phenol red.',
    };

    const proposals = extractProposals(fieldMap, doc);
    expect(proposals).toHaveLength(0);
  });

  it('matches when keyword starts the label', () => {
    const fieldMap: SpecSheetFieldMap = {
      recordKind: 'vendor-product',
      fieldMappings: [
        { targetField: 'formulation', source: 'Formulation' },
      ],
    };

    const doc = {
      url: 'https://example.com/label',
      text: 'Formulation: Trypsin-EDTA 0.25% in HBSS',
    };

    const proposals = extractProposals(fieldMap, doc);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].targetField).toBe('formulation');
    expect(proposals[0].value).toBe('Trypsin-EDTA 0.25% in HBSS');
  });
});

/* ------------------------------------------------------------------ */
/* (c) NO REGRESSION ON PIPE FORM — segment labels must still work   */
/* ------------------------------------------------------------------ */

describe('label anchoring — no regression on pipe-separated segments', () => {
  it('still extracts vendor from pipe-separated line (segment labels)', () => {
    const fieldMap: SpecSheetFieldMap = {
      recordKind: 'labware',
      fieldMappings: [
        { targetField: 'vendor', source: 'Vendor / Manufacturer' },
      ],
    };

    const doc = {
      url: 'https://example.com/reservoir',
      text: 'Vendor: Polypropylene (PP) ◉ Reservoir Capacity: 195 mL',
    };

    const proposals = extractProposals(fieldMap, doc);
    const vendors = proposals.filter((p) => p.targetField === 'vendor');
    expect(vendors).toHaveLength(1);
    expect(vendors[0].value).toBe('Polypropylene (PP)');
  });
});
