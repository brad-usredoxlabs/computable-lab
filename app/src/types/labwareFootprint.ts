/**
 * Labware footprint in physical millimetres.
 *
 * The lawn's clamp/collision math must stop assuming every tile is an SBS
 * plate. A labware's physical footprint is data, resolved here in ONE place:
 *
 *   1. `labware.physicalFootprintMm` — stamped at build time from the
 *      labware-definition's `physical_geometry.overall_dimensions_mm` (vendor
 *      sheet), or derived at build time via `deriveGridFootprintMm`.
 *   2. The bound definition record's `physical_geometry.overall_dimensions_mm`
 *      (via the app's LABWARE_DEFINITIONS mirror) for instances that predate
 *      stamping.
 *   3. Derivation for rectangular grids: `(columns·pitch + 2·EDGE_MARGIN_MM) ×
 *      (rows·pitch + 2·EDGE_MARGIN_MM)` — pitch-to-pitch span plus one edge
 *      margin on each side.
 *   4. LEGACY FALLBACK: 127 × 85 mm ("SBS footprint approx"). Kept ONLY so
 *      topology-less labware (pre-definition records) keeps placing; this is
 *      the collapse pointed at by
 *      ~/.hermes/specs/inbox/2026-09-18_230000-definition-driven-labware-placement.md
 *      (decision 3). Delete this branch only when every placement path carries
 *      a definition (task #13).
 *
 * Spec: "Definition-Driven Labware Placement — Kill the Legacy-Enum Collapse",
 * decision 3. Tile *render* size stays fixed px (documented legibility
 * decision) — only physical mm changes here.
 */

import type { Labware } from './labware'
import { getLabwareDefinitionById } from './labwareDefinition'

/**
 * Distance from the outermost well centre-line to the vessel edge, per side.
 * Lives HERE (one exported constant) so clamp math and derived footprints
 * cannot drift apart.
 */
export const EDGE_MARGIN_MM = 6

/** Legacy SBS footprint (landscape: 127 × 85 mm) — final fallback only. */
export const LEGACY_SBS_FOOTPRINT_MM = { length: 127, width: 85 } as const

/**
 * Bench-tile geometry — the ONE source for how big a tile renders and how many
 * mm a rendered pixel is worth on each bench. LawnSurface renders from these and
 * the preview/drag math converts through them, so a tile's screen size and its
 * mm footprint can never drift apart.
 */
export const LAWN_TILE_LANDSCAPE_PX = { w: 126, h: 80 } as const
export const LAWN_TILE_PORTRAIT_PX = { w: 80, h: 126 } as const
/** mm per rendered pixel on the primary (main) bench. */
export const MM_PER_PIXEL_PRIMARY = 1.6
/** mm per rendered pixel on the secondary (side) bench. */
export const MM_PER_PIXEL_SIDE = 1.4

export interface FootprintMm {
  /** Long-edge span in mm, landscape axes. */
  length: number
  /** Short-edge span in mm, landscape axes. */
  width: number
}

/**
 * Derive a rectangular grid footprint from pitch geometry, per spec decision 3:
 *   length = columns·pitch + 2·EDGE_MARGIN_MM
 *   width  = rows·pitch    + 2·EDGE_MARGIN_MM
 * A 5×16 rack at 13 mm pitch → (16·13+12) × (5·13+12) = 220 × 77 mm.
 */
export function deriveGridFootprintMm(
  rows: number,
  columns: number,
  pitchMm: number,
): FootprintMm {
  return {
    length: columns * pitchMm + 2 * EDGE_MARGIN_MM,
    width: rows * pitchMm + 2 * EDGE_MARGIN_MM,
  }
}

/**
 * Physical footprint of a labware instance in landscape axes, longest
 * resolution-first (see module header). Orientation swaps the axes: a
 * portrait-placed object occupies width↔length.
 */
