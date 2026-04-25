/**
 * Tests for EditorProjectionService.
 *
 * Covers:
 * 1. Happy-path budget projection (editor config path)
 * 2. Fallback projection from form.sections
 */

import { describe, it, expect } from 'vitest';
import type { UISpec } from './types.js';
import { projectRecord, createEditorProjectionService } from './EditorProjectionService.js';

// ============================================================================
// Fixtures
// ============================================================================

/**
 * Minimal budget UISpec with editor config (mirrors budget.ui.yaml).
 */
function makeBudgetUISpec(): UISpec {
  return {
    uiVersion: 1,
    schemaId: 'https://computable-lab.com/schema/computable-lab/budget.schema.yaml',
    editor: {
      mode: 'document',
      blocks: [
        {
          id: 'header-summary',
          kind: 'section',
          label: 'Budget Summary',
          help: 'Overview of budget state, currency, and totals.',
        },
        {
          id: 'line-items',
          kind: 'repeater',
          label: 'Line Items',
          help: 'Selected vendor-offer lines with pricing.',
          path: '$.lines',
        },
        {
          id: 'totals',
          kind: 'section',
          label: 'Totals',
          help: 'Computed summary of approved line items.',
        },
      ],
      slots: [
        {
          id: 'title-slot',
          path: '$.title',
          label: 'Budget Title',
          widget: 'text',
          required: true,
        },
        {
          id: 'state-slot',
          path: '$.state',
          label: 'State',
          widget: 'select',
          suggestionProviders: ['local-vocab'],
        },
        {
          id: 'currency-slot',
          path: '$.currency',
          label: 'Currency',
          widget: 'select',
          suggestionProviders: ['local-vocab'],
        },
        {
          id: 'notes-slot',
          path: '$.notes',
          label: 'Notes',
          widget: 'textarea',
          suggestionProviders: ['local-vocab'],
        },
      ],
    },
  };
}

/**
 * Minimal legacy UISpec with only form.sections (no editor config).
 */
function makeLegacyUISpec(): UISpec {
  return {
    uiVersion: 1,
    schemaId: 'https://computable-lab.com/schema/computable-lab/legacy.schema.yaml',
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
          id: 'details',
          title: 'Details',
          fields: [
            {
              path: '$.name',
              widget: 'text',
              label: 'Name',
              required: true,
            },
            {
              path: '$.description',
              widget: 'textarea',
              label: 'Description',
            },
          ],
        },
      ],
    },
  };
}

/**
 * Minimal budget payload.
 */
const budgetPayload: Record<string, unknown> = {
  title: 'Q1 2026 Reagent Budget',
  state: 'draft',
  currency: 'USD',
  notes: 'Initial budget draft.',
  lines: [],
};

/**
 * Minimal legacy payload.
 */
const legacyPayload: Record<string, unknown> = {
  recordId: 'LEG-001',
  kind: 'legacy',
  name: 'Test Legacy Record',
  description: 'A legacy record with no editor config.',
};

// ============================================================================
// Tests
// ============================================================================

