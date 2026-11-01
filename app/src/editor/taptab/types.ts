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
  | 'record-ref'
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
  | 'protocol-ai-suggestions'
  | 'local-protocol-labwares'
  | 'local-protocol-equipment'
  | 'local-protocol-materials'
  | 'local-protocol-steps';

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
  /**
   * WIDGET-R1: the item-hint for array widgets (the projection's `items`
   * member). Carries the item's field set so the ArrayWidget can seed items
   * from the hint (never bare `{}`) and render each item through the
   * existing ObjectWidget. Absent for hint-less arrays (the widget keeps its
   * bare-`{}` behavior; the projection keeps its loud diagnostic).
   *
   * WIDGET-R1 fix-run 2 (D2 / ruling ARCHD2L1T1335 OPT-A): the `fields`
   * entries are SELF-RECURSIVE (`ArrayItemHintField.fields?`) — a field
   * whose hint declares its own `fields` is a nested object; the
   * ArrayWidget forwards those nested `fields` through (recursive mapping)
   * and the ObjectWidget renders that property through another ObjectWidget.
   * Recursion depth is data-driven. ALL optional — every existing caller is
   * unchanged (a flat hint with no nested `fields` is byte-identical to the
   * pre-change shape).
   */
  itemHint?: {
    path?: string;
    widget?: string;
    label?: string;
    fields?: ArrayItemHintField[];
  };
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
 * WIDGET-R1 fix-run 2 (D2 / ruling ARCHD2L1T1335 OPT-A): ONE item-hint
 * field entry, SELF-RECURSIVE. A field whose hint declares its own
 * `fields` is a nested object — the ArrayWidget forwards the nested
 * `fields` through (recursive mapping, same pattern as the options map)
 * and the ObjectWidget renders that property through another ObjectWidget.
 * Recursion depth is data-driven (the `fields?` member IS the recursion —
 * no depth cap, no widget-name / field-name branch). OPTIONAL — a flat
 * hint (no `fields`) is byte-identical to the pre-change entry shape.
 */
export interface ArrayItemHintField {
  /** Field name within the item (e.g. `kind`, `role_ref`). */
  path: string;
  /** Widget type for this field. */
  widget: string;
  /** Display label (display-only). */
  label?: string;
  /** Help text. */
  help?: string;
  /** Whether required. */
  required?: boolean;
  /** Options for select/radio/multiselect. */
  options?: Array<{ value: string | number | boolean; label: string }>;
  /**
   * W2 part 2 (typed sub-fields through the existing widget switch): the
   * ui.yaml-declared `refKind` for ref/record-ref sub-fields — forwarded
   * so a `widget: record-ref` item sub-field opens the RecordRefPicker
   * scoped to the declared kind (the same generic forwarding as the
   * top-level slot's refKind; shape-only, no field-name branch).
   */
  refKind?: string;
  /**
   * W2 part 2: the ui.yaml-declared suggestion `props` for the sub-field
   * (sources / valueShape / ontologyBinding). Forwarded so a ref sub-field
   * renders the ref picker with the SAME suggestion plan the top-level
   * slot would (buildSuggestionPlanFromFieldHint over the declared props —
   * the ontology-ref pattern: the 'ols' source turns on the /resolve
   * spine, valueShape ontology-ref commits the canonical ref OBJECT).
   */
  props?: Record<string, unknown>;
  /**
   * Nested field hints — present ONLY when this field is a nested object.
   * Self-recursive: each nested field may itself declare `fields`.
   */
  fields?: ArrayItemHintField[];
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
  /**
   * W2 part 2: the ui.yaml-declared `refKind` for a ref/record-ref property.
   * Forwarded so a ref-typed sub-field renders the existing picker machinery
   * (RefCombobox / RecordRefPicker) scoped to the declared kind — the SAME
   * generic forwarding the top-level slot's refKind gets (shape-only, no
   * field-name / kind-name branch). Absent for non-ref properties.
   */
  refKind?: string;
  /**
   * W2 part 2: the ui.yaml-declared suggestion `props` (sources / valueShape
   * / ontologyBinding) for a ref sub-field. The ObjectWidget renders the
   * ref sub-field through the existing WidgetRenderer switch with a
   * suggestion plan built from these props (the ontology-ref pattern: the
   * 'ols' source turns on the /resolve spine and valueShape ontology-ref
   * commits the canonical ref OBJECT, never free text). Absent for
   * non-ref / flat properties (byte-identical rendering).
   */
  props?: Record<string, unknown>;
  /**
   * WIDGET-R1 fix-run 2 (D2 / ruling ARCHD2L1T1335 OPT-A): nested property
   * definitions — present ONLY when this property is a nested object. The
   * ObjectWidget edit view branches on NON-EMPTY `fields` (never on
   * widget/field names) and renders that property through another
   * ObjectWidget; empty/absent `fields` renders the flat input path
   * EXACTLY as before. Self-recursive: each nested property may itself
   * carry `fields`. OPTIONAL — existing flat configs are unchanged.
   */
  fields?: ObjectFieldConfig[];
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
