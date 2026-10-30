/**
 * Focused tests for EditorProjection fallback from form.sections.
 *
 * Covers:
 * 1. planned-run-style projection with descriptions/collapsible sections
 * 2. experiment-style projection with field visibility/help metadata
 * 3. unsupported nested widget case that yields diagnostics instead of
 *    metadata loss
 */

import { describe, it, expect } from 'vitest';
import type { UISpec } from './types.js';
import { projectRecord } from './EditorProjectionService.js';

// ============================================================================
// Fixtures — planned-run style
// ============================================================================

/**
 * A planned-run-style UISpec mirroring schema/workflow/planned-run.ui.yaml.
 * Has multiple sections, some with descriptions, collapsible flags, and
 * a mix of supported and unsupported widgets.
 */
function makePlannedRunUISpec(): UISpec {
  return {
    uiVersion: 1,
    schemaId:
      'https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml',
    form: {
      layout: 'sections',
      sections: [
        {
          id: 'identity',
          title: 'Identity',
          description: 'Unique identifiers for this planned run.',
          fields: [
            {
              path: '$.recordId',
              widget: 'text',
              label: 'Record ID',
              readOnly: true,
            },
            {
              path: '$.kind',
              widget: 'text',
              label: 'Kind',
              hidden: true,
            },
          ],
        },
        {
          id: 'basic-info',
          title: 'Basic Information',
          description: 'Core metadata for the planned run.',
          fields: [
            {
              path: '$.title',
              widget: 'text',
              label: 'Title',
              required: true,
              placeholder: 'Enter a descriptive title',
            },
            {
              path: '$.state',
              widget: 'select',
              label: 'State',
              required: true,
              options: [
                { value: 'draft', label: 'Draft' },
                { value: 'approved', label: 'Approved' },
                { value: 'completed', label: 'Completed' },
              ],
            },
            {
              path: '$.sourceType',
              widget: 'select',
              label: 'Source Type',
              required: true,
            },
            {
              path: '$.sourceRef',
              widget: 'ref',
              label: 'Source',
              required: true,
              refKind: 'protocol',
            },
            {
              path: '$.protocolRef',
              widget: 'ref',
              label: 'Protocol',
              refKind: 'protocol',
            },
          ],
        },
        {
          id: 'operator',
          title: 'Operator',
          description: 'Person performing this run.',
          collapsible: true,
          fields: [
            {
              path: '$.operatorRef',
              widget: 'ref',
              label: 'Operator',
              refKind: 'person',
              help:
                'Person performing this run. Optional — used for readiness and compliance checks.',
            },
          ],
        },
        {
          id: 'bindings',
          title: 'Bindings',
          collapsible: true,
          collapsed: true,
          fields: [
            {
              path: '$.bindings.labware',
              widget: 'array',
              label: 'Labware Bindings',
              help: 'Deck-bound labware instances.',
            },
            {
              path: '$.bindings.materials',
              widget: 'array',
              label: 'Material Bindings',
            },
            {
              path: '$.bindings.instruments',
              widget: 'array',
              label: 'Instrument Bindings',
            },
            {
              path: '$.bindings.parameters',
              widget: 'array',
              label: 'Parameter Bindings',
            },
          ],
        },
        {
          id: 'deck-layout',
          title: 'Deck Layout',
          fields: [
            {
              path: '$.deckLayout.assignments',
              widget: 'array',
              label: 'Deck Assignments',
            },
          ],
        },
        {
          id: 'notes',
          title: 'Notes',
          fields: [
            {
              path: '$.notes',
              widget: 'markdown',
              label: 'Notes',
            },
            {
              path: '$.tags',
              widget: 'array',
              label: 'Tags',
            },
          ],
        },
      ],
    },
  };
}

/**
 * A planned-run payload.
 */
