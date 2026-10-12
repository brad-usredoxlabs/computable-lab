/**
 * Unit tests for recordSerializer.ts
 */

import { describe, it, expect } from 'vitest';
import { serializeDocument, isDirty, stripSystemProvenance } from './recordSerializer';

/**
 * Minimal TipTap JSON content node type - matches @tiptap/core JSONContent.
 */
interface JSONContent {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: JSONContent[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

describe('serializeDocument', () => {
  it('serializes flat fields correctly (name, status)', () => {
    // Build a minimal TipTap doc JSON fixture by hand
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'section',
          attrs: { title: 'Identity' },
          content: [
            {
              type: 'sectionHeading',
              content: [{ type: 'text', text: 'Identity' }],
            },
            {
              type: 'fieldRow',
              attrs: {
                path: '$.name',
                widget: 'text',
                label: 'Name',
                value: 'Centrifuge-001',
              },
            },
            {
              type: 'fieldRow',
              attrs: {
                path: '$.status',
                widget: 'select',
                label: 'Status',
                value: 'active',
              },
            },
          ],
        },
      ],
    };

    const baseRecord: Record<string, unknown> = {
      name: '',
      status: 'inactive',
    };

    const result = serializeDocument(doc, baseRecord);

    expect(result.name).toBe('Centrifuge-001');
    expect(result.status).toBe('active');
  });

  it('serializes nested fields correctly (readiness.calibrationRequired)', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'section',
          attrs: { title: 'Readiness' },
          content: [
            {
              type: 'sectionHeading',
              content: [{ type: 'text', text: 'Readiness' }],
            },
            {
              type: 'fieldRow',
              attrs: {
                path: '$.readiness.calibrationRequired',
                widget: 'checkbox',
                label: 'Calibration Required',
                value: true,
              },
            },
            {
              type: 'fieldRow',
              attrs: {
                path: '$.readiness.lastCalibration',
                widget: 'date',
                label: 'Last Calibration',
                value: '2024-01-15',
              },
            },
          ],
        },
      ],
    };

    const baseRecord: Record<string, unknown> = {
      readiness: {
        calibrationRequired: false,
        lastCalibration: '',
      },
    };

    const result = serializeDocument(doc, baseRecord);

    expect(result.readiness).toBeDefined();
    expect((result.readiness as Record<string, unknown>).calibrationRequired).toBe(true);
    expect((result.readiness as Record<string, unknown>).lastCalibration).toBe('2024-01-15');
  });

  it('does not mutate the original baseRecord', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'section',
          attrs: { title: 'Identity' },
          content: [
            {
              type: 'sectionHeading',
              content: [{ type: 'text', text: 'Identity' }],
            },
            {
              type: 'fieldRow',
              attrs: {
                path: '$.name',
                widget: 'text',
                label: 'Name',
                value: 'New Name',
              },
            },
          ],
        },
      ],
    };

    const baseRecord: Record<string, unknown> = {
      name: 'Original Name',
    };

    const originalName = baseRecord.name;
    const result = serializeDocument(doc, baseRecord);

    // Original should not be mutated
    expect(baseRecord.name).toBe(originalName);
    // Result should have the new value
    expect(result.name).toBe('New Name');
  });

  it('handles mixed flat and nested fields', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'section',
          attrs: { title: 'Mixed' },
          content: [
            {
              type: 'sectionHeading',
              content: [{ type: 'text', text: 'Mixed' }],
            },
            {
              type: 'fieldRow',
              attrs: {
                path: '$.name',
                widget: 'text',
                label: 'Name',
                value: 'Test Equipment',
              },
            },
            {
              type: 'fieldRow',
              attrs: {
                path: '$.settings.threshold',
                widget: 'number',
                label: 'Threshold',
                value: 42,
              },
            },
          ],
        },
      ],
    };

    const baseRecord: Record<string, unknown> = {
      name: '',
      settings: {
        threshold: 0,
      },
    };

    const result = serializeDocument(doc, baseRecord);

    expect(result.name).toBe('Test Equipment');
    expect((result.settings as Record<string, unknown>).threshold).toBe(42);
  });

  it('handles empty document gracefully', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [],
    };

    const baseRecord: Record<string, unknown> = {
      name: 'Original',
    };

    const result = serializeDocument(doc, baseRecord);

    // Should return a clone of the base record with no changes
    expect(result.name).toBe('Original');
  });

  it('strips system provenance from a serialized record', () => {
    const payload: Record<string, unknown> = {
      name: 'X',
      createdBy: 'USR-BRAD',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    };
    const out = stripSystemProvenance(structuredClone(payload));
    expect(out).not.toHaveProperty('createdBy');
    expect(out).not.toHaveProperty('createdAt');
    expect(out).not.toHaveProperty('updatedAt');
    expect(out.name).toBe('X');
  });
});

