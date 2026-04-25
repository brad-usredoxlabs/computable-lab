/**
 * DatetimeWidget — renders a date or datetime input with proper formatting.
 */

import { useState } from 'react';
import type { WidgetType } from '../types';

export interface DatetimeWidgetProps {
  value: unknown;
  widget: WidgetType;
  readOnly: boolean;
  onCommit: (newValue: unknown) => void;
}

export function DatetimeWidget({ value, widget, readOnly, onCommit }: DatetimeWidgetProps) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(String(value ?? ''));

  const inputType = widget === 'datetime' ? 'datetime-local' : 'date';

  const handleBlur = () => {
    if (editing) {
      onCommit(localValue);
      setEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCommit(localValue);
      setEditing(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setLocalValue(String(value ?? ''));
      setEditing(false);
    }
  };

  if (readOnly) {
    return (
      <span className="taptab-widget-value taptab-datetime-value" data-widget={widget}>
        <span>{String(value ?? '')}</span>
      </span>
    );
  }

  if (editing) {
    return (
      <input
        type={inputType}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="taptab-inline-input taptab-datetime-input"
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span
      className="taptab-widget-value taptab-datetime-value"
      data-widget={widget}
      onClick={() => setEditing(true)}
    >
      <span>{String(value ?? '')}</span>
    </span>
  );
}
