/**
 * Types for UI specification and form generation.
 * 
 * UI behavior is driven by *.ui.yaml specs — NO schema-specific
 * code is allowed in UI components.
 */

/**
 * Supported widget types for form fields.
 */
export type WidgetType =
  | 'text'           // Single-line text input
  | 'textarea'       // Multi-line text input
  | 'number'         // Numeric input
  | 'select'         // Dropdown selection
  | 'multiselect'    // Multiple selection
  | 'checkbox'       // Boolean checkbox
  | 'radio'          // Radio button group
  | 'date'           // Date picker
  | 'datetime'       // Date + time picker
  | 'ref'            // Record reference picker
  | 'reflist'        // Multiple record references
  | 'array'          // Array of items
  | 'object'         // Nested object
  | 'hidden'         // Hidden field
  | 'readonly'       // Read-only display
  | 'custom';        // Custom widget (requires renderer)

/**
 * Layout direction for form sections.
 */
export type LayoutDirection = 'vertical' | 'horizontal' | 'grid';

/**
 * Field visibility condition.
 */
export interface VisibilityCondition {
  /** Path to the controlling field */
  when: string;
  /** Operator for comparison */
  operator: 'equals' | 'notEquals' | 'in' | 'notIn' | 'exists' | 'notExists';
  /** Value to compare against (for equals/notEquals/in/notIn) */
  value?: unknown;
}

/**
 * UI hint for a single field.
 */
export interface FieldHint {
  /** JSONPath to the field in the payload */
  path: string;
  /** Widget type to render */
  widget: WidgetType;
  /** Display label */
  label?: string;
  /** Help text / description */
  help?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Whether field is required (overrides schema) */
  required?: boolean;
  /** Whether field is disabled */
  disabled?: boolean;
  /** Whether field is read-only */
  readOnly?: boolean;
  /** Default value (if not in schema) */
  defaultValue?: unknown;
  /** Visibility condition */
  visible?: VisibilityCondition;
  /** Options for select/radio/multiselect */
  options?: FieldOption[];
  /** For ref widgets: the target record kind */
  refKind?: string;
  /** For array widgets: item configuration */
  items?: FieldHint;
  /** For object widgets: nested field hints */
  fields?: FieldHint[];
  /** Custom widget name (for widget="custom") */
  customWidget?: string;
  /** Additional widget-specific props */
  props?: Record<string, unknown>;
  /** Order hint (lower = earlier) */
  order?: number;
  /** Column span for grid layout */
  colSpan?: number;
}

/**
 * Option for select/radio/multiselect fields.
 */
export interface FieldOption {
  /** Value to store */
  value: string | number | boolean;
  /** Display label */
  label: string;
  /** Optional description */
  description?: string;
  /** Whether option is disabled */
  disabled?: boolean;
}

/**
 * A section of related fields in the form.
 */
export interface FormSection {
  /** Section identifier */
  id?: string;
  /** Section title */
  title?: string;
  /** Section description */
  description?: string;
  /** Layout direction for fields */
  layout?: LayoutDirection;
  /** Number of columns for grid layout */
  columns?: number;
  /** Fields in this section */
  fields: FieldHint[];
  /** Visibility condition for entire section */
  visible?: VisibilityCondition;
  /** Whether section is collapsible */
  collapsible?: boolean;
  /** Whether section starts collapsed */
  collapsed?: boolean;
}

/**
 * Form configuration from UI spec.
 */
export interface FormConfig {
  /** Overall form layout */
  layout?: LayoutDirection;
  /** Number of columns for grid layout */
  columns?: number;
  /** Form sections */
  sections: FormSection[];
  /** Submit button configuration */
  submit?: {
    label?: string;
    disabled?: boolean;
  };
  /** Cancel button configuration */
  cancel?: {
    label?: string;
    show?: boolean;
  };
}

/**
 * Display configuration for list views.
 */
