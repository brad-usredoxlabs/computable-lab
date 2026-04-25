/**
 * UI Specification types for schema-driven forms.
 * Mirrors computable-lab/src/ui/types.ts with frontend adjustments.
 */

export type WidgetType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'radio'
  | 'date'
  | 'datetime'
  | 'ref'
  | 'reflist'
  | 'array'
  | 'object'
  | 'hidden'
  | 'readonly'
  | 'custom'
  | 'markdown'
  | 'combobox'

export type LayoutDirection = 'vertical' | 'horizontal' | 'grid' | 'sections'

export interface VisibilityCondition {
  when: string
  operator: 'equals' | 'notEquals' | 'in' | 'notIn' | 'exists' | 'notExists'
  value?: unknown
}

export interface FieldOption {
  value: string | number | boolean
  label: string
  description?: string
  disabled?: boolean
}

export interface FieldHint {
  path: string
  widget: WidgetType | string
  label?: string
  help?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  /** Canonical readOnly from backend type */
  readOnly?: boolean
  /** YAML uses lowercase readonly — accept both */
  readonly?: boolean
  /** YAML uses hidden: true to suppress rendering */
  hidden?: boolean
  defaultValue?: unknown
  visible?: VisibilityCondition
  options?: FieldOption[]
  refKind?: string
  items?: FieldHint
  fields?: FieldHint[]
  customWidget?: string
  props?: Record<string, unknown>
  order?: number
  colSpan?: number
}

export interface FormSection {
  id?: string
  title?: string
  description?: string
  layout?: LayoutDirection
  columns?: number
  fields: FieldHint[]
  visible?: VisibilityCondition
  collapsible?: boolean
  collapsed?: boolean
}

export interface FormConfig {
  layout?: LayoutDirection
  columns?: number
  sections: FormSection[]
  submit?: { label?: string; disabled?: boolean }
  cancel?: { label?: string; show?: boolean }
}

export interface ListColumn {
  path: string
  label: string
  width?: string | number
  sortable?: boolean
  renderer?: string
}

export interface ListConfig {
  columns: ListColumn[]
  sortField?: string
  sortDirection?: 'asc' | 'desc'
  searchFields?: string[]
}

export interface UISpec {
  uiVersion: number
  schemaId: string
  display?: {
    titleField?: string
    subtitleField?: string
    icon?: string
  }
  form?: FormConfig
  list?: ListConfig
  detail?: unknown
  className?: string
}

/** Response shape from GET /ui/schema/:schemaId */
export interface UISpecResponse {
  schemaId: string
  spec: UISpec
}

/** Response shape from GET /ui/record/:recordId */
export interface RecordWithUIResponse {
  record: {
    recordId: string
    schemaId: string
    payload: Record<string, unknown>
    meta?: Record<string, unknown>
  }
  uiSpec: UISpec | null
  schema: Record<string, unknown> | null
}

/**
 * Block kinds for the editor/document layout.
 */
export type EditorBlockKind = 'section' | 'paragraph' | 'repeater' | 'table'

/**
 * Suggestion provider kinds for editor slots.
 */
export type SuggestionProviderKind =
  | 'local-records'
  | 'local-vocab'
  | 'ontology'
  | 'vendor-search'
  | 'compiler'

/**
 * A block in the editor/document layout.
 */
export interface EditorBlock {
  /** Stable block identifier */
  id: string
  /** Block kind */
  kind: EditorBlockKind
  /** Display label */
  label?: string
  /** Help text / description */
  help?: string
  /** Whether the block is collapsible */
  collapsible?: boolean
  /** Whether the block starts collapsed */
  collapsed?: boolean
  /** For repeater/table: the path to the array field */
  path?: string
  /** For table: column definitions */
  columns?: EditorTableColumn[]
  /** Visibility condition */
  visible?: VisibilityCondition
}

/**
 * Column definition for a table block.
 */
export interface EditorTableColumn {
  /** Path to the field */
  path: string
  /** Column header label */
  label: string
  /** Column width */
  width?: string | number
  /** Widget type for editing */
  widget?: WidgetType | string
}

