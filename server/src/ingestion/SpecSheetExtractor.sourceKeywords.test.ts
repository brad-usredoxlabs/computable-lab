// @vitest-environment node
/**
 * L2-SPEC-SHEET-INGEST-1 g6fix — source-keyword parsing + the shipped labware
 * map's topology entries.
 *
 * Browser gate g6: D1 (HIGH) the addressing keyword truncated to
 * "Addressing type (grid" via the "/" split inside a parenthetical, so
 * topology.addressing — REQUIRED by labware-definition.schema.yaml, enum
 * [grid, linear, single] — never mapped and every save 422'd; D2 (MINOR) rows
 * and columns both reduced to "Number", so one line filled both.
 *
 * parseSourceKeywords is private; its behaviour is observed through
 * extractProposals, the public seam that consumes the keywords.
 */

import { describe, it, expect } from 'vitest';
import type { SpecSheetFieldMap } from './SpecSheetFieldMaps.js';
import { getSpecSheetFieldMap } from './SpecSheetFieldMaps.js';
import { extractProposals } from './SpecSheetExtractor.js';

const ADDRESSING_ENUM = ['grid', 'linear', 'single'];

describe('source keywords — parentheticals are documentation, not alternatives', () => {
  it('extracts topology.addressing from the pre-fix source line (D1 truncation pin)', () => {
    const fieldMap: SpecSheetFieldMap = {
      recordKind: 'labware',
      // Verbatim pre-g6fix YAML source: the "/" split used to yield only the
      // unusable literal "Addressing type (grid" as a label keyword.
      fieldMappings: [
        { targetField: 'topology.addressing', source: 'Addressing type (grid/linear/single) from the sheet' },
      ],
    };
    const proposals = extractProposals(fieldMap, { url: 'https://example.com/plate', text: 'Addressing type: grid' });

    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.targetField).toBe('topology.addressing');
    expect(ADDRESSING_ENUM).toContain(proposals[0]?.value);
  });
});

describe('source keywords — quantifier heads keep their complement', () => {
  it('does not fold rows and columns into the shared keyword "Number" (D2 pin)', () => {
    // The shipped map's first alternative per field is exactly this form;
    // without the guard both parse to "Number" and one line fills both fields.
    const fieldMap: SpecSheetFieldMap = {
      recordKind: 'labware',
      fieldMappings: [
        { targetField: 'topology.rows', source: 'Number of rows' },
        { targetField: 'topology.columns', source: 'Number of columns' },
      ],
    };
    // Only the rows line exists — pre-fix it filled topology.columns too.
    const proposals = extractProposals(fieldMap, { url: 'https://example.com/plate', text: 'Number of rows: 8' });
    const rows = proposals.filter((p) => p.targetField === 'topology.rows');
    const columns = proposals.filter((p) => p.targetField === 'topology.columns');

    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe('8');
    expect(columns).toHaveLength(0);
  });
});

describe('shipped labware map — topology sources yield distinct keywords', () => {
  it('reads rows from the rows label and columns from the columns label', async () => {
    const fieldMap = await getSpecSheetFieldMap('labware');
    const proposals = extractProposals(fieldMap, {
      url: 'https://example.com/plate',
      text: 'Rows: 8\nColumns: 12',
    });
    const rows = proposals.filter((p) => p.targetField === 'topology.rows');
    const columns = proposals.filter((p) => p.targetField === 'topology.columns');

    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe('8');
    expect(columns).toHaveLength(1);
    expect(columns[0]?.value).toBe('12');
    expect(rows[0]?.passage).not.toBe(columns[0]?.passage);
  });

  it('maps a realistic plate sheet to an enum-legal addressing + own-line rows/columns', async () => {
    const fieldMap = await getSpecSheetFieldMap('labware');
    const proposals = extractProposals(fieldMap, {
      url: 'https://example.com/96-well-plate',
      text: [
        'Display name: 96-Well Polypropylene Microplate',
        'Vendor: Corning',
        'Max well volume: 350 uL',
        'Well length: 8.0 mm',
        'Addressing type: grid',
        'Number of rows: 8',
        'Number of columns: 12',
      ].join('\n'),
    });
    const byField = (field: string) => proposals.filter((p) => p.targetField === field);

    expect(byField('topology.addressing')).toHaveLength(1);
    expect(ADDRESSING_ENUM).toContain(byField('topology.addressing')[0]?.value);

    expect(byField('topology.rows')).toHaveLength(1);
    expect(byField('topology.columns')).toHaveLength(1);
    expect(byField('topology.rows')[0]?.value).toBe('8');
    expect(byField('topology.columns')[0]?.value).toBe('12');
    expect(byField('topology.rows')[0]?.passage).toBe('Number of rows: 8');
    expect(byField('topology.columns')[0]?.passage).toBe('Number of columns: 12');

    // No regression in the rest of the sheet
    expect(byField('display_name')[0]?.value).toBe('96-Well Polypropylene Microplate');
    expect(byField('vendor')[0]?.value).toBe('Corning');
    expect(byField('capacity.max_well_volume_uL')[0]?.value).toBe('350 uL');
    expect(byField('physical_geometry.well_length_mm')[0]?.value).toBe('8.0 mm');
  });
});
