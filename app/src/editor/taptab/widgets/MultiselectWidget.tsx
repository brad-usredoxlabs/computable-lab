/**
 * MultiselectWidget — renders a typed multi-value selection, not comma-joined text.
 */

import { useState } from 'react';
import type { WidgetType } from '../types';

export interface MultiselectWidgetProps {
  value: unknown;
  widget: WidgetType;
  options: Array<{ value: string; label: string }> | null;
  readOnly: boolean;
  onCommit: (newValue: unknown) => void;
}

export function MultiselectWidget({
  value,
  widget,
  options,
  readOnly,
  onCommit,
}: MultiselectWidgetProps) {
  const [editing, setEditing] = useState(false);

  // Parse the current value as an array of strings
  const currentValue: string[] = Array.isArray(value)
    ? (value as string[])
    : value
      ? [String(value)]
      : [];

  const toggleOption = (optionValue: string) => {
    const updated = currentValue.includes(optionValue)
      ? currentValue.filter((v) => v !== optionValue)
      : [...currentValue, optionValue];
    onCommit(updated);
  };

  if (readOnly) {
    return (
      <span className="taptab-widget-value taptab-multiselect-value" data-widget={widget}>
        {currentValue.length > 0 ? (
          <ul className="taptab-multiselect-tags" style={{ margin: 0, paddingLeft: '1.2em' }}>
            {currentValue.map((v) => {
              const opt = options?.find((o) => o.value === v);
              return (
                <li key={v} className="taptab-multiselect-tag">
                  {opt?.label ?? v}
                </li>
              );
            })}
          </ul>
        ) : (
          <span className="taptab-multiselect-empty">None selected</span>
        )}
      </span>
    );
  }

  if (editing) {
    return (
      <div className="taptab-multiselect-editor" data-widget={widget}>
        {options?.map((opt) => (
          <label key={opt.value} className="taptab-multiselect-option">
            <input
              type="checkbox"
              checked={currentValue.includes(opt.value)}
              onChange={() => toggleOption(opt.value)}
              onClick={(e) => e.stopPropagation()}
            />
            <span>{opt.label}</span>
          </label>
        ))}
        <button
          className="taptab-multiselect-done"
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
      className="taptab-widget-value taptab-multiselect-value"
      data-widget={widget}
      onClick={() => setEditing(true)}
    >
      {currentValue.length > 0 ? (
        <ul className="taptab-multiselect-tags" style={{ margin: 0, paddingLeft: '1.2em' }}>
          {currentValue.map((v) => {
            const opt = options?.find((o) => o.value === v);
            return (
              <li key={v} className="taptab-multiselect-tag">
                {opt?.label ?? v}
              </li>
            );
          })}
        </ul>
      ) : (
        <span className="taptab-multiselect-empty">Click to select</span>
      )}
    </span>
  );
}
