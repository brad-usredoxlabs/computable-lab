/**
 * Unit tests for documentMapper.ts
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { describe, it, expect } from 'vitest';
import { buildDocument, buildProjectionDocument } from './documentMapper';
import type { UISpec } from '../../types/uiSpec';
import type { ArrayItemHintField, ObjectFieldConfig } from './types';

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
      'Notes',
    ])
    expect(labels).not.toContain('Overview')
    expect(labels).not.toContain('Protocol Structure')
    expect(labels).not.toContain('Structure Suggestions')
    expect(widgets.filter((widget) => widget === 'protocol-prose-authoring')).toHaveLength(2)
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

// ============================================================================
// WIDGET-R1 fix-run 3 (data-path, ruling ARCHD3L1T1440 DECISION: OPT-A) —
// nested item-hint `fields` forwarding through buildProjectionDocument.
// ============================================================================
//
// The server projection forwards the ui.yaml item-hint VERBATIM — its
// FieldHint is self-recursive (`items?: FieldHint; fields?: FieldHint[]`),
// so the `$.roles` item-hint's role_ref / context_ref each arrive with
// their own `fields` (kind / type / id). The CLIENT mapper silently
// flattened them before the widget ever saw them: `attrs.itemHint.fields`
// entries came out WITHOUT `fields` (measured by the D2 probe as
// hasFields:false / DROPPED=true) and the objectConfig sibling map
// dropped the same member on its `properties` entries. Flattened inputs
// reach the C2 gate as strings in ref-object positions → 422
// `Expected type: object` (gate shot 36).
//
// The fix (this run) is generic recursive forwarding in documentMapper
// only: both maps forward a non-empty `fields` member recursively (same
// conditional-spread pattern as the existing options map and as
// ArrayWidget.mapHintFieldsToObjectFields). A field WITHOUT nested
// fields must map byte-identically (no `fields: undefined` /
// `fields: []` key appears) — the flat-parity pins below stay green
// before AND after the fix.
//
// RED at branch base 82f7cd3a: the two nested-carry-through legs fail
// (the `fields` member is dropped); every flat-parity assertion in them
// is GREEN at base. GREEN after the mapper edit.
// ============================================================================

/** The REAL assertion.ui.yaml `$.roles` slot WITH its nested item-hint
 *  (read first-hand, no hand-invented fixture — mirrors
 *  ObjectWidget.nested.test.tsx's realRolesItemHint loader). */
function realRolesSlotFromAssertionUiYaml(): Record<string, unknown> {
  const ui = YAML.parse(
    readFileSync(join(process.cwd(), '..', 'schema', 'knowledge', 'assertion.ui.yaml'), 'utf8'),
  ) as { form?: { sections?: Array<{ fields?: Array<Record<string, unknown>> }> } };
  for (const section of ui.form?.sections ?? []) {
    for (const field of section.fields ?? []) {
      if (field.path === '$.roles') {
        return field;
      }
    }
  }
  throw new Error('assertion.ui.yaml declares no $.roles slot');
}

/** The fieldRow attrs for `path` in a projection document. */
function projectionFieldRowAttrs(
  doc: { type: string; content: JSONContent[] },
  path: string,
): Record<string, unknown> {
  const row = (doc.content as JSONContent[]).flatMap((section: JSONContent) =>
    (section.content ?? []).filter((item: JSONContent) => item.type === 'fieldRow'),
  ).find((row: JSONContent) => (row.attrs as { path?: string })?.path === path);
  expect(row, `the projection document must contain a fieldRow for ${path}`).toBeTruthy();
  return row!.attrs as Record<string, unknown>;
}

