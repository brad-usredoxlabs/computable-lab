/**
 * Document mapper for converting UISpec + record data into TipTap-compatible JSON.
 */

import type { UISpec, FieldHint, FormSection, FieldOption } from '../../types/uiSpec';
import type { ArrayItemHintField, ObjectFieldConfig } from './types';
import { getValueAtPath, stripJsonPath, isFieldHidden } from '../../shared/lib/formHelpers';
import { buildSuggestionPlanFromFieldHint } from '../../shared/forms/suggestionPlan';

/**
 * TipTap JSON content node type - matches @tiptap/core JSONContent.
 */
interface JSONContent {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: JSONContent[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

/**
 * Build a TipTap document node from UISpec and record data.
 * Returns { type: 'doc', content: [...sections] } shape.
 * Hidden fields are excluded; sections with all hidden fields produce no section node.
 */
export function buildDocument(
  uiSpec: UISpec,
  data: Record<string, unknown>,
): { type: 'doc'; content: JSONContent[] } {
  const sections: JSONContent[] = [];

  const formSections = uiSpec.form?.sections ?? [];

  for (const section of formSections) {
    const sectionNode = buildSectionNode(section, data);
    if (sectionNode) {
      sections.push(sectionNode);
    }
  }

  return { type: 'doc', content: sections };
}

/**
 * Build a single section node from a FormSection.
 * Returns null if all fields are hidden.
 */
function buildSectionNode(section: FormSection, data: Record<string, unknown>): JSONContent | null {
  // Filter out hidden fields
  const visibleFields = section.fields.filter((field) => !isFieldHidden(field));

  // Skip sections with zero visible fields
  if (visibleFields.length === 0) {
    return null;
  }

  // Build fieldRow nodes for visible fields
  const fieldRows: JSONContent[] = visibleFields.map((field) => buildFieldRowNode(field, data));

  // Build section node with heading and field rows
  const sectionNode: JSONContent = {
    type: 'section',
    attrs: {
      title: section.title ?? '',
    },
    content: [
      {
        type: 'sectionHeading',
        content: [{ type: 'text', text: section.title ?? '' }],
      },
      ...fieldRows,
    ],
  };
  return sectionNode;
}

/**
 * Build a fieldRow node from a FieldHint.
 */
function buildFieldRowNode(field: FieldHint, data: Record<string, unknown>): JSONContent {
  const rawValue = getValueAtPath(data, field.path);
  const value = stripJsonPathValue(rawValue);

  // Convert FieldOption[] to FieldRowAttrs options format
  const fieldOptions = field.options?.map((opt: FieldOption) => ({
    value: String(opt.value),
    label: opt.label,
  })) ?? null;

  const suggestionPlan = buildSuggestionPlanFromFieldHint(field.widget, field.props, field.refKind, fieldOptions ?? undefined);

  const attrs: Record<string, unknown> = {
    path: field.path,
    widget: field.widget,
    label: field.label ?? stripJsonPath(field.path),
    value,
    readOnly: Boolean(field.readOnly ?? field.readonly ?? suggestionPlan.ownedByApp ?? false),
    required: field.required ?? false,
    options: fieldOptions,
    refKind: field.refKind ?? undefined,
    suggestionPlan,
    help: field.help ?? undefined,
    recordId: typeof data.recordId === 'string' ? data.recordId : undefined,
  };

  return {
    type: 'fieldRow',
    attrs,
  };
}

/**
 * Strip JSON path prefix and convert value for display.
 */
function stripJsonPathValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return stripJsonPath(value);
  }
  return value;
}

// ============================================================================
// Projection-backed document building (additive path for BudgetDocumentSurface)
// ============================================================================

/**
 * WIDGET-R1 fix-run 3 (data-path, ruling ARCHD3L1T1440 OPT-A): map ONE
 * item-hint field entry — and its nested `fields` recursively — to the
 * `attrs.itemHint.fields` entry shape. Same conditional-spread pattern as
 * the existing options map (and as ArrayWidget.mapHintFieldsToObjectFields):
 * a field WITH a non-empty `fields` member forwards it recursively; a field
 * WITHOUT `fields` maps byte-identically to the pre-change shape (no
 * `fields: undefined` / `fields: []` key appears). Generic forwarding ONLY —
 * no field-name / widget-name / kind-name branch anywhere: the branch is on
 * the presence of a non-empty `fields` member in the hint data.
 */
