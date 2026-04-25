/**
 * IntraEventChecks - Validation checks that are decidable from a single
 * compile's artifacts without cross-turn reasoning.
 *
 * - pipette-volume-cap: warns if any transfer event has volumeUl >
 *   mounted pipette maxVolumeUl.
 * - well-address-valid: errors if well addresses don't match labware
 *   geometry (e.g. I1 on a 96-well plate).
 */

import { registerValidationCheck } from '../ValidationCheck.js';
import type { ValidationFinding } from '../ValidationReport.js';
import { getLabwareDefinitionRegistry } from '../../../registry/LabwareDefinitionRegistry.js';

// ---------------------------------------------------------------------------
// Labware geometry helper
// ---------------------------------------------------------------------------

const labwareRegistry = getLabwareDefinitionRegistry();

function getLabwareGeometry(labwareType: string): { rows: number; cols: number } | null {
  const spec = labwareRegistry.get(labwareType) ?? labwareRegistry.getByAlias(labwareType);
  if (!spec?.topology) return null;
  const { rows, columns } = spec.topology;
  if (typeof rows !== 'number' || typeof columns !== 'number' || rows <= 0 || columns <= 0) return null;
  return { rows, cols: columns };
}

// ---------------------------------------------------------------------------
// pipette-volume-cap
// ---------------------------------------------------------------------------

registerValidationCheck({
  id: 'pipette-volume-cap',
  category: 'intra-event',
  run({ artifacts, priorLabState }) {
    const findings: ValidationFinding[] = [];
    const pipettes = priorLabState.mountedPipettes;
    if (pipettes.length === 0) return findings; // no pipette → cannot check
    const maxVol = Math.max(...pipettes.map((p) => p.maxVolumeUl));
    const events = artifacts.events ?? [];
    for (const e of events) {
      const vol = Number((e.details as { volumeUl?: number }).volumeUl ?? 0);
      if (vol > maxVol) {
        findings.push({
          severity: 'warning',
          category: 'intra-event',
          message: `Event ${e.eventId} volume ${vol}uL exceeds max pipette capacity ${maxVol}uL`,
          suggestion: 'Split the transfer into multiple events or mount a larger pipette.',
          affectedIds: [e.eventId],
        });
      }
    }
    return findings;
  },
});

// ---------------------------------------------------------------------------
// well-address-valid
// ---------------------------------------------------------------------------

registerValidationCheck({
  id: 'well-address-valid',
  category: 'intra-event',
  run({ artifacts }) {
    const findings: ValidationFinding[] = [];
    const events = artifacts.events ?? [];
    for (const e of events) {
      const wells: string[] = [];
      const d = e.details as Record<string, unknown> | undefined;
      if (d?.well && typeof d.well === 'string') wells.push(d.well);
      if (d?.to && typeof d.to === 'object' && (d.to as any).well)
        wells.push((d.to as any).well);
      if (d?.from && typeof d.from === 'object' && (d.from as any).well)
        wells.push((d.from as any).well);
      const labwareType =
        (d?.to && typeof d.to === 'object' && (d.to as any).labwareType) ||
        (d?.from && typeof d.from === 'object' && (d.from as any).labwareType) ||
        (d?.labwareType as string | undefined);
      if (!labwareType) continue;
      const geom = getLabwareGeometry(labwareType);
      if (!geom) continue;
      for (const w of wells) {
        if (!isValidWell(w, geom)) {
          findings.push({
            severity: 'error',
            category: 'intra-event',
            message: `Invalid well address ${w} for labware ${labwareType}`,
            affectedIds: [e.eventId],
          });
        }
      }
    }
    return findings;
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidWell(
  well: string,
  geom: { rows: number; cols: number },
): boolean {
  const m = well.match(/^([A-Z]+)(\d+)$/);
  if (!m) return false;
  const rowIdx = m[1].charCodeAt(0) - 65;
  const col = Number(m[2]);
  return rowIdx >= 0 && rowIdx < geom.rows && col >= 1 && col <= geom.cols;
}
