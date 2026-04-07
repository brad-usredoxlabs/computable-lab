/**
 * Unit tests for documentMapper.ts
 */

import { describe, it, expect } from 'vitest';
import { buildDocument } from './documentMapper';
import type { UISpec } from '../../types/uiSpec';

interface JSONContent {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: JSONContent[];
  text?: string;
}

// Test UISpec with Identity (hidden fields) and Readiness sections
const testUISpec: UISpec = {
  uiVersion: 1,
  schemaId: 'equipment',
  form: {
    sections: [
      {
        id: 'identity',
        title: 'Identity',
        fields: [
          {
            path: '$.name',
            widget: 'text',
            label: 'Name',
          },
          {
            path: '$.status',
            widget: 'select',
            label: 'Status',
            hidden: true, // Hidden field
          },
          {
            path: '$.kind',
            widget: 'text',
            label: 'Kind',
            hidden: true, // Hidden field
          },
        ],
      },
      {
        id: 'readiness',
        title: 'Readiness',
        fields: [
          {
            path: '$.readiness.calibrationRequired',
            widget: 'checkbox',
            label: 'Calibration Required',
          },
          {
            path: '$.readiness.lastCalibration',
            widget: 'date',
            label: 'Last Calibration',
          },
          {
            path: '$.readiness.nextCalibration',
            widget: 'date',
            label: 'Next Calibration',
          },
        ],
      },
      {
        id: 'hiddenSection',
        title: 'Hidden Section',
        fields: [
          {
            path: '$.internal.notes',
            widget: 'text',
            hidden: true,
          },
          {
            path: '$.internal.flags',
            widget: 'text',
            hidden: true,
          },
        ],
      },
    ],
  },
};

// Sample equipment data
const testData: Record<string, unknown> = {
  name: 'Centrifuge-001',
  status: 'active',
  kind: 'centrifuge',
  readiness: {
    calibrationRequired: true,
    lastCalibration: '2024-01-15',
    nextCalibration: '2024-07-15',
  },
  internal: {
    notes: 'Internal notes',
    flags: 'test',
  },
};

const emptySchema: Record<string, unknown> = {};

describe('buildDocument', () => {
  it('produces doc with correct number of sections', () => {
    const doc = buildDocument(testUISpec, emptySchema, testData);

    expect(doc.type).toBe('doc');
    expect(Array.isArray(doc.content)).toBe(true);
    // Should have 2 sections: Identity (1 visible field) and Readiness (3 visible fields)
    // Hidden Section should be omitted (all fields hidden)
    expect(doc.content.length).toBe(2);
  });

  it('excludes hidden fields from field count', () => {
    const doc = buildDocument(testUISpec, emptySchema, testData);
    const identitySection = doc.content[0] as JSONContent;
    const readinessSection = doc.content[1] as JSONContent;

    // Identity section has 3 fields defined but only 1 visible (name)
    const identityFieldRows = (identitySection.content ?? []).filter(
      (item: JSONContent) => item.type === 'fieldRow',
    );
    expect(identityFieldRows.length).toBe(1);

    // Readiness section has 3 visible fields
    const readinessFieldRows = (readinessSection.content ?? []).filter(
      (item: JSONContent) => item.type === 'fieldRow',
    );
    expect(readinessFieldRows.length).toBe(3);
  });

  it('populates field values from record data', () => {
    const doc = buildDocument(testUISpec, emptySchema, testData);
    const readinessSection = doc.content[1] as JSONContent;

    const fieldRows = (readinessSection.content ?? []).filter(
      (item: JSONContent) => item.type === 'fieldRow',
    ) as JSONContent[];

    expect((fieldRows[0].attrs as { path: string; value: unknown }).path).toBe('$.readiness.calibrationRequired');
    expect((fieldRows[0].attrs as { path: string; value: unknown }).value).toBe(true);

    expect((fieldRows[1].attrs as { path: string; value: unknown }).path).toBe('$.readiness.lastCalibration');
    expect((fieldRows[1].attrs as { path: string; value: unknown }).value).toBe('2024-01-15');

    expect((fieldRows[2].attrs as { path: string; value: unknown }).path).toBe('$.readiness.nextCalibration');
    expect((fieldRows[2].attrs as { path: string; value: unknown }).value).toBe('2024-07-15');
  });

  it('handles nested paths', () => {
    const doc = buildDocument(testUISpec, emptySchema, testData);
    const readinessSection = doc.content[1] as JSONContent;

    const fieldRows = (readinessSection.content ?? []).filter(
      (item: JSONContent) => item.type === 'fieldRow',
    ) as JSONContent[];

    // Verify nested path $.readiness.calibrationRequired is preserved
    expect((fieldRows[0].attrs as { path: string }).path).toBe('$.readiness.calibrationRequired');
  });

  it('omits section when all fields are hidden', () => {
    const doc = buildDocument(testUISpec, emptySchema, testData);

    // Check that no section with title 'Hidden Section' exists
    const hiddenSection = doc.content.find(
      (section: JSONContent) =>
        (section.attrs as { title?: string })?.title === 'Hidden Section',
    );

    expect(hiddenSection).toBeUndefined();
  });

  it('includes section heading with correct title', () => {
    const doc = buildDocument(testUISpec, emptySchema, testData);
    const identitySection = doc.content[0] as JSONContent;

    expect(identitySection.type).toBe('section');
    expect((identitySection.attrs as { title: string }).title).toBe('Identity');

    const heading = (identitySection.content ?? [])[0] as JSONContent;
    expect(heading.type).toBe('sectionHeading');
    expect((heading.content ?? [])[0]?.text).toBe('Identity');
  });

  it('handles empty data gracefully', () => {
    const doc = buildDocument(testUISpec, emptySchema, {});

    expect(doc.type).toBe('doc');
    expect(doc.content.length).toBe(2); // Still 2 sections, just with empty values

    const readinessSection = doc.content[1] as JSONContent;
    const fieldRows = (readinessSection.content ?? []).filter(
      (item: JSONContent) => item.type === 'fieldRow',
    ) as JSONContent[];

    expect((fieldRows[0].attrs as { value: unknown }).value).toBeUndefined();
  });

  it('uses path as label fallback when label is missing', () => {
    const uiSpecWithMissingLabels: UISpec = {
      uiVersion: 1,
      schemaId: 'test',
      form: {
        sections: [
          {
            id: 'test',
            title: 'Test',
            fields: [
              {
                path: '$.someField',
                widget: 'text',
                // No label provided
              },
            ],
          },
        ],
      },
    };

    const doc = buildDocument(uiSpecWithMissingLabels, emptySchema, { someField: 'value' });
    const section = doc.content[0] as JSONContent;
    const fieldRow = (section.content ?? [])[1] as JSONContent;

    // Label should fallback to path without $. prefix
    expect((fieldRow.attrs as { label: string }).label).toBe('someField');
  });
});
