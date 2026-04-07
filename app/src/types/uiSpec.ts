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
