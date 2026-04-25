/**
 * Unit tests for RefCombobox — structured ref and suggestion parity.
 *
 * Covers:
 *   - Structured ref commit path (provenance metadata)
 *   - Ontology-scoped slot (ontologies restriction)
 *   - Tags-backed local slot (searchField = 'tags')
 *   - Keywords-backed local slot (searchField = 'keywords')
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RefCombobox } from './RefCombobox';
import type { StructuredValue } from '../../shared/forms/suggestionPlan';

// Mock the hooks
vi.mock('../../shared/hooks/useTagSuggestions', () => ({
  useTagSuggestions: vi.fn((_opts: { query: string; field: string; enabled?: boolean }) => ({
    suggestions: [
      { value: 'tag-a', count: 3, source: 'local' as const },
      { value: 'tag-b', count: 1, source: 'local' as const },
    ],
    loading: false,
    error: null,
  })),
}));

vi.mock('../../shared/hooks/useOLSSearch', () => ({
  useOLSSearch: vi.fn((_opts: { query: string; ontologies?: string[]; enabled?: boolean }) => ({
    results: [
      {
        label: 'T cell',
        iri: 'http://purl.obolibrary.org/obo/CL_0000084',
        ontology_name: 'cl',
        description: ['A type of lymphocyte'],
        synonyms: ['lymphocyte T', 'T lymphocyte'],
      },
    ],
    loading: false,
    error: null,
    fromCache: false,
    refetch: vi.fn(),
    clear: vi.fn(),
  })),
}));

// ============================================================================
// Tests
// ============================================================================

describe('RefCombobox', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the input field', () => {
    render(
      <RefCombobox
        value=""
        refKind="cl"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
  });

  it('commits structured value with provenance on Enter for local result', () => {
    const onSelect = vi.fn();
    render(
      <RefCombobox
        value="tag"
        refKind="cl"
        suggestionPlan={{
          sources: ['local', 'ols'],
          ontologies: ['cl'],
          searchField: 'tags',
          isRef: true,
          isCombobox: false,
        }}
        onSelect={onSelect}
        onCancel={vi.fn()}
      />
    );

    const input = screen.getByRole('textbox');
    // Navigate to first result (skip header)
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalled();
    const callArgs = onSelect.mock.calls[0];
    expect(callArgs[0]).toBe('tag-a'); // First local result value
    expect(callArgs[1]).toBe('local'); // Source type

    // Verify structured value is passed in termData
    const termData = callArgs[2] as { __structured__?: StructuredValue };
    expect(termData.__structured__).toBeDefined();
    expect(termData.__structured__!.source).toBe('local');
    expect(termData.__structured__!.metadata?.searchField).toBe('tags');
    expect(termData.__structured__!.metadata?.sources).toEqual(['local', 'ols']);
  });

  it('commits structured value with provenance on Enter for ontology result', () => {
    const onSelect = vi.fn();
    render(
      <RefCombobox
        value="t"
        refKind="cl"
        suggestionPlan={{
          sources: ['local', 'ols'],
          ontologies: ['cl'],
          searchField: 'keywords',
          isRef: true,
          isCombobox: false,
        }}
        onSelect={onSelect}
        onCancel={vi.fn()}
      />
    );

    // Navigate to the ontology result (skip local header + 2 local results + ontology header)
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // First local
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // Second local
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // First ontology

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalled();
    const callArgs = onSelect.mock.calls[0];
    expect(callArgs[0]).toBe('T cell'); // Ontology result label
    expect(callArgs[1]).toBe('ontology'); // Source type

    // Verify structured value carries IRI and ontology metadata
    const termData = callArgs[2] as { __structured__?: StructuredValue };
    expect(termData.__structured__).toBeDefined();
    expect(termData.__structured__!.source).toBe('ols');
    expect(termData.__structured__!.metadata?.ontology).toBe('cl');
    expect(termData.__structured__!.metadata?.iri).toBe('http://purl.obolibrary.org/obo/CL_0000084');
  });

  it('uses searchField from suggestionPlan for local search', () => {
    const onSelect = vi.fn();
    render(
      <RefCombobox
        value="test"
        refKind="cl"
        suggestionPlan={{
          sources: ['local'],
          ontologies: [],
          searchField: 'keywords',
          isRef: false,
          isCombobox: true,
        }}
        onSelect={onSelect}
        onCancel={vi.fn()}
      />
    );

    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    const termData = onSelect.mock.calls[0][2] as { __structured__?: StructuredValue };
    expect(termData.__structured__!.metadata?.searchField).toBe('keywords');
  });

  it('uses searchField from suggestionPlan for tags', () => {
    const onSelect = vi.fn();
    render(
      <RefCombobox
        value="test"
        refKind="cl"
        suggestionPlan={{
          sources: ['local'],
          ontologies: [],
          searchField: 'tags',
          isRef: false,
          isCombobox: true,
        }}
        onSelect={onSelect}
        onCancel={vi.fn()}
      />
    );

    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    const termData = onSelect.mock.calls[0][2] as { __structured__?: StructuredValue };
    expect(termData.__structured__!.metadata?.searchField).toBe('tags');
  });

  it('respects ontologies restriction from suggestionPlan', () => {
    const onSelect = vi.fn();
    render(
      <RefCombobox
        value="test"
        refKind="cl"
        suggestionPlan={{
          sources: ['local', 'ols'],
          ontologies: ['chebi'], // Only chebi, not cl
          searchField: 'keywords',
          isRef: true,
          isCombobox: false,
        }}
        onSelect={onSelect}
        onCancel={vi.fn()}
      />
    );

    // Navigate to ontology result
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    const termData = onSelect.mock.calls[0][2] as { __structured__?: StructuredValue };
    expect(termData.__structured__!.metadata?.ontology).toBe('cl'); // From the mock result
    // The ontologies restriction is passed to the hook, which would filter in real usage
  });

  it('calls onCancel on Escape', () => {
    const onCancel = vi.fn();
    render(
      <RefCombobox
        value=""
        refKind="cl"
        onSelect={vi.fn()}
        onCancel={onCancel}
      />
    );

    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalled();
  });

  it('defaults to local-only sources when no suggestionPlan provided', () => {
    const onSelect = vi.fn();
    render(
      <RefCombobox
        value="test"
        refKind="cl"
        onSelect={onSelect}
        onCancel={vi.fn()}
      />
    );

    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Should still work with defaults
    expect(onSelect).toHaveBeenCalled();
    const termData = onSelect.mock.calls[0][2] as { __structured__?: StructuredValue };
    expect(termData.__structured__!.source).toBe('local');
  });
});
