// @vitest-environment node
/**
 * L2-NOUN-FROM-DOC-1 unit 1 (nfdoutcomes) — per-field named outcomes.
 *
 * extractProposalOutcomes reports a NAMED outcome for EVERY declared
 * fieldMapping: a proposal when the field matched, `not_present` with a
 * reason when it did not — so a document that yields 2 of 9 declared fields
 * can no longer look complete. extractFromUrl carries the list through
 * unchanged on the success and noProposals arms.
 *
 * Pins: AC2 (no `value` key on `not_present`; a table-header cell is never a
 * `proposal.value`), AC3 (outcomes derive from fieldMap.fieldMappings — a
 * hand-built two-field map yields exactly two outcomes; no YAML is touched),
 * and delegation (extractProposals is the projection of proposed outcomes;
 * the four pre-existing test files pin the values themselves).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SpecSheetFieldMap } from './SpecSheetFieldMaps.js';
import { getSpecSheetFieldMap } from './SpecSheetFieldMaps.js';
import { extractProposals, extractFromUrl, extractProposalOutcomes } from './SpecSheetExtractor.js';
import type { SpecSheetFieldOutcome } from './SpecSheetExtractor.js';

type Proposed = Extract<SpecSheetFieldOutcome, { status: 'proposed' }>;
type NotPresent = Extract<SpecSheetFieldOutcome, { status: 'not_present' }>;
const isProposed = (o: SpecSheetFieldOutcome): o is Proposed => o.status === 'proposed';
const fieldOf = (o: SpecSheetFieldOutcome): string =>
  o.status === 'proposed' ? o.proposal.targetField : o.targetField;
const declaredOrder = (map: SpecSheetFieldMap) => map.fieldMappings.map((m) => m.targetField);

/* AC3 fixtures — hand-built maps; outcomes derive from these, not from YAML */
const twoFieldMap: SpecSheetFieldMap = {
  recordKind: 'vendor-product',
  fieldMappings: [
    { targetField: 'catalog_number', source: 'Catalog number / Product number from the sheet' },
    { targetField: 'grade', source: 'Grade / Purity / Quality specification from the sheet' },
  ],
};
const docOnlyCatalog = { url: 'https://example.com/product-25200056', text: 'Catalog Number: 25200056' };

describe('extractProposalOutcomes — one outcome per declared field', () => {
  it('proposes the matched field; reports the other as not_present with a reason', () => {
    const outcomes = extractProposalOutcomes(twoFieldMap, docOnlyCatalog);
    expect(outcomes).toHaveLength(twoFieldMap.fieldMappings.length);
    expect(outcomes.map(fieldOf)).toEqual(declaredOrder(twoFieldMap)); // declared order

    const catalog = outcomes[0] as Proposed;
    expect(catalog.status).toBe('proposed');
    expect(catalog.proposal.value).toBe('25200056');
    expect(catalog.proposal.sourceUrl).toBe(docOnlyCatalog.url);

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
    const outcomes = extractProposalOutcomes(fieldMap, { url: 'https://example.com/header-only', text: 'Quantity/Size | 100 mL' });
    expect(outcomes).toHaveLength(fieldMap.fieldMappings.length);
    const outcome = outcomes[0] as NotPresent;
    expect(outcome.status).toBe('not_present');
    expect(outcome.targetField).toBe(fieldMap.fieldMappings[0]!.targetField);
    expect(outcome.reason).toBe('no_label_match');
    for (const o of outcomes) {
      if (isProposed(o)) {
        expect(o.proposal.value).not.toBe('Quantity/Size');
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
    const outcomes = extractProposalOutcomes(fieldMap, { url: 'https://example.com/zero-kw', text: 'Catalog Number: 25200056' });
    expect(outcomes).toHaveLength(fieldMap.fieldMappings.length);
    const outcome = outcomes[1] as NotPresent;
    expect(outcome.status).toBe('not_present');
    expect(outcome.targetField).toBe(fieldMap.fieldMappings[1]!.targetField);
    expect(outcome.reason).toBe('no_label_match');
    expect(extractProposals(fieldMap, { url: 'https://example.com/zero-kw', text: 'Catalog Number: 25200056' })).toHaveLength(1);
  });

  it('extractProposals delegates: proposals equal the proposed outcomes, in order', () => {
    const docs = [
      docOnlyCatalog,
      { url: 'https://example.com/mixed', text: 'Catalog Number: 25200056\nGrade: ACS reagent' },
    ];
    for (const doc of docs) {
      expect(extractProposals(twoFieldMap, doc)).toEqual(
        extractProposalOutcomes(twoFieldMap, doc).filter(isProposed).map((o) => o.proposal),
      );
    }
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
    const proposedFields = result.proposals.map((p) => p.targetField);
    for (const mapping of declared) {
      const outcome = result.fieldOutcomes.find((o) => fieldOf(o) === mapping.targetField)!;
      if (proposedFields.includes(mapping.targetField)) {
        expect(outcome.status).toBe('proposed');
      } else if (outcome.status === 'not_present') {
        expect(outcome.reason).toBe('no_label_match');
        expect(Object.keys(outcome)).not.toContain('value'); // AC2
      }
    }
  });

  it('noProposals arm: no_field_match preserved; every outcome is not_present', async () => {
    vi.spyOn(exaMod, 'resolveExaConfig').mockReturnValue(exaConfig);
    vi.spyOn(exaMod, 'exaGetContents').mockResolvedValue({ results: [{ text: 'Polypropylene reagent reservoir. Single well format, sterile.' }] });
    const result = await extractFromUrl('vendor-product', 'https://example.com/no-fields');
    if (!('noProposals' in result)) throw new Error('noProposals missing');
    expect(result.noProposals.reason).toBe('no_field_match');
    expect(result.proposals).toEqual([]);
    if ('fieldOutcomes' in result) {
      const declared = (await getSpecSheetFieldMap('vendor-product')).fieldMappings;
      expect(result.fieldOutcomes).toHaveLength(declared.length);
      expect(result.fieldOutcomes.every((o) => !isProposed(o))).toBe(true);
      expect(result.fieldOutcomes.map(fieldOf)).toEqual(declared.map((m) => m.targetField));
    }
  });

  it('empty-document arm: empty_document preserved; outcomes present, all not_present', async () => {
    vi.spyOn(exaMod, 'resolveExaConfig').mockReturnValue(exaConfig);
    vi.spyOn(exaMod, 'exaGetContents').mockResolvedValue({ results: [{ text: '' }] });
    const result = await extractFromUrl('vendor-product', 'https://example.com/empty-page');
    if (!('noProposals' in result)) throw new Error('noProposals missing');
    expect(result.noProposals.reason).toBe('empty_document');
    if ('fieldOutcomes' in result) {
      const declared = (await getSpecSheetFieldMap('vendor-product')).fieldMappings;
      expect(result.fieldOutcomes).toHaveLength(declared.length);
      expect(result.fieldOutcomes.every((o) => !isProposed(o))).toBe(true);
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
