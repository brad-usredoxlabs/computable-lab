/**
 * ChipComboboxWidget — multi-value, ontology-aware chip input.
 *
 * This is the biologist-facing input for free-vocabulary metadata arrays
 * (tags, FAIR keywords). It behaves like the ontology fields elsewhere in
 * the app (the /m material picker, MaterialPicker):
 *
 *   1. local-first   — existing local vocabulary (useTagSuggestions)
 *   2. then ontology — OLS4 search, when the field's plan includes 'ols'
 *   3. create new    — last resort, never the keyboard default
 *
 * Selections render as RefBadge chips (label + CURIE for ontology terms,
 * a remove button each), so the field reads as part of the document rather
 * than an HTML multi-select.
 *
 * Stored value: a string[] (matches the schema for tags/keywords). Local
 * picks are stored as plain strings; ontology picks are stored as the
 * structured-JSON envelope produced by serializeStructuredValue() (the same
 * convention the single-value combobox already uses), so the CURIE/IRI
 * round-trips and re-renders as an ontology chip on reload.
 *
 * NOTE on "create new": for these free-text fields, creating a new value
 * means adding the typed text as a local entry — NOT minting a server-side
 * record. apiClient.mintLocalTerm() mints a draft *material* record, which is
 * the right floor for the /m material funnel but wrong for a tag/keyword. A
 * new tag simply becomes part of the local vocabulary the next time the
 * field is searched (useTagSuggestions reads from existing usage).
 */

import { useState } from 'react';
import { RefCombobox } from '../RefCombobox';
import { RefBadge, type Ref } from '../../../shared/ref/RefBadge';
import {
  serializeStructuredValue,
  deserializeStructuredValue,
} from '../../../shared/forms/suggestionPlan';

/**
 * The loose suggestion-plan shape forwarded through FieldRow → WidgetRenderer
 * (matches WidgetRendererProps.suggestionPlan / RefComboboxProps.suggestionPlan).
 * We only read sources/ontologies/searchField here.
 */
interface WidgetSuggestionPlan {
  sources: string[];
  ontologies: string[];
  searchField: 'keywords' | 'tags';
  isRef: boolean;
  isCombobox: boolean;
  ontologyBinding?: 'allow-ontology' | 'local-material-required' | 'local-record-required';
  ownedByApp?: boolean;
  valueShape?: 'text' | 'ref' | 'record-ref' | 'ontology-ref' | 'material-ref';
  lifecycleDefault?: string;
}

export interface ChipEntry {
  /** Canonical value: the label for ontology terms, the text for local. */
  value: string;
  source: 'local' | 'ontology';
  label: string;
  /** Ontology only — e.g. "EFO:0000001". */
  curie?: string;
  /** Ontology only — e.g. "EFO". */
  namespace?: string;
  /** Ontology only — full IRI. */
  iri?: string;
}

export interface ChipComboboxWidgetProps {
  value: unknown;
  suggestionPlan?: WidgetSuggestionPlan;
  refKind: string | undefined;
  readOnly: boolean;
  onCommit: (newValue: unknown) => void;
}

interface SelectedTermData {
  label: string;
  iri?: string;
  definition?: string;
  synonyms?: string[];
  ontology?: string;
  oboId?: string;
}

/**
 * Derive a normalized { curie, namespace } from an OLS term's identifiers.
 * Mirrors the logic in FieldRow's curieFromOntologyTerm so chips and the
 * single-value combobox agree on CURIE shape.
 */