const plannedRunPayload: Record<string, unknown> = {
  recordId: 'PR-001',
  kind: 'planned-run',
  title: 'Q1 2026 Screening Run',
  state: 'draft',
  sourceType: 'protocol',
  sourceRef: 'PROT-001',
  protocolRef: 'PROT-002',
  operatorRef: 'PER-001',
  bindings: {
    labware: [],
    materials: [],
    instruments: [],
    parameters: [],
  },
  deckLayout: {
    assignments: [],
  },
  notes: 'Initial screening run.',
  tags: ['screening', 'q1-2026'],
};

// ============================================================================
// Fixtures — experiment style
// ============================================================================

/**
 * An experiment-style UISpec mirroring schema/studies/experiment.ui.yaml.
 * Has collapsible sections, combobox widgets, props, and visibility conditions.
 */
function makeExperimentUISpec(): UISpec {
  return {
    uiVersion: 1,
    schemaId:
      'https://computable-lab.com/schema/computable-lab/experiment.schema.yaml',
    form: {
      layout: 'sections',
      sections: [
        {
          id: 'identity',
          title: 'Identity',
          fields: [
            {
              path: '$.recordId',
              widget: 'text',
              label: 'Record ID',
              readOnly: true,
            },
            {
              path: '$.kind',
              widget: 'text',
              label: 'Kind',
              hidden: true,
            },
          ],
        },
        {
          id: 'basic-info',
          title: 'Basic Information',
          description: 'Core experiment metadata.',
          fields: [
            {
              path: '$.title',
              widget: 'text',
              label: 'Title',
              required: true,
              placeholder: 'Enter experiment title',
            },
            {
              path: '$.shortSlug',
              widget: 'text',
              label: 'Short Slug',
              placeholder: 'auto-generated',
            },
            {
              path: '$.studyId',
              widget: 'ref',
              label: 'Study',
              refKind: 'study',
            },
            {
              path: '$.description',
              widget: 'markdown',
              label: 'Description',
              help: 'Rich-text description of the experiment.',
            },
          ],
        },
        {
          id: 'metadata',
          title: 'Metadata',
          collapsible: true,
          fields: [
            {
              path: '$.tags',
              widget: 'combobox',
              label: 'Tags',
              props: {
                sources: ['local'],
                field: 'tags',
              },
            },
            {
              path: '$.claimIds',
              widget: 'array',
              label: 'Claim IDs',
            },
          ],
        },
        {
          id: 'fair',
          title: 'FAIR',
          collapsible: true,
          collapsed: true,
          fields: [
            {
              path: '$.license',
              widget: 'text',
              label: 'License',
            },
            {
              path: '$.keywords',
              widget: 'combobox',
              label: 'Keywords',
              props: {
                sources: ['local', 'ols'],
                ontologies: ['efo', 'chebi', 'go'],
                field: 'keywords',
              },
            },
            {
              path: '$.relatedIdentifiers',
              widget: 'array',
              label: 'Related Identifiers',
            },
          ],
        },
        {
          id: 'provenance',
          title: 'Provenance',
          collapsible: true,
          collapsed: true,
          fields: [
            {
              path: '$.createdAt',
              widget: 'text',
              label: 'Created',
              readOnly: true,
            },
            {
              path: '$.createdBy',
              widget: 'text',
              label: 'Created By',
              readOnly: true,
            },
            {
              path: '$.updatedAt',
              widget: 'text',
              label: 'Updated',
              readOnly: true,
            },
          ],
        },
      ],
    },
  };
}

/**
 * An experiment payload.
 */
const experimentPayload: Record<string, unknown> = {
  recordId: 'EXP-001',
  kind: 'experiment',
  title: 'HepG2 Viability Assay',
  shortSlug: 'hepg2-viability',
  studyId: 'STUDY-001',
  description: 'Testing compound viability.',
  tags: ['viability', 'hepg2'],
  claimIds: [],
  license: 'MIT',
  keywords: ['cell-viability', 'hepg2'],
  relatedIdentifiers: [],
  createdAt: '2026-01-15T10:00:00Z',
  createdBy: 'user@example.com',
  updatedAt: '2026-01-16T12:00:00Z',
};

// ============================================================================
// Fixtures — unsupported nested widget
// ============================================================================