describe('EditorProjectionService', () => {
  describe('budget editor config path', () => {
    it('projects header, line-items, and totals blocks', () => {
      const uiSpec = makeBudgetUISpec();
      const result = projectRecord(
        uiSpec,
        budgetPayload,
        uiSpec.schemaId,
        'BUD-001'
      );

      expect(result.schemaId).toBe(uiSpec.schemaId);
      expect(result.recordId).toBe('BUD-001');
      expect(result.title).toBe('Q1 2026 Reagent Budget');
      expect(result.blocks).toHaveLength(3);
      expect(result.blocks[0].id).toBe('header-summary');
      expect(result.blocks[0].kind).toBe('section');
      expect(result.blocks[1].id).toBe('line-items');
      expect(result.blocks[1].kind).toBe('repeater');
      expect(result.blocks[1].path).toBe('$.lines');
      expect(result.blocks[2].id).toBe('totals');
      expect(result.blocks[2].kind).toBe('section');
    });

    it('projects all four slots with correct metadata', () => {
      const uiSpec = makeBudgetUISpec();
      const result = projectRecord(
        uiSpec,
        budgetPayload,
        uiSpec.schemaId,
        'BUD-001'
      );

      expect(result.slots).toHaveLength(4);

      const titleSlot = result.slots.find((s) => s.id === 'title-slot');
      expect(titleSlot).toBeDefined();
      expect(titleSlot!.path).toBe('$.title');
      expect(titleSlot!.label).toBe('Budget Title');
      expect(titleSlot!.widget).toBe('text');
      expect(titleSlot!.required).toBe(true);

      const stateSlot = result.slots.find((s) => s.id === 'state-slot');
      expect(stateSlot).toBeDefined();
      expect(stateSlot!.suggestionProviders).toEqual(['local-vocab']);

      const currencySlot = result.slots.find((s) => s.id === 'currency-slot');
      expect(currencySlot).toBeDefined();
      expect(currencySlot!.widget).toBe('select');

      const notesSlot = result.slots.find((s) => s.id === 'notes-slot');
      expect(notesSlot).toBeDefined();
      expect(notesSlot!.widget).toBe('textarea');
    });

    it('assigns slots to blocks by path prefix', () => {
      const uiSpec = makeBudgetUISpec();
      const result = projectRecord(
        uiSpec,
        budgetPayload,
        uiSpec.schemaId,
        'BUD-001'
      );

      // line-items block should have no slots (no slot path starts with $.lines)
      const lineItemsBlock = result.blocks.find((b) => b.id === 'line-items');
      expect(lineItemsBlock!.slotIds).toEqual([]);

      // header-summary and totals blocks have no path, so no slot assignment
      const headerBlock = result.blocks.find((b) => b.id === 'header-summary');
      expect(headerBlock!.slotIds).toEqual([]);
    });

    it('emits a diagnostic for required slot with missing value', () => {
      const uiSpec = makeBudgetUISpec();
      const emptyPayload: Record<string, unknown> = {};
      const result = projectRecord(
        uiSpec,
        emptyPayload,
        uiSpec.schemaId,
        'BUD-002'
      );

      const requiredDiagnostics = result.diagnostics.filter(
        (d) => d.code === 'REQUIRED_SLOT_MISSING'
      );
      expect(requiredDiagnostics.length).toBeGreaterThan(0);
      expect(requiredDiagnostics[0].severity).toBe('warning');
      expect(requiredDiagnostics[0].path).toBe('$.title');
    });

    it('returns empty diagnostics when all required slots are present', () => {
      const uiSpec = makeBudgetUISpec();
      const result = projectRecord(
        uiSpec,
        budgetPayload,
        uiSpec.schemaId,
        'BUD-003'
      );

      const requiredDiagnostics = result.diagnostics.filter(
        (d) => d.code === 'REQUIRED_SLOT_MISSING'
      );
      expect(requiredDiagnostics).toHaveLength(0);
    });

    it('service class wraps projectRecord correctly', () => {
      const service = createEditorProjectionService();
      const uiSpec = makeBudgetUISpec();
      const result = service.project(
        uiSpec,
        budgetPayload,
        uiSpec.schemaId,
        'BUD-004'
      );

      expect(result.blocks).toHaveLength(3);
      expect(result.slots).toHaveLength(4);
    });
  });

  describe('form.sections fallback path', () => {
    it('projects section blocks from form.sections', () => {
      const uiSpec = makeLegacyUISpec();
      const result = projectRecord(
        uiSpec,
        legacyPayload,
        uiSpec.schemaId,
        'LEG-001'
      );

      expect(result.blocks).toHaveLength(2);
      expect(result.blocks[0].id).toBe('identity');
      expect(result.blocks[0].kind).toBe('section');
      expect(result.blocks[0].label).toBe('Identity');
      expect(result.blocks[1].id).toBe('details');
      expect(result.blocks[1].kind).toBe('section');
      expect(result.blocks[1].label).toBe('Details');
    });

    it('projects slots from form fields, skipping hidden fields', () => {
      const uiSpec = makeLegacyUISpec();
      const result = projectRecord(
        uiSpec,
        legacyPayload,
        uiSpec.schemaId,
        'LEG-001'
      );

      // Should have 3 slots: recordId, name, description (kind is hidden)
      expect(result.slots).toHaveLength(3);

      const recordIdSlot = result.slots.find((s) => s.path === '$.recordId');
      expect(recordIdSlot).toBeDefined();
      expect(recordIdSlot!.readOnly).toBe(true);

      const nameSlot = result.slots.find((s) => s.path === '$.name');
      expect(nameSlot).toBeDefined();
      expect(nameSlot!.required).toBe(true);

      const kindSlot = result.slots.find((s) => s.path === '$.kind');
      expect(kindSlot).toBeUndefined(); // hidden field should be skipped
    });

    it('emits info diagnostic when editor config is absent', () => {
      const uiSpec = makeLegacyUISpec();
      const result = projectRecord(
        uiSpec,
        legacyPayload,
        uiSpec.schemaId,
        'LEG-002'
      );

      const fallbackDiagnostics = result.diagnostics.filter(
        (d) => d.code === 'EDITOR_CONFIG_MISSING'
      );
      expect(fallbackDiagnostics).toHaveLength(1);
      expect(fallbackDiagnostics[0].severity).toBe('info');
    });

    it('assigns slots to blocks by section membership', () => {
      const uiSpec = makeLegacyUISpec();
      const result = projectRecord(
        uiSpec,
        legacyPayload,
        uiSpec.schemaId,
        'LEG-003'
      );

      const identityBlock = result.blocks.find((b) => b.id === 'identity');
      expect(identityBlock!.slotIds).toContain('slot-_recordId');

      const detailsBlock = result.blocks.find((b) => b.id === 'details');
      expect(detailsBlock!.slotIds).toContain('slot-_name');
      expect(detailsBlock!.slotIds).toContain('slot-_description');
    });

    it('returns a valid title from payload', () => {
      const uiSpec = makeLegacyUISpec();
      const result = projectRecord(
        uiSpec,
        legacyPayload,
        uiSpec.schemaId,
        'LEG-004'
      );

      expect(result.title).toBe('Test Legacy Record');
    });
  });

  describe('edge cases', () => {
    it('returns empty projection when no editor config and no form sections', () => {
      const uiSpec: UISpec = {
        uiVersion: 1,
        schemaId: 'https://computable-lab.com/schema/computable-lab/empty.schema.yaml',
      };
      const result = projectRecord(
        uiSpec,
        {},
        uiSpec.schemaId,
        'EMPTY-001'
      );

      expect(result.blocks).toHaveLength(0);
      expect(result.slots).toHaveLength(0);
      expect(result.diagnostics.length).toBeGreaterThanOrEqual(1);
      const layoutCodes = result.diagnostics.map((d) => d.code);
      expect(layoutCodes).toContain('NO_LAYOUT_CONFIG');
    });

    it('extracts title from recordId when no title field', () => {
      const uiSpec = makeBudgetUISpec();
      const payload: Record<string, unknown> = {
        recordId: 'BUD-999',
        state: 'approved',
      };
      const result = projectRecord(
        uiSpec,
        payload,
        uiSpec.schemaId,
        'BUD-999'
      );

      expect(result.title).toBe('BUD-999');
    });

    it('extracts title from name field when no title field', () => {
      const uiSpec = makeBudgetUISpec();
      const payload: Record<string, unknown> = {
        name: 'My Budget',
        state: 'draft',
      };
      const result = projectRecord(
        uiSpec,
        payload,
        uiSpec.schemaId,
        'BUD-998'
      );

      expect(result.title).toBe('My Budget');
    });

    it('returns "Untitled" when no title-like fields exist', () => {
      const uiSpec = makeBudgetUISpec();
      const result = projectRecord(
        uiSpec,
        { foo: 'bar' },
        uiSpec.schemaId,
        'BUD-997'
      );

      expect(result.title).toBe('Untitled');
    });

    it('handles empty editor config blocks gracefully', () => {
      const uiSpec: UISpec = {
        uiVersion: 1,
        schemaId: 'https://computable-lab.com/schema/computable-lab/empty-editor.schema.yaml',
        editor: {
          mode: 'document',
          blocks: [],
          slots: [],
        },
      };
      const result = projectRecord(
        uiSpec,
        {},
        uiSpec.schemaId,
        'EMPTY-002'
      );

      expect(result.blocks).toHaveLength(0);
      expect(result.slots).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(2); // EMPTY_BLOCKS + EMPTY_SLOTS
    });
  });
});
