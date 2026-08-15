/**
 * Unit tests for documentMapper.ts
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
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

describe('buildDocument', () => {
  it('produces doc with correct number of sections', () => {
    const doc = buildDocument(testUISpec, testData);

    expect(doc.type).toBe('doc');
    expect(Array.isArray(doc.content)).toBe(true);
    // Should have 2 sections: Identity (1 visible field) and Readiness (3 visible fields)
    // Hidden Section should be omitted (all fields hidden)
    expect(doc.content.length).toBe(2);
  });

  it('excludes hidden fields from field count', () => {
    const doc = buildDocument(testUISpec, testData);
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
    const doc = buildDocument(testUISpec, testData);
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
    const doc = buildDocument(testUISpec, testData);
    const readinessSection = doc.content[1] as JSONContent;

    const fieldRows = (readinessSection.content ?? []).filter(
      (item: JSONContent) => item.type === 'fieldRow',
    ) as JSONContent[];

    // Verify nested path $.readiness.calibrationRequired is preserved
    expect((fieldRows[0].attrs as { path: string }).path).toBe('$.readiness.calibrationRequired');
  });

  it('omits section when all fields are hidden', () => {
    const doc = buildDocument(testUISpec, testData);

    // Check that no section with title 'Hidden Section' exists
    const hiddenSection = doc.content.find(
      (section: JSONContent) =>
        (section.attrs as { title?: string })?.title === 'Hidden Section',
    );

    expect(hiddenSection).toBeUndefined();
  });

  it('includes section heading with correct title', () => {
    const doc = buildDocument(testUISpec, testData);
    const identitySection = doc.content[0] as JSONContent;

    expect(identitySection.type).toBe('section');
    expect((identitySection.attrs as { title: string }).title).toBe('Identity');

    const heading = (identitySection.content ?? [])[0] as JSONContent;
    expect(heading.type).toBe('sectionHeading');
    expect((heading.content ?? [])[0]?.text).toBe('Identity');
  });

  it('handles empty data gracefully', () => {
    const doc = buildDocument(testUISpec, {});

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

    const doc = buildDocument(uiSpecWithMissingLabels, { someField: 'value' });
    const section = doc.content[0] as JSONContent;
    const fieldRow = (section.content ?? [])[1] as JSONContent;

    // Label should fallback to path without $. prefix
    expect((fieldRow.attrs as { label: string }).label).toBe('someField');
  });
});


describe('protocol UI projection', () => {
  it('shows structured protocol authoring fields and hides Overview', () => {
    const uiSpec = YAML.parse(
      readFileSync(join(process.cwd(), '..', 'schema', 'workflow', 'protocol.ui.yaml'), 'utf8'),
    ) as UISpec
    const doc = buildDocument(uiSpec, {
      recordId: 'PRT-test',
      kind: 'protocol',
      title: 'Cell seeding',
      version: '1.0.0',
      createdBy: 'Dr Example',
      purpose: 'Prepare seeded plates.',
      overview: 'Legacy overview should not be rendered.',
      description: '',
      roles: { materialRoles: [], labwareRoles: [], instrumentRoles: [] },
      steps: [{ stepId: 'step_1', kind: 'other', description: 'Seed cells' }],
    })

    const headings = doc.content.flatMap((section: JSONContent) =>
      (section.content ?? [])
        .filter((item: JSONContent) => item.type === 'sectionHeading')
        .map((item: JSONContent) => item.content?.[0]?.text),
    )
    const fields = doc.content.flatMap((section: JSONContent) =>
      (section.content ?? []).filter((item: JSONContent) => item.type === 'fieldRow'),
    ) as JSONContent[]
    const labels = fields.map((field) => (field.attrs as { label: string }).label)
    const widgets = fields.map((field) => (field.attrs as { widget: string }).widget)

    expect(headings).toEqual(['Protocol'])
    expect(labels).toEqual([
      'Title',
      'Version',
      'Author',
      'Purpose',
      'Materials',
      'Consumables / Labware',
      'Equipment',
      'Steps',
      'Full Protocol Text',
      'Notes',
    ])
    expect(labels).not.toContain('Overview')
    expect(labels).not.toContain('Protocol Structure')
    expect(labels).not.toContain('Structure Suggestions')
    expect(widgets.filter((widget) => widget === 'protocol-prose-authoring')).toHaveLength(3)
    expect(widgets).not.toContain('protocol-ai-suggestions')
    expect(widgets).toContain('protocol-labware-roles')
  })

  it('maps local-protocol ui spec: setup sections first, then steps', () => {
    const spec = YAML.parse(
      readFileSync(join(process.cwd(), '..', 'schema', 'workflow', 'local-protocol.ui.yaml'), 'utf8'),
    ) as UISpec
    const sections = spec.form!.sections
    const titles = sections.map((s) => s.title)
    expect(titles).toEqual(['Labwares', 'Equipment', 'Materials', 'Steps', 'Identity'])
    const widgets = sections.flatMap((s) => s.fields.map((f) => f.widget))
    expect(widgets).toContain('local-protocol-labwares')
    expect(widgets).toContain('local-protocol-equipment')
    expect(widgets).toContain('local-protocol-materials')
    expect(widgets).toContain('local-protocol-steps')
    // Setup sections come before steps (biologist reads setup first)
    expect(titles.indexOf('Materials')).toBeLessThan(titles.indexOf('Steps'))
  })
})