/**
 * A UISpec with unsupported nested widgets (array, object, custom) that
 * should emit diagnostics while preserving nested metadata.
 */
function makeUnsupportedWidgetUISpec(): UISpec {
  return {
    uiVersion: 1,
    schemaId:
      'https://computable-lab.com/schema/computable-lab/test.schema.yaml',
    form: {
      layout: 'sections',
      sections: [
        {
          id: 'nested',
          title: 'Nested Widgets',
          description: 'Section with unsupported widget types.',
          fields: [
            {
              path: '$.items',
              widget: 'array',
              label: 'Items',
              // WIDGET-R1: a VALID typed item-hint (path + widget) — the
              // ArrayWidget is authorable, so the projection SUPPRESSES the
              // UNSUPPORTED_WIDGET diagnostic for this array.
              items: {
                path: '$.items[].name',
                widget: 'text',
                label: 'Item Name',
                required: true,
              },
            },
            {
              // WIDGET-R1: a HINT-LESS array — a spec defect marker. The
              // diagnostic stays LOUD (the raw-fallback items echo is not
              // present because there is no items to echo).
              path: '$.plainItems',
              widget: 'array',
              label: 'Plain Items (no hint)',
            },
            {
              // WIDGET-R1: an array whose item-hint is INVALID (items present
              // but missing the loader-required path/widget) — still a spec
              // defect marker. The diagnostic is emitted LOUD with the items
              // echo preserved (traceability for the raw fallback). The shape
              // is deliberately malformed (no path, no widget) — the loader's
              // validateFieldHint would reject it at load time, so in the
              // projection-only path it exercises the "items present but
              // not a valid hint" branch.
              path: '$.malformed',
              widget: 'array',
              label: 'Malformed hint',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              items: { label: 'malformed (no path, no widget)' } as any,
            },
            {
              path: '$.config',
              widget: 'object',
              label: 'Configuration',
              fields: [
                {
                  path: '$.config.timeout',
                  widget: 'number',
                  label: 'Timeout',
                },
                {
                  path: '$.config.retries',
                  widget: 'number',
                  label: 'Retries',
                },
              ],
            },
            {
              path: '$.customField',
              widget: 'custom',
              label: 'Custom Field',
              customWidget: 'rich-editor',
              props: {
                toolbar: true,
                placeholder: 'Enter content...',
              },
            },
            {
              path: '$.markdown',
              widget: 'markdown',
              label: 'Markdown Notes',
            },
            // Supported widget — should NOT emit diagnostic
            {
              path: '$.title',
              widget: 'text',
              label: 'Title',
              required: true,
            },
          ],
        },
      ],
    },
  };
}

const unsupportedPayload: Record<string, unknown> = {
  title: 'Test Record',
  items: [],
  config: { timeout: 30, retries: 3 },
  customField: '',
  markdown: '',
};

// ============================================================================
// Tests — planned-run style
// ============================================================================

