/**
 * ArrayWidget — renders repeatable item groups / repeaters.
 * Each item is a structured object, not collapsed to JSON text.
 */

import { useState } from 'react';
import type { WidgetType } from '../types';

export interface ArrayWidgetProps {
  value: unknown;
  widget: WidgetType;
  readOnly: boolean;
  onCommit: (newValue: unknown) => void;
}

/**
 * Format a single array item for display.
 * - object → formatted key-value pairs
 * - primitive → formatted string
 */
function formatItem(item: unknown): string {
  if (item === null || item === undefined) return '—';
  if (typeof item === 'object' && !Array.isArray(item)) {
    const entries = Object.entries(item as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    return entries
      .map(([k, v]) => `  ${k}: ${formatItem(v)}`)
      .join('\n');
  }
  if (Array.isArray(item)) {
    return item.map(formatItem).join('\n');
  }
  return String(item);
}

export function ArrayWidget({ value, widget, readOnly, onCommit }: ArrayWidgetProps) {
  const [editing, setEditing] = useState(false);

  const items = Array.isArray(value) ? value : value ? [value] : [];

  const removeItem = (index: number) => {
    const updated = items.filter((_, i) => i !== index);
    onCommit(updated);
  };

  if (readOnly) {
    return (
      <span className="taptab-widget-value taptab-array-value" data-widget={widget}>
        {items.length > 0 ? (
          <ul className="taptab-array-items" style={{ margin: 0, paddingLeft: '1.2em' }}>
            {items.map((item, i) => (
              <li key={i} className="taptab-array-item">
                <pre className="taptab-array-item-content" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {formatItem(item)}
                </pre>
              </li>
            ))}
          </ul>
        ) : (
          <span className="taptab-array-empty">Empty array</span>
        )}
      </span>
    );
  }

  if (editing) {
    return (
      <div className="taptab-array-editor" data-widget={widget}>
        {items.map((item, i) => (
          <div key={i} className="taptab-array-entry">
            <pre className="taptab-array-entry-content" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {formatItem(item)}
            </pre>
            <button
              className="taptab-array-remove"
              onClick={(e) => {
                e.stopPropagation();
                removeItem(i);
              }}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          className="taptab-array-add"
          onClick={(e) => {
            e.stopPropagation();
            onCommit([...items, {}]);
          }}
        >
          + Add item
        </button>
        <button
          className="taptab-array-done"
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
      className="taptab-widget-value taptab-array-value"
      data-widget={widget}
      onClick={() => setEditing(true)}
    >
      {items.length > 0 ? (
        <ul className="taptab-array-items" style={{ margin: 0, paddingLeft: '1.2em' }}>
          {items.map((item, i) => (
            <li key={i} className="taptab-array-item">
              <pre className="taptab-array-item-content" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {formatItem(item)}
              </pre>
            </li>
          ))}
        </ul>
      ) : (
        <span className="taptab-array-empty">Click to add items</span>
      )}
    </span>
  );
}