describe('buildProjectionDocument nested item-hint fields (WIDGET-R1 fix-run 3, ARCHD3L1T1440 OPT-A)', () => {
  it('forwards the REAL assertion.ui.yaml $.roles item-hint nested `fields` through TWO levels (DROPPED=false); flat entries stay byte-identical (no `fields` key appears)', () => {
    const roles = realRolesSlotFromAssertionUiYaml()
    const rolesItems = roles.items as Record<string, unknown> & {
      path: string
      widget: string
      label: string
      fields: ArrayItemHintField[]
    }
    // Sanity — the REAL data IS nested (the gap the probe measured):
    // role_ref + context_ref each declare their own `fields`.
    expect(rolesItems.fields.map((f) => f.path)).toEqual(['role_ref', 'context_ref'])
    for (const nested of ['role_ref', 'context_ref']) {
      const entry = rolesItems.fields.find((f) => f.path === nested) as { fields?: unknown[] }
      expect(Array.isArray(entry.fields) && entry.fields.length === 3, `${nested} must declare 3 nested fields in the real ui.yaml`).toBe(true)
    }

    const doc = buildProjectionDocument(
      [{ id: 'sec1', kind: 'section', label: 'Roles', slotIds: ['roles-slot'] }],
      [{ id: 'roles-slot', path: '$.roles', label: 'Roles', widget: 'array', items: rolesItems }],
      {},
    )
    const attrs = projectionFieldRowAttrs(doc, '$.roles')
    const itemHint = attrs.itemHint as {
      path?: string
      widget?: string
      label?: string
      fields?: Array<Record<string, unknown>>
    }
    expect(itemHint, 'the array slot must carry its itemHint').toBeTruthy()
    expect(itemHint.path).toBe(rolesItems.path)
    expect(itemHint.widget).toBe(rolesItems.widget)
    expect(itemHint.label).toBe(rolesItems.label)
    expect(itemHint.fields?.map((f) => f.path)).toEqual(['role_ref', 'context_ref'])

    for (const nested of ['role_ref', 'context_ref']) {
      const input = rolesItems.fields.find((f) => f.path === nested) as unknown as { fields: ArrayItemHintField[] }
      const entry = itemHint.fields!.find((f) => f.path === nested) as Record<string, unknown>
      const nestedFields = (entry.fields as Array<Record<string, unknown>> | undefined)!
      expect(nestedFields, `${nested} must carry its nested fields through the itemHint map`).toBeTruthy()
      // THE DROPPED=false SHAPE (RED at base): the nested `fields` are
      // carried through the itemHint map — level 1 (present, all three
      // sub-fields) and level 2 (every sub-field member forwarded
      // verbatim, `required` normalized to false exactly like the
      // top-level entries). toEqual is key-presence-sensitive: the input
      // entries carry no `fields` key, so this ALSO pins that no
      // `fields` key is invented on the flat nested entries.
      expect(nestedFields, `${nested} must carry its nested fields through the itemHint map`).toEqual(
        input.fields.map((f) => ({ ...f, required: f.required ?? false })),
      )
      expect(nestedFields.map((f) => f.path)).toEqual(['kind', 'type', 'id'])
      for (const inner of nestedFields) {
        expect('fields' in inner, `${nested}.${inner.path} is flat — no fields key may appear`).toBe(false)
        expect(inner.required).toBe(false) // normalized like the top-level entries
        expect('options' in inner).toBe(inner.path === 'kind') // flat-parity pin: options forwarded on kind, absent elsewhere
        expect(inner.widget).toBe(inner.path === 'kind' ? 'select' : 'text')
      }
    }
  })

  it('forwards nested `fields` through the objectConfig sibling map (top-level `object` slot); flat entries stay byte-identical', () => {
    const slot: { id: string; path: string; label: string; widget: 'object'; properties: ObjectFieldConfig[] } = {
      id: 'outcome-slot',
      path: '$.outcome',
      label: 'Outcome',
      widget: 'object' as const,
      properties: [
        { name: 'measure', widget: 'text', label: 'Measure' },
        {
          name: 'device',
          widget: 'object',
          label: 'Device',
          fields: [
            { name: 'id', widget: 'text', label: 'Device ID' },
            { name: 'model', widget: 'text', label: 'Model', help: 'device model' },
          ],
        },
      ],
    }
    const doc = buildProjectionDocument(
      [{ id: 'sec1', kind: 'section', label: 'Outcome', slotIds: ['outcome-slot'] }],
      [slot],
      {},
    )
    const attrs = projectionFieldRowAttrs(doc, '$.outcome')
    const objectConfig = attrs.objectConfig as { properties: Array<Record<string, unknown>> }
    expect(objectConfig, 'the object slot must carry its objectConfig').toBeTruthy()
    expect(objectConfig.properties.map((p) => p.name)).toEqual(['measure', 'device'])

    // Flat entry — byte-identical to today (the pre-existing flat-parity
    // pin: no `fields` key may appear on a flat entry).
    const measure = objectConfig.properties.find((p) => p.name === 'measure') as Record<string, unknown>
    expect(measure).toEqual({ name: 'measure', widget: 'text', label: 'Measure', help: undefined, required: false })
    expect('fields' in measure).toBe(false)

    // THE DROPPED=false SHAPE (RED at base): the nested entry carries
    // `fields` through (as ObjectFieldConfig entries — the objectConfig
    // shape is name-keyed), and the nested entries are flat (level 2).
    const device = objectConfig.properties.find((p) => p.name === 'device') as Record<string, unknown>
    const deviceFields = device.fields as Array<Record<string, unknown>> | undefined
    expect(deviceFields, 'device must carry its nested fields through the objectConfig map').toEqual([
      { name: 'id', widget: 'text', label: 'Device ID', help: undefined, required: false },
      { name: 'model', widget: 'text', label: 'Model', help: 'device model', required: false },
    ])
    for (const inner of deviceFields!) {
      expect('fields' in inner, `${inner.name} is flat — no fields key may appear`).toBe(false)
    }
  })
})