function deriveCurie(term: SelectedTermData): { curie: string; namespace: string } | null {
  if (term.oboId && /^[A-Za-z][A-Za-z0-9_]*:[A-Za-z0-9_]+$/.test(term.oboId)) {
    const [ns, ...rest] = term.oboId.split(':');
    const namespace = ns!.toUpperCase();
    return { curie: `${namespace}:${rest.join(':')}`, namespace };
  }
  const iriTail = term.iri?.split(/[\/#]/).filter(Boolean).pop();
  if (iriTail && /^[A-Za-z][A-Za-z0-9]+_[A-Za-z0-9_]+$/.test(iriTail)) {
    const [prefix, ...rest] = iriTail.split('_');
    return { curie: `${prefix!.toUpperCase()}:${rest.join('_')}`, namespace: prefix!.toUpperCase() };
  }
  const namespace = term.ontology?.trim().toUpperCase();
  if (!namespace) return null;
  const id = term.label.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return { curie: `${namespace}:${id}`, namespace };
}

/** Parse a single stored array item into a ChipEntry. */
function parseItem(item: unknown): ChipEntry | null {
  if (item == null) return null;
  if (typeof item === 'string') {
    const structured = deserializeStructuredValue(item);
    if (structured) {
      if (structured.source === 'ols') {
        const md = structured.metadata ?? {};
        return {
          value: structured.value,
          source: 'ontology',
          label: structured.value,
          curie: (md.curie as string) ?? (md.oboId as string) ?? undefined,
          namespace: (md.namespace as string) ?? (md.ontology as string)?.toUpperCase() ?? undefined,
          iri: (md.iri as string) ?? undefined,
        };
      }
      return { value: structured.value, source: 'local', label: structured.value };
    }
    return { value: item, source: 'local', label: item };
  }
  if (typeof item === 'object') {
    const obj = item as Record<string, unknown>;
    // Ref-object shape (datatypes/ref.schema.yaml): { kind, id, label, namespace, uri }.
    // This is how `valueShape: ontology-ref` arrays (e.g. material $.class) are stored.
    if (obj.kind === 'ontology' || obj.kind === 'record') {
      if (obj.kind === 'ontology') {
        const label = (obj.label as string) ?? (obj.id as string) ?? '';
        return {
          value: label,
          source: 'ontology',
          label,
          curie: (obj.id as string) ?? undefined,
          namespace: (obj.namespace as string) ?? undefined,
          iri: (obj.uri as string) ?? undefined,
        };
      }
      const label = (obj.label as string) ?? (obj.id as string) ?? '';
      return { value: (obj.id as string) ?? label, source: 'local', label };
    }
    // Already-structured entry (e.g. ReflistEntry-shaped).
    const td = (obj.termData ?? {}) as Record<string, unknown>;
    const source = obj.source === 'ontology' ? 'ontology' : 'local';
    const label = (td.label as string) ?? (obj.value as string) ?? '';
    return {
      value: (obj.value as string) ?? label,
      source,
      label,
      curie: (td.curie as string) ?? (td.oboId as string) ?? undefined,
      namespace: (td.namespace as string) ?? (td.ontology as string)?.toUpperCase() ?? undefined,
      iri: (td.iri as string) ?? undefined,
    };
  }
  return { value: String(item), source: 'local', label: String(item) };
}

function parseValue(value: unknown): ChipEntry[] {
  if (value == null) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr.map(parseItem).filter((e): e is ChipEntry => e !== null);
}

/** Serialize a ChipEntry to its stored array item. */
function serializeEntry(entry: ChipEntry): string {
  if (entry.source === 'ontology') {
    return serializeStructuredValue({
      value: entry.label,
      source: 'ols',
      metadata: {
        ...(entry.iri ? { iri: entry.iri } : {}),
        ...(entry.curie ? { curie: entry.curie, oboId: entry.curie } : {}),
        ...(entry.namespace ? { namespace: entry.namespace, ontology: entry.namespace } : {}),
      },
    });
  }
  return entry.value;
}

function entryKey(entry: ChipEntry): string {
  return `${entry.source}:${entry.curie ?? entry.value}`;
}

function entryToRef(entry: ChipEntry, searchField: string): Ref {
  if (entry.source === 'ontology') {
    return {
      kind: 'ontology',
      id: entry.curie ?? entry.value,
      namespace: entry.namespace ?? '',
      label: entry.label,
      ...(entry.iri ? { uri: entry.iri } : {}),
    };
  }
  return {
    kind: 'record',
    type: searchField === 'keywords' ? 'keyword' : 'tag',
    id: entry.value,
    label: entry.label,
  };
}

export function ChipComboboxWidget({
  value,
  suggestionPlan,
  refKind,
  readOnly,
  onCommit,
}: ChipComboboxWidgetProps) {
  const [adding, setAdding] = useState(false);
  // Bumping this key remounts RefCombobox after each add so the search box
  // clears and the user can keep adding chips without re-clicking "+ Add".
  const [addSeq, setAddSeq] = useState(0);

  const entries = parseValue(value);
  const searchField = suggestionPlan?.searchField ?? 'tags';
  // Ref-shaped fields (e.g. material $.class, valueShape: ontology-ref) store an
  // array of ref objects per datatypes/ref.schema.yaml. Tags/keywords instead
  // store a string[] (plain text or a structured-JSON envelope). Pick the
  // serializer to match the field's schema so values round-trip and validate.
  const valueShape = suggestionPlan?.valueShape;
  const isRefShape =
    valueShape === 'ref' ||
    valueShape === 'record-ref' ||
    valueShape === 'ontology-ref' ||
    valueShape === 'material-ref';
  const addLabel =
    valueShape === 'ontology-ref'
      ? '+ Classification'
      : searchField === 'keywords'
        ? '+ Keyword'
        : '+ Tag';

  const commit = (next: ChipEntry[]) =>
    onCommit(next.map((e) => (isRefShape ? entryToRef(e, searchField) : serializeEntry(e))));

  const appendEntry = (entry: ChipEntry) => {
    const key = entryKey(entry);
    if (entries.some((e) => entryKey(e) === key)) {
      // Already present — no-op, just keep the search box open for the next add.
      setAddSeq((n) => n + 1);
      return;
    }
    commit([...entries, entry]);
    setAddSeq((n) => n + 1);
  };

  const removeAt = (index: number) => {
    commit(entries.filter((_, i) => i !== index));
  };

  const handleSelect = (v: string, source: 'local' | 'ontology', termData?: SelectedTermData) => {
    if (source === 'ontology' && termData) {
      const curie = deriveCurie(termData);
      appendEntry({
        value: termData.label,
        source: 'ontology',
        label: termData.label,
        curie: curie?.curie,
        namespace: curie?.namespace,
        iri: termData.iri,
      });
    } else {
      appendEntry({ value: v, source: 'local', label: v });
    }
  };

  const handleCreateNew = (query: string) => {
    const q = query.trim();
    if (q) appendEntry({ value: q, source: 'local', label: q });
  };

  const chips = entries.map((entry, i) => (
    <RefBadge
      key={entryKey(entry) + i}
      value={entryToRef(entry, searchField)}
      size="md"
      onRemove={readOnly ? undefined : () => removeAt(i)}
    />
  ));

  if (readOnly) {
    return (
      <span className="taptab-widget-value taptab-chips" data-widget="chips">
        {entries.length > 0 ? (
          <span className="taptab-chips-list">{chips}</span>
        ) : (
          <span className="taptab-widget-empty" aria-hidden />
        )}
      </span>
    );
  }

  return (
    // The wrapper is the tab-nav target: focusAdjacentTapTabField activates a
    // field by clicking its .taptab-widget-value, so a click here opens the
    // add affordance (and lands focus in the search box). Chip remove buttons
    // and the inner controls stopPropagation so they don't re-trigger this.
    <span
      className="taptab-widget-value taptab-chips"
      data-widget="chips"
      onClick={() => {
        if (!adding) setAdding(true);
      }}
    >
      <span className="taptab-chips-list">{chips}</span>
      {adding ? (
        <span className="taptab-chips-adding" onClick={(e) => e.stopPropagation()}>
          <RefCombobox
            key={addSeq}
            value=""
            refKind={refKind || searchField}
            suggestionPlan={suggestionPlan}
            allowCreate={!isRefShape}
            onCreateNew={isRefShape ? undefined : handleCreateNew}
            onSelect={handleSelect}
            onCancel={() => setAdding(false)}
          />
          <button
            type="button"
            className="taptab-chips-done"
            onClick={(e) => {
              e.stopPropagation();
              setAdding(false);
            }}
          >
            Done
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="taptab-chips-add"
          onClick={(e) => {
            e.stopPropagation();
            setAdding(true);
          }}
        >
          {addLabel}
        </button>
      )}
    </span>
  );
}
