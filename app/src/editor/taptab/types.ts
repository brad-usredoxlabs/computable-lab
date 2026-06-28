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
  | 'chips'
  | 'textarea'
  | 'markdown'
  | 'array'
  | 'object'
  | 'readonly'
  | 'hidden'
  | 'protocol-prose-authoring'
  | 'protocol-material-roles'
  | 'protocol-labware-roles'
  | 'protocol-equipment-roles'
  | 'protocol-step-roles'
  | 'protocol-ai-suggestions';

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
  /** Suggestion/control metadata forwarded from the UI spec. */
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
  /** Reference kind for ref widgets */
  refKind?: string;
  /** Help text for the field */
  help?: string;
  /** Current canonical record ID, used by record-scoped custom widgets. */
  recordId?: string;
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
 * TapTab posture (Phase 4). `prose` is the default — the editor renders as
 * a flowing writing surface with widgets inline in paragraphs. `form` keeps
 * the pre-Phase-4 stacked label-above-widget layout for schemas that
 * benefit from form density (e.g. dense reference data entry).
 */
export type TapTabStyle = 'prose' | 'form';

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
  /** TapTab posture. Defaults to the spec's `taptab.style` or `prose`. */
  style?: TapTabStyle;
  /** Callback fired when the editor content changes (event-driven dirty tracking) */
  onUpdate?: OnSerializedChangeCallback;
  /**
   * Opt into the inline ontology copilot: typing `@<noun>` opens
   * ontology-grounded candidates from the resolve() spine and inserts a
   * CURIE-bearing mention. Off by default — enable on protocol-authoring
   * surfaces. (See OntologyCopilotExtension.)
   */
  enableOntologyCopilot?: boolean;
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
    options?: Array<{ value: string | number | boolean; label: string }>;
    refKind?: string;
    props?: Record<string, unknown>;
  }>;
  /** Base payload to edit */
  data: Record<string, unknown>;
  /** Whether the editor is disabled */
  disabled?: boolean;
}