function mapHintFieldEntry(f: ArrayItemHintField): ArrayItemHintField {
  return {
    path: f.path,
    widget: f.widget,
    ...(f.label !== undefined && { label: f.label }),
    ...(f.help !== undefined && { help: f.help }),
    required: f.required ?? false,
    ...(f.options !== undefined && {
      options: f.options.map((o) => ({ value: o.value, label: o.label })),
    }),
    // W2 part 2: forward the declared refKind + suggestion props so a
    // ref/record-ref item sub-field reaches the ObjectWidget with enough
    // data to render the EXISTING picker machinery (RefCombobox /
    // RecordRefPicker) — the same generic shape-only forwarding as the
    // options/fields maps. Absent for flat fields (byte-identical).
    ...(f.refKind !== undefined && { refKind: f.refKind }),
    ...(f.props !== undefined && { props: f.props }),
    ...(Array.isArray(f.fields) && f.fields.length > 0
      ? { fields: f.fields.map(mapHintFieldEntry) }
      : {}),
  };
}

/**
 * WIDGET-R1 fix-run 3 (data-path, ruling ARCHD3L1T1440 OPT-A): map ONE
 * `attrs.objectConfig` property entry — and its nested `fields` recursively
 * — to the ObjectFieldConfig shape. Same conditional-spread pattern: a
 * property WITH a non-empty `fields` member forwards it recursively (the
 * ObjectWidget renders that property through another ObjectWidget); a flat
 * property maps byte-identically to the pre-change shape (no `fields` key
 * appears). Generic forwarding ONLY — no field-name / widget-name /
 * kind-name branch.
 */
function mapObjectConfigProperty(p: {
  name: string;
  widget: string;
  label: string;
  help?: string;
  required?: boolean;
  fields?: ObjectFieldConfig[];
}): ObjectFieldConfig {
  return {
    name: p.name,
    widget: p.widget as any,
    label: p.label,
    help: p.help,
    required: p.required ?? false,
    ...(Array.isArray(p.fields) && p.fields.length > 0
      ? { fields: p.fields.map((n) => mapObjectConfigProperty(n)) }
      : {}),
  };
}

/**
 * Build a TipTap document from EditorProjection blocks and slots.
 * This is the additive projection path used by BudgetDocumentSurface.
 *
 * Supports composite widget types:
 * - datetime: date/datetime input
 * - multiselect: multi-value selection with options
 * - reflist: structured multi-reference selections
 * - array: repeatable item groups
 * - object: grouped nested slots
 * - readonly: stable non-editable display
 *
 * @param blocks - EditorProjection blocks
 * @param slots - EditorProjection slots
 * @param data - Record data to populate slot values
 * @returns TipTap document node
 */
