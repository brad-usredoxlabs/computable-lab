/**
 * WidgetRenderer component for rendering different widget types.
 * Extracted from FieldRow to reduce complexity.
 */

import { useState } from 'react';
import type { WidgetType } from '../types';
import { EnumCombobox } from '../EnumCombobox';
import { RefCombobox } from '../RefCombobox';
import { RichTextField } from '../RichTextField';

export interface WidgetRendererProps {
  widget: WidgetType;
  value: unknown;
  readOnly: boolean;
  options: Array<{ value: string; label: string }> | null;
  refKind: string | undefined;
  onCommit: (newValue: unknown) => void;
  onCancel: () => void;
  onRefSelect: (value: string, source: 'local' | 'ontology', termData?: { label: string; iri: string; definition?: string; synonyms?: string[]; ontology?: string }) => void;
}

export function WidgetRenderer({
  widget,
  value,
  readOnly,
  options,
  refKind,
  onCommit,
  onCancel,
  onRefSelect,
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
  const handleRefSelect = (v: string, s: 'local' | 'ontology', t?: { label: string; iri: string; definition?: string; synonyms?: string[]; ontology?: string }) => { onRefSelect(v, s, t); setEditing(false); };
  const handleRefCancel = () => { setLocalValue(String(value ?? '')); setEditing(false); onCancel(); };
  const handleRichTextChange = (html: string) => { onCommit(html); };

  const getInputType = () => widget === 'number' ? 'number' : widget === 'date' ? 'date' : 'text';

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
    return <RefCombobox value={String(value ?? '')} refKind={refKind || 'default'} onSelect={handleRefSelect} onCancel={handleRefCancel} />;
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
