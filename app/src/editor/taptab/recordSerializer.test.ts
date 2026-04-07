/**
 * Unit tests for recordSerializer.ts
 */

import { describe, it, expect } from 'vitest';
import { serializeDocument, isDirty } from './recordSerializer';

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
