/**
 * RoleResolver - Maps role-based coordinates to physical well addresses.
 *
 * This module provides a default role resolver that maps conceptual roles
 * (e.g. 'cell_region', 'control_well', 'perturbant_col_N') to concrete
 * well addresses, taking into account the current labware orientation
 * and optional assay-spec panel constraints.
 */

import type { LabwareOrientation } from '../state/LabState.js';
import type { AssaySpec } from '../../registry/AssaySpecRegistry.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Context passed to a role resolver.
 */
export interface RoleResolutionContext {
  orientation: LabwareOrientation;
  labwareType: string;            // e.g. '96-well-plate'
  assay?: AssaySpec;
  args?: Record<string, unknown>; // e.g. {col: 3} for perturbant_col_3
}

/**
 * A role resolver maps a role string to an array of well addresses.
 */
export type RoleResolver = (role: string, ctx: RoleResolutionContext) => string[];

// ---------------------------------------------------------------------------
// Default role library
// ---------------------------------------------------------------------------

/**
 * Default role resolver. Handles:
 * - cell_region: interior of a 96-well (rows B-G, cols 2-11 in landscape)
 * - control_well: A12 by convention
 * - perturbant_col_N: column N, rows B-G
 * - triplicate_<label>: three adjacent columns starting at args.startCol
 */
export const defaultRoleResolver: RoleResolver = (role, ctx) => {
  // cell_region: interior of a 96-well plate
  if (role === 'cell_region' && ctx.labwareType.includes('96')) {
    return expandCellRegion(ctx);
  }
  // control_well: A12 by convention
  if (role === 'control_well') return ['A12'];
  // perturbant_col_N: column N, rows B-G
  const colMatch = role.match(/^perturbant_col_(\d+)$/);
  if (colMatch) return perturbantCol(Number(colMatch[1]), ctx);
  // triplicate_<label>: three adjacent columns starting at args.startCol
  if (role.startsWith('triplicate_')) return triplicate(ctx);
  return [];
};

/**
 * Expand cell_region to concrete well addresses.
 *
 * Landscape (8 rows × 12 cols): rows B-G × cols 2-11 → 60 wells
 * Portrait (12 rows × 8 cols): rows C-J × cols 2-7 → 48 wells
 *
 * The orientation changes the physical grid interpretation:
 * - Landscape: standard 8×12 grid (rows A-H, cols 1-12)
 * - Portrait: rotated 90°, treated as 12×8 grid (rows A-L, cols 1-8)
 */
function expandCellRegion(ctx: RoleResolutionContext): string[] {
  const rows: string[] = [];
  const cols: number[] = [];

  if (ctx.orientation === 'landscape') {
    // Standard 96-well: 8 rows (A-H) × 12 cols (1-12)
    // Interior: rows B-G (6 rows), cols 2-11 (10 cols) = 60 wells
    rows.push('B', 'C', 'D', 'E', 'F', 'G');
    for (let c = 2; c <= 11; c++) cols.push(c);
  } else {
    // Portrait: rotated 90°, treated as 12 rows (A-L) × 8 cols (1-8)
    // Interior: rows C-J (8 rows), cols 2-7 (6 cols) = 48 wells
    rows.push('C', 'D', 'E', 'F', 'G', 'H', 'I', 'J');
    for (let c = 2; c <= 7; c++) cols.push(c);
  }

  const out: string[] = [];
  for (const r of rows) {
    for (const c of cols) {
      out.push(`${r}${c}`);
    }
  }
  return out;
}

/**
 * Expand perturbant_col_N to concrete well addresses.
 * Rows B-G in the specified column.
 */
function perturbantCol(n: number, ctx: RoleResolutionContext): string[] {
  const rows = ['B', 'C', 'D', 'E', 'F', 'G'];
  return rows.map(r => `${r}${n}`);
}

/**
 * Expand triplicate_<label> to concrete well addresses.
 * Three adjacent columns starting at args.startCol (default 1).
 * Rows B-G in each column.
 */
function triplicate(ctx: RoleResolutionContext): string[] {
  const start = (ctx.args?.startCol as number | undefined) ?? 1;
  const rows = ['B', 'C', 'D', 'E', 'F', 'G'];
  const out: string[] = [];
  for (let c = start; c < start + 3; c++) {
    for (const r of rows) {
      out.push(`${r}${c}`);
    }
  }
  return out;
}
