// @vitest-environment node
/**
 * g6d2 — browser-gate g6 defect D2 pin.
 *
 * `parseSourceKeywords` strips a prepositional tail at the FIRST preposition,
 * and "of" is in that set, so both "Number of rows for grid addressing" and
 * "Number of columns for grid addressing" used to reduce to the SAME keyword
 * "Number". One line then filled BOTH topology.rows and topology.columns.
 *
 * The labware field map now declares DISTINCT `keywords` per mapping, which
 * override the derived list. These tests use the real map on disk.
 */

import { describe, it, expect } from 'vitest';
import { extractProposals } from './SpecSheetExtractor.js';
import { getSpecSheetFieldMap } from './SpecSheetFieldMaps.js';

describe('g6d2 — rows/columns keywords cannot cross-fill', () => {
  it('a rows-only line proposes topology.rows and NOT topology.columns', async () => {
    const fieldMap = await getSpecSheetFieldMap('labware');
    const doc = {
      url: 'https://example.com/labware/rows-only',
      text: 'Number of rows for grid addressing: 8',
    };

    const proposals = extractProposals(fieldMap, doc);
    const rows = proposals.filter((p) => p.targetField === 'topology.rows');
    const columns = proposals.filter((p) => p.targetField === 'topology.columns');

    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe('8');
    expect(columns.map((p) => [p.targetField, p.value])).toEqual([]);
  });

  it('a columns-only line proposes topology.columns and NOT topology.rows', async () => {
    const fieldMap = await getSpecSheetFieldMap('labware');
    const doc = {
      url: 'https://example.com/labware/columns-only',
      text: 'Number of columns for grid addressing: 12',
    };

    const proposals = extractProposals(fieldMap, doc);
    const rows = proposals.filter((p) => p.targetField === 'topology.rows');
    const columns = proposals.filter((p) => p.targetField === 'topology.columns');

    expect(columns).toHaveLength(1);
    expect(columns[0]?.value).toBe('12');
    expect(rows.map((p) => [p.targetField, p.value])).toEqual([]);
  });
});
