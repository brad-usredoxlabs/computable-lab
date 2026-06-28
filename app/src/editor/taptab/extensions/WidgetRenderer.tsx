/**
 * WidgetRenderer component for rendering different widget types.
 * Supports primitive widgets (text, number, date, checkbox, select, ref, combobox, textarea, markdown, hidden)
 * and composite widgets (datetime, multiselect, reflist, array, object, readonly).
 */

import { useEffect, useMemo, useState } from 'react';
import { focusAdjacentTapTabField } from '../tabNavPlugin';
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
import { ChipComboboxWidget } from '../widgets/ChipComboboxWidget';
import {
  ProtocolAiSuggestionsWidget,
  ProtocolEquipmentRolesWidget,
  ProtocolLabwareRolesWidget,
  ProtocolMaterialRolesWidget,
  ProtocolProseAuthoringWidget,
  ProtocolStepRolesWidget,
} from '../widgets/ProtocolAuthoringWidgets';
import type { StructuredValue } from '../../../shared/forms/suggestionPlan';

function isRecordLikeRef(value: unknown): value is { id?: unknown; label?: unknown; type?: unknown; kind?: unknown } {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    ('id' in value || 'label' in value) &&
    ('kind' in value || 'type' in value || 'id' in value),
  );
}

function formatWidgetDisplayValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (isRecordLikeRef(value)) {
    const label = typeof value.label === 'string' ? value.label : '';
    const id = typeof value.id === 'string' ? value.id : '';
    if (label && id) return `${label} (${id})`;
    return label || id || JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => formatWidgetDisplayValue(item)).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatWidgetEditValue(value: unknown): string {
  if (isRecordLikeRef(value) && typeof value.id === 'string') return value.id;
  return formatWidgetDisplayValue(value);
}

