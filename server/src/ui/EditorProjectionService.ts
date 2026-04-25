/**
 * EditorProjectionService — Resolves record payload + schema + UI spec
 * into a typed projection response with blocks, slots, and diagnostics
 * for TapTab consumption.
 *
 * The service honours the `editor` config from uiSpec when present,
 * and falls back to projecting existing `form.sections` into section/slot
 * blocks when editor config is absent.
 */

import type {
  UISpec,
  EditorConfig,
  EditorBlock,
  EditorSlot,
  FormSection,
  FieldHint,
  VisibilityCondition,
  EditorBlockKind,
  SuggestionProviderKind,
  EditorDiagnostic,
  ProjectionBlock,
  ProjectionSlot,
  EditorProjectionResponse,
} from './types.js';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build a visibility condition from a FieldHint's visible field.
 */
function buildVisibilityCondition(
  hint: FieldHint | EditorSlot
): VisibilityCondition | undefined {
  if ('visible' in hint && hint.visible) {
    return hint.visible;
  }
  return undefined;
}

/**
 * Build a visibility condition from an EditorBlock's visible field.
 */
function buildBlockVisibilityCondition(
  block: EditorBlock
): VisibilityCondition | undefined {
  return block.visible;
}

/**
 * Extract a display title from a record payload.
 */
function extractTitle(payload: Record<string, unknown>): string {
  // Try common title fields in order
  const candidates = ['title', 'name', 'label', 'subject'];
  for (const key of candidates) {
    const val = payload[key];
    if (typeof val === 'string' && val.length > 0) {
      return val;
    }
  }
  // Fallback: use recordId if available
  const recordId = payload['recordId'] ?? payload['id'];
  if (typeof recordId === 'string' && recordId.length > 0) {
    return recordId;
  }
  return 'Untitled';
}

// ============================================================================
// Projection: editor config path
// ============================================================================

/**
 * Project blocks from an EditorConfig.
 */
function projectBlocksFromEditorConfig(
  editorConfig: EditorConfig
): ProjectionBlock[] {
  return editorConfig.blocks.map((block) => ({
    id: block.id,
    kind: block.kind,
    label: block.label,
    help: block.help,
    collapsible: block.collapsible ?? false,
    collapsed: block.collapsed ?? false,
    path: block.path,
    columns: block.columns,
    visible: buildBlockVisibilityCondition(block),
    slotIds: [], // Will be populated below
  }));
}

/**
 * Project slots from an EditorConfig.
 *
 * Preserves combobox/ref semantics from slot metadata:
 *   - options (for select/radio/multiselect)
 *   - refKind (for ref widgets)
 *   - props (includes sources, ontologies, field)
 *   - items (for array widgets)
 *   - fields (for object widgets)
 */
function projectSlotsFromEditorConfig(
  editorConfig: EditorConfig
): ProjectionSlot[] {
  return editorConfig.slots.map((slot) => ({
    id: slot.id,
    path: slot.path,
    label: slot.label,
    widget: slot.widget,
    help: slot.help,
    required: slot.required ?? false,
    readOnly: false, // Editor config doesn't specify readOnly
    suggestionProviders: slot.suggestionProviders,
    visible: buildVisibilityCondition(slot),
    // Preserve combobox/ref semantics from slot metadata
    // (sources, ontologies, field, refKind, options, etc.)
    options: slot.options,
    refKind: slot.refKind,
    items: slot.items,
    fields: slot.fields,
    props: slot.props,
  }));
}

/**
 * Assign slots to blocks based on path prefix matching.
 * A slot belongs to a block if the slot's path starts with the block's path.
 */
function assignSlotsToBlocks(
  blocks: ProjectionBlock[],
  slots: ProjectionSlot[]
): void {
  for (const block of blocks) {
    if (!block.path) continue;
    block.slotIds = slots
      .filter((slot) => slot.path.startsWith(block.path))
      .map((slot) => slot.id);
  }
}

// ============================================================================
// Projection: form.sections fallback path
// ============================================================================

/**
 * Project blocks from form.sections (fallback when no editor config).
 */