/**
 * EDITOR-9 — empty optional slots must serialize to ABSENCE.
 *
 * Brad's field report (sandbox, :5192): saving a person with ONLY required
 * fields 422s with
 *   "Validation failed: /organizationId: Expected type: string;
 *    /contact/phone: Expected type: string"
 * person.schema.yaml declares both as optional `type: string` and is correct.
 * The save path wrote a typed empty (null for an untouched widget — FieldRow's
 * attr default is null; '' for a cleared one) into a slot whose valid states
 * are ABSENT or a value of the declared type (exactOptionalPropertyTypes).
 *
 * Contract: the serializer's ONE shared omission helper decides emission for
 * every widget. An empty/never-set value is ABSENT from the payload, and a
 * cleared optional must also DELETE a stale base-payload value at that path
 * (otherwise "clear" silently un-clears). Required-but-empty is omitted too —
 * the server's required-check is the correct authority, the client must not
 * fabricate one.
 */
describe('serializeDocument — empty optional omission (EDITOR-9)', () => {
  /** Person-shaped doc: required slots filled, optional slots untouched. */
  function personDoc(optionalValue: unknown): JSONContent {
    return {
      type: 'doc',
      content: [
        {
          type: 'section',
          attrs: { title: 'Identity' },
          content: [
            { type: 'sectionHeading', content: [{ type: 'text', text: 'Identity' }] },
            { type: 'fieldRow', attrs: { path: '$.kind', widget: 'text', label: 'Kind', required: true, value: 'person' } },
            { type: 'fieldRow', attrs: { path: '$.id', widget: 'text', label: 'Id', required: true, value: 'PER-EDITOR9' } },
            { type: 'fieldRow', attrs: { path: '$.displayName', widget: 'text', label: 'Display Name', required: true, value: 'Editor Nine' } },
            { type: 'fieldRow', attrs: { path: '$.status', widget: 'select', label: 'Status', required: true, value: 'active' } },
            // Optional, never touched: the mapper leaves the widget's default.
            { type: 'fieldRow', attrs: { path: '$.organizationId', widget: 'text', label: 'Organization', value: optionalValue } },
            { type: 'fieldRow', attrs: { path: '$.contact.email', widget: 'text', label: 'Email', value: optionalValue } },
            { type: 'fieldRow', attrs: { path: '$.contact.phone', widget: 'text', label: 'Phone', value: optionalValue } },
          ],
        },
      ],
    };
  }

  const personBase: Record<string, unknown> = {
    kind: 'person',
    id: 'PER-EDITOR9',
    displayName: 'Editor Nine',
    status: 'active',
  };

  it('RED-1: an untouched optional (null widget value) is ABSENT from the payload', () => {
    const result = serializeDocument(personDoc(null), structuredClone(personBase));

    // Required slots are present.
    expect(result.kind).toBe('person');
    expect(result.displayName).toBe('Editor Nine');

    // The defect: null written into an optional `type: string` slot 422s with
    // "Expected type: string". Absence is the only correct emission.
    expect(result).not.toHaveProperty('organizationId');
    expect(result).not.toHaveProperty('contact');
  });

  it('RED-2: an untouched optional holding an empty string is ABSENT', () => {
    const result = serializeDocument(personDoc(''), structuredClone(personBase));

    expect(result).not.toHaveProperty('organizationId');
    expect(result).not.toHaveProperty('contact');
  });

  it('filled optional is PRESENT with its value (no over-omission)', () => {
    const doc = personDoc(null);
    // Fill only the optional slots the user chose to fill.
    // section.content: [0]=heading, [1..4]=required rows, [5]=organizationId,
    // [6]=contact.email, [7]=contact.phone.
    (doc.content![0]!.content![5]!.attrs as Record<string, unknown>).value = 'ORG-LANE1';
    (doc.content![0]!.content![6]!.attrs as Record<string, unknown>).value = 'editor9@example.org';

    const result = serializeDocument(doc, structuredClone(personBase));

    expect(result.organizationId).toBe('ORG-LANE1');
    const contact = result.contact as Record<string, unknown>;
    expect(contact.email).toBe('editor9@example.org');
    // The untouched sibling stays absent, not ''.
    expect(contact).not.toHaveProperty('phone');
  });

  it('RED-3: a CLEARED optional deletes the stale base-payload value (absent, not \'\')', () => {
    // The stored record HAS values at these paths; the widgets now hold the
    // cleared value. Mirroring the ref contract's deleteValueAtPath behavior,
    // the payload must drop them — otherwise the PUT re-writes the old value
    // and the clear silently un-clears.
    const stored: Record<string, unknown> = {
      ...structuredClone(personBase),
      organizationId: 'ORG-STALE',
      contact: { email: 'stale@example.org', phone: '555-0100' },
    };

    const result = serializeDocument(personDoc(''), structuredClone(stored));

    expect(result).not.toHaveProperty('organizationId');
    expect(result).not.toHaveProperty('contact');
  });

  it('clearing one nested optional keeps its filled siblings', () => {
    const stored: Record<string, unknown> = {
      ...structuredClone(personBase),
      contact: { email: 'keep@example.org', phone: '555-0100' },
    };

    const doc = personDoc(null);
    (doc.content![0]!.content![6]!.attrs as Record<string, unknown>).value = 'keep@example.org';

    const result = serializeDocument(doc, structuredClone(stored));

    const contact = result.contact as Record<string, unknown>;
    expect(contact.email).toBe('keep@example.org');
    expect(contact).not.toHaveProperty('phone');
  });

  it('required-but-empty is omitted from the payload (the server owns requiredness)', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'section',
          attrs: { title: 'Identity' },
          content: [
            { type: 'sectionHeading', content: [{ type: 'text', text: 'Identity' }] },
            { type: 'fieldRow', attrs: { path: '$.displayName', widget: 'text', label: 'Display Name', required: true, value: '' } },
          ],
        },
      ],
    };

    const result = serializeDocument(doc, {});

    // The client simply omits; the server's required-check is the real,
    // desired validation error. No client-side required check is fabricated.
    expect(result).not.toHaveProperty('displayName');
  });

  it('number widget: a cleared input is ABSENT, but 0 is a real value and stays', () => {
    const numberDoc = (value: unknown): JSONContent => ({
      type: 'doc',
      content: [
        {
          type: 'section',
          attrs: { title: 'Spec' },
          content: [
            { type: 'sectionHeading', content: [{ type: 'text', text: 'Spec' }] },
            { type: 'fieldRow', attrs: { path: '$.threshold', widget: 'number', label: 'Threshold', value } },
          ],
        },
      ],
    });

    // The inline number input commits '' when the user clears the field.
    expect(serializeDocument(numberDoc(''), { threshold: 42 })).not.toHaveProperty('threshold');
    expect(serializeDocument(numberDoc(null), { threshold: 42 })).not.toHaveProperty('threshold');

    // 0 is a value, not an empty.
    const zero = serializeDocument(numberDoc(0), {});
    expect(zero.threshold).toBe(0);
  });

  it('false and empty arrays are real values and stay (no over-omission)', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'section',
          attrs: { title: 'Flags' },
          content: [
            { type: 'sectionHeading', content: [{ type: 'text', text: 'Flags' }] },
            { type: 'fieldRow', attrs: { path: '$.calibrationRequired', widget: 'checkbox', label: 'Calibration', value: false } },
            { type: 'fieldRow', attrs: { path: '$.tags', widget: 'multiselect', label: 'Tags', value: [] } },
          ],
        },
      ],
    };

    const result = serializeDocument(doc, {});
    expect(result.calibrationRequired).toBe(false);
    expect(result.tags).toEqual([]);
  });

  it('an untouched composite slot (null attr default) is ABSENT, not null', () => {
    // TipTap fills an absent attr with the node default (null), so an
    // untouched array/object row carries null — writing null into a
    // `type: array` slot 422s "Expected type: array" just like the strings.
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'section',
          attrs: { title: 'Lists' },
          content: [
            { type: 'sectionHeading', content: [{ type: 'text', text: 'Lists' }] },
            { type: 'fieldRow', attrs: { path: '$.labIds', widget: 'multiselect', label: 'Labs', value: null } },
            { type: 'fieldRow', attrs: { path: '$.settings', widget: 'object', label: 'Settings', value: null } },
          ],
        },
      ],
    };

    const result = serializeDocument(doc, {});
    expect(result).not.toHaveProperty('labIds');
    expect(result).not.toHaveProperty('settings');
  });

  it('ref-widget fences are unchanged (QMS-6E): null and \'—\' refs absent, structured ref present', () => {
    const refDoc = (value: unknown): JSONContent => ({
      type: 'doc',
      content: [
        {
          type: 'section',
          attrs: { title: 'Signers' },
          content: [
            { type: 'sectionHeading', content: [{ type: 'text', text: 'Signers' }] },
            { type: 'fieldRow', attrs: { path: '$.reviewerRef', widget: 'ref', label: 'Reviewer', value } },
          ],
        },
      ],
    });

    expect(serializeDocument(refDoc(null), { reviewerRef: { kind: 'record', type: 'user', id: 'USR-STALE' } })).not.toHaveProperty('reviewerRef');
    expect(serializeDocument(refDoc('—'), { reviewerRef: { kind: 'record', type: 'user', id: 'USR-STALE' } })).not.toHaveProperty('reviewerRef');

    const kept = serializeDocument(refDoc({ kind: 'record', type: 'user', id: 'USR-BRAD' }), {});
    expect(kept.reviewerRef).toEqual({ kind: 'record', type: 'user', id: 'USR-BRAD' });
  });
});

