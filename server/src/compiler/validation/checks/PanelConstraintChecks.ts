/**
 * PanelConstraintChecks - Validation checks for assay panel constraints.
 *
 * - assay-edge-exclusion: errors if any event targets an excluded edge
 *   well (row A/H or col 1/12 on a 96-well) when the resolved assay
 *   declares edgeExclusion (heuristic: assay id starts with 'FIRE').
 * - assay-cell-region: warns if events are outside the declared
 *   cellRegion (heuristic: FIRE-cellular-redox → B2-G11).
 */

import { registerValidationCheck } from '../ValidationCheck.js';
import type { ValidationFinding } from '../ValidationReport.js';

// ---------------------------------------------------------------------------
// Edge-well exclusion set for 96-well plates
// ---------------------------------------------------------------------------

const EXCLUDED_WELLS_96 = new Set<string>();
for (const r of ['A', 'H']) {
  for (let c = 1; c <= 12; c++) {
    EXCLUDED_WELLS_96.add(`${r}${c}`);
  }
}
for (const r of ['B', 'C', 'D', 'E', 'F', 'G']) {
  EXCLUDED_WELLS_96.add(`${r}1`);
  EXCLUDED_WELLS_96.add(`${r}12`);
}

// ---------------------------------------------------------------------------
// assay-edge-exclusion
// ---------------------------------------------------------------------------

registerValidationCheck({
  id: 'assay-edge-exclusion',
  category: 'panel-constraint',
  run({ artifacts }) {
    const findings: ValidationFinding[] = [];
    const resolved = artifacts.resolvedRefs ?? [];
    const assayRefs = resolved.filter((r) => r.kind === 'assay');
    if (assayRefs.length === 0) return findings;

    // Heuristic: edgeExclusion applies when the assay id starts with 'FIRE'.
    const edgeExcluded = assayRefs.some((r) => r.resolvedId.startsWith('FIRE'));
    if (!edgeExcluded) return findings;

    const events = artifacts.events ?? [];
    const violations = events.filter((e) => {
      const well = (e.details as { well?: string }).well;
      return well && EXCLUDED_WELLS_96.has(well);
    });
    if (violations.length === 0) return findings;

    findings.push({
      severity: 'error',
      category: 'panel-constraint',
      message: `${violations.length} events target edge wells on a FIRE-assay plate (edges excluded).`,
      suggestion: 'Move events to the interior (rows B-G, cols 2-11).',
      affectedIds: violations.map((v) => v.eventId),
    });

    return findings;
  },
});

// ---------------------------------------------------------------------------
// assay-cell-region
// ---------------------------------------------------------------------------

registerValidationCheck({
  id: 'assay-cell-region',
  category: 'panel-constraint',
  run({ artifacts }) {
    const findings: ValidationFinding[] = [];
    const resolved = artifacts.resolvedRefs ?? [];
    const assayRefs = resolved.filter((r) => r.kind === 'assay');
    const isFIRE = assayRefs.some((r) => r.resolvedId === 'FIRE-cellular-redox');
    if (!isFIRE) return findings;

    const events = artifacts.events ?? [];
    const inRegion = (well?: string): boolean => {
      if (!well) return true;
      const m = well.match(/^([A-Z])(\d+)$/);
      if (!m) return true;
      const row = m[1];
      const col = Number(m[2]);
      return 'BCDEFG'.includes(row) && col >= 2 && col <= 11;
    };

    const outside = events.filter(
      (e) => !inRegion((e.details as { well?: string }).well),
    );
    if (outside.length > 0) {
      findings.push({
        severity: 'warning',
        category: 'panel-constraint',
        message: `${outside.length} events are outside the FIRE cellRegion (B2-G11).`,
        affectedIds: outside.map((v) => v.eventId),
      });
    }

    return findings;
  },
});