function projectBlocksFromFormSections(
  sections: FormSection[]
): ProjectionBlock[] {
  return sections.map((section, index) => ({
    id: section.id ?? `section-${index}`,
    kind: 'section' as EditorBlockKind,
    label: section.title,
    help: section.description,
    collapsible: section.collapsible ?? false,
    collapsed: section.collapsed ?? false,
    visible: buildVisibilityCondition(section),
    slotIds: [],
  }));
}

/**
 * Project slots from form.sections fields (fallback when no editor config).
 */
function projectSlotsFromFormSections(
  sections: FormSection[]
): ProjectionSlot[] {
  const slots: ProjectionSlot[] = [];

  for (const section of sections) {
    for (const field of section.fields) {
      // Skip hidden fields
      if (field.hidden) continue;

      // Skip fields without a path
      if (!field.path) continue;

      // Determine widget type
      const widget = field.widget ?? 'text';

      // Determine required state
      const required = field.required ?? false;

      // Determine readOnly state (accept both readOnly and readonly)
      const readOnly =
        field.readOnly ?? field.readonly ?? false;

      slots.push({
        id: `slot-${field.path.replace(/\$/g, '').replace(/\./g, '_')}`,
        path: field.path,
        label: field.label ?? field.path,
        widget,
        help: field.help,
        placeholder: field.placeholder,
        required,
        readOnly,
        defaultValue: field.defaultValue,
        visible: buildVisibilityCondition(field),
        options: field.options,
        refKind: field.refKind,
        items: field.items,
        fields: field.fields,
        props: field.props,
      });
    }
  }

  return slots;
}

/**
 * Assign slots to blocks from form.sections based on section membership.
 */
function assignSlotsToBlocksFromSections(
  blocks: ProjectionBlock[],
  slots: ProjectionSlot[],
  sections: FormSection[]
): void {
  for (const section of sections) {
    const blockId = section.id ?? `section-${blocks.length - sections.indexOf(section)}`;
    const block = blocks.find((b) => b.id === blockId);
    if (!block) continue;

    // Collect field paths in this section
    const sectionPaths = new Set(
      section.fields.filter((f) => f.path).map((f) => f.path!)
    );

    block.slotIds = slots
      .filter((slot) => sectionPaths.has(slot.path))
      .map((slot) => slot.id);
  }
}

// ============================================================================
// Diagnostics
// ============================================================================

/**
 * Widget types that TapTab does not yet fully support in fallback mode.
 * When encountered, the projection preserves nested metadata and emits
 * a diagnostic so the consumer knows the shape is not fully rendered.
 */
const UNSUPPORTED_WIDGETS = new Set<string>([
  'array',
  'object',
  'custom',
  'markdown',
]);

/**
 * Emit diagnostics for the projection.
 * These are deterministic, non-fatal warnings about the projection state.
 */
function emitDiagnostics(
  uiSpec: UISpec,
  payload: Record<string, unknown>
): EditorDiagnostic[] {
  const diagnostics: EditorDiagnostic[] = [];

  // Check if editor config is missing
  if (!uiSpec.editor) {
    diagnostics.push({
      code: 'EDITOR_CONFIG_MISSING',
      message:
        'No editor config found in UI spec; falling back to form.sections projection.',
      severity: 'info',
    });
  }

  // Check for empty blocks
  if (uiSpec.editor && uiSpec.editor.blocks.length === 0) {
    diagnostics.push({
      code: 'EMPTY_BLOCKS',
      message: 'Editor config has zero blocks.',
      severity: 'warning',
    });
  }

  // Check for empty slots
  if (uiSpec.editor && uiSpec.editor.slots.length === 0) {
    diagnostics.push({
      code: 'EMPTY_SLOTS',
      message: 'Editor config has zero slots.',
      severity: 'warning',
    });
  }

  // Check for required slots with no payload value
  if (uiSpec.editor) {
    for (const slot of uiSpec.editor.slots) {
      if (slot.required) {
        const val = resolvePath(payload, slot.path);
        if (val === undefined || val === null) {
          diagnostics.push({
            code: 'REQUIRED_SLOT_MISSING',
            message: `Required slot "${slot.id}" has no value in payload.`,
            severity: 'warning',
            path: slot.path,
          });
        }
      }
    }
  }

  return diagnostics;
}

/**
 * Emit diagnostics for unsupported widget types in form.sections fallback.
 * These diagnostics preserve nested shape metadata instead of silently dropping it.
 */
