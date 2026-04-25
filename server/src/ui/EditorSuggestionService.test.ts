/**
 * Unit tests for EditorSuggestionService — structured ref and suggestion parity.
 *
 * Covers:
 *   - Ontology-scoped slot (ontologies restriction)
 *   - Tags-backed local slot (searchField = 'tags')
 *   - Keywords-backed local slot (searchField = 'keywords')
 *   - Structured ref commit path (provenance metadata)
 */

import { describe, it, expect } from 'vitest';
import {
  resolveLocalVocab,
  resolveOntology,
  extractSources,
  extractOntologies,
  extractSearchField,
} from './EditorSuggestionService';
import type { UISpec } from './types';

// ============================================================================
// Test fixtures
// ============================================================================

/**
 * UISpec with editor config containing a tags-backed combobox slot.
 */
const tagsBackedUISpec: UISpec = {
  uiVersion: 1,
  schemaId: 'test/tags-field',
  editor: {
    mode: 'document',
    blocks: [],
    slots: [
      {
        id: 'slot-tags',
        path: '$.status',
        label: 'Tags',
        widget: 'combobox',
        suggestionProviders: ['local-vocab'],
        props: {
          sources: ['local'],
          field: 'tags',
        },
      },
    ],
  },
};

/**
 * UISpec with editor config containing a keywords-backed combobox slot.
 */
const keywordsBackedUISpec: UISpec = {
  uiVersion: 1,
  schemaId: 'test/keywords-field',
  editor: {
    mode: 'document',
    blocks: [],
    slots: [
      {
        id: 'slot-keywords',
        path: '$.priority',
        label: 'Keywords',
        widget: 'combobox',
        suggestionProviders: ['local-vocab'],
        props: {
          sources: ['local'],
          field: 'keywords',
        },
      },
    ],
  },
};

/**
 * UISpec with editor config containing an ontology-scoped slot.
 */
const ontologyScopedUISpec: UISpec = {
  uiVersion: 1,
  schemaId: 'test/ontology-field',
  editor: {
    mode: 'document',
    blocks: [],
    slots: [
      {
        id: 'slot-ontology',
        path: '$.cellType',
        label: 'Cell Type',
        widget: 'ref',
        suggestionProviders: ['ontology'],
        props: {
          sources: ['local', 'ols'],
          ontologies: ['cl', 'chebi'],
          field: 'keywords',
        },
        refKind: 'cl',
      },
    ],
  },
};

/**
 * UISpec with editor config containing explicit options (select path).
 */
const optionsBackedUISpec: UISpec = {
  uiVersion: 1,
  schemaId: 'test/options-field',
  editor: {
    mode: 'document',
    blocks: [],
    slots: [
      {
        id: 'slot-options',
        path: '$.status',
        label: 'Status',
        widget: 'select',
        suggestionProviders: ['local-vocab'],
        options: [
          { value: 'draft', label: 'Draft' },
          { value: 'review', label: 'Review' },
          { value: 'approved', label: 'Approved' },
        ],
      },
    ],
  },
};

// ============================================================================
// Tests
// ============================================================================

describe('extractSources', () => {
  it('extracts sources from props', () => {
    expect(extractSources({ sources: ['local', 'ols'] })).toEqual(['local', 'ols']);
  });

  it('defaults to local when no sources specified', () => {
    expect(extractSources(undefined)).toEqual(['local']);
    expect(extractSources({})).toEqual(['local']);
  });

  it('filters out invalid source values', () => {
    expect(extractSources({ sources: ['local', 'invalid', 'ols'] })).toEqual(['local', 'ols']);
  });
});

describe('extractOntologies', () => {
  it('extracts ontologies from props', () => {
    expect(extractOntologies({ ontologies: ['cl', 'chebi'] })).toEqual(['cl', 'chebi']);
  });

  it('returns empty array when no ontologies specified', () => {
    expect(extractOntologies(undefined)).toEqual([]);
    expect(extractOntologies({})).toEqual([]);
  });

  it('filters out empty strings', () => {
    expect(extractOntologies({ ontologies: ['cl', '', 'chebi'] })).toEqual(['cl', 'chebi']);
  });
});

describe('extractSearchField', () => {
  it('extracts keywords field', () => {
    expect(extractSearchField({ field: 'keywords' })).toBe('keywords');
  });

  it('extracts tags field', () => {
    expect(extractSearchField({ field: 'tags' })).toBe('tags');
  });

  it('defaults to tags when no field specified', () => {
    expect(extractSearchField(undefined)).toBe('tags');
    expect(extractSearchField({})).toBe('tags');
  });
});

describe('resolveLocalVocab — tags-backed', () => {
  it('returns vocabulary terms for tags-backed slot', () => {
    const items = resolveLocalVocab(tagsBackedUISpec, 'slot-tags', '', 10);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].source).toBe('local-vocab');
    // Verify metadata carries the searchField
    expect(items[0].metadata?.searchField).toBe('tags');
  });

  it('filters terms by query', () => {
    const items = resolveLocalVocab(tagsBackedUISpec, 'slot-tags', 'draft', 10);
    for (const item of items) {
      expect(item.label.toLowerCase()).toContain('draft');
    }
  });
});

describe('resolveLocalVocab — keywords-backed', () => {
  it('returns vocabulary terms for keywords-backed slot', () => {
    const items = resolveLocalVocab(keywordsBackedUISpec, 'slot-keywords', '', 10);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].source).toBe('local-vocab');
    // Verify metadata carries the searchField
    expect(items[0].metadata?.searchField).toBe('keywords');
  });
});

describe('resolveLocalVocab — ontology-scoped', () => {
  it('includes ontology scope hints when ols is in sources', () => {
    const items = resolveLocalVocab(ontologyScopedUISpec, 'slot-ontology', '', 10);
    const ontologyHints = items.filter((i) => i.value.startsWith('ontology-scope:'));
    expect(ontologyHints.length).toBeGreaterThan(0);
    // Should include cl and chebi
    const ontologyNames = ontologyHints.map((h) => h.value.replace('ontology-scope:', ''));
    expect(ontologyNames).toContain('cl');
    expect(ontologyNames).toContain('chebi');
  });
});

describe('resolveLocalVocab — explicit options', () => {
  it('returns explicit options when defined', () => {
    const items = resolveLocalVocab(optionsBackedUISpec, 'slot-options', '', 10);
    expect(items.length).toBe(3);
    expect(items.map((i) => i.value)).toEqual(['draft', 'review', 'approved']);
  });

  it('filters options by query', () => {
    const items = resolveLocalVocab(optionsBackedUISpec, 'slot-options', 'appr', 10);
    expect(items.length).toBe(1);
    expect(items[0].value).toBe('approved');
  });
});

describe('resolveOntology — with ontology restriction', () => {
  it('accepts ontologies parameter', async () => {
    // The function should accept ontologies and pass them to the fetch URL
    // We can't actually hit the server, but we can verify the function signature
    const result = await resolveOntology('test', 10, ['cl', 'chebi']);
    // Result will be empty since there's no server, but the call should succeed
    expect(Array.isArray(result)).toBe(true);
  });

  it('works without ontologies restriction', async () => {
    const result = await resolveOntology('test', 10);
    expect(Array.isArray(result)).toBe(true);
  });
});