export function labwareFootprintMm(
  labware: Labware,
  orientation: 'landscape' | 'portrait' = 'landscape',
): FootprintMm {
  const base = resolveLandscapeFootprint(labware)
  return orientation === 'portrait'
    ? { length: base.width, width: base.length }
    : base
}

/**
 * Bench footprint of a piece of EQUIPMENT (landscape axes).
 *
 * Same discipline as labware, same file, same signature shape:
 *   1. `equipment.physicalFootprintMm` — stamped from the equipment-class's
 *      `physical_geometry.overall_dimensions_mm` once classes declare dimensions.
 *   2. PLACEHOLDER (until 1 exists for a given class): the rendered bench tile —
 *      `LAWN_TILE_*_PX × MM_PER_PIXEL_*`. This is a SCREEN-size stand-in, not
 *      vendor data; it is used so the preview can lay equipment out without
 *      overlapping and so the drag clamp matches the tile the user is dragging.
 *      Nothing may treat it as a specification: an equipment-class that declares
 *      real dimensions supersedes it, and the deck's "does it fit" reasoning must
 *      not be derived from it.
 */
export function equipmentFootprintMm(
  equipment: { physicalFootprintMm?: FootprintMm },
  orientation: 'landscape' | 'portrait' = 'landscape',
  surface: 'primary' | 'side' = 'primary',
): FootprintMm {
  const stamped = equipment.physicalFootprintMm
  const base: FootprintMm = stamped
    ?? placeholderEquipmentFootprint(surface)
  return orientation === 'portrait'
    ? { length: base.width, width: base.length }
    : base
}

/** The screen-size placeholder tile footprint (see equipmentFootprintMm). */
export function placeholderEquipmentFootprint(
  surface: 'primary' | 'side' = 'primary',
): FootprintMm {
  const mmPerPx = surface === 'side' ? MM_PER_PIXEL_SIDE : MM_PER_PIXEL_PRIMARY
  return {
    length: LAWN_TILE_LANDSCAPE_PX.w * mmPerPx,
    width: LAWN_TILE_LANDSCAPE_PX.h * mmPerPx,
  }
}

/**
 * Long-edge ÷ short-edge ratio of the physical footprint.
 *
 * The focus (zoom-in) view must preserve this: the deck chip and the lawn
 * clamp already size the object by its real footprint, so a zoom-in that
 * snapped to the 127:85 SBS plate frame would show a different object than the
 * tile the user clicked (a 5×16 rack is 220×77 mm — ratio 2.86, not 1.49).
 * Orientation-invariant: rotating swaps which axis is long, not the ratio.
 */
export function labwareFootprintAspect(labware: Labware): number {
  const { length, width } = labwareFootprintMm(labware)
  const long = Math.max(length, width)
  const short = Math.min(length, width)
  return short > 0 ? long / short : 1
}

function resolveLandscapeFootprint(labware: Labware): FootprintMm {
  // 1. Stamped at build time from definition data.
  if (labware.physicalFootprintMm) {
    return labware.physicalFootprintMm
  }

  // 2. Bound definition record carries vendor dimensions.
  const definition = labware.definitionId ? getLabwareDefinitionById(labware.definitionId) : null
  const vendor = definition?.physical_geometry?.overall_dimensions_mm
  if (vendor && typeof vendor.length === 'number' && typeof vendor.width === 'number') {
    return { length: vendor.length, width: vendor.width }
  }

  // 3. Derivation for rectangular grids with a known pitch.
  const pitch = labware.wellPitch_mm
    ?? definition?.topology.well_pitch_mm
    ?? definition?.topology.row_pitch_mm
  if (
    labware.addressing?.type === 'grid'
    && typeof labware.addressing.rows === 'number'
    && typeof labware.addressing.columns === 'number'
    && typeof pitch === 'number'
    && pitch > 0
  ) {
    return deriveGridFootprintMm(labware.addressing.rows, labware.addressing.columns, pitch)
  }

  // 4. Legacy SBS fallback — see module header; delete with task #13, not before.
  return { ...LEGACY_SBS_FOOTPRINT_MM }
}
