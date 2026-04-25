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
 * Includes composite widgets: datetime, multiselect, reflist, array, object, readonly.
 */
export type WidgetType =
  | 'text'
  | 'number'
  | 'date'
  | 'datetime'
  | 'checkbox'
  | 'select'
  | 'multiselect'
  | 'ref'
  | 'reflist'
  | 'combobox'
  | 'textarea'
  | 'markdown'
  | 'array'
  | 'object'
  | 'readonly'
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
  /** Array item schema for array widgets */
  arraySchema?: Record<string, unknown>;
  /** Object widget config for object widgets */
  objectConfig?: ObjectWidgetConfig;
  /** Reflist config for reflist widgets */
  reflistConfig?: ReflistConfig;
  /** Multiselect config for multiselect widgets */
  multiselectConfig?: MultiselectConfig;
}

/**
 * Section configuration for the TapTab editor.
 */
export interface SectionAttrs {
  /** Section title */
  title: string;
}

/**
 * Configuration for an array widget item schema.
 */
export interface ArrayItemConfig {
  /** Schema for each array item */
  schema: Record<string, unknown>;
  /** Label for the array item */
  label?: string;
}

/**
 * Configuration for an object widget with nested properties.
 */
export interface ObjectFieldConfig {
  /** Property name */
  name: string;
  /** Widget type for this property */
  widget: WidgetType;
  /** Display label */
  label: string;
  /** Help text */
  help?: string;
  /** Whether required */
  required?: boolean;
  /** Options for select/multiselect */
  options?: Array<{ value: string; label: string }>;
}

/**
 * Configuration for an object widget.
 */
export interface ObjectWidgetConfig {
  /** Nested property definitions */
  properties: ObjectFieldConfig[];
}

/**
 * Configuration for a reflist widget.
 */
export interface ReflistConfig {
  /** Reference kind to look up */
  refKind: string;
  /** Label for the reflist */
  label?: string;
}

/**
 * Configuration for a multiselect widget.
 */
export interface MultiselectConfig {
  /** Available options */
  options: Array<{ value: string; label: string }>;
}

/**
 * Callback fired when the editor content changes.
 * @param serializedPayload - The serialized record payload extracted from the editor
 * @param dirty - Whether the current content differs from the original data
 */
export type OnSerializedChangeCallback = (
  serializedPayload: Record<string, unknown>,
  dirty: boolean,
) => void;

/**
 * Props for the TapTabEditor component.
 * Supports both the legacy uiSpec+data path and the new projection-backed path.
 */
export interface TapTabEditorProps {
  /** Record data to edit */
  data: Record<string, unknown>;
  /** UI specification for the form layout (legacy path) */
  uiSpec: UISpec;
  /** JSON schema for validation */
  schema: Record<string, unknown>;
  /** Whether the editor is disabled */
  disabled?: boolean;
  /** Callback fired when the editor content changes (event-driven dirty tracking) */
  onUpdate?: OnSerializedChangeCallback;
}

/**
 * Projection-backed editor props — used by BudgetDocumentSurface.
 * Provides blocks and slots from the EditorProjection service.
 */
export interface ProjectionEditorProps {
  /** Document blocks from the projection */
  blocks: Array<{
    id: string;
    kind: string;
    label?: string;
    help?: string;
    slotIds?: string[];
  }>;
  /** Document slots from the projection */
  slots: Array<{
    id: string;
    path: string;
    label: string;
    widget: string;
    help?: string;
    required?: boolean;
    readOnly?: boolean;
    suggestionProviders?: string[];
  }>;
  /** Base payload to edit */
  data: Record<string, unknown>;
  /** Whether the editor is disabled */
  disabled?: boolean;
}
