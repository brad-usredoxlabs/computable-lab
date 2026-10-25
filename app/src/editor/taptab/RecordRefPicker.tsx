/**
 * RecordRefPicker — pick a RECORD of a declared kind (person, equipment,
 * training-material, …). Used by the `record-ref` widget; the ontology/vocab
 * search (RefCombobox) is for terms, never for records.
 *
 * The option list comes from the record list itself (GET /records?kind=…), not
 * from the full-text index: freshly created records have no index title, so a
 * query-only search would show nothing. Local substring filtering runs over
 * id/label; no server round-trip per keystroke.
 *
 * Commit shape is the canonical ref (schema/core/datatypes/ref.schema.yaml):
 * { kind: 'record', type: <refKind>, id, label }.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { apiClient } from '../../shared/api/client';

export interface RecordRefSelection {
  kind: 'record';
  type: string;
  id: string;
  label: string;
}

export interface RecordRefPickerProps {
  value: string;
  /** Record kind to search (the ui.yaml `refKind`). */
  refKind: string;
  onSelect: (ref: RecordRefSelection) => void;
  onCancel: () => void;
}

interface Option {
  recordId: string;
  label: string;
}

function labelOf(payload: Record<string, unknown>, recordId: string): string {
  for (const key of ['displayName', 'name', 'title', 'label', 'id']) {
    const v = payload[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return recordId;
}

export function RecordRefPicker({ value, refKind, onSelect, onCancel }: RecordRefPickerProps) {
  const [query, setQuery] = useState(value);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // D3 (REG-3 fix1): the affordance stays consistent with the committed
  // "label (id)" display. Until the user types, the query mirrors the
  // initial value; once the candidate list is loaded, a bare id (or a
  // stored label) is resolved to the label the loaded list KNOWS. No extra
  // fetch, no invented label data — the resolution reads the same
  // kind-scoped listing the picker already loads.
  const typedRef = useRef(false);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    let cancelled = false;
    setOptions(null);
    apiClient
      .listRecordsByKind(refKind, 200)
      .then((r) => {
        if (cancelled) return;
        const loaded = r.records.map((rec) => ({
          recordId: rec.recordId,
          label: labelOf(rec.payload as Record<string, unknown>, rec.recordId),
        }));
        setOptions(loaded);
        if (typedRef.current) return;
        const match = loaded.find((o) => o.recordId === value || o.label === value);
        if (match) setQuery(match.label);
      })
      .catch(() => { if (!cancelled) setOptions([]); });
    return () => { cancelled = true; };
  }, [refKind, value]);

  const filtered = useMemo(() => {
    if (!options) return [];
    const q = query.trim().toLowerCase();
    if (q.length === 0) return options;
    return options.filter(
      (o) => o.recordId.toLowerCase().includes(q) || o.label.toLowerCase().includes(q),
    );
  }, [options, query]);

  useEffect(() => { setHighlightIndex(0); }, [query]);

  const commit = (option: Option) => {
    onSelect({ kind: 'record', type: refKind, id: option.recordId, label: option.label });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIndex((p) => Math.min(p + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIndex((p) => Math.max(p - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const o = filtered[highlightIndex]; if (o) commit(o); }
    else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  };

  return (
    <div className="record-ref-picker">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => { typedRef.current = true; setQuery(e.target.value); }}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="taptab-inline-input"
        autoFocus
      />
      <ul className="record-ref-picker__list">
        {options === null ? (
          <li className="record-ref-picker__empty">Loading {refKind} records…</li>
        ) : filtered.length === 0 ? (
          <li className="record-ref-picker__empty">No {refKind} records match “{query}”</li>
        ) : (
          filtered.slice(0, 50).map((o, i) => (
            <li
              key={o.recordId}
              className={`record-ref-picker__item${i === highlightIndex ? ' record-ref-picker__item--active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(o)}
            >
              <span className="record-ref-picker__label">{o.label}</span>
              <span className="record-ref-picker__id">{o.recordId}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
