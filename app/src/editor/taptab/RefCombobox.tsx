import { useState, useRef, useEffect, KeyboardEvent, MouseEvent } from 'react';
import { useTagSuggestions } from '../../shared/hooks/useTagSuggestions';
import { useResolveOntology } from '../hooks/useResolveOntology';
import { focusAdjacentTapTabField } from './tabNavPlugin';
import type { StructuredValue } from '../../shared/forms/suggestionPlan';

export interface RefComboboxProps {
  value: string;
  refKind: string; // Used as the vocab domain for local search
  /** Optional suggestion plan from the projection (sources, ontologies, field). */
  suggestionPlan?: {
    sources: string[];
    ontologies: string[];
    searchField: 'keywords' | 'tags';
    isRef: boolean;
    isCombobox: boolean;
    ontologyBinding?: 'allow-ontology' | 'local-material-required' | 'local-record-required';
    ownedByApp?: boolean;
    valueShape?: 'text' | 'ref' | 'record-ref' | 'ontology-ref' | 'material-ref';
    lifecycleDefault?: string;
  };
  onSelect: (
    value: string,
    source: 'local' | 'ontology',
    termData?: {
      label: string;
      iri?: string;
      definition?: string;
      synonyms?: string[];
      ontology?: string;
      oboId?: string;
    } & { __structured__?: StructuredValue }
  ) => void;
  onCancel: () => void;
  /**
   * Offer a "create new" last-resort item (the funnel floor). When set and the
   * query is non-empty, a pinned-bottom "Create …" row appears; it is never the
   * keyboard default — Enter only triggers it when no result is highlightable.
   */
  allowCreate?: boolean;
  onCreateNew?: (query: string) => void;
}

/**
 * Combined result item for the dropdown
 */
interface CombinedResult {
  type: 'local' | 'ontology';
  value: string;
  label: string;
  iri?: string; // Only for ontology results
  definition?: string;
  synonyms?: string[];
  ontology?: string;
  oboId?: string;
}

/**
 * Dropdown item representation - includes both headers and results
 */
interface DropdownItem {
  kind: 'header' | 'result';
  resultIndex?: number; // Only for result items - index into combinedResults
  group?: 'local' | 'ontology'; // Only for headers
}

