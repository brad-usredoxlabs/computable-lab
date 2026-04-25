/**
 * ReadonlyWidget — renders a stable, non-editable display surface.
 * Does NOT collapse to raw JSON text; formats values in a readable way.
 */

import type { WidgetType } from '../types';

export interface ReadonlyWidgetProps {
  value: unknown;
  widget: WidgetType;
}

/**
 * Format a value for stable readonly display.
 * - null/undefined → "—"
 * - boolean → "true"/"false"
 * - number → formatted string
 * - string → as-is
 * - array → line-separated items
 * - object → formatted key-value pairs
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((item) => formatValue(item)).join('\n');
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    return entries
      .map(([k, v]) => `  ${k}: ${formatValue(v)}`)
      .join('\n');
  }
  return String(value);
}

export function ReadonlyWidget({ value, widget }: ReadonlyWidgetProps) {
  const formatted = formatValue(value);

  // For datetime widgets, add a date-specific class
  const className =
    widget === 'datetime'
      ? 'taptab-readonly taptab-readonly-datetime'
      : 'taptab-readonly';

  return (
    <span className={className} data-widget={widget}>
      <pre className="taptab-readonly-content" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {formatted}
      </pre>
    </span>
  );
}
