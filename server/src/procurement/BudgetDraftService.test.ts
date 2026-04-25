/**
 * Tests for BudgetDraftService.
 *
 * Covers:
 * - Draft budget line seeded from a manifest requirement
 * - No selected-offer assumptions
 * - Unresolved requirements preserved
 * - Package count suggestions
 */

import { describe, it, expect } from 'vitest';
import { BudgetDraftService } from './BudgetDraftService.js';
import { ProcurementManifestService } from './ProcurementManifestService.js';
import type { RecordEnvelope } from '../store/types.js';

function makePlannedRunEnvelope(
  recordId: string,
  bindings: Record<string, unknown>,
): RecordEnvelope {
  return {
    recordId,
    schemaId: 'https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml',
    payload: {
      kind: 'planned-run',
      recordId,
      title: 'Test Run',
      state: 'draft',
      bindings,
    },
  };
}

describe('BudgetDraftService', () => {
  const manifestService = new ProcurementManifestService();
  const budgetService = new BudgetDraftService();

  // -----------------------------------------------------------------------
  // Draft budget line seeded from manifest
  // -----------------------------------------------------------------------

  it('creates a draft budget with lines seeded from manifest', () => {
    const envelope = makePlannedRunEnvelope('PLR-0001', {
      materials: [
        {
          roleId: 'reagent-A',
          materialRef: { id: 'MAT-0001', type: 'reagent', label: 'DMEM High Glucose' },
        },
      ],
      labware: [],
    });

    const manifest = manifestService.derive(envelope);
    const draft = budgetService.createFromManifest(manifest);

    expect(draft.lines).toHaveLength(1);
    const line = draft.lines[0];
    expect(line.requirementId).toBe('REQ-0001');
    expect(line.description).toBe('DMEM High Glucose');
    expect(line.suggestedPackageCount).toBe(1);
    expect(line.unit).toBe('pcs');
    expect(line.selectedOfferRef).toBeNull();
    expect(line.unitPrice).toBeNull();
    expect(line.totalPrice).toBeNull();
    expect(line.approved).toBe(false);
    expect(line.notes).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // No selected-offer assumptions
  // -----------------------------------------------------------------------

  it('starts with no selected-offer assumptions', () => {
    const envelope = makePlannedRunEnvelope('PLR-0002', {
      materials: [
        {
          roleId: 'reagent-A',
          materialRef: { id: 'MAT-0001', type: 'reagent', label: 'Reagent A' },
        },
      ],
      labware: [],
    });

    const manifest = manifestService.derive(envelope);
    const draft = budgetService.createFromManifest(manifest);

    for (const line of draft.lines) {
      expect(line.selectedOfferRef).toBeNull();
      expect(line.unitPrice).toBeNull();
      expect(line.totalPrice).toBeNull();
      expect(line.approved).toBe(false);
    }
  });

  // -----------------------------------------------------------------------
  // Unresolved requirements preserved
  // -----------------------------------------------------------------------

  it('preserves unresolved requirements with appropriate notes', () => {
    const envelope = makePlannedRunEnvelope('PLR-0003', {
      materials: [
        {
          roleId: 'unknown-reagent',
          materialRef: { id: 'unknown-material-1', type: 'reagent', label: 'Unknown' },
        },
      ],
      labware: [],
    });

    const manifest = manifestService.derive(envelope);
    const draft = budgetService.createFromManifest(manifest);

    expect(draft.lines).toHaveLength(1);
    const line = draft.lines[0];
    expect(line.requirementId).toBe('REQ-0001');
    expect(line.provenance).toBe('unresolved');
    expect(line.notes).toBe('Unresolved requirement — no vendor offer available yet');
    expect(line.selectedOfferRef).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Inferred consumables preserved
  // -----------------------------------------------------------------------

  it('preserves inferred consumable lines with appropriate notes', () => {
    const envelope = makePlannedRunEnvelope('PLR-0004', {
      materials: [],
      labware: [],
    });

    const eventGraphSummary = {
      events: [
        { eventType: 'transfer', volume: 50, volumeUnit: 'µL', pipetteChannelCount: 8 },
      ],
    };

    const manifest = manifestService.derive(envelope, eventGraphSummary);
    const draft = budgetService.createFromManifest(manifest);

    const tipsLine = draft.lines.find((l) => l.requirementId === 'REQ-INF-TIPS');
    expect(tipsLine).toBeDefined();
    expect(tipsLine!.provenance).toBe('inferred');
    expect(tipsLine!.notes).toBe('Inferred consumable — quantity is approximate');
  });

  // -----------------------------------------------------------------------
  // Package count suggestions
  // -----------------------------------------------------------------------

  it('suggests package counts for consumables', () => {
    const envelope = makePlannedRunEnvelope('PLR-0005', {
      materials: [],
      labware: [],
    });

    // 170 tips → should round up to 192 (2 × 96)
    const eventGraphSummary = {
      events: [
        { eventType: 'transfer', volume: 50, volumeUnit: 'µL', pipetteChannelCount: 8 },
        { eventType: 'transfer', volume: 50, volumeUnit: 'µL', pipetteChannelCount: 8 },
        { eventType: 'transfer', volume: 50, volumeUnit: 'µL', pipetteChannelCount: 1 },
      ],
    };

    const manifest = manifestService.derive(envelope, eventGraphSummary);
    const draft = budgetService.createFromManifest(manifest);

    const tipsLine = draft.lines.find((l) => l.requirementId === 'REQ-INF-TIPS');
    expect(tipsLine).toBeDefined();
    // 8 + 8 + 1 = 17 tips → ceil(17/96) * 96 = 96
    expect(tipsLine!.suggestedPackageCount).toBe(96);
  });

  // -----------------------------------------------------------------------
  // Update from manifest
  // -----------------------------------------------------------------------

  it('updates an existing budget with new manifest lines', () => {
    const envelope = makePlannedRunEnvelope('PLR-0006', {
      materials: [
        {
          roleId: 'reagent-A',
          materialRef: { id: 'MAT-0001', type: 'reagent', label: 'Reagent A' },
        },
      ],
      labware: [],
    });

    const manifest = manifestService.derive(envelope);
    const draft = budgetService.createFromManifest(manifest);

    // Simulate an existing budget payload
    const existingPayload: Record<string, unknown> = {
      kind: 'budget',
      recordId: 'BUD-EXISTING',
      title: 'Existing Budget',
      state: 'draft',
      currency: 'USD',
      lines: [],
      summary: { lineCount: 0, approvedLineCount: 0, grandTotal: 0 },
    };

    const updated = budgetService.updateFromManifest(existingPayload, manifest);

    expect(updated.lines).toHaveLength(1);
    expect(updated.payload.recordId).toBe('BUD-EXISTING');
    // Title is updated from the manifest source
    expect(updated.payload.title).toBe('Budget for PLR-0006');
  });

  // -----------------------------------------------------------------------
  // Custom budget record ID
  // -----------------------------------------------------------------------

  it('accepts a custom budget record ID', () => {
    const envelope = makePlannedRunEnvelope('PLR-0007', {
      materials: [],
      labware: [],
    });

    const manifest = manifestService.derive(envelope);
    const draft = budgetService.createFromManifest(manifest, 'BUD-CUSTOM-001');

    expect(draft.payload.recordId).toBe('BUD-CUSTOM-001');
  });
});
