/**
 * Type definitions for the TapTab TipTap-based record editor.
 */

import type { UISpec } from '../../types/uiSpec';
import type { Editor } from '@tiptap/react';

/**
 * Imperative handle type for TapTabEditor.
 */
export interface TapTabEditorHandle {
  getEditor: () => Editor | null;
}

/**
 * Widget type literal union for field rendering.
 */
export type WidgetType =
  | 'text'
  | 'number'
  | 'date'
  | 'checkbox'
  | 'select'
  | 'ref'
  | 'combobox'
  | 'textarea'
  | 'markdown'
  | 'hidden';

/**
 * Field configuration for a FieldRow component.
 */
export interface FieldRowAttrs {
  /** JSONPath to the field value */
  path: string;
  /** Widget type for rendering */
  widget: WidgetType;
  /** Display label for the field */
  label: string;
  /** Current value of the field */
  value: unknown;
  /** Whether the field is read-only */
  readOnly?: boolean;
  /** Whether the field is required */
  required?: boolean;
  /** Options for select/combobox widgets */
  options: Array<{ value: string; label: string }> | null;
  /** Reference kind for ref widgets */
  refKind?: string;
  /** Help text for the field */
  help?: string;
}

/**
 * Section configuration for the TapTab editor.
 */
export interface SectionAttrs {
  /** Section title */
  title: string;
}

/**
 * Props for the TapTabEditor component.
 */
export interface TapTabEditorProps {
  /** Record data to edit */
  data: Record<string, unknown>;
  /** UI specification for the form layout */
  uiSpec: UISpec;
  /** JSON schema for validation */
  schema: Record<string, unknown>;
  /** Whether the editor is disabled */
  disabled?: boolean;
}
