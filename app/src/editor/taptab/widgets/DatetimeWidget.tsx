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

/**
 * D1 (REG-3 fix1): the datetime-local control commits "YYYY-MM-DDTHH:mm"
 * with NO seconds, and the server's Ajv2020 `format: date-time` (ajv-formats,
 * strict) REJECTS that — the training-record create died with 422
 * "/completedAt: Invalid format: expected date-time". Proven against the
 * server's own Ajv config:
 *   "2026-10-18T14:30"    -> invalid      "2026-10-18T14:30:00" -> valid
 *
 * So the widget completes the value IT produced by appending the seconds
 * component. A value that already carries seconds (or a fraction/offset,
 * e.g. a stored "…T15:10:13.995Z") passes through untouched. Normalization
 * lives ONLY in this commit path — never page-side, never schema-side: the
 * schema's `format: date-time` remains the validation authority.
 */
function normalizeDateTimeCommit(raw: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw) ? `${raw}:00` : raw
}

export function DatetimeWidget({ value, widget, readOnly, onCommit }: DatetimeWidgetProps) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(String(value ?? ''));

  const inputType = widget === 'datetime' ? 'datetime-local' : 'date';

  // Only the datetime control's own output is completed; a `date` widget
  // commits a bare "YYYY-MM-DD" and must stay exactly that.
  const commitValue = () =>
    widget === 'datetime' ? normalizeDateTimeCommit(localValue) : localValue;

  const handleBlur = () => {
    if (editing) {
      onCommit(commitValue());
      setEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCommit(commitValue());
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
