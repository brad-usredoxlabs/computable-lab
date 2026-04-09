import { useState, useRef, useEffect, KeyboardEvent, MouseEvent } from 'react';
import { apiClient } from '../../shared/api/client';

export interface RecordRefPickerProps {
  value: string;
  refKind: string;
  onSelect: (value: string, recordId: string) => void;
  onCancel: () => void;
}

interface SearchResult {
  recordId: string;
  title: string;
  kind: string;
}

export function RecordRefPicker({ value, refKind, onSelect, onCancel }: RecordRefPickerProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setHighlightIndex(0); }, [query]);

  useEffect(() => {
    if (highlightIndex >= 0 && highlightIndex < results.length && listRef.current) {
      (listRef.current.children[highlightIndex] as HTMLElement)?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex, results]);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (query.length >= 2) {
      setLoading(true);
      debounceRef.current = window.setTimeout(async () => {
        try {
          const data = await apiClient.searchRecordsByKind(query, refKind);
          setResults(data.records);
        } catch (error) {
          console.error('Search failed:', error);
          setResults([]);
        } finally {
          setLoading(false);
        }
      }, 250);
    } else {
      setResults([]);
    }
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [query, refKind]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIndex((p) => Math.min(p + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIndex((p) => Math.max(p - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < results.length) onSelect(results[highlightIndex].title, results[highlightIndex].recordId);
    } else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  };

  const handleMouseDown = (e: MouseEvent<HTMLLIElement>) => { e.preventDefault(); };

  return (
    <div className="ref-combobox">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        className="taptab-inline-input"
        onClick={(e) => e.stopPropagation()}
        autoFocus
      />
      {query.length >= 2 && (
        <ul className="ref-dropdown" ref={listRef}>
          {loading && <li className="no-match">Searching...</li>}
          {!loading && results.length === 0 && <li className="no-match">No matches</li>}
          {!loading && results.map((r, i) => (
            <li
              key={r.recordId}
              className={`result-item ${i === highlightIndex ? 'highlighted' : ''}`}
              onClick={() => onSelect(r.title, r.recordId)}
              onMouseDown={handleMouseDown}
            >
              <span className="result-label">{r.title}</span>
              <span className="ontology-iri">{r.recordId}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