describe('isDirty', () => {
  it('returns false for identical records', () => {
    const original: Record<string, unknown> = {
      name: 'Centrifuge-001',
      status: 'active',
      readiness: {
        calibrationRequired: true,
      },
    };

    const current: Record<string, unknown> = {
      name: 'Centrifuge-001',
      status: 'active',
      readiness: {
        calibrationRequired: true,
      },
    };

    expect(isDirty(original, current)).toBe(false);
  });

  it('returns true when a value changes', () => {
    const original: Record<string, unknown> = {
      name: 'Centrifuge-001',
      status: 'active',
    };

    const current: Record<string, unknown> = {
      name: 'Centrifuge-001',
      status: 'inactive', // Changed
    };

    expect(isDirty(original, current)).toBe(true);
  });

  it('returns true when a nested value changes', () => {
    const original: Record<string, unknown> = {
      name: 'Centrifuge-001',
      readiness: {
        calibrationRequired: false,
      },
    };

    const current: Record<string, unknown> = {
      name: 'Centrifuge-001',
      readiness: {
        calibrationRequired: true, // Changed
      },
    };

    expect(isDirty(original, current)).toBe(true);
  });

  it('returns true when a new field is added', () => {
    const original: Record<string, unknown> = {
      name: 'Centrifuge-001',
    };

    const current: Record<string, unknown> = {
      name: 'Centrifuge-001',
      status: 'active', // New field
    };

    expect(isDirty(original, current)).toBe(true);
  });

  it('returns true when a field is removed', () => {
    const original: Record<string, unknown> = {
      name: 'Centrifuge-001',
      status: 'active',
    };

    const current: Record<string, unknown> = {
      name: 'Centrifuge-001',
    };

    expect(isDirty(original, current)).toBe(true);
  });

  it('returns false for empty objects', () => {
    const original: Record<string, unknown> = {};
    const current: Record<string, unknown> = {};

    expect(isDirty(original, current)).toBe(false);
  });
});