/**
 * A slot in the editor/document layout.
 */
export interface EditorSlot {
  /** Stable slot identifier */
  id: string
  /** JSONPath to the field in the payload */
  path: string
  /** Display label */
  label: string
  /** Widget type to render */
  widget: WidgetType | string
  /** Help text / description */
  help?: string
  /** Whether the slot is required */
  required?: boolean
  /** Suggestion providers available for this slot */
  suggestionProviders?: SuggestionProviderKind[]
  /** Visibility condition */
  visible?: VisibilityCondition
}

/**
 * Editor configuration for document-style surfaces.
 * Additive to form, list, and detail configs.
 */
export interface EditorConfig {
  /** Editor mode — 'document' for document-style layout */
  mode: 'document'
  /** Ordered blocks in the document */
  blocks: EditorBlock[]
  /** Slots that can be placed inside blocks */
  slots: EditorSlot[]
}

// ============================================================================
// EditorProjection types — frontend response shape
// ============================================================================

/**
 * Diagnostic severity levels for projection diagnostics.
 */
export type DiagnosticSeverity = 'info' | 'warning' | 'error'

/**
 * A diagnostic emitted during projection (non-fatal, deterministic).
 */
export interface EditorDiagnostic {
  /** Stable diagnostic identifier */
  code: string
  /** Human-readable message */
  message: string
  /** Severity level */
  severity: DiagnosticSeverity
  /** Optional path in the record payload this diagnostic refers to */
  path?: string
}

/**
 * A block emitted by the EditorProjection service.
 */
export interface ProjectionBlock {
  /** Stable block identifier */
  id: string
  /** Block kind */
  kind: EditorBlockKind
  /** Display label */
  label?: string
  /** Help text / description */
  help?: string
  /** Whether the block is collapsible */
  collapsible?: boolean
  /** Whether the block starts collapsed */
  collapsed?: boolean
  /** For repeater/table: the path to the array field */
  path?: string
  /** For table: column definitions */
  columns?: EditorTableColumn[]
  /** Visibility condition */
  visible?: VisibilityCondition
  /** Slots that belong to this block (by slot id) */
  slotIds?: string[]
}

/**
 * A slot emitted by the EditorProjection service.
 */
export interface ProjectionSlot {
  /** Stable slot identifier */
  id: string
  /** JSONPath to the field in the payload */
  path: string
  /** Display label */
  label: string
  /** Widget type to render */
  widget: WidgetType | string
  /** Help text / description */
  help?: string
  /** Placeholder text */
  placeholder?: string
  /** Whether the slot is required */
  required?: boolean
  /** Whether the slot is read-only */
  readOnly?: boolean
  /** Default value (if not in payload) */
  defaultValue?: unknown
  /** Suggestion providers available for this slot */
  suggestionProviders?: SuggestionProviderKind[]
  /** Visibility condition */
  visible?: VisibilityCondition
  /** Options for select/radio/multiselect */
  options?: FieldOption[]
  /** For ref widgets: the target record kind */
  refKind?: string
  /** For array widgets: item configuration */
  items?: FieldHint
  /** For object widgets: nested field hints */
  fields?: FieldHint[]
  /** Additional widget-specific props */
  props?: Record<string, unknown>
}

/**
 * Response shape from GET /ui/record/:recordId/editor.
 */
export interface EditorProjectionResponse {
  /** The schema ID of the record */
  schemaId: string
  /** The record ID */
  recordId: string
  /** Display title derived from the record */
  title: string
  /** Document blocks */
  blocks: ProjectionBlock[]
  /** Document slots */
  slots: ProjectionSlot[]
  /** Non-fatal diagnostics */
  diagnostics: EditorDiagnostic[]
}

/**
 * Complete UI specification for a schema.
 */
export interface UISpec {
  uiVersion: number
  schemaId: string
  display?: {
    titleField?: string
    subtitleField?: string
    icon?: string
  }
  form?: FormConfig
  list?: ListConfig
  detail?: unknown
  className?: string
  /** Editor configuration for document-style surfaces (additive) */
  editor?: EditorConfig
}
