/**
 * RefCombobox — the LAB-LOCAL vocabulary tier must not be offered on an
 * ontology-ref field.
 *
 * `ontology_ref` is `type: object` (schema/workflow/labware-definition.schema.yaml),
 * so a local-vocabulary row (a bare string) can only ever 422 on save. The shared
 * combobox therefore suppresses the local tier when the FIELD'S OWN plan declares
 * `valueShape: 'ontology-ref'`; every other field keeps its local tier untouched.
 *
 * Mock harness shape copied from RefCombobox.test.tsx (not imported from it).
 * The useTagSuggestions mock honours `enabled` exactly like the real hook
 * (useTagSuggestions.ts:47-51 returns an EMPTY list when disabled), so the pin
 * measures the gate rather than the mock.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RefCombobox } from './RefCombobox';

vi.mock('../../shared/hooks/useTagSuggestions', () => ({
  useTagSuggestions: vi.fn((opts: { query: string; field: string; enabled?: boolean }) => ({
    suggestions:
      opts.enabled === false || opts.query.length < 1
        ? []
        : [
            { value: 'tag-a', count: 3, source: 'local' as const },
            { value: 'tag-b', count: 1, source: 'local' as const },
          ],
    loading: false,
    error: null,
  })),
}));

vi.mock('../hooks/useResolveOntology', () => ({
  useResolveOntology: vi.fn((opts: { query: string; enabled?: boolean }) => ({
    results:
      opts.enabled === false || opts.query.length < 2
        ? []
        : [
            {
              curie: 'CL:0000084',
              label: 'T cell',
              namespace: 'cl',
              tier: 2 as const,
              level: 'concept' as const,
              score: 1,
              source: 'oak' as const,
              uri: 'http://purl.obolibrary.org/obo/CL_0000084',
              definition: 'A T cell.',
            },
          ],
    loading: false,
    fromCache: false,
  })),
}));

const basePlan = {
  sources: ['local', 'ols'],
  ontologies: ['cl'],
  searchField: 'tags' as const,
  isRef: true,
  isCombobox: true,
};

const typeInto = (text: string) => {
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: text } });
  return input;
};

describe('RefCombobox — local tier suppression for ontology-ref', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('offers ontology rows only when the plan valueShape is ontology-ref', () => {
    render(
      <RefCombobox
        value=""
        refKind="cl"
        suggestionPlan={{ ...basePlan, valueShape: 'ontology-ref' }}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    typeInto('Mic');

    // No local vocabulary section and no local row.
    expect(screen.queryByText('Local vocabulary')).toBeNull();
    expect(screen.queryByText('tag-a')).toBeNull();
    // The ontology row is still offered.
    expect(screen.getByText('T cell')).toBeInTheDocument();
  });

  it('still offers the local tier when the plan valueShape is ref', () => {
    render(
      <RefCombobox
        value=""
        refKind="cl"
        suggestionPlan={{ ...basePlan, valueShape: 'ref' }}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    typeInto('Mic');

    expect(screen.getByText('Local vocabulary')).toBeInTheDocument();
    expect(screen.getByText('tag-a')).toBeInTheDocument();
  });
});