describe('planned-run fallback projection', () => {
  it('preserves section descriptions in block help text', () => {
    const uiSpec = makePlannedRunUISpec();
    const result = projectRecord(
      uiSpec,
      plannedRunPayload,
      uiSpec.schemaId,
      'PR-001'
    );

    const identityBlock = result.blocks.find((b) => b.id === 'identity');
    expect(identityBlock).toBeDefined();
    expect(identityBlock!.help).toBe(
      'Unique identifiers for this planned run.'
    );

    const basicInfoBlock = result.blocks.find((b) => b.id === 'basic-info');
    expect(basicInfoBlock).toBeDefined();
    expect(basicInfoBlock!.help).toBe('Core metadata for the planned run.');

    const operatorBlock = result.blocks.find((b) => b.id === 'operator');
    expect(operatorBlock).toBeDefined();
    expect(operatorBlock!.help).toBe(
      'Person performing this run.'
    );
  });

  it('preserves section collapsible and collapsed state', () => {
    const uiSpec = makePlannedRunUISpec();
    const result = projectRecord(
      uiSpec,
      plannedRunPayload,
      uiSpec.schemaId,
      'PR-002'
    );

    const operatorBlock = result.blocks.find((b) => b.id === 'operator');
    expect(operatorBlock!.collapsible).toBe(true);
    expect(operatorBlock!.collapsed).toBe(false);

    const bindingsBlock = result.blocks.find((b) => b.id === 'bindings');
    expect(bindingsBlock!.collapsible).toBe(true);
    expect(bindingsBlock!.collapsed).toBe(true);
  });

  it('preserves section visibility conditions', () => {
    const uiSpec: UISpec = {
      uiVersion: 1,
      schemaId: 'https://example.com/schema/test.schema.yaml',
      form: {
        layout: 'sections',
        sections: [
          {
            id: 'conditional',
            title: 'Conditional Section',
            visible: {
              when: '$.state',
              operator: 'equals',
              value: 'advanced',
            },
            fields: [
              {
                path: '$.advancedField',
                widget: 'text',
                label: 'Advanced',
              },
            ],
          },
        ],
      },
    };
    const result = projectRecord(
      uiSpec,
      { state: 'advanced' },
      uiSpec.schemaId,
      'PR-003'
    );

    const block = result.blocks[0];
    expect(block.visible).toEqual({
      when: '$.state',
      operator: 'equals',
      value: 'advanced',
    });
  });

  it('preserves field placeholder, help, options, refKind, props', () => {
    const uiSpec = makePlannedRunUISpec();
    const result = projectRecord(
      uiSpec,
      plannedRunPayload,
      uiSpec.schemaId,
      'PR-004'
    );

    // Title field has placeholder
    const titleSlot = result.slots.find((s) => s.path === '$.title');
    expect(titleSlot).toBeDefined();
    expect(titleSlot!.placeholder).toBe('Enter a descriptive title');

    // State field has options
    const stateSlot = result.slots.find((s) => s.path === '$.state');
    expect(stateSlot).toBeDefined();
    expect(stateSlot!.options).toHaveLength(3);
    expect(stateSlot!.options![0].value).toBe('draft');

    // SourceRef has refKind
    const sourceRefSlot = result.slots.find(
      (s) => s.path === '$.sourceRef'
    );
    expect(sourceRefSlot).toBeDefined();
    expect(sourceRefSlot!.refKind).toBe('protocol');

    // Operator has help text
    const operatorSlot = result.slots.find(
      (s) => s.path === '$.operatorRef'
    );
    expect(operatorSlot).toBeDefined();
    expect(operatorSlot!.help).toBe(
      'Person performing this run. Optional — used for readiness and compliance checks.'
    );
  });

  it('skips hidden fields', () => {
    const uiSpec = makePlannedRunUISpec();
    const result = projectRecord(
      uiSpec,
      plannedRunPayload,
      uiSpec.schemaId,
      'PR-005'
    );

    const kindSlot = result.slots.find((s) => s.path === '$.kind');
    expect(kindSlot).toBeUndefined();
  });

  it('preserves section order deterministically', () => {
    const uiSpec = makePlannedRunUISpec();
    const result = projectRecord(
      uiSpec,
      plannedRunPayload,
      uiSpec.schemaId,
      'PR-006'
    );

    expect(result.blocks).toHaveLength(6);
    expect(result.blocks[0].id).toBe('identity');
    expect(result.blocks[1].id).toBe('basic-info');
    expect(result.blocks[2].id).toBe('operator');
    expect(result.blocks[3].id).toBe('bindings');
    expect(result.blocks[4].id).toBe('deck-layout');
    expect(result.blocks[5].id).toBe('notes');
  });

  it('does not flatten sections into one generic blob', () => {
    const uiSpec = makePlannedRunUISpec();
    const result = projectRecord(
      uiSpec,
      plannedRunPayload,
      uiSpec.schemaId,
      'PR-007'
    );

    // Each section should be its own block
    const blockIds = result.blocks.map((b) => b.id);
    expect(blockIds).toContain('identity');
    expect(blockIds).toContain('basic-info');
    expect(blockIds).toContain('operator');
    expect(blockIds).toContain('bindings');
    expect(blockIds).toContain('deck-layout');
    expect(blockIds).toContain('notes');
    // Should NOT have a single flattened section
    expect(blockIds).not.toContain('all-fields');
  });

  it('emits UNSUPPORTED_WIDGET diagnostics for array and markdown widgets', () => {
    const uiSpec = makePlannedRunUISpec();
    const result = projectRecord(
      uiSpec,
      plannedRunPayload,
      uiSpec.schemaId,
      'PR-008'
    );

    const unsupportedDiagnostics = result.diagnostics.filter(
      (d) => d.code === 'UNSUPPORTED_WIDGET'
    );
    expect(unsupportedDiagnostics.length).toBeGreaterThan(0);

    // Should have diagnostics for: bindings.labware, bindings.materials,
    // bindings.instruments, bindings.parameters, deckLayout.assignments,
    // notes (markdown), tags
    const paths = unsupportedDiagnostics.map((d) => d.path);
    expect(paths).toContain('$.bindings.labware');
    expect(paths).toContain('$.bindings.materials');
    expect(paths).toContain('$.deckLayout.assignments');
    expect(paths).toContain('$.notes');
    expect(paths).toContain('$.tags');
  });

  it('assigns slots to blocks by section membership', () => {
    const uiSpec = makePlannedRunUISpec();
    const result = projectRecord(
      uiSpec,
      plannedRunPayload,
      uiSpec.schemaId,
      'PR-009'
    );

    const identityBlock = result.blocks.find((b) => b.id === 'identity');
    expect(identityBlock!.slotIds).toContain('slot-_recordId');

    const basicInfoBlock = result.blocks.find((b) => b.id === 'basic-info');
    expect(basicInfoBlock!.slotIds).toContain('slot-_title');
    expect(basicInfoBlock!.slotIds).toContain('slot-_state');
    expect(basicInfoBlock!.slotIds).toContain('slot-_sourceType');
    expect(basicInfoBlock!.slotIds).toContain('slot-_sourceRef');
    expect(basicInfoBlock!.slotIds).toContain('slot-_protocolRef');

    const operatorBlock = result.blocks.find((b) => b.id === 'operator');
    expect(operatorBlock!.slotIds).toContain('slot-_operatorRef');
  });

  it('preserves readOnly and required on slots', () => {
    const uiSpec = makePlannedRunUISpec();
    const result = projectRecord(
      uiSpec,
      plannedRunPayload,
      uiSpec.schemaId,
      'PR-010'
    );

    const recordIdSlot = result.slots.find(
      (s) => s.path === '$.recordId'
    );
    expect(recordIdSlot!.readOnly).toBe(true);

    const titleSlot = result.slots.find((s) => s.path === '$.title');
    expect(titleSlot!.required).toBe(true);
  });
});

