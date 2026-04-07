/**
 * Types for CRUD view controllers.
 * 
 * These types define the data structures for list, detail, and edit views.
 * NO framework-specific code — just data models.
 */

import type { RecordEnvelope } from '../../types/RecordEnvelope.js';
import type { ValidationResult } from '../../validation/types.js';
import type { LintResult } from '../../lint/types.js';
import type { UISpec, FormState, ListColumn } from '../types.js';
import type { FormDefinition } from '../FormBuilder.js';

/**
 * Sort direction for list views.
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Filter operator for list views.
 */
export type FilterOperator = 
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'between';

/**
 * A single filter criterion.
 */
export interface FilterCriterion {
  /** Field path to filter on */
  path: string;
  /** Filter operator */
  operator: FilterOperator;
  /** Value(s) to filter by */
  value: unknown;
}

/**
 * Query parameters for list views.
 */
export interface ListQuery {
  /** Filter by record kind */
  kind?: string;
  /** Sort field path */
  sortField?: string;
  /** Sort direction */
  sortDirection?: SortDirection;
  /** Filter criteria */
  filters?: FilterCriterion[];
  /** Search query string */
  search?: string;
  /** Page number (1-indexed) */
  page?: number;
  /** Items per page */
  pageSize?: number;
}

/**
 * A row in the list view.
 */
export interface ListRow {
  /** Record ID */
  recordId: string;
  /** Record kind */
  kind: string;
  /** Display values for each column */
  columns: Map<string, unknown>;
  /** The full envelope (for actions) */
  envelope: RecordEnvelope;
}

/**
 * Pagination info.
 */
export interface PaginationInfo {
  /** Current page (1-indexed) */
  page: number;
  /** Items per page */
  pageSize: number;
  /** Total items */
  totalItems: number;
  /** Total pages */
  totalPages: number;
  /** Has previous page */
  hasPrevious: boolean;
  /** Has next page */
  hasNext: boolean;
}

/**
 * State for a list view.
 */
export interface ListViewState {
  /** Current query */
  query: ListQuery;
  /** Rows to display */
  rows: ListRow[];
  /** Column definitions */
  columns: ListColumn[];
  /** Pagination info */
  pagination: PaginationInfo;
  /** Whether data is loading */
  isLoading: boolean;
  /** Error message if any */
  error?: string;
  /** Selected row IDs */
  selectedIds: Set<string>;
}

/**
 * Related record summary for detail view.
 */
export interface RelatedRecordSummary {
  /** Related record ID */
  recordId: string;
  /** Related record kind */
  kind: string;
  /** Display title */
  title: string;
  /** Relationship predicate (e.g., "studyId") */
  predicate: string;
  /** Relationship direction */
  direction: 'incoming' | 'outgoing';
}

/**
 * State for a detail view.
 */
export interface DetailViewState {
  /** The record envelope */
  envelope: RecordEnvelope | null;
  /** The UI spec (for rendering hints) */
  uiSpec?: UISpec;
  /** Related records */
  related: RelatedRecordSummary[];
  /** Whether data is loading */
  isLoading: boolean;
  /** Error message if any */
  error?: string;
  /** JSON-LD representation */
  jsonLd?: Record<string, unknown>;
}

/**
 * State for an edit view.
 */
export interface EditViewState {
  /** Edit mode: create or update */
  mode: 'create' | 'update';
  /** The record kind */
  kind: string;
  /** Schema ID */
  schemaId: string;
  /** Form definition */
  formDefinition: FormDefinition;
  /** Current form state */
  formState: FormState;
  /** Structural validation result */
  validationResult?: ValidationResult;
  /** Lint result */
  lintResult?: LintResult;
  /** Whether saving */
  isSaving: boolean;
  /** Error message if any */
  error?: string;
  /** Original envelope (for update mode) */
  originalEnvelope?: RecordEnvelope;
}

/**
 * Events emitted by list view controller.
 */
export interface ListViewEvents {
  /** Called when query changes */
  onQueryChange?: (query: ListQuery) => void;
  /** Called when row is selected */
  onRowSelect?: (recordId: string) => void;
  /** Called when row is clicked */
  onRowClick?: (recordId: string) => void;
  /** Called when create is requested */
  onCreateClick?: () => void;
  /** Called when delete is requested */
  onDeleteClick?: (recordIds: string[]) => void;
}

/**
 * Events emitted by detail view controller.
 */
export interface DetailViewEvents {
  /** Called when edit is requested */
  onEditClick?: () => void;
  /** Called when delete is requested */
  onDeleteClick?: () => void;
  /** Called when a related record is clicked */
  onRelatedClick?: (recordId: string) => void;
  /** Called when back is requested */
  onBackClick?: () => void;
}

/**
 * Events emitted by edit view controller.
 */
export interface EditViewEvents {
  /** Called when a field value changes */
  onFieldChange?: (path: string, value: unknown) => void;
  /** Called when form is submitted */
  onSubmit?: () => void;
  /** Called when cancel is requested */
  onCancel?: () => void;
  /** Called when validation runs */
  onValidate?: (result: ValidationResult) => void;
  /** Called when lint runs */
  onLint?: (result: LintResult) => void;
}

/**
 * Action result (for CRUD operations).
 */
export interface ActionResult {
  /** Whether action succeeded */
  success: boolean;
  /** Result record (for create/update) */
  envelope?: RecordEnvelope;
  /** Error message if any */
  error?: string;
  /** Validation errors if any */
  validationErrors?: string[];
}