function hasWidgetValue(value: unknown): boolean {
  return value !== null && value !== undefined && !(typeof value === 'string' && value === '');
}

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
    ontologyBinding?: 'allow-ontology' | 'local-material-required' | 'local-record-required';
    ownedByApp?: boolean;
    valueShape?: 'text' | 'ref' | 'record-ref' | 'ontology-ref' | 'material-ref';
    lifecycleDefault?: string;
  };
  onCommit: (newValue: unknown) => void;
  onCancel: () => void;
  onRefSelect: (
    value: string,
    source: 'local' | 'ontology',
    termData?: {
      label: string;
      iri?: string;
      definition?: string;
      synonyms?: string[];
      ontology?: string;
      oboId?: string;
    } & { __structured__?: StructuredValue }
  ) => void;
  /** Object widget properties (for 'object' widget type) */
  objectProperties?: Array<{ name: string; widget: WidgetType; label: string; help?: string; required?: boolean; options?: Array<{ value: string; label: string }> }>;
  /** Multiselect options (for 'multiselect' widget type) */
  multiselectOptions?: Array<{ value: string; label: string }>;
  /** Canonical record ID for record-scoped custom widgets. */
  recordId?: string;
  /** Patch sibling fields from record-scoped widgets (path -> value). */
  onRecordPatch?: (patch: Record<string, unknown>) => void;
  /** Read current sibling field value by JSON path. */
  getRecordValue?: (path: string) => unknown;
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
  recordId,
  onRecordPatch,
  getRecordValue,
}: WidgetRendererProps) {
  const [editing, setEditing] = useState(false);
  const editText = useMemo(() => formatWidgetEditValue(value), [value]);
  const [localValue, setLocalValue] = useState(editText);

  useEffect(() => {
    if (!editing) setLocalValue(editText);
  }, [editing, editText]);

  const handleInputBlur = () => {
    if (editing) { onCommit(localValue); setEditing(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); onCommit(localValue); setEditing(false); }
    else if (e.key === 'Escape') { e.preventDefault(); setLocalValue(editText); setEditing(false); onCancel(); }
    else if (e.key === 'Tab') {
      // Keydowns inside the React NodeView never reach ProseMirror's
      // tab-nav plugin, so Word-style commit-and-advance is handled here.
      e.preventDefault();
      e.stopPropagation();
      const from = e.currentTarget as HTMLElement;
      onCommit(localValue);
      setEditing(false);
      focusAdjacentTapTabField(from, e.shiftKey);
    }
  };

  const handleComboboxSelect = (v: string) => { onCommit(v); setEditing(false); };
  const handleComboboxCancel = () => { setLocalValue(editText); setEditing(false); onCancel(); };

  // Handle ref/combobox selection — commit structured value with provenance
  const handleRefSelect = (
    v: string,
    s: 'local' | 'ontology',
    t?: {
      label: string;
      iri?: string;
      definition?: string;
      synonyms?: string[];
      ontology?: string;
      oboId?: string;
    } & { __structured__?: StructuredValue }
  ) => {
    onRefSelect(v, s, t);
    setEditing(false);
  };
  const handleRefCancel = () => { setLocalValue(editText); setEditing(false); onCancel(); };
  const handleRichTextChange = (html: string) => { onCommit(html); };

  const getInputType = () => widget === 'number' ? 'number' : widget === 'date' ? 'date' : 'text';

  // ========================================================================
  // Composite widgets — dedicated renderers
  // ========================================================================

  if (widget === 'protocol-prose-authoring') {
    return <ProtocolProseAuthoringWidget value={value} readOnly={readOnly} recordId={recordId} onCommit={onCommit} onRecordPatch={onRecordPatch} getRecordValue={getRecordValue} />;
  }

  if (widget === 'protocol-material-roles') {
    return <ProtocolMaterialRolesWidget value={value} readOnly={readOnly} recordId={recordId} onCommit={onCommit} />;
  }

  if (widget === 'protocol-labware-roles') {
    return <ProtocolLabwareRolesWidget value={value} readOnly={readOnly} recordId={recordId} onCommit={onCommit} />;
  }

  if (widget === 'protocol-equipment-roles') {
    return <ProtocolEquipmentRolesWidget value={value} readOnly={readOnly} recordId={recordId} onCommit={onCommit} />;
  }

  if (widget === 'protocol-step-roles') {
    return <ProtocolStepRolesWidget value={value} readOnly={readOnly} recordId={recordId} onCommit={onCommit} onRecordPatch={onRecordPatch} getRecordValue={getRecordValue} />;
  }

  if (widget === 'protocol-ai-suggestions') {
    return <ProtocolAiSuggestionsWidget value={value} readOnly={readOnly} recordId={recordId} onCommit={onCommit} />;
  }

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

  if (widget === 'chips') {
    return (
      <ChipComboboxWidget
        value={value}
        suggestionPlan={suggestionPlan}
        refKind={refKind}
        readOnly={readOnly}
        onCommit={onCommit}
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
        value={editText}
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

  // For option-backed widgets (e.g. select), show the option's friendly label
  // in display mode rather than the stored raw value (e.g. "CC BY 4.0" instead
  // of "CC-BY-4.0", "In Progress" instead of "in_progress").
  const optionLabel = options?.find((o) => String(o.value) === String(value ?? ''))?.label;
  const displayText = optionLabel ?? formatWidgetDisplayValue(value);

  const display = editing ? (
    // autoFocus: edit mode is entered by clicking the display span (or via
    // Tab-nav's synthetic click) — the input that replaces it must take
    // focus itself or keystrokes silently go nowhere.
    <input type={getInputType()} value={localValue} onChange={(e) => setLocalValue(e.target.value)} onBlur={handleInputBlur} onKeyDown={handleKeyDown} className="taptab-inline-input" onClick={(e) => e.stopPropagation()} autoFocus />
  ) : hasWidgetValue(value) ? (
    <span>{displayText}</span>
  ) : (
    // Visible affordance for empty editable fields — without it a new
    // record renders as invisible zero-width click targets.
    <span className="taptab-widget-empty" aria-hidden>
      {readOnly ? '' : '—'}
    </span>
  );

  const wrapperProps = readOnly ? { className: 'taptab-widget-value' } : { className: 'taptab-widget-value', onClick: () => setEditing(true) };
  return <span {...wrapperProps}>{display}</span>;
}
