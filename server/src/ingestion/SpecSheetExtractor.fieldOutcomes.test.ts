// @vitest-environment node
/**
 * L2-NOUN-FROM-DOC-1 unit 1 (nfdoutcomes) — per-field named outcomes.
 *
 * extractProposalOutcomes reports a NAMED outcome for EVERY declared
 * fieldMapping: a proposal when matched, `not_present` with a reason when
 * not. extractFromUrl carries the list through unchanged on the success and
 * noProposals arms. Pins AC2 (no `value` on `not_present`; a header cell
 * never becomes a proposal.value) and AC3 (outcomes derive from fieldMappings
 * — hand-built maps, no YAML touched); the four pre-existing test files pin
 * extractProposals' output unchanged.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SpecSheetFieldMap } from './SpecSheetFieldMaps.js';
import { getSpecSheetFieldMap } from './SpecSheetFieldMaps.js';
import { extractFromUrl, extractProposalOutcomes } from './SpecSheetExtractor.js';
import type { SpecSheetFieldOutcome } from './SpecSheetExtractor.js';

type Proposed = Extract<SpecSheetFieldOutcome, { status: 'proposed' }>;
type NotPresent = Extract<SpecSheetFieldOutcome, { status: 'not_present' }>;
const isProposed = (o: SpecSheetFieldOutcome): o is Proposed => o.status === 'proposed';
const fieldOf = (o: SpecSheetFieldOutcome): string => o.status === 'proposed' ? o.proposal.targetField : o.targetField;

/* AC3 fixture — hand-built map; outcomes derive from this, not from YAML */
const twoFieldMap: SpecSheetFieldMap = {
  recordKind: 'vendor-product',
  fieldMappings: [
    { targetField: 'catalog_number', source: 'Catalog number / Product number from the sheet' },
    { targetField: 'grade', source: 'Grade / Purity / Quality specification from the sheet' },
  ],
};

describe('extractProposalOutcomes — one outcome per declared field', () => {
  it('proposes the matched field; reports the other as not_present with a reason', () => {
    const doc = { url: 'https://example.com/product-25200056', text: 'Catalog Number: 25200056' };
    const outcomes = extractProposalOutcomes(twoFieldMap, doc);
    expect(outcomes).toHaveLength(twoFieldMap.fieldMappings.length); // AC3
    expect(outcomes.map(fieldOf)).toEqual(twoFieldMap.fieldMappings.map((m) => m.targetField)); // declared order

    const catalog = outcomes[0] as Proposed;
    expect(catalog.status).toBe('proposed');
    expect(catalog.proposal.value).toBe('25200056');
    expect(catalog.proposal.sourceUrl).toBe(doc.url);

    const grade = outcomes[1] as NotPresent;
    expect(grade.status).toBe('not_present');
    expect(grade.targetField).toBe(twoFieldMap.fieldMappings[1]!.targetField);
    expect(grade.reason).toBe('no_label_match');
    expect(Object.keys(grade)).not.toContain('value'); // AC2: no value on not_present
  });

  it('a header-only table row is never a value (AC2)', () => {
    const fieldMap: SpecSheetFieldMap = {
      recordKind: 'vendor-product',
      fieldMappings: [
        { targetField: 'package_size', source: 'Package size / Quantity as stated on the sheet', transform: 'parse_volume', unit: 'mL' },
      ],
    };
    // "Quantity/Size" is a colon-less header cell: the only package_size candidate in the doc.
    const outcomes = extractProposalOutcomes(fieldMap, { url: 'https://example.com/header-only', text: 'Quantity/Size | 100 mL' });
    expect(outcomes).toHaveLength(fieldMap.fieldMappings.length);
    const outcome = outcomes[0] as NotPresent;
    expect(outcome.status).toBe('not_present');
    expect(outcome.targetField).toBe(fieldMap.fieldMappings[0]!.targetField);
    expect(outcome.reason).toBe('no_label_match');
    for (const o of outcomes) {
      if (isProposed(o)) {
        expect(o.proposal.value).not.toBe('Quantity/Size'); // never the header text
        expect(o.proposal.value).not.toBe('100 mL');
      }
    }
  });

  it('a mapping with zero keywords still reports not_present (AC3 length invariant)', () => {
    const fieldMap: SpecSheetFieldMap = {
      recordKind: 'vendor-product',
      fieldMappings: [
        { targetField: 'catalog_number', source: 'Catalog number / Product number from the sheet' },
        { targetField: 'notes', source: '' },
      ],
    };
    const doc = { url: 'https://example.com/zero-kw', text: 'Catalog Number: 25200056' };
    const outcomes = extractProposalOutcomes(fieldMap, doc);
    expect(outcomes).toHaveLength(fieldMap.fieldMappings.length);
    const outcome = outcomes[1] as NotPresent;
    expect(outcome.status).toBe('not_present');
    expect(outcome.targetField).toBe(fieldMap.fieldMappings[1]!.targetField);
    expect(outcome.reason).toBe('no_label_match');
  });
});