// ============================================================================
// Tests — experiment style
// ============================================================================

describe('experiment fallback projection', () => {
  it('preserves section descriptions and collapsible state', () => {
    const uiSpec = makeExperimentUISpec();
    const result = projectRecord(
      uiSpec,
      experimentPayload,
      uiSpec.schemaId,
      'EXP-001'
    );

    const basicInfoBlock = result.blocks.find((b) => b.id === 'basic-info');
    expect(basicInfoBlock!.help).toBe('Core experiment metadata.');

    const metadataBlock = result.blocks.find((b) => b.id === 'metadata');
    expect(metadataBlock!.collapsible).toBe(true);
    expect(metadataBlock!.collapsed).toBe(false);

    const fairBlock = result.blocks.find((b) => b.id === 'fair');
    expect(fairBlock!.collapsible).toBe(true);
    expect(fairBlock!.collapsed).toBe(true);

    const provenanceBlock = result.blocks.find(
      (b) => b.id === 'provenance'
    );
    expect(provenanceBlock!.collapsible).toBe(true);
    expect(provenanceBlock!.collapsed).toBe(true);
  });

  it('preserves field help metadata', () => {
    const uiSpec = makeExperimentUISpec();
    const result = projectRecord(
      uiSpec,
      experimentPayload,
      uiSpec.schemaId,
      'EXP-002'
    );

    const descriptionSlot = result.slots.find(
      (s) => s.path === '$.description'
    );
    expect(descriptionSlot).toBeDefined();
    expect(descriptionSlot!.help).toBe(
      'Rich-text description of the experiment.'
    );
  });

  it('preserves field placeholder metadata', () => {
    const uiSpec = makeExperimentUISpec();
    const result = projectRecord(
      uiSpec,
      experimentPayload,
      uiSpec.schemaId,
      'EXP-003'
    );

    const titleSlot = result.slots.find((s) => s.path === '$.title');
    expect(titleSlot!.placeholder).toBe('Enter experiment title');

    const slugSlot = result.slots.find((s) => s.path === '$.shortSlug');
    expect(slugSlot!.placeholder).toBe('auto-generated');
  });

  it('preserves props on combobox fields', () => {
    const uiSpec = makeExperimentUISpec();
    const result = projectRecord(
      uiSpec,
      experimentPayload,
      uiSpec.schemaId,
      'EXP-004'
    );

    const tagsSlot = result.slots.find((s) => s.path === '$.tags');
    expect(tagsSlot).toBeDefined();
    expect(tagsSlot!.props).toEqual({
      sources: ['local'],
      field: 'tags',
    });

    const keywordsSlot = result.slots.find(
      (s) => s.path === '$.keywords'
    );
    expect(keywordsSlot!.props).toEqual({
      sources: ['local', 'ols'],
      ontologies: ['efo', 'chebi', 'go'],
      field: 'keywords',
    });
  });

  it('preserves refKind on reference fields', () => {
    const uiSpec = makeExperimentUISpec();
    const result = projectRecord(
      uiSpec,
      experimentPayload,
      uiSpec.schemaId,
      'EXP-005'
    );

    const studySlot = result.slots.find((s) => s.path === '$.studyId');
    expect(studySlot!.refKind).toBe('study');
  });

  it('preserves readOnly on provenance fields', () => {
    const uiSpec = makeExperimentUISpec();
    const result = projectRecord(
      uiSpec,
      experimentPayload,
      uiSpec.schemaId,
      'EXP-006'
    );

    const createdAtSlot = result.slots.find(
      (s) => s.path === '$.createdAt'
    );
    expect(createdAtSlot!.readOnly).toBe(true);

    const createdBySlot = result.slots.find(
      (s) => s.path === '$.createdBy'
    );
    expect(createdBySlot!.readOnly).toBe(true);

    const updatedAtSlot = result.slots.find(
      (s) => s.path === '$.updatedAt'
    );
    expect(updatedAtSlot!.readOnly).toBe(true);
  });

  it('emits UNSUPPORTED_WIDGET diagnostics for array and markdown', () => {
    const uiSpec = makeExperimentUISpec();
    const result = projectRecord(
      uiSpec,
      experimentPayload,
      uiSpec.schemaId,
      'EXP-007'
    );

    const unsupportedDiagnostics = result.diagnostics.filter(
      (d) => d.code === 'UNSUPPORTED_WIDGET'
    );
    expect(unsupportedDiagnostics.length).toBeGreaterThan(0);

    const paths = unsupportedDiagnostics.map((d) => d.path);
    expect(paths).toContain('$.description'); // markdown
    expect(paths).toContain('$.claimIds'); // array
    expect(paths).toContain('$.relatedIdentifiers'); // array
  });

  it('preserves section order deterministically', () => {
    const uiSpec = makeExperimentUISpec();
    const result = projectRecord(
      uiSpec,
      experimentPayload,
      uiSpec.schemaId,
      'EXP-008'
    );

    expect(result.blocks).toHaveLength(5);
    expect(result.blocks[0].id).toBe('identity');
    expect(result.blocks[1].id).toBe('basic-info');
    expect(result.blocks[2].id).toBe('metadata');
    expect(result.blocks[3].id).toBe('fair');
    expect(result.blocks[4].id).toBe('provenance');
  });
});