export function RefCombobox({
  value,
  // refKind is accepted (callers pass it as the vocab domain) but local/ontology
  // search is driven entirely by suggestionPlan now, so it's intentionally unused.
  suggestionPlan,
  onSelect,
  onCancel,
  allowCreate = false,
  onCreateNew,
}: RefComboboxProps) {
  const [query, setQuery] = useState(value);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Extract suggestion plan values (fall back to defaults).
  const sources = suggestionPlan?.sources ?? ['local'];
  const searchField = suggestionPlan?.searchField ?? 'tags';
  const useOls = sources.includes('ols');

  // Get local tag suggestions — use the searchField from the plan
  const { suggestions: localResults, loading: localLoading } = useTagSuggestions({
    query,
    field: searchField,
    enabled: query.length >= 1,
  });

  // Ontology results come from the resolve() spine (POST /resolve: local OAK →
  // remote OLS4, ranked) — the SAME path the slash menu, the agent, and the
  // material picker use, so the combobox agrees with the rest of the app.
  // (The previous direct browser→EBI useOLSSearch returned nothing on the
  // appliance, where the network path to OLS4 isn't available.)
  const { results: ontologyResults, loading: ontologyLoading } = useResolveOntology({
    query,
    enabled: useOls && query.length >= 2,
    debounceMs: 400,
    // Show a wider ranked list (exact/shortest first) — the dropdown scrolls,
    // so the long tail is reachable instead of capped at the default 10.
    maxResults: 40,
  });

  // Combine results into a single list (headers are NOT included in this array)
  const combinedResults: CombinedResult[] = [
    // Local vocabulary results
    ...localResults.map((s): CombinedResult => ({
      type: 'local',
      value: s.value,
      label: s.value,
    })),
    // Ontology results
    ...ontologyResults.map((r): CombinedResult => ({
      type: 'ontology',
      value: r.curie,
      label: r.label,
      iri: r.uri,
      definition: r.definition,
      synonyms: undefined,
      ontology: r.namespace,
      oboId: r.curie,
    })),
  ];

  // Build the dropdown items structure (includes headers)
  // This is the authoritative list for navigation
  const dropdownItems: DropdownItem[] = [];

  // Add local vocabulary section header if there are local results
  if (localResults.length > 0) {
    dropdownItems.push({ kind: 'header', group: 'local' });
  }

  // Add local results with their indices into combinedResults
  for (let i = 0; i < localResults.length; i++) {
    dropdownItems.push({ kind: 'result', resultIndex: i });
  }

  // Add ontology section header if there are ontology results
  if (ontologyResults.length > 0) {
    dropdownItems.push({ kind: 'header', group: 'ontology' });
  }

  // Add ontology results with their indices into combinedResults
  for (let i = 0; i < ontologyResults.length; i++) {
    dropdownItems.push({ kind: 'result', resultIndex: localResults.length + i });
  }

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Reset highlight index when query changes
  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && highlightIndex < dropdownItems.length && listRef.current) {
      const highlightedItem = listRef.current.children[highlightIndex] as HTMLElement | undefined;
      if (highlightedItem?.scrollIntoView) {
        highlightedItem.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightIndex, dropdownItems]);

  // Helper to find the next valid result index (skipping headers)
  const findNextResultIndex = (currentIndex: number, direction: 1 | -1): number => {
    let index = currentIndex + direction;
    const step = direction;
    
    while (index >= 0 && index < dropdownItems.length) {
      if (dropdownItems[index].kind === 'result') {
        return index;
      }
      index += step;
    }
    
    // If no result found in that direction, return the first/last result
    if (direction === 1) {
      // Wrap to first result
      for (let i = 0; i < dropdownItems.length; i++) {
        if (dropdownItems[i].kind === 'result') {
          return i;
        }
      }
    } else {
      // Wrap to last result
      for (let i = dropdownItems.length - 1; i >= 0; i--) {
        if (dropdownItems[i].kind === 'result') {
          return i;
        }
      }
    }
    
    return currentIndex;
  };

  // Commit the currently highlighted result (if any). Returns true when a real
  // result was committed, false when there was nothing highlightable. Shared by
  // Enter and Tab so both keys turn the highlighted term into a chip; the parent
  // ChipComboboxWidget remounts this combobox (key={addSeq}) to clear+refocus,
  // so the user can keep typing the next term without leaving the keyboard.
  const commitHighlighted = (): boolean => {
    const selectedItem = dropdownItems[highlightIndex];
    const hasResult = selectedItem && selectedItem.kind === 'result' && selectedItem.resultIndex !== undefined;
    if (!hasResult) return false;
    const result = combinedResults[selectedItem.resultIndex!];
    if (result.type === 'ontology') {
      onSelect(result.value, 'ontology', {
        label: result.label,
        iri: result.iri || '',
        definition: result.definition,
        synonyms: result.synonyms,
        ontology: result.ontology,
        oboId: result.oboId,
        __structured__: {
          value: result.value,
          source: 'ols',
          metadata: {
            iri: result.iri,
            ontology: result.ontology,
            oboId: result.oboId,
            definition: result.definition,
          },
        },
      });
    } else {
      onSelect(result.value, 'local', {
        label: result.label,
        __structured__: {
          value: result.value,
          source: 'local',
          metadata: {
            searchField,
            sources,
          },
        },
      });
    }
    return true;
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => findNextResultIndex(prev, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => findNextResultIndex(prev, -1));
    } else if (e.key === 'Tab') {
      // Tab commits the highlighted term as a chip and keeps the search open
      // (the parent remounts us to clear+refocus). Only intercept when there's
      // a real result to commit — otherwise let Tab do its normal focus-advance
      // so an empty/unmatched field doesn't trap the keyboard.
      if (commitHighlighted()) {
        e.preventDefault();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!commitHighlighted()) {
        // No highlightable result — Enter falls through to "create new" when
        // offered, so a typed-but-unmatched term isn't lost. Never overrides
        // a real result selection.
        if (allowCreate && onCreateNew && query.trim().length >= 1) {
          onCreateNew(query.trim());
        }
      }
    } else if (e.key === 'Escape') {
      // Dismiss the search without picking anything, and advance to the next
      // field — Escape gets the user out of an unwanted dropdown and moving
      // again without reaching for the mouse.
      e.preventDefault();
      e.stopPropagation();
      const from = e.currentTarget as HTMLElement;
      onCancel();
      focusAdjacentTapTabField(from, false);
    }
  };

  // Close the dropdown when focus leaves the field (e.g. the user clicks into
  // another field instead of picking a result). Option clicks call
  // preventDefault on mousedown, so selecting a result does NOT blur-close
  // before the click commits.
  const handleBlur = () => {
    onCancel();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const handleOptionSelect = (
    resultValue: string,
    resultType: 'local' | 'ontology',
    termData?: {
      label: string;
      iri?: string;
      definition?: string;
      synonyms?: string[];
      ontology?: string;
      oboId?: string;
    }
  ) => {
    const structuredValue: StructuredValue | undefined =
      resultType === 'ontology'
        ? {
            value: resultValue,
            source: 'ols',
            metadata: {
              iri: termData?.iri,
              ontology: termData?.ontology,
              oboId: termData?.oboId,
              definition: termData?.definition,
            },
          }
        : {
            value: resultValue,
            source: 'local',
            metadata: { searchField, sources },
          };

    onSelect(resultValue, resultType, {
      ...termData,
      label: termData?.label ?? resultValue,
      __structured__: structuredValue,
    });
  };

  const handleMouseDown = (e: MouseEvent<HTMLLIElement>) => {
    // Prevent blur from firing before selection
    e.preventDefault();
  };

  // Calculate counts for group headers
  const localCount = localResults.length;
  const ontologyCount = ontologyResults.length;

  // Build the dropdown items with group headers
  const renderDropdownItems = () => {
    const items: JSX.Element[] = [];

    // Add local vocabulary section header if there are local results
    if (localCount > 0) {
      items.push(
        <li key="local-header" className="group-header" data-group="local">
          Local vocabulary
        </li>
      );
    }

    // Add local results
    for (let i = 0; i < localCount; i++) {
      const result = localResults[i];
      // Find the display index for this local result
      const displayIndex = dropdownItems.findIndex((item) => item.kind === 'result' && item.resultIndex === i);
      
      items.push(
        <li
          key={`local-${result.value}`}
          className={`result-item ${displayIndex === highlightIndex ? 'highlighted' : ''}`}
          data-type="local"
          onClick={() => handleOptionSelect(result.value, 'local')}
          onMouseDown={handleMouseDown}
        >
          <span className="result-label">{result.value}</span>
          <span className="result-count">{result.count}</span>
        </li>
      );
    }

    // Add ontology section header if there are ontology results
    if (ontologyCount > 0) {
      items.push(
        <li key="ontology-header" className="group-header" data-group="ontology">
          Ontology
        </li>
      );
    }

    // Add ontology results
     for (let i = 0; i < ontologyCount; i++) {
       const result = ontologyResults[i];
       const resultIndex = localCount + i;
       // Find the display index for this ontology result
       const displayIndex = dropdownItems.findIndex((item) => item.kind === 'result' && item.resultIndex === resultIndex);

       items.push(
         <li
           key={`ontology-${result.curie || result.uri}`}
           className={`result-item ${displayIndex === highlightIndex ? 'highlighted' : ''}`}
           data-type="ontology"
           onClick={() => handleOptionSelect(result.label, 'ontology', {
             label: result.label,
             iri: result.uri,
             definition: result.definition,
             synonyms: undefined,
             ontology: result.namespace,
             oboId: result.curie,
           })}
           onMouseDown={handleMouseDown}
         >
           <span className="result-label">{result.label}</span>
           {result.uri && <span className="ontology-iri">{result.uri}</span>}
         </li>
       );
     }

    // Show loading indicator if no results but loading
    if (combinedResults.length === 0 && (localLoading || ontologyLoading)) {
      items.push(
        <li key="loading" className="no-match">
          Loading...
        </li>
      );
    }

    // Show no match message if no results and not loading
    if (combinedResults.length === 0 && !localLoading && !ontologyLoading && query.length >= 1) {
      items.push(
        <li key="no-match" className="no-match">
          No matches found
        </li>
      );
    }

    // Funnel floor: a pinned-bottom "create new" affordance, always offered
    // (when enabled and the query is non-empty) and always last, never the
    // keyboard default — click or Enter-with-no-result to use it.
    if (allowCreate && onCreateNew && query.trim().length >= 1) {
      items.push(
        <li
          key="create-new"
          className="result-item ref-create-item"
          data-type="create"
          onClick={() => onCreateNew(query.trim())}
          onMouseDown={handleMouseDown}
        >
          <span className="result-label">Create “{query.trim()}”</span>
          <span className="result-count">new</span>
        </li>
      );
    }

    return items;
  };

  return (
    <div className="ref-combobox">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="taptab-inline-input"
        onClick={(e) => e.stopPropagation()}
        placeholder="Search local or ontology..."
        autoFocus
      />
      <ul className="ref-dropdown" ref={listRef}>
        {renderDropdownItems()}
      </ul>
    </div>
  );
}
