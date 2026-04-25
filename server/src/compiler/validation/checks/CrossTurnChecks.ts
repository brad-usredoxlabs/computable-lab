/**
 * CrossTurnChecks - Validation checks that require cross-turn reasoning.
 *
 * - pipette-feasibility-cross-turn: errors if any event requires a volume
 *   below the feasibility floor of the mounted pipette (e.g. qPCR-scale
 *   uL on a 1000 uL pipette).
 */

import { registerValidationCheck } from '../ValidationCheck.js';
import type { ValidationFinding } from '../ValidationReport.js';

// ---------------------------------------------------------------------------
// pipette-feasibility-cross-turn
// ---------------------------------------------------------------------------

registerValidationCheck({
  id: 'pipette-feasibility-cross-turn',
  category: 'cross-turn',
  run({ artifacts, priorLabState }) {
    const findings: ValidationFinding[] = [];
    const pipettes = priorLabState.mountedPipettes;
    if (pipettes.length === 0) return findings;

    const events = artifacts.events ?? [];
    for (const p of pipettes) {
      // Simple heuristic: feasibility floor = maxVolumeUl * 0.01,
      // with a minimum of 5 uL.
      const floor = Math.max(5, p.maxVolumeUl * 0.01);
      const tooSmall = events.filter((e) => {
        const v = Number((e.details as { volumeUl?: number }).volumeUl ?? 0);
        return v > 0 && v < floor;
      });
      if (tooSmall.length === 0) continue;
      findings.push({
        severity: 'error',
        category: 'cross-turn',
        message: `Mounted pipette ${p.pipetteType} (max ${p.maxVolumeUl}uL) is too coarse for ${tooSmall.length} events with sub-${floor}uL volumes (e.g. qPCR).`,
        suggestion: `Swap to a smaller-volume pipette (e.g. 20uL 8-channel) before these events.`,
        details: { pipette: p.pipetteType, affectedCount: tooSmall.length, floor },
      });
    }

    return findings;
  },
});
