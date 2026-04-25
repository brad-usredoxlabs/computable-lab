/**
 * Unit tests for composite widget types: datetime, multiselect, reflist, array, object, readonly.
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

// ============================================================================
// datetime widget tests
// ============================================================================

describe('datetime widget serialization', () => {
  it('serializes a date field correctly', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'section',
          attrs: { title: 'Dates' },
          content: [
            {
              type: 'sectionHeading',
              content: [{ type: 'text', text: 'Dates' }],
            },
            {
              type: 'fieldRow',
              attrs: {
                path: '$.startDate',
                widget: 'datetime',
                label: 'Start Date',
                value: '2024-06-15',
              },
            },
          ],
        },
      ],
    };

    const baseRecord: Record<string, unknown> = {
      startDate: '',
    };

    const result = serializeDocument(doc, baseRecord);
    expect(result.startDate).toBe('2024-06-15');
  });

  it('serializes a datetime-local field correctly', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'section',
          attrs: { title: 'Timestamps' },
          content: [
            {
              type: 'sectionHeading',
              content: [{ type: 'text', text: 'Timestamps' }],
            },
            {
              type: 'fieldRow',
              attrs: {
                path: '$.createdAt',
                widget: 'datetime',
                label: 'Created At',
                value: '2024-06-15T10:30',
              },
            },
          ],
        },
      ],
    };

    const baseRecord: Record<string, unknown> = {
      createdAt: '',
    };

    const result = serializeDocument(doc, baseRecord);
    expect(result.createdAt).toBe('2024-06-15T10:30');
  });
});

// ============================================================================
// multiselect widget tests
// ============================================================================

describe('multiselect widget serialization', () => {
  it('serializes a multiselect as an array of strings', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'section',
          attrs: { title: 'Tags' },
          content: [
            {
              type: 'sectionHeading',
              content: [{ type: 'text', text: 'Tags' }],
            },
            {
              type: 'fieldRow',
              attrs: {
                path: '$.tags',
                widget: 'multiselect',
                label: 'Tags',
                value: ['active', 'verified'],
              },
            },
          ],
        },
      ],
    };

    const baseRecord: Record<string, unknown> = {
      tags: [],
    };

    const result = serializeDocument(doc, baseRecord);
    expect(Array.isArray(result.tags)).toBe(true);
    expect(result.tags).toEqual(['active', 'verified']);
  });

  it('serializes an empty multiselect', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'section',
          attrs: { title: 'Tags' },
          content: [
            {
              type: 'sectionHeading',
              content: [{ type: 'text', text: 'Tags' }],
            },
            {
              type: 'fieldRow',
              attrs: {
                path: '$.tags',
                widget: 'multiselect',
                label: 'Tags',
                value: [],
              },
            },
          ],
        },
      ],
    };

    const baseRecord: Record<string, unknown> = {
      tags: ['default'],
    };

    const result = serializeDocument(doc, baseRecord);
    expect(result.tags).toEqual([]);
  });
});

// ============================================================================
// reflist widget tests
// ============================================================================

describe('reflist widget serialization', () => {
  it('serializes a reflist as structured reference entries', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'section',
          attrs: { title: 'References' },
          content: [
            {
              type: 'sectionHeading',
              content: [{ type: 'text', text: 'References' }],
            },
            {
              type: 'fieldRow',
              attrs: {
                path: '$.references',
                widget: 'reflist',
                label: 'References',
                value: [
                  { value: 'term-001', source: 'local' },
                  {
                    value: 'http://example.org/term-002',
                    source: 'ontology',
                    termData: {
                      label: 'Test Term',
                      iri: 'http://example.org/term-002',
                      definition: 'A test definition',
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const baseRecord: Record<string, unknown> = {
      references: [],
    };

    const result = serializeDocument(doc, baseRecord);
    expect(Array.isArray(result.references)).toBe(true);
    const refs = result.references as Array<Record<string, unknown>>;
    expect(refs.length).toBe(2);
    expect(refs[0].value).toBe('term-001');
    expect(refs[0].source).toBe('local');
    expect(refs[1].source).toBe('ontology');
    expect((refs[1].termData as { label: string })?.label).toBe('Test Term');
  });

  it('serializes a single-value reflist as a single object (serializer preserves value type)', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'section',
          attrs: { title: 'References' },
          content: [
            {
              type: 'sectionHeading',
              content: [{ type: 'text', text: 'References' }],
            },
            {
              type: 'fieldRow',
              attrs: {
                path: '$.references',
                widget: 'reflist',
                label: 'References',
                value: { value: 'single-ref', source: 'local' },
              },
            },
          ],
        },
      ],
    };

    const baseRecord: Record<string, unknown> = {
      references: [],
    };

    const result = serializeDocument(doc, baseRecord);
    // Serializer preserves the value type as-is; widget rendering handles wrapping
    expect(result.references).toEqual({ value: 'single-ref', source: 'local' });
  });
});

// ============================================================================
// array widget tests
// ============================================================================

describe('array widget serialization', () => {
  it('serializes an array of objects without dropping sibling values', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'section',
          attrs: { title: 'Components' },
          content: [
            {
              type: 'sectionHeading',
              content: [{ type: 'text', text: 'Components' }],
            },
            {
              type: 'fieldRow',
              attrs: {
                path: '$.components',
                widget: 'array',
                label: 'Components',
                value: [
                  { name: 'Reagent A', volume: 100, unit: 'uL' },
                  { name: 'Reagent B', volume: 50, unit: 'uL' },
                ],
              },
            },
          ],
        },
      ],
    };

    const baseRecord: Record<string, unknown> = {
      components: [],
      protocol: 'test-wash',
    };

    const result = serializeDocument(doc, baseRecord);
    expect(Array.isArray(result.components)).toBe(true);
    const components = result.components as Array<Record<string, unknown>>;
    expect(components.length).toBe(2);
    expect(components[0].name).toBe('Reagent A');
    expect(components[0].volume).toBe(100);
    expect(components[0].unit).toBe('uL');
    expect(components[1].name).toBe('Reagent B');
    // Sibling values must survive
    expect(result.protocol).toBe('test-wash');
  });

  it('serializes an array of primitives', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'section',
          attrs: { title: 'Keywords' },
          content: [
            {
              type: 'sectionHeading',
              content: [{ type: 'text', text: 'Keywords' }],
            },
            {
              type: 'fieldRow',
              attrs: {
                path: '$.keywords',
                widget: 'array',
                label: 'Keywords',
                value: ['qPCR', 'AhR', 'viability'],
              },
            },
          ],
        },
      ],
    };

    const baseRecord: Record<string, unknown> = {
      keywords: [],
    };

    const result = serializeDocument(doc, baseRecord);
    expect(result.keywords).toEqual(['qPCR', 'AhR', 'viability']);
  });
});

// ============================================================================
// object widget tests
// ============================================================================

describe('object widget serialization', () => {
  it('serializes a nested object correctly', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'section',
          attrs: { title: 'Settings' },
          content: [
            {
              type: 'sectionHeading',
              content: [{ type: 'text', text: 'Settings' }],
            },
            {
              type: 'fieldRow',
              attrs: {
                path: '$.settings',
                widget: 'object',
                label: 'Settings',
                value: {
                  threshold: 42,
                  enabled: true,
                  name: 'Test Protocol',
                },
              },
            },
          ],
        },
      ],
    };

    const baseRecord: Record<string, unknown> = {
      settings: {
        threshold: 0,
        enabled: false,
        name: '',
      },
    };

    const result = serializeDocument(doc, baseRecord);
    expect(result.settings).toBeDefined();
    const settings = result.settings as Record<string, unknown>;
    expect(settings.threshold).toBe(42);
    expect(settings.enabled).toBe(true);
    expect(settings.name).toBe('Test Protocol');
  });

  it('serializes a nested object alongside sibling fields', () => {
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
                value: 'Protocol-001',
              },
            },
          ],
        },
        {
          type: 'section',
          attrs: { title: 'Settings' },
          content: [
            {
              type: 'sectionHeading',
              content: [{ type: 'text', text: 'Settings' }],
            },
            {
              type: 'fieldRow',
              attrs: {
                path: '$.settings',
                widget: 'object',
                label: 'Settings',
                value: { threshold: 100, enabled: true },
              },
            },
          ],
        },
      ],
    };

    const baseRecord: Record<string, unknown> = {
      name: '',
      settings: { threshold: 0, enabled: false },
    };

    const result = serializeDocument(doc, baseRecord);
    expect(result.name).toBe('Protocol-001');
    const settings = result.settings as Record<string, unknown>;
    expect(settings.threshold).toBe(100);
    expect(settings.enabled).toBe(true);
  });
});

// ============================================================================
// readonly widget tests
// ============================================================================

describe('readonly widget serialization', () => {
  it('serializes a readonly field correctly', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'section',
          attrs: { title: 'Metadata' },
          content: [
            {
              type: 'sectionHeading',
              content: [{ type: 'text', text: 'Metadata' }],
            },
            {
              type: 'fieldRow',
              attrs: {
                path: '$.createdAt',
                widget: 'readonly',
                label: 'Created At',
                value: '2024-01-15T08:00',
              },
            },
          ],
        },
      ],
    };

    const baseRecord: Record<string, unknown> = {
      createdAt: '',
    };

    const result = serializeDocument(doc, baseRecord);
    expect(result.createdAt).toBe('2024-01-15T08:00');
  });

  it('serializes a readonly object field without JSON formatting', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'section',
          attrs: { title: 'Metadata' },
          content: [
            {
              type: 'sectionHeading',
              content: [{ type: 'text', text: 'Metadata' }],
            },
            {
              type: 'fieldRow',
              attrs: {
                path: '$.metadata',
                widget: 'readonly',
                label: 'Metadata',
                value: { version: '1.0', author: 'test' },
              },
            },
          ],
        },
      ],
    };

    const baseRecord: Record<string, unknown> = {
      metadata: {},
    };

    const result = serializeDocument(doc, baseRecord);
    expect(result.metadata).toEqual({ version: '1.0', author: 'test' });
  });
});

// ============================================================================
// Mixed composite widget tests
// ============================================================================

describe('mixed composite widget round-trip', () => {
  it('round-trips a record with multiple composite types without clobbering', () => {
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
                value: 'Protocol-001',
              },
            },
            {
              type: 'fieldRow',
              attrs: {
                path: '$.createdAt',
                widget: 'datetime',
                label: 'Created At',
                value: '2024-06-15T10:30',
              },
            },
          ],
        },
        {
          type: 'section',
          attrs: { title: 'Configuration' },
          content: [
            {
              type: 'sectionHeading',
              content: [{ type: 'text', text: 'Configuration' }],
            },
            {
              type: 'fieldRow',
              attrs: {
                path: '$.tags',
                widget: 'multiselect',
                label: 'Tags',
                value: ['active', 'reviewed'],
              },
            },
            {
              type: 'fieldRow',
              attrs: {
                path: '$.components',
                widget: 'array',
                label: 'Components',
                value: [
                  { name: 'Reagent A', volume: 100 },
                  { name: 'Reagent B', volume: 50 },
                ],
              },
            },
            {
              type: 'fieldRow',
              attrs: {
                path: '$.settings',
                widget: 'object',
                label: 'Settings',
                value: { threshold: 42, enabled: true },
              },
            },
          ],
        },
      ],
    };

    const baseRecord: Record<string, unknown> = {
      name: '',
      createdAt: '',
      tags: [],
      components: [],
      settings: { threshold: 0, enabled: false },
    };

    const result = serializeDocument(doc, baseRecord);

    // Verify all fields are present and correct
    expect(result.name).toBe('Protocol-001');
    expect(result.createdAt).toBe('2024-06-15T10:30');
    expect(result.tags).toEqual(['active', 'reviewed']);
    expect(Array.isArray(result.components)).toBe(true);
    const components = result.components as Array<Record<string, unknown>>;
    expect(components.length).toBe(2);
    expect(components[0].name).toBe('Reagent A');
    expect(components[0].volume).toBe(100);
    expect(components[1].name).toBe('Reagent B');
    expect(components[1].volume).toBe(50);
    const settings = result.settings as Record<string, unknown>;
    expect(settings.threshold).toBe(42);
    expect(settings.enabled).toBe(true);
  });

  it('isDirty returns false when composite values are unchanged', () => {
    const original: Record<string, unknown> = {
      name: 'Protocol-001',
      tags: ['active'],
      components: [{ name: 'A', volume: 100 }],
      settings: { threshold: 42 },
    };

    const current: Record<string, unknown> = {
      name: 'Protocol-001',
      tags: ['active'],
      components: [{ name: 'A', volume: 100 }],
      settings: { threshold: 42 },
    };

    expect(isDirty(original, current)).toBe(false);
  });

  it('isDirty returns true when a composite value changes', () => {
    const original: Record<string, unknown> = {
      name: 'Protocol-001',
      tags: ['active'],
      components: [{ name: 'A', volume: 100 }],
      settings: { threshold: 42 },
    };

    const current: Record<string, unknown> = {
      name: 'Protocol-001',
      tags: ['active', 'reviewed'], // Changed
      components: [{ name: 'A', volume: 100 }],
      settings: { threshold: 42 },
    };

    expect(isDirty(original, current)).toBe(true);
  });
});
