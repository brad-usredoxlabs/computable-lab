/**
 * WidgetRenderer component for rendering different widget types.
 * Supports primitive widgets (text, number, date, checkbox, select, ref, combobox, textarea, markdown, hidden)
 * and composite widgets (datetime, multiselect, reflist, array, object, readonly).
 */

import { useState } from 'react';
import type { WidgetType } from '../types';
import { EnumCombobox } from '../EnumCombobox';
import { RefCombobox } from '../RefCombobox';
import { RichTextField } from '../RichTextField';
import { ReadonlyWidget } from '../widgets/ReadonlyWidget';
import { DatetimeWidget } from '../widgets/DatetimeWidget';
import { MultiselectWidget } from '../widgets/MultiselectWidget';
import { ReflistWidget, type ReflistEntry } from '../widgets/ReflistWidget';
import { ArrayWidget } from '../widgets/ArrayWidget';
import { ObjectWidget } from '../widgets/ObjectWidget';
import type { StructuredValue } from '../../shared/forms/suggestionPlan';

export interface WidgetRendererProps {
  widget: WidgetType;
  value: unknown;
  readOnly: boolean;
  options: Array<{ value: string; label: string }> | null;
  refKind: string | undefined;
  /** Optional suggestion plan from the projection (sources, ontologies, field). */
  suggestionPlan?: {
    sources: string[];
    ontologies: string[];
    searchField: 'keywords' | 'tags';
    isRef: boolean;
    isCombobox: boolean;
  };
  onCommit: (newValue: unknown) => void;
  onCancel: () => void;
  onRefSelect: (
    value: string,
    source: 'local' | 'ontology',
    termData?: {
      label: string;
      iri: string;
      definition?: string;
      synonyms?: string[];
      ontology?: string;
    } & { __structured__?: StructuredValue }
  ) => void;
  /** Object widget properties (for 'object' widget type) */
  objectProperties?: Array<{ name: string; widget: WidgetType; label: string; help?: string; required?: boolean; options?: Array<{ value: string; label: string }> }>;
  /** Multiselect options (for 'multiselect' widget type) */
  multiselectOptions?: Array<{ value: string; label: string }>;
}

export function WidgetRenderer({
  widget,
  value,
  readOnly,
  options,
  refKind,
  suggestionPlan,
  onCommit,
  onCancel,
  onRefSelect,
  objectProperties,
  multiselectOptions,
}: WidgetRendererProps) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(String(value ?? ''));

  const handleInputBlur = () => {
    if (editing) { onCommit(localValue); setEditing(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); onCommit(localValue); setEditing(false); }
    else if (e.key === 'Escape') { e.preventDefault(); setLocalValue(String(value ?? '')); setEditing(false); onCancel(); }
  };

  const handleComboboxSelect = (v: string) => { onCommit(v); setEditing(false); };
  const handleComboboxCancel = () => { setLocalValue(String(value ?? '')); setEditing(false); onCancel(); };

  // Handle ref/combobox selection — commit structured value with provenance
  const handleRefSelect = (
    v: string,
    s: 'local' | 'ontology',
    t?: {
      label: string;
      iri: string;
      definition?: string;
      synonyms?: string[];
      ontology?: string;
    } & { __structured__?: StructuredValue }
  ) => {
    onRefSelect(v, s, t);
    setEditing(false);
  };
  const handleRefCancel = () => { setLocalValue(String(value ?? '')); setEditing(false); onCancel(); };
  const handleRichTextChange = (html: string) => { onCommit(html); };

  const getInputType = () => widget === 'number' ? 'number' : widget === 'date' ? 'date' : 'text';

  // ========================================================================
  // Composite widgets — dedicated renderers
  // ========================================================================

  if (widget === 'readonly') {
    return <ReadonlyWidget value={value} widget={widget} />;
  }

  if (widget === 'datetime') {
    return <DatetimeWidget value={value} widget={widget} readOnly={readOnly} onCommit={onCommit} />;
  }

  if (widget === 'multiselect') {
    const opts = multiselectOptions ?? options;
    return (
      <MultiselectWidget
        value={value}
        widget={widget}
        options={opts}
        readOnly={readOnly}
        onCommit={onCommit}
      />
    );
  }

  if (widget === 'reflist') {
    return (
      <ReflistWidget
        value={value}
        widget={widget}
        refKind={refKind}
        readOnly={readOnly}
        onCommit={onCommit}
        onRefSelect={(entry: ReflistEntry) => {
          onRefSelect(entry.value, entry.source, entry.termData);
        }}
      />
    );
  }

  if (widget === 'array') {
    return <ArrayWidget value={value} widget={widget} readOnly={readOnly} onCommit={onCommit} />;
  }

  if (widget === 'object') {
    return (
      <ObjectWidget
        value={value}
        widget={widget}
        properties={(objectProperties ?? []).map((p) => ({
          name: p.name,
          widget: p.widget,
          label: p.label,
          help: p.help,
          required: p.required ?? false,
          options: p.options,
        }))}
        readOnly={readOnly}
        onCommit={onCommit}
      />
    );
  }

  // ========================================================================
  // Primitive widgets — existing logic
  // ========================================================================

  if (widget === 'hidden') return null;

  if (widget === 'checkbox') {
    return (
      <input type="checkbox" checked={value as boolean || false} onChange={() => onCommit(!(value as boolean || false))} disabled={readOnly} className="taptab-checkbox" />
    );
  }

  if (widget === 'select' && editing && options) {
    return <EnumCombobox options={options} value={String(value ?? '')} onSelect={handleComboboxSelect} onCancel={handleComboboxCancel} />;
  }

  if ((widget === 'ref' || widget === 'combobox') && editing) {
    return (
      <RefCombobox
        value={String(value ?? '')}
        refKind={refKind || 'default'}
        suggestionPlan={suggestionPlan}
        onSelect={handleRefSelect}
        onCancel={handleRefCancel}
      />
    );
  }

  if (widget === 'textarea' || widget === 'markdown') {
    return <RichTextField content={String(value ?? '')} onChange={handleRichTextChange} />;
  }

  const display = editing ? (
    <input type={getInputType()} value={localValue} onChange={(e) => setLocalValue(e.target.value)} onBlur={handleInputBlur} onKeyDown={handleKeyDown} className="taptab-inline-input" onClick={(e) => e.stopPropagation()} />
  ) : (
    <span>{String(value ?? '')}</span>
  );

  const wrapperProps = readOnly ? { className: 'taptab-widget-value' } : { className: 'taptab-widget-value', onClick: () => setEditing(true) };
  return <span {...wrapperProps}>{display}</span>;
}
