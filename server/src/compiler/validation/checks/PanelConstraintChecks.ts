/**
 * PanelConstraintChecks - Validation checks for assay panel constraints.
 *
 * - assay-edge-exclusion: errors if any event targets an excluded edge
 *   well (row A/H or col 1/12 on a 96-well) when the resolved assay
 *   declares `panelConstraints.edgeExclusion: true` in its YAML spec.
 * - assay-cell-region: warns if events are outside the declared
 *   `panelConstraints.cellRegion` (rows/cols) in the assay YAML spec.
 */

import { registerValidationCheck } from '../ValidationCheck.js';
import type { ValidationFinding } from '../ValidationReport.js';
import { getAssaySpecRegistry } from '../../../registry/AssaySpecRegistry.js';

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
// Cell-region parser
// ---------------------------------------------------------------------------

/**
 * Parse a cellRegion spec like `{ rows: 'B-G', cols: '2-11' }` into
 * a usable shape.  Returns `null` if either field is missing or malformed.
 */
function parseCellRegion(
  region: { rows?: string; cols?: string },
): { rows: Set<string>; cols: { min: number; max: number } } | null {
  const { rows, cols } = region;
  if (!rows || !cols) return null;

  // Parse rows: 'A-Z' range → Set of single-letter row names
  const rowMatch = rows.match(/^([A-Z])-([A-Z])$/);
  if (!rowMatch) return null;
  const rowStart = rowMatch[1]!.charCodeAt(0);
  const rowEnd = rowMatch[2]!.charCodeAt(0);
  if (rowEnd < rowStart) return null;
  const rowSet = new Set<string>();
  for (let code = rowStart; code <= rowEnd; code++) {
    rowSet.add(String.fromCharCode(code));
  }

  // Parse cols: '1-12' range → { min, max }
  const colMatch = cols.match(/^(\d+)-(\d+)$/);
  if (!colMatch) return null;
  const colMin = Number(colMatch[1]);
  const colMax = Number(colMatch[2]);
  if (colMax < colMin) return null;

  return { rows: rowSet, cols: { min: colMin, max: colMax } };
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

    const registry = getAssaySpecRegistry();
    const events = artifacts.events ?? [];

    for (const assayRef of assayRefs) {
      const spec = registry.get(assayRef.resolvedId);
      if (!spec?.panelConstraints?.edgeExclusion) continue;

      const assayName = spec.name ?? assayRef.resolvedId;
      const violations = events.filter((e) => {
        const well = (e.details as { well?: string }).well;
        return well && EXCLUDED_WELLS_96.has(well);
      });
      if (violations.length === 0) continue;

      findings.push({
        severity: 'error',
        category: 'panel-constraint',
        message: `${violations.length} events target edge wells on a ${assayName} plate (edges excluded).`,
        suggestion: 'Move events to the interior (rows B-G, cols 2-11).',
        affectedIds: violations.map((v) => v.eventId),
      });
    }

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
    if (assayRefs.length === 0) return findings;

    const registry = getAssaySpecRegistry();
    const events = artifacts.events ?? [];

    for (const assayRef of assayRefs) {
      const spec = registry.get(assayRef.resolvedId);
      if (!spec?.panelConstraints?.cellRegion) continue;

      const region = parseCellRegion(spec.panelConstraints.cellRegion);
      if (!region) continue;

      const assayName = spec.name ?? assayRef.resolvedId;
      const outside = events.filter((e) => {
        const well = (e.details as { well?: string }).well;
        if (!well) return false;
        const m = well!.match(/^([A-Z])(\d+)$/);
        if (!m) return false;
        const row = m[1]!;
        const col = Number(m[2]);
        return (
          !region.rows.has(row) || col < region.cols.min || col > region.cols.max
        );
      });

      if (outside.length > 0) {
        findings.push({
          severity: 'warning',
          category: 'panel-constraint',
          message: `${outside.length} events are outside the ${assayName} cellRegion.`,
          affectedIds: outside.map((v) => v.eventId),
        });
      }
    }

    return findings;
  },
});
