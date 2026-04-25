/**
 * ReflistWidget — renders structured multi-reference selections.
 * Each reference is a structured object { value, source, termData? }, not a plain string.
 */

import { useState } from 'react';
import type { WidgetType } from '../types';

export interface ReflistEntry {
  value: string;
  source: 'local' | 'ontology';
  termData?: {
    label: string;
    iri: string;
    definition?: string;
    synonyms?: string[];
    ontology?: string;
  };
}

export interface ReflistWidgetProps {
  value: unknown;
  widget: WidgetType;
  refKind: string | undefined;
  readOnly: boolean;
  onCommit: (newValue: unknown) => void;
  onRefSelect: (entry: ReflistEntry) => void;
}

/**
 * Parse the value into an array of ReflistEntry.
 */
function parseReflistValue(value: unknown): ReflistEntry[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'string') {
        return { value: item, source: 'local' as const };
      }
      if (typeof item === 'object' && item !== null) {
        return item as ReflistEntry;
      }
      return { value: String(item), source: 'local' as const };
    });
  }
  // Single value — wrap in array
  if (typeof value === 'string') {
    return [{ value, source: 'local' as const }];
  }
  if (typeof value === 'object' && value !== null) {
    return [value as ReflistEntry];
  }
  return [];
}

export function ReflistWidget({
  value,
  widget,
  refKind,
  readOnly,
  onCommit,
  onRefSelect,
}: ReflistWidgetProps) {
  const [editing, setEditing] = useState(false);
  const entries = parseReflistValue(value);

  const removeEntry = (index: number) => {
    const updated = entries.filter((_, i) => i !== index);
    onCommit(updated);
  };

  if (readOnly) {
    return (
      <span className="taptab-widget-value taptab-reflist-value" data-widget={widget}>
        {entries.length > 0 ? (
          <ul className="taptab-reflist-items" style={{ margin: 0, paddingLeft: '1.2em' }}>
            {entries.map((entry, i) => (
              <li key={i} className="taptab-reflist-item">
                <span className="taptab-reflist-item-label">
                  {entry.termData?.label ?? entry.value}
                </span>
                {entry.source === 'ontology' && (
                  <span className="taptab-reflist-item-source">[{entry.source}]</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <span className="taptab-reflist-empty">No references</span>
        )}
      </span>
    );
  }

  if (editing) {
    return (
      <div className="taptab-reflist-editor" data-widget={widget}>
        {entries.map((entry, i) => (
          <div key={i} className="taptab-reflist-entry">
            <span className="taptab-reflist-entry-label">
              {entry.termData?.label ?? entry.value}
            </span>
            <button
              className="taptab-reflist-remove"
              onClick={(e) => {
                e.stopPropagation();
                removeEntry(i);
              }}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          className="taptab-reflist-add"
          onClick={(e) => {
            e.stopPropagation();
            // Trigger the ref combobox via parent — for now, just close editing
            setEditing(false);
          }}
        >
          + Add reference
        </button>
        <button
          className="taptab-reflist-done"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(false);
          }}
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <span
      className="taptab-widget-value taptab-reflist-value"
      data-widget={widget}
      onClick={() => setEditing(true)}
    >
      {entries.length > 0 ? (
        <ul className="taptab-reflist-items" style={{ margin: 0, paddingLeft: '1.2em' }}>
          {entries.map((entry, i) => (
            <li key={i} className="taptab-reflist-item">
              <span className="taptab-reflist-item-label">
                {entry.termData?.label ?? entry.value}
              </span>
              {entry.source === 'ontology' && (
                <span className="taptab-reflist-item-source">[{entry.source}]</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <span className="taptab-reflist-empty">Click to add references</span>
      )}
    </span>
  );
}