function emitUnsupportedWidgetDiagnostics(
  sections: FormSection[]
): EditorDiagnostic[] {
  const diagnostics: EditorDiagnostic[] = [];

  for (const section of sections) {
    for (const field of section.fields) {
      if (field.hidden || !field.path) continue;

      const widget = field.widget ?? 'text';

      if (UNSUPPORTED_WIDGETS.has(widget)) {
        const diagnostic: EditorDiagnostic = {
          code: 'UNSUPPORTED_WIDGET',
          message: `Widget "${widget}" is not yet fully supported in fallback projection; nested metadata preserved.`,
          severity: 'info',
          path: field.path,
        };

        // Include nested metadata in the message for traceability
        if (field.items) {
          diagnostic.message += ` [items: ${JSON.stringify(field.items)}]`;
        }
        if (field.fields && field.fields.length > 0) {
          diagnostic.message += ` [fields: ${JSON.stringify(field.fields)}]`;
        }

        diagnostics.push(diagnostic);
      }
    }
  }

  return diagnostics;
}

/**
 * Resolve a JSONPath-like string from an object.
 * Supports simple paths like "$.title", "$.lines", "$.notes".
 */
function resolvePath(
  obj: Record<string, unknown>,
  path: string
): unknown {
  // Strip leading "$."
  const cleanPath = path.replace(/^\$\./, '');
  const parts = cleanPath.split('.');

  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ============================================================================
// Main projection function
// ============================================================================

/**
 * Project a record into an EditorProjectionResponse.
 *
 * @param uiSpec - The UI specification for the record's schema
 * @param payload - The record payload
 * @param schemaId - The schema ID
 * @param recordId - The record ID
 * @returns The projection response
 */
export function projectRecord(
  uiSpec: UISpec,
  payload: Record<string, unknown>,
  schemaId: string,
  recordId: string
): EditorProjectionResponse {
  const diagnostics: EditorDiagnostic[] = [];
  let blocks: ProjectionBlock[];
  let slots: ProjectionSlot[];

  if (uiSpec.editor) {
    // --- Editor config path ---
    blocks = projectBlocksFromEditorConfig(uiSpec.editor);
    slots = projectSlotsFromEditorConfig(uiSpec.editor);
    assignSlotsToBlocks(blocks, slots);
  } else if (uiSpec.form && uiSpec.form.sections.length > 0) {
    // --- Form sections fallback path ---
    blocks = projectBlocksFromFormSections(uiSpec.form.sections);
    slots = projectSlotsFromFormSections(uiSpec.form.sections);
    assignSlotsToBlocksFromSections(blocks, slots, uiSpec.form.sections);

    // Emit diagnostics for unsupported widgets in fallback
    diagnostics.push(
      ...emitUnsupportedWidgetDiagnostics(uiSpec.form.sections)
    );
  } else {
    // --- No editor config and no form sections: return empty projection ---
    blocks = [];
    slots = [];
    diagnostics.push({
      code: 'NO_LAYOUT_CONFIG',
      message:
        'UI spec has no editor config and no form.sections; returning empty projection.',
      severity: 'warning',
    });
  }

  // Add general diagnostics
  diagnostics.push(
    ...emitDiagnostics(uiSpec, payload)
  );

  return {
    schemaId,
    recordId,
    title: extractTitle(payload),
    blocks,
    slots,
    diagnostics,
  };
}

// ============================================================================
// Service class
// ============================================================================

/**
 * EditorProjectionService — Resolves record payload + schema + UI spec
 * into a typed projection response.
 */
export class EditorProjectionService {
  /**
   * Project a record into an EditorProjectionResponse.
   *
   * @param uiSpec - The UI specification for the record's schema
   * @param payload - The record payload
   * @param schemaId - The schema ID
   * @param recordId - The record ID
   * @returns The projection response
   */
  project(
    uiSpec: UISpec,
    payload: Record<string, unknown>,
    schemaId: string,
    recordId: string
  ): EditorProjectionResponse {
    return projectRecord(uiSpec, payload, schemaId, recordId);
  }
}

/**
 * Create a new EditorProjectionService instance.
 */
export function createEditorProjectionService(): EditorProjectionService {
  return new EditorProjectionService();
}
