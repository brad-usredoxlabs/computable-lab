/**
 * suggestionPlan.ts — Normalized suggestion plan derived from
 * FieldHint / ProjectionSlot metadata.
 *
 * This module maps UISpec combobox/ref semantics (sources, ontologies,
 * field, refKind, options) into a single plan object that both the
 * server-side projection service and the client-side widgets can consume.
 *
 * The plan preserves:
 *   - field.props.sources       → sources[]
 *   - field.props.ontologies    → ontologies[]
 *   - field.props.field         → searchField ('keywords' | 'tags')
 *   - refKind                   → refKind (for ref widgets)
 *   - options                   → explicit option list
 *
 * This replaces the old hard-coded keyword-only lookup with a
 * semantic, UISpec-driven suggestion plan.
 */

// ============================================================================
// Domain types
// ============================================================================

/**
 * The search field used for local tag/keyword suggestions.
 */
export type SearchField = 'keywords' | 'tags';

/**
 * A single suggestion source (local vocabulary, ontology, etc.).
 */
export type SuggestionSource = 'local' | 'ols' | 'vendor-search' | 'local-records';

/**
 * Normalized suggestion plan derived from FieldHint / ProjectionSlot.
 */
export interface SuggestionPlan {
  /** Widget type this plan applies to. */
  widget: string;
  /** Local search field ('keywords' or 'tags'). */
  searchField: SearchField;
  /** Suggestion sources to activate (e.g. ['local', 'ols']). */
  sources: SuggestionSource[];
  /** Ontology namespaces to restrict OLS search to. */
  ontologies: string[];
  /** For ref widgets: the target record kind. */
  refKind?: string;
  /** Explicit option list for select/radio/multiselect. */
  options?: Array<{ value: string; label: string }>;
  /** Whether this plan represents a structured ref (not plain text). */
  isRef: boolean;
  /** Whether this plan represents a combobox (multi-value). */
  isCombobox: boolean;
}

// ============================================================================
// Plan builder
// ============================================================================

/**
 * Build a SuggestionPlan from a FieldHint (used in form.sections fallback).
 */
export function buildSuggestionPlanFromFieldHint(
  widget: string,
  props?: Record<string, unknown>,
  refKind?: string,
  options?: Array<{ value: string; label: string }>
): SuggestionPlan {
  const sources = extractSources(props);
  const ontologies = extractOntologies(props);
  const searchField = extractSearchField(props);
  const isRef = widget === 'ref' || widget === 'reflist';
  const isCombobox = widget === 'combobox';

  return {
    widget,
    searchField,
    sources,
    ontologies,
    refKind,
    options,
    isRef,
    isCombobox,
  };
}

/**
 * Build a SuggestionPlan from a ProjectionSlot (used in editor config path).
 */
export function buildSuggestionPlanFromSlot(
  widget: string,
  props?: Record<string, unknown>,
  refKind?: string,
  options?: Array<{ value: string; label: string }>
): SuggestionPlan {
  return buildSuggestionPlanFromFieldHint(widget, props, refKind, options);
}

// ============================================================================
// Extractors
// ============================================================================

/**
 * Extract suggestion sources from field props.
 *
 * UISpec convention:
 *   field.props.sources = ['local'] | ['local', 'ols'] | ['vendor-search'] | ...
 *
 * Falls back to ['local'] when no sources are specified.
 */
function extractSources(props?: Record<string, unknown>): SuggestionSource[] {
  const raw = props?.sources;
  if (Array.isArray(raw)) {
    return raw.filter((s): s is SuggestionSource =>
      s === 'local' || s === 'ols' || s === 'vendor-search' || s === 'local-records'
    );
  }
  // Default: local-only
  return ['local'];
}

/**
 * Extract ontology namespaces from field props.
 *
 * UISpec convention:
 *   field.props.ontologies = ['efo', 'chebi', 'go']
 */
function extractOntologies(props?: Record<string, unknown>): string[] {
  const raw = props?.ontologies;
  if (Array.isArray(raw)) {
    return raw.filter((o): o is string => typeof o === 'string' && o.length > 0);
  }
  return [];
}

/**
 * Extract the search field from field props.
 *
 * UISpec convention:
 *   field.props.field = 'keywords' | 'tags'
 *
 * Falls back to 'tags' (the legacy default).
 */
function extractSearchField(props?: Record<string, unknown>): SearchField {
  const raw = props?.field;
  if (raw === 'keywords' || raw === 'tags') {
    return raw;
  }
  return 'tags';
}

// ============================================================================
// Structured value helpers
// ============================================================================

/**
 * A structured value that carries source provenance.
 * Used when committing selections from combobox/ref widgets.
 */
export interface StructuredValue {
  /** The stored value (label, IRI, recordId, etc.). */
  value: string;
  /** Source provider that produced this value. */
  source: SuggestionSource;
  /** Optional structured metadata (e.g. IRI, ontology namespace). */
  metadata?: Record<string, unknown>;
}

/**
 * Serialize a structured value to a plain string for storage.
 * Returns the raw value for simple cases, or a JSON-encoded structured
 * payload when metadata is present.
 */
export function serializeStructuredValue(sv: StructuredValue): string {
  if (!sv.metadata || Object.keys(sv.metadata).length === 0) {
    return sv.value;
  }
  return JSON.stringify({
    __structured__: true,
    value: sv.value,
    source: sv.source,
    metadata: sv.metadata,
  });
}

/**
 * Deserialize a stored value back to a StructuredValue.
 * Returns null if the value is a plain string (no structured marker).
 */
export function deserializeStructuredValue(
  stored: string
): StructuredValue | null {
  try {
    const parsed = JSON.parse(stored);
    if (parsed && parsed.__structured__ === true) {
      return {
        value: parsed.value,
        source: parsed.source as SuggestionSource,
        metadata: parsed.metadata,
      };
    }
  } catch {
    // Not JSON — plain string
  }
  return null;
}

// ============================================================================
// Exports
// ============================================================================

export { extractSources, extractOntologies, extractSearchField };