describe('extractFromUrl — fieldOutcomes carried through unchanged', () => {
  let exaMod: typeof import('../integrations/exa.js');
  beforeEach(async () => { exaMod = await import('../integrations/exa.js'); });
  afterEach(() => { vi.restoreAllMocks(); });
  const exaConfig = { apiKey: 'test-key', baseUrl: 'https://api.exa.ai', defaultSearchType: 'auto', defaultContentMode: 'highlights', defaultMaxCharacters: 4000, timeoutMs: 20000 } as const;

  it('success arm: one proposal; every other declared field is not_present', async () => {
    vi.spyOn(exaMod, 'resolveExaConfig').mockReturnValue(exaConfig);
    vi.spyOn(exaMod, 'exaGetContents').mockResolvedValue({ results: [{ text: 'Catalog Number: 25200056' }] });
    const result = await extractFromUrl('vendor-product', 'https://example.com/one-of-nine');
    expect(result.configured).toBe(true);
    if (!('fieldOutcomes' in result)) throw new Error('fieldOutcomes missing on success arm');
    const declared = (await getSpecSheetFieldMap('vendor-product')).fieldMappings;
    expect(result.fieldOutcomes).toHaveLength(declared.length); // AC3: list derives from fieldMappings
    expect(result.fieldOutcomes.map(fieldOf)).toEqual(declared.map((m) => m.targetField)); // declared order
    expect(result.proposals).toHaveLength(1);
    for (const outcome of result.fieldOutcomes) {
      const proposed = result.proposals.some((p) => p.targetField === fieldOf(outcome));
      expect(outcome.status).toBe(proposed ? 'proposed' : 'not_present');
      if (!proposed && outcome.status === 'not_present') {
        expect(outcome.reason).toBe('no_label_match');
        expect(Object.keys(outcome)).not.toContain('value'); // AC2
      }
    }
  });

  it('noProposals arms: reasons preserved; every outcome is not_present, in declared order', async () => {
    vi.spyOn(exaMod, 'resolveExaConfig').mockReturnValue(exaConfig);
    const declared = (await getSpecSheetFieldMap('vendor-product')).fieldMappings;
    for (const [text, reason] of [['Polypropylene reagent reservoir. Single well format, sterile.', 'no_field_match'], ['', 'empty_document']] as const) {
      vi.spyOn(exaMod, 'exaGetContents').mockResolvedValue({ results: [{ text }] });
      const result = await extractFromUrl('vendor-product', 'https://example.com/no-fields');
      if (!('noProposals' in result)) throw new Error('noProposals missing');
      expect(result.noProposals.reason).toBe(reason); // semantics unchanged
      expect(result.proposals).toEqual([]);
      if ('fieldOutcomes' in result) {
        expect(result.fieldOutcomes).toHaveLength(declared.length);
        expect(result.fieldOutcomes.every((o) => !isProposed(o))).toBe(true);
        expect(result.fieldOutcomes.map(fieldOf)).toEqual(declared.map((m) => m.targetField));
      }
    }
  });

  it('blocked and not-configured arms carry no fieldOutcomes field', async () => {
    vi.spyOn(exaMod, 'resolveExaConfig').mockReturnValue(null);
    const notConfigured = await extractFromUrl('vendor-product', 'https://example.com/foo');
    expect(notConfigured.configured).toBe(false);
    expect('fieldOutcomes' in notConfigured).toBe(false);
    vi.spyOn(exaMod, 'resolveExaConfig').mockReturnValue(exaConfig);
    vi.spyOn(exaMod, 'exaGetContents').mockRejectedValue(new Error('Exa contents fetch failed'));
    const blocked = await extractFromUrl('vendor-product', 'https://example.com/foo');
    expect('blocked' in blocked).toBe(true);
    expect('fieldOutcomes' in blocked).toBe(false);
  });
});
