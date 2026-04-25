/**
 * Tests for ProcurementManifestService.
 *
 * Covers:
 * - Explicit material requirement from planned-run.bindings.materials
 * - Inferred consumable requirement from event-graph transfer events
 * - Unresolved requirement when material reference is unknown
 */

import { describe, it, expect } from 'vitest';
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

describe('ProcurementManifestService', () => {
  const service = new ProcurementManifestService();

  // -----------------------------------------------------------------------
  // Explicit material requirement
  // -----------------------------------------------------------------------

  it('derives an explicit requirement line from a bound material', () => {
    const envelope = makePlannedRunEnvelope('PLR-0001', {
      materials: [
        {
          roleId: 'reagent-A',
          materialRef: {
            id: 'MAT-0001',
            type: 'reagent',
            label: 'DMEM High Glucose',
          },
        },
      ],
      labware: [],
    });

    const manifest = service.derive(envelope);

    expect(manifest.lines).toHaveLength(1);
    const line = manifest.lines[0];
    expect(line.requirementId).toBe('REQ-0001');
    expect(line.category).toBe('reagent');
    expect(line.description).toBe('DMEM High Glucose');
    expect(line.quantityHint).toBe(1);
    expect(line.unit).toBe('pcs');
    expect(line.provenance).toBe('explicit');
    expect(line.provenanceSummary).toBe('planned-run.bindings.materials[reagent-A]');
    expect(line.coverageStatus).toBe('covered');
    expect(line.sourceRef).toBe('MAT-0001');
  });

  // -----------------------------------------------------------------------
  // Inferred consumable requirement
  // -----------------------------------------------------------------------

  it('derives an inferred consumable line from event-graph transfer events', () => {
    const envelope = makePlannedRunEnvelope('PLR-0002', {
      materials: [],
      labware: [],
    });

    const eventGraphSummary = {
      events: [
        { eventType: 'transfer', volume: 50, volumeUnit: 'µL', pipetteChannelCount: 8 },
        { eventType: 'transfer', volume: 100, volumeUnit: 'µL', pipetteChannelCount: 8 },
        { eventType: 'transfer', volume: 25, volumeUnit: 'µL', pipetteChannelCount: 1 },
      ],
    };

    const manifest = service.derive(envelope, eventGraphSummary);

    // Should have 2 inferred lines: tips + reservoir
    expect(manifest.lines).toHaveLength(2);

    const tipsLine = manifest.lines.find((l) => l.requirementId === 'REQ-INF-TIPS');
    expect(tipsLine).toBeDefined();
    expect(tipsLine!.category).toBe('consumable');
    expect(tipsLine!.provenance).toBe('inferred');
    // 8 + 8 + 1 = 17 tips
    expect(tipsLine!.quantityHint).toBe(17);
    expect(tipsLine!.unit).toBe('pcs');

    const reservoirLine = manifest.lines.find((l) => l.requirementId === 'REQ-INF-RESERVOIR');
    expect(reservoirLine).toBeDefined();
    expect(reservoirLine!.provenance).toBe('inferred');
    // 50 + 100 + 25 = 175 µL total
    expect(reservoirLine!.quantityHint).toBe(1); // Math.ceil(175/1000) = 1
  });

  // -----------------------------------------------------------------------
  // Unresolved requirement
  // -----------------------------------------------------------------------

  it('marks a requirement as unresolved when material reference is unknown', () => {
    const envelope = makePlannedRunEnvelope('PLR-0003', {
      materials: [
        {
          roleId: 'unknown-reagent',
          materialRef: {
            id: 'unknown-material-1',
            type: 'reagent',
            label: 'Unknown Reagent',
          },
        },
      ],
      labware: [],
    });

    const manifest = service.derive(envelope);

    expect(manifest.lines).toHaveLength(1);
    const line = manifest.lines[0];
    expect(line.requirementId).toBe('REQ-0001');
    expect(line.provenance).toBe('unresolved');
    expect(line.coverageStatus).toBe('uncovered');
    expect(line.description).toBe('Unknown Reagent');
  });

  // -----------------------------------------------------------------------
  // Labware binding
  // -----------------------------------------------------------------------

  it('derives a labware requirement from bindings', () => {
    const envelope = makePlannedRunEnvelope('PLR-0004', {
      materials: [],
      labware: [
        {
          roleId: 'source-plate',
          labwareInstanceRef: {
            id: 'LW-0001',
            type: 'labware',
            label: '96-well plate',
          },
        },
      ],
    });

    const manifest = service.derive(envelope);

    expect(manifest.lines).toHaveLength(1);
    const line = manifest.lines[0];
    expect(line.requirementId).toBe('REQ-0001');
    expect(line.category).toBe('labware');
    expect(line.description).toBe('96-well plate');
    expect(line.provenance).toBe('explicit');
    expect(line.coverageStatus).toBe('covered');
  });

  // -----------------------------------------------------------------------
  // Mixed scenario
  // -----------------------------------------------------------------------

  it('combines explicit, inferred, and unresolved lines in one manifest', () => {
    const envelope = makePlannedRunEnvelope('PLR-0005', {
      materials: [
        {
          roleId: 'reagent-A',
          materialRef: { id: 'MAT-0001', type: 'reagent', label: 'Reagent A' },
        },
        {
          roleId: 'unknown-reagent',
          materialRef: { id: 'unknown-material-1', type: 'reagent', label: 'Unknown' },
        },
      ],
      labware: [
        {
          roleId: 'plate-1',
          labwareInstanceRef: { id: 'LW-0001', type: 'labware', label: 'Plate 1' },
        },
      ],
    });

    const eventGraphSummary = {
      events: [
        { eventType: 'transfer', volume: 50, volumeUnit: 'µL', pipetteChannelCount: 8 },
      ],
    };

    const manifest = service.derive(envelope, eventGraphSummary);

    // 2 explicit materials + 1 labware + 2 inferred = 5 lines
    expect(manifest.lines).toHaveLength(5);

    const explicitLines = manifest.lines.filter((l) => l.provenance === 'explicit');
    const unresolvedLines = manifest.lines.filter((l) => l.provenance === 'unresolved');
    const inferredLines = manifest.lines.filter((l) => l.provenance === 'inferred');

    expect(explicitLines).toHaveLength(2);
    expect(unresolvedLines).toHaveLength(1);
    expect(inferredLines).toHaveLength(2);
  });

  // -----------------------------------------------------------------------
  // Empty bindings
  // -----------------------------------------------------------------------

  it('returns empty lines when there are no bindings', () => {
    const envelope = makePlannedRunEnvelope('PLR-0006', {
      materials: [],
      labware: [],
    });

    const manifest = service.derive(envelope);
    expect(manifest.lines).toHaveLength(0);
  });
});