// ============================================================================
// Tests — unsupported nested widget diagnostics
// ============================================================================

describe('unsupported nested widget diagnostics', () => {
  it('emits UNSUPPORTED_WIDGET diagnostics for the hint-less/invalid-hint arrays, object, custom, and markdown — and SUPPRESSES the valid-hint array (WIDGET-R1 conditional)', () => {
    const uiSpec = makeUnsupportedWidgetUISpec();
    const result = projectRecord(
      uiSpec,
      unsupportedPayload,
      uiSpec.schemaId,
      'TEST-001'
    );

    const unsupportedDiagnostics = result.diagnostics.filter(
      (d) => d.code === 'UNSUPPORTED_WIDGET'
    );
    // WIDGET-R1: the valid-hint `$.items` array is SUPPRESSED (authorable);
    // the hint-less `$.plainItems`, the invalid-hint `$.malformed`, the
    // `$.config` object, the `$.customField` custom, and the `$.markdown`
    // markdown still emit.
    expect(unsupportedDiagnostics).toHaveLength(5);

    const paths = unsupportedDiagnostics.map((d) => d.path);
    // The valid typed item-hint array is authorable — NOT diagnostic.
    expect(paths).not.toContain('$.items');
    // The spec-defect arrays (hint-less + invalid-hint) stay LOUD.
    expect(paths).toContain('$.plainItems'); // array, no hint
    expect(paths).toContain('$.malformed'); // array, invalid hint
    expect(paths).toContain('$.config'); // object
    expect(paths).toContain('$.customField'); // custom
    expect(paths).toContain('$.markdown'); // markdown
  });

  it('preserves nested items metadata for array widgets in slot projection', () => {
    const uiSpec = makeUnsupportedWidgetUISpec();
    const result = projectRecord(
      uiSpec,
      unsupportedPayload,
      uiSpec.schemaId,
      'TEST-002'
    );

    const itemsSlot = result.slots.find((s) => s.path === '$.items');
    expect(itemsSlot).toBeDefined();
    expect(itemsSlot!.items).toEqual({
      path: '$.items[].name',
      widget: 'text',
      label: 'Item Name',
      required: true,
    });
  });

  it('preserves nested fields metadata for object widgets in slot projection', () => {
    const uiSpec = makeUnsupportedWidgetUISpec();
    const result = projectRecord(
      uiSpec,
      unsupportedPayload,
      uiSpec.schemaId,
      'TEST-003'
    );

    const configSlot = result.slots.find((s) => s.path === '$.config');
    expect(configSlot).toBeDefined();
    expect(configSlot!.fields).toHaveLength(2);
    expect(configSlot!.fields![0].path).toBe('$.config.timeout');
    expect(configSlot!.fields![1].path).toBe('$.config.retries');
  });

  it('preserves props on custom widget slots', () => {
    const uiSpec = makeUnsupportedWidgetUISpec();
    const result = projectRecord(
      uiSpec,
      unsupportedPayload,
      uiSpec.schemaId,
      'TEST-004'
    );

    const customSlot = result.slots.find(
      (s) => s.path === '$.customField'
    );
    expect(customSlot).toBeDefined();
    expect(customSlot!.props).toEqual({
      toolbar: true,
      placeholder: 'Enter content...',
    });
  });

  it('does NOT emit diagnostics for supported widgets like text', () => {
    const uiSpec = makeUnsupportedWidgetUISpec();
    const result = projectRecord(
      uiSpec,
      unsupportedPayload,
      uiSpec.schemaId,
      'TEST-005'
    );

    const titleSlot = result.slots.find((s) => s.path === '$.title');
    expect(titleSlot).toBeDefined();
    expect(titleSlot!.widget).toBe('text');

    // The title field should not have an UNSUPPORTED_WIDGET diagnostic
    const titleDiagnostics = result.diagnostics.filter(
      (d) =>
        d.code === 'UNSUPPORTED_WIDGET' && d.path === '$.title'
    );
    expect(titleDiagnostics).toHaveLength(0);
  });

  it('includes nested metadata in diagnostic messages for traceability (the invalid-hint array keeps its items echo; the valid-hint array is suppressed)', () => {
    const uiSpec = makeUnsupportedWidgetUISpec();
    const result = projectRecord(
      uiSpec,
      unsupportedPayload,
      uiSpec.schemaId,
      'TEST-006'
    );

    // WIDGET-R1: the valid-hint `$.items` array is SUPPRESSED (no diagnostic,
    // no items echo). The invalid-hint `$.malformed` array is still LOUD and
    // keeps its items echo for the raw-fallback traceability.
    const itemsDiagnostic = result.diagnostics.find(
      (d) => d.code === 'UNSUPPORTED_WIDGET' && d.path === '$.malformed'
    );
    expect(itemsDiagnostic).toBeDefined();
    expect(itemsDiagnostic!.message).toContain('items:');

    // The valid-hint array must NOT emit a diagnostic (authorable).
    const validHintDiagnostic = result.diagnostics.find(
      (d) => d.code === 'UNSUPPORTED_WIDGET' && d.path === '$.items'
    );
    expect(validHintDiagnostic).toBeUndefined();

    const configDiagnostic = result.diagnostics.find(
      (d) => d.code === 'UNSUPPORTED_WIDGET' && d.path === '$.config'
    );
    expect(configDiagnostic).toBeDefined();
    expect(configDiagnostic!.message).toContain('fields:');
  });
});

