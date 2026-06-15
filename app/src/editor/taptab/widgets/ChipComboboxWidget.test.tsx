/**
 * Unit tests for ChipComboboxWidget — multi-value ontology/local chips.
 *
 * Covers:
 *   - Rendering local + ontology entries as chips (label + CURIE)
 *   - Round-tripping structured-JSON ontology entries from stored strings
 *   - Add flow: local pick → appended as plain string
 *   - Add flow: ontology pick → appended as structured-JSON with CURIE
 *   - Create-new (funnel floor) → appended as free-text local entry
 *   - Remove → onCommit without the removed entry
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ChipComboboxWidget } from './ChipComboboxWidget';
import { serializeStructuredValue, deserializeStructuredValue } from '../../../shared/forms/suggestionPlan';

vi.mock('../../../shared/hooks/useTagSuggestions', () => ({
  useTagSuggestions: vi.fn(() => ({
    suggestions: [
      { value: 'tag-a', count: 3, source: 'local' as const },
      { value: 'tag-b', count: 1, source: 'local' as const },
    ],
    loading: false,
    error: null,
  })),
}));

// Ontology search flows through RefCombobox → the resolve() spine
// (useResolveOntology), the same path the slash menu / agent / material
// picker use. Mock that, not the dead direct-EBI useOLSSearch.
vi.mock('../../hooks/useResolveOntology', () => ({
  useResolveOntology: vi.fn(() => ({
    results: [
      {
        obo_id: 'CL:0000084',
        label: 'T cell',
        iri: 'http://purl.obolibrary.org/obo/CL_0000084',
        ontology_name: 'cl',
      },
    ],
    loading: false,
    fromCache: false,
  })),
}));

const tagsPlan = {
  sources: ['local'],
  ontologies: [],
  searchField: 'tags' as const,
  isRef: false,
  isCombobox: true,
};

const keywordsPlan = {
  sources: ['local', 'ols'],
  ontologies: ['cl'],
  searchField: 'keywords' as const,
  isRef: false,
  isCombobox: true,
};

// Ref-shaped field (material $.class): entries store/round-trip as ref objects
// per datatypes/ref.schema.yaml, not the tags/keywords string envelope.
const classPlan = {
  sources: ['ols'],
  ontologies: ['cl', 'chebi'],
  searchField: 'tags' as const,
  isRef: false,
  isCombobox: true,
  valueShape: 'ontology-ref' as const,
  ontologyBinding: 'allow-ontology' as const,
};

describe('ChipComboboxWidget', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders plain string entries as chips', () => {
    render(
      <ChipComboboxWidget
        value={['alpha', 'beta']}
        suggestionPlan={tagsPlan}
        refKind="tags"
        readOnly={false}
        onCommit={vi.fn()}
      />,
    );
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
  });

  it('round-trips a structured ontology entry into a chip with CURIE', () => {
    const stored = serializeStructuredValue({
      value: 'T cell',
      source: 'ols',
      metadata: { curie: 'CL:0000084', oboId: 'CL:0000084', namespace: 'CL', ontology: 'CL', iri: 'x' },
    });
    render(
      <ChipComboboxWidget
        value={[stored]}
        suggestionPlan={keywordsPlan}
        refKind="keywords"
        readOnly={false}
        onCommit={vi.fn()}
      />,
    );
    expect(screen.getByText('T cell')).toBeInTheDocument();
    expect(screen.getByText('CL:0000084')).toBeInTheDocument();
  });

  it('appends a local pick as a plain string on select', () => {
    const onCommit = vi.fn();
    render(
      <ChipComboboxWidget
        value={['alpha']}
        suggestionPlan={tagsPlan}
        refKind="tags"
        readOnly={false}
        onCommit={onCommit}
      />,
    );
    fireEvent.click(screen.getByText('+ Tag'));
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCommit).toHaveBeenCalledWith(['alpha', 'tag-a']);
  });

  it('appends an ontology pick as a structured-JSON entry carrying the CURIE', () => {
    const onCommit = vi.fn();
    render(
      <ChipComboboxWidget
        value={[]}
        suggestionPlan={keywordsPlan}
        refKind="keywords"
        readOnly={false}
        onCommit={onCommit}
      />,
    );
    fireEvent.click(screen.getByText('+ Keyword'));
    const input = screen.getByRole('textbox');
    // local-a, local-b, ontology
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0][0] as string[];
    expect(committed).toHaveLength(1);
    const sv = deserializeStructuredValue(committed[0]);
    expect(sv?.source).toBe('ols');
    expect(sv?.value).toBe('T cell');
    expect(sv?.metadata?.curie).toBe('CL:0000084');
  });

  it('offers create-new as a last resort and appends the typed text', () => {
    const onCommit = vi.fn();
    render(
      <ChipComboboxWidget
        value={[]}
        suggestionPlan={tagsPlan}
        refKind="tags"
        readOnly={false}
        onCommit={onCommit}
      />,
    );
    fireEvent.click(screen.getByText('+ Tag'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'pilot-study' } });

    const createItem = screen.getByText(/Create/);
    fireEvent.click(createItem);

    expect(onCommit).toHaveBeenCalledWith(['pilot-study']);
  });

  it('renders a stored ref-object classification as an ontology chip', () => {
    render(
      <ChipComboboxWidget
        value={[
          { kind: 'ontology', id: 'CL:0000182', namespace: 'CL', label: 'hepatocyte', uri: 'x' },
        ]}
        suggestionPlan={classPlan}
        refKind="class"
        readOnly={false}
        onCommit={vi.fn()}
      />,
    );
    expect(screen.getByText('hepatocyte')).toBeInTheDocument();
    expect(screen.getByText('CL:0000182')).toBeInTheDocument();
  });

  it('appends an ontology pick as a ref object (not a JSON string) for ref-shaped fields', () => {
    const onCommit = vi.fn();
    render(
      <ChipComboboxWidget
        value={[]}
        suggestionPlan={classPlan}
        refKind="class"
        readOnly={false}
        onCommit={onCommit}
      />,
    );
    fireEvent.click(screen.getByText('+ Classification'));
    const input = screen.getByRole('textbox');
    // local-a, local-b, ontology (the mock surfaces locals regardless of sources)
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(committed).toHaveLength(1);
    expect(committed[0]).toMatchObject({
      kind: 'ontology',
      id: 'CL:0000084',
      namespace: 'CL',
      label: 'T cell',
    });
  });

  it('does not offer create-new for ref-shaped (ontology-only) fields', () => {
    render(
      <ChipComboboxWidget
        value={[]}
        suggestionPlan={classPlan}
        refKind="class"
        readOnly={false}
        onCommit={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('+ Classification'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'something novel' } });
    expect(screen.queryByText(/Create/)).not.toBeInTheDocument();
  });

  it('removes a chip on its remove button', () => {
    const onCommit = vi.fn();
    render(
      <ChipComboboxWidget
        value={['alpha', 'beta']}
        suggestionPlan={tagsPlan}
        refKind="tags"
        readOnly={false}
        onCommit={onCommit}
      />,
    );
    const removeButtons = screen.getAllByTitle('Remove');
    fireEvent.click(removeButtons[0]);
    expect(onCommit).toHaveBeenCalledWith(['beta']);
  });

  it('renders read-only without add or remove affordances', () => {
    render(
      <ChipComboboxWidget
        value={['alpha']}
        suggestionPlan={tagsPlan}
        refKind="tags"
        readOnly
        onCommit={vi.fn()}
      />,
    );
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.queryByText('+ Tag')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Remove')).not.toBeInTheDocument();
  });
});
