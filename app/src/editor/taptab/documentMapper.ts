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