export interface ListConfig {
  /** Columns to display */
  columns: ListColumn[];
  /** Default sort field */
  sortField?: string;
  /** Default sort direction */
  sortDirection?: 'asc' | 'desc';
  /** Fields to search */
  searchFields?: string[];
  /** Available filters */
  filters?: ListFilter[];
}

/**
 * Column definition for list view.
 */
export interface ListColumn {
  /** Path to the field */
  path: string;
  /** Column header label */
  label: string;
  /** Column width */
  width?: string | number;
  /** Whether column is sortable */
  sortable?: boolean;
  /** Custom renderer name */
  renderer?: string;
}

/**
 * Filter definition for list view.
 */
export interface ListFilter {
  /** Path to the field */
  path: string;
  /** Filter label */
  label: string;
  /** Filter type */
  type: 'text' | 'select' | 'dateRange' | 'numberRange';
  /** Options for select filter */
  options?: FieldOption[];
}

/**
 * Display configuration for detail views.
 */
export interface DetailConfig {
  /** Title template (supports interpolation) */
  titleTemplate?: string;
  /** Sections to display */
  sections: DetailSection[];
  /** Related records to show */
  related?: RelatedConfig[];
}

/**
 * Section in detail view.
 */
export interface DetailSection {
  /** Section title */
  title?: string;
  /** Fields to display */
  fields: DetailField[];
  /** Layout direction */
  layout?: LayoutDirection;
}

/**
 * Field in detail view.
 */
export interface DetailField {
  /** Path to the field */
  path: string;
  /** Display label */
  label?: string;
  /** Custom renderer */
  renderer?: string;
}

/**
 * Related records configuration.
 */
export interface RelatedConfig {
  /** Title for the related section */
  title: string;
  /** Kind of related records */
  kind: string;
  /** Predicate (reference field) that links */
  predicate: string;
  /** Direction: incoming = records that reference this, outgoing = this references */
  direction: 'incoming' | 'outgoing';
  /** Columns to display */
  columns: ListColumn[];
  /** Maximum records to show */
  limit?: number;
}

/**
 * Complete UI specification for a schema.
 */
export interface UISpec {
  /** UI spec version */
  uiVersion: number;
  /** Associated schema ID */
  schemaId: string;
  /** Form configuration */
  form?: FormConfig;
  /** List view configuration */
  list?: ListConfig;
  /** Detail view configuration */
  detail?: DetailConfig;
  /** Custom CSS class for styling */
  className?: string;
}

/**
 * Result of loading a UI spec.
 */
export interface UISpecLoadResult {
  /** Whether loading succeeded */
  success: boolean;
  /** The loaded spec (if successful) */
  spec?: UISpec;
  /** Error message (if failed) */
  error?: string;
  /** Validation errors (if any) */
  validationErrors?: string[];
}

/**
 * Form state for rendering.
 */
export interface FormState {
  /** Current form values */
  values: Record<string, unknown>;
  /** Validation errors by path */
  errors: Map<string, string[]>;
  /** Touched fields */
  touched: Set<string>;
  /** Whether form is submitting */
  isSubmitting: boolean;
  /** Whether form has changes */
  isDirty: boolean;
}

/**
 * Form field props passed to widgets.
 */
export interface FieldProps {
  /** Field hint from UI spec */
  hint: FieldHint;
  /** Current value */
  value: unknown;
  /** Error messages for this field */
  errors: string[];
  /** Whether field has been touched */
  touched: boolean;
  /** Change handler */
  onChange: (value: unknown) => void;
  /** Blur handler */
  onBlur: () => void;
  /** Whether field is disabled */
  disabled: boolean;
  /** Schema fragment for this field */
  schema?: Record<string, unknown>;
}

/**
 * Widget renderer function type.
 */
export type WidgetRenderer = (props: FieldProps) => unknown;

/**
 * Widget registry interface.
 */
export interface WidgetRegistry {
  /** Get a widget renderer by type */
  get(type: WidgetType | string): WidgetRenderer | undefined;
  /** Register a custom widget */
  register(name: string, renderer: WidgetRenderer): void;
  /** Check if a widget is registered */
  has(name: string): boolean;
}