// ============================================================================
// Tests — defaultValue preservation
// ============================================================================

describe('defaultValue preservation in fallback', () => {
  it('preserves defaultValue on slots from form.sections', () => {
    const uiSpec: UISpec = {
      uiVersion: 1,
      schemaId: 'https://example.com/schema/test.schema.yaml',
      form: {
        layout: 'sections',
        sections: [
          {
            id: 'defaults',
            title: 'Defaults',
            fields: [
              {
                path: '$.status',
                widget: 'text',
                label: 'Status',
                defaultValue: 'pending',
              },
              {
                path: '$.count',
                widget: 'number',
                label: 'Count',
                defaultValue: 0,
              },
            ],
          },
        ],
      },
    };
    const result = projectRecord(
      uiSpec,
      {},
      uiSpec.schemaId,
      'DEF-001'
    );

    const statusSlot = result.slots.find((s) => s.path === '$.status');
    expect(statusSlot!.defaultValue).toBe('pending');

    const countSlot = result.slots.find((s) => s.path === '$.count');
    expect(countSlot!.defaultValue).toBe(0);
  });
});

// ============================================================================
// Tests — section visibility preservation
// ============================================================================

describe('section visibility preservation in fallback', () => {
  it('preserves section visible conditions in block projection', () => {
    const uiSpec: UISpec = {
      uiVersion: 1,
      schemaId: 'https://example.com/schema/test.schema.yaml',
      form: {
        layout: 'sections',
        sections: [
          {
            id: 'visible-section',
            title: 'Visible Section',
            visible: {
              when: '$.mode',
              operator: 'equals',
              value: 'advanced',
            },
            fields: [
              {
                path: '$.advanced',
                widget: 'text',
                label: 'Advanced',
              },
            ],
          },
          {
            id: 'always-visible',
            title: 'Always Visible',
            fields: [
              {
                path: '$.basic',
                widget: 'text',
                label: 'Basic',
              },
            ],
          },
        ],
      },
    };
    const result = projectRecord(
      uiSpec,
      { mode: 'advanced' },
      uiSpec.schemaId,
      'VIS-001'
    );

    const visibleBlock = result.blocks.find(
      (b) => b.id === 'visible-section'
    );
    expect(visibleBlock!.visible).toEqual({
      when: '$.mode',
      operator: 'equals',
      value: 'advanced',
    });

    const alwaysBlock = result.blocks.find(
      (b) => b.id === 'always-visible'
    );
    expect(alwaysBlock!.visible).toBeUndefined();
  });
});
