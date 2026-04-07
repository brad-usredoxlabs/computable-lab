import { useState, useRef, useEffect, KeyboardEvent, MouseEvent } from 'react';
import { useTagSuggestions } from '../../shared/hooks/useTagSuggestions';
import { useOLSSearch } from '../../shared/hooks/useOLSSearch';

export interface RefComboboxProps {
  value: string;
  refKind: string; // Used as the vocab domain for local search
  onSelect: (value: string, source: 'local' | 'ontology', termData?: { label: string; iri: string; definition?: string; synonyms?: string[]; ontology?: string }) => void;
  onCancel: () => void;
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
}

/**
 * Dropdown item representation - includes both headers and results
 */
interface DropdownItem {
  kind: 'header' | 'result';
  resultIndex?: number; // Only for result items - index into combinedResults
  group?: 'local' | 'ontology'; // Only for headers
}

export function RefCombobox({ value, refKind, onSelect, onCancel }: RefComboboxProps) {
  const [query, setQuery] = useState(value);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Get local tag suggestions
  const { suggestions: localResults, loading: localLoading } = useTagSuggestions({
    query,
    field: 'keywords',
    enabled: query.length >= 1,
  });

  // Get ontology search results
  // refKind can be used to filter ontologies (e.g., 'cl' for cell ontology)
  const { results: ontologyResults, loading: ontologyLoading } = useOLSSearch({
    query,
    ontologies: refKind ? [refKind] : [],
    enabled: query.length >= 2,
    debounceMs: 400,
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
      value: r.label,
      label: r.label,
      iri: r.iri,
      definition: r.description?.[0],
      synonyms: r.synonyms,
      ontology: r.ontology_name,
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
      const highlightedItem = listRef.current.children[highlightIndex] as HTMLElement;
      if (highlightedItem) {
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

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => findNextResultIndex(prev, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => findNextResultIndex(prev, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selectedItem = dropdownItems[highlightIndex];
      if (selectedItem && selectedItem.kind === 'result' && selectedItem.resultIndex !== undefined) {
        const result = combinedResults[selectedItem.resultIndex];
        if (result.type === 'ontology') {
          onSelect(result.value, 'ontology', {
            label: result.label,
            iri: result.iri || '',
          });
        } else {
          onSelect(result.value, 'local');
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const handleOptionSelect = (resultValue: string, resultType: 'local' | 'ontology', termData?: { label: string; iri: string; definition?: string; synonyms?: string[]; ontology?: string }) => {
    onSelect(resultValue, resultType, termData);
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
          key={`ontology-${result.obo_id || result.iri}`}
          className={`result-item ${displayIndex === highlightIndex ? 'highlighted' : ''}`}
          data-type="ontology"
          onClick={() => handleOptionSelect(result.label, 'ontology', {
            label: result.label,
            iri: result.iri,
            definition: result.description?.[0],
            synonyms: result.synonyms,
            ontology: result.ontology_name,
          })}
          onMouseDown={handleMouseDown}
        >
          <span className="result-label">{result.label}</span>
          {result.iri && <span className="ontology-iri">{result.iri}</span>}
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