export function buildProjectionDocument(
  blocks: Array<{
    id: string;
    kind: string;
    label?: string;
    help?: string;
    slotIds?: string[];
  }>,
  slots: Array<{
    id: string;
    path: string;
    label: string;
    widget: string;
    help?: string;
    required?: boolean;
    readOnly?: boolean;
    /** Authoritative display-only value override (wins over `data`). */
    value?: unknown;
    suggestionProviders?: string[];
    options?: Array<{ value: string | number | boolean; label: string }>;
    refKind?: string;
    props?: Record<string, unknown>;
    properties?: Array<{
      name: string;
      widget: string;
      label: string;
      help?: string;
      required?: boolean;
      /**
       * WIDGET-R1 fix-run 3 (data-path, ruling ARCHD3L1T1440 OPT-A): nested
       * field definitions — present ONLY when this property is a nested
       * object. Self-recursive (ObjectFieldConfig.fields?); forwarded
       * through the objectConfig map below so the ObjectWidget can render
       * that property through another ObjectWidget. Absent/flat on every
       * existing caller (byte-identical).
       */
      fields?: ObjectFieldConfig[];
    }>;
    /**
     * WIDGET-R1: the item-hint for `widget: array` slots (the projection's
     * `items` member, server `FieldHint`). Carries the item's field set so
     * the client can seed items from the hint and render each item through
     * the existing ObjectWidget. Absent for hint-less arrays.
     *
     * WIDGET-R1 fix-run 3 (data-path, ruling ARCHD3L1T1440 OPT-A): the
     * `fields` entries are SELF-RECURSIVE (`ArrayItemHintField.fields?`,
     * types.ts — the same shape the widget layer already consumes) — a
     * field whose hint declares its own `fields` is a nested object. The
     * mapper forwards those nested `fields` through the itemHint map below
     * (recursive, same conditional-spread pattern as the options map).
     * One name per entity: NO second shape is declared here.
     */
    items?: {
      path?: string;
      widget?: string;
      label?: string;
      fields?: ArrayItemHintField[];
    };
  }>,
  data: Record<string, unknown>,
): { type: 'doc'; content: JSONContent[] } {
  const sections: JSONContent[] = [];

  for (const block of blocks) {
    if (block.kind !== 'section') continue;

    const blockSlots = (block.slotIds ?? [])
      .map((slotId) => slots.find((s) => s.id === slotId))
      .filter((s): s is NonNullable<typeof slots[number]> => s !== undefined);

    if (blockSlots.length === 0) continue;

    const fieldRows: JSONContent[] = blockSlots.map((slot) => {
      // A slot-level `value` is an authoritative display-only override supplied
      // by the projection (e.g. license read-through from the parent study, the
      // resolved Created By name). It wins over the stored payload value.
      const rawValue = slot.value !== undefined ? slot.value : getValueAtPath(data, slot.path);
      const value = stripJsonPathValue(rawValue);

      const slotOptions = slot.options?.map((opt) => ({ value: String(opt.value), label: opt.label }));

      const suggestionPlan = buildSuggestionPlanFromFieldHint(slot.widget, slot.props, slot.refKind, slotOptions);

      // Build composite widget config based on widget type
      const attrs: Record<string, unknown> = {
        path: slot.path,
        widget: slot.widget,
        label: slot.label,
        value,
        readOnly: Boolean(slot.readOnly ?? suggestionPlan.ownedByApp ?? false),
        required: slot.required ?? false,
        // Option-backed widgets (select/radio) need their options to render the
        // dropdown and to map stored values to friendly labels in display mode.
        options: slotOptions ?? null,
        refKind: slot.refKind ?? undefined,
        suggestionPlan,
        help: slot.help ?? undefined,
        recordId: typeof data.recordId === 'string' ? data.recordId : undefined,
      };

      // Handle composite widget configs
      if (slot.widget === 'multiselect' && slot.options) {
        attrs.multiselectConfig = { options: slot.options };
      }

      if (slot.widget === 'reflist') {
        attrs.reflistConfig = { refKind: slot.suggestionProviders?.[0] ?? 'default' };
      }

      if (slot.widget === 'object' && slot.properties) {
        attrs.objectConfig = {
          // WIDGET-R1 fix-run 3 (data-path, ruling ARCHD3L1T1440 OPT-A):
          // recursive forwarding — a property that declares its own
          // `fields` is a nested object and its `fields` are forwarded
          // through (same conditional-spread pattern as the itemHint map
          // below); a flat property maps byte-identically to today.
          properties: slot.properties.map((p) => mapObjectConfigProperty(p)),
        };
      }

      if (slot.widget === 'array' && slot.properties) {
        attrs.arraySchema = {
          type: 'object',
          properties: Object.fromEntries(
            slot.properties.map((p) => [p.name, { type: 'string', title: p.label }])
          ),
        };
      }

      // WIDGET-R1: surface the item-hint (the projection's `items` member)
      // for `widget: array` slots so the ArrayWidget can seed items from the
      // hint's field set and render each item through the existing
      // ObjectWidget. The client previously DROPPED this member (the server
      // payload already carried it — EditorProjectionService forwards
      // `slot.items` in both the editor-mode and form-fallback projections).
      if (slot.widget === 'array' && slot.items) {
        attrs.itemHint = {
          ...(slot.items.path !== undefined && { path: slot.items.path }),
          ...(slot.items.widget !== undefined && { widget: slot.items.widget }),
          ...(slot.items.label !== undefined && { label: slot.items.label }),
          ...(slot.items.fields !== undefined && {
            // WIDGET-R1 fix-run 3 (data-path, ruling ARCHD3L1T1440 OPT-A):
            // recursive forwarding — a hint field that declares its own
            // `fields` is a nested object and its `fields` are forwarded
            // through (mapHintFieldEntry, same conditional-spread pattern
            // as the options map); a field without `fields` maps
            // byte-identically to today (no `fields` key appears).
            fields: slot.items.fields.map(mapHintFieldEntry),
          }),
        };
      }

      return {
        type: 'fieldRow',
        attrs,
      } as JSONContent;
    });

    sections.push({
      type: 'section',
      attrs: { title: block.label ?? '' },
      content: [
        {
          type: 'sectionHeading',
          content: [{ type: 'text', text: block.label ?? '' }],
        },
        ...fieldRows,
      ],
    } as JSONContent);
  }

  return { type: 'doc', content: sections };
}
