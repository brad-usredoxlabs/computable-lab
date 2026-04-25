/**
 * Document mapper for converting UISpec + record data into TipTap-compatible JSON.
 */

import type { UISpec, FieldHint, FormSection, FieldOption } from '../../types/uiSpec';
import { getValueAtPath, stripJsonPath, isFieldHidden } from '../../shared/lib/formHelpers';

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

  const attrs: Record<string, unknown> = {
    path: field.path,
    widget: field.widget,
    label: field.label ?? stripJsonPath(field.path),
    value,
    readOnly: field.readOnly ?? field.readonly ?? false,
    required: field.required ?? false,
    options: fieldOptions,
    refKind: field.refKind ?? undefined,
    help: field.help ?? undefined,
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
    suggestionProviders?: string[];
    options?: Array<{ value: string; label: string }>;
    properties?: Array<{ name: string; widget: string; label: string; help?: string; required?: boolean }>;
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
      const rawValue = getValueAtPath(data, slot.path);
      const value = stripJsonPathValue(rawValue);

      // Build composite widget config based on widget type
      const attrs: Record<string, unknown> = {
        path: slot.path,
        widget: slot.widget,
        label: slot.label,
        value,
        readOnly: slot.readOnly ?? false,
        required: slot.required ?? false,
        options: null,
        refKind: undefined,
        help: slot.help ?? undefined,
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
          properties: slot.properties.map((p) => ({
            name: p.name,
            widget: p.widget as any,
            label: p.label,
            help: p.help,
            required: p.required ?? false,
          })),
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
