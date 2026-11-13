/**
 * An ontology-ref field must NOT offer the lab-local tier: a local row commits a bare
 * string and `ontology_ref` is `type: object` (labware-definition.schema.yaml:46-47),
 * so that pick can only 422. Other fields keep it. Mocks honour `enabled` like the hooks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RefCombobox } from './RefCombobox';

vi.mock('../../shared/hooks/useTagSuggestions', () => ({
  useTagSuggestions: vi.fn((o: { query: string; enabled?: boolean }) => ({
    suggestions: o.enabled === false || o.query.length < 1 ? [] : [
      { value: 'tag-a', count: 3, source: 'local' as const },
      { value: 'tag-b', count: 1, source: 'local' as const }],
    loading: false, error: null,
  })),
}));
vi.mock('../hooks/useResolveOntology', () => ({
  useResolveOntology: vi.fn((o: { query: string; enabled?: boolean }) => ({
    results: o.enabled === false || o.query.length < 2 ? [] : [{
      curie: 'CL:0000084', label: 'T cell', namespace: 'cl', tier: 2 as const,
      level: 'concept' as const, score: 1, source: 'oak' as const,
      uri: 'http://purl.obolibrary.org/obo/CL_0000084' }],
    loading: false, fromCache: false,
  })),
}));

const renderFor = (
  valueShape: 'ref' | 'ontology-ref' | 'material-ref' | 'record-ref' | 'text',
  plan?: { sources: string[]; ontologies: string[]; searchField: string; isRef: boolean; isCombobox: boolean; valueShape: typeof valueShape }
) => render(
  <RefCombobox value="" refKind="cl" onSelect={vi.fn()} onCancel={vi.fn()}
    suggestionPlan={plan ?? { sources: ['local', 'ols'], ontologies: ['cl'], searchField: 'tags',
      isRef: true, isCombobox: true, valueShape }} />
);

const typeInto = (t: string) =>
  fireEvent.change(screen.getByRole('textbox'), { target: { value: t } });

describe('RefCombobox ontology-ref local-tier suppression', () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); });

  it('offers ontology rows only when valueShape is ontology-ref', () => {
    renderFor('ontology-ref');
    typeInto('Mic');
    expect(screen.queryByText('Local vocabulary')).toBeNull();
    expect(screen.queryByText('tag-a')).toBeNull();
    expect(screen.getByText('T cell')).toBeInTheDocument();
  });

  it('still offers the local tier when valueShape is ref', () => {
    renderFor('ref');
    typeInto('Mic');
    expect(screen.getByText('Local vocabulary')).toBeInTheDocument();
    expect(screen.getByText('tag-a')).toBeInTheDocument();
  });
});
