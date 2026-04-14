import type { Labware } from '../../types/labware'
import type { WellId } from '../../types/plate'

export type LabwareOrientation = 'portrait' | 'landscape'

/**
 * Calculate the center (cx, cy) of a well in SVG coordinates for a grid labware.
 * This mirrors the positioning logic in LabwareCanvas.tsx.
 */
export function getGridWellCenter(
  labware: Labware,
  wellId: WellId,
  orientation: LabwareOrientation,
  svgWidth: number = 500,
  svgHeight: number = 380
): { cx: number; cy: number } | null {
  if (labware.addressing.type !== 'grid') return null

  const padding = 40
  const rows = labware.addressing.rows || 8
  const cols = labware.addressing.columns || 12
  const availableWidth = svgWidth - padding * 2
  const availableHeight = svgHeight - padding * 2
  const wellWidth = availableWidth / cols
  const wellHeight = availableHeight / rows

  // Parse well ID (e.g., "A1" -> row "A", col 1)
  const match = wellId.match(/^([A-Z]+)(\d+)$/)
  if (!match) return null

  const rowLabel = match[1]
  const colNum = parseInt(match[2], 10)

  const rowLabels = labware.addressing.rowLabels || Array.from({ length: rows }, (_, i) => String.fromCharCode(65 + i))
  const colLabels = labware.addressing.columnLabels || Array.from({ length: cols }, (_, i) => String(i + 1))

  const rowIndex = rowLabels.indexOf(rowLabel)
  const colIndex = colLabels.indexOf(String(colNum))

  if (rowIndex < 0 || colIndex < 0) return null

  // Handle orientation
  let displayRow: number
  let displayCol: number
  if (orientation === 'portrait') {
    displayRow = colIndex
    displayCol = rowIndex
  } else {
    displayRow = rowIndex
    displayCol = colIndex
  }

  const cx = padding + displayCol * wellWidth + wellWidth / 2
  const cy = padding + displayRow * wellHeight + wellHeight / 2

  return { cx, cy }
}

/**
 * Calculate the center of a linear labware well in SVG coordinates.
 */
export function getLinearWellCenter(
  labware: Labware,
  wellId: WellId,
  orientation: 'portrait' | 'landscape',
  svgWidth: number,
  svgHeight: number
): { cx: number; cy: number } | null {
  if (labware.addressing.type !== 'linear') return null

  const labels = labware.addressing.linearLabels || []
  const idx = labels.indexOf(wellId)
  if (idx < 0) return null

  const useTroughStyle = labware.linearWellStyle === 'trough'

  if (orientation === 'landscape') {
    const padding = useTroughStyle ? 24 : 30
    const availableWidth = svgWidth - padding * 2
    const cellWidth = availableWidth / Math.max(1, labels.length)
    const x = padding + idx * cellWidth + cellWidth / 2
    const y = svgHeight / 2
    return { cx: x, cy: y }
  } else {
    // Portrait
    const padding = 30
    const labelWidth = 30
    const availableHeight = svgHeight - padding * 2
    const slotHeight = availableHeight / labels.length
    const x = labelWidth + (svgWidth - padding - labelWidth) / 2
    const y = padding + idx * slotHeight + slotHeight / 2
    return { cx: x, cy: y }
  }
}

/**
 * Calculate the center of a single labware well.
 */
export function getSingleWellCenter(
  labware: Labware,
  _wellId: WellId,
  svgWidth: number = 150,
  svgHeight: number = 200
): { cx: number; cy: number } | null {
  if (labware.addressing.type !== 'single') return null

  const centerX = svgWidth / 2
  const centerY = svgHeight / 2
  return { cx: centerX, cy: centerY }
}

/**
 * Get the center of a well in SVG coordinates for any labware type.
 */
export function getWellCenterSvg(
  labware: Labware,
  wellId: WellId,
  orientation: LabwareOrientation = 'landscape',
  svgWidth: number = 500,
  svgHeight: number = 380
): { cx: number; cy: number } | null {
  if (labware.addressing.type === 'grid') {
    return getGridWellCenter(labware, wellId, orientation, svgWidth, svgHeight)
  }
  if (labware.addressing.type === 'linear') {
    return getLinearWellCenter(labware, wellId, orientation, svgWidth, svgHeight)
  }
  if (labware.addressing.type === 'single') {
    return getSingleWellCenter(labware, wellId, svgWidth, svgHeight)
  }
  return null
}

export interface GridViewTransform {
  orientation: LabwareOrientation
  displayRows: number
  displayCols: number
  displayRowLabels: string[]
  displayColLabels: string[]
  canonicalRowLabels: string[]
  canonicalColLabels: string[]
  canonicalToDisplay: (wellId: WellId) => { row: number; col: number } | null
  displayToCanonical: (displayRow: number, displayCol: number) => WellId | null
}

function parseGridWell(wellId: WellId): { row: string; col: number } | null {
  const match = wellId.match(/^([A-Z]+)(\d+)$/)
  if (!match) return null
  return { row: match[1], col: parseInt(match[2], 10) }
}

export function getCanonicalPitchMm(labware: Labware): number {
  if (typeof labware.wellPitch_mm === 'number') return labware.wellPitch_mm
  if (labware.addressing.type !== 'grid') return 9
  const rows = labware.addressing.rows || 0
  const cols = labware.addressing.columns || 0
  if (rows === 16 && cols === 24) return 4.5
  return 9
}

export function resolveOrientationForLabware(
  labware: Labware,
  orientation: LabwareOrientation
): LabwareOrientation {
  if (labware.orientationPolicy === 'fixed_columns' && labware.addressing.type === 'grid') return 'landscape'
  return orientation
}

export function resolveEffectiveLinearAxisForLabware(
  labware: Labware,
  orientation: LabwareOrientation
): 'x' | 'y' {
  const baseAxis = labware.linearAxis || 'x'
  const resolved = resolveOrientationForLabware(labware, orientation)
  if (resolved === 'portrait') {
    return baseAxis === 'x' ? 'y' : 'x'
  }
  return baseAxis
}

export function createGridViewTransform(
  labware: Labware,
  orientation: LabwareOrientation
): GridViewTransform {
  const resolved = resolveOrientationForLabware(labware, orientation)
  const canonicalRows = labware.addressing.rows || 8
  const canonicalCols = labware.addressing.columns || 12
  const canonicalRowLabels = labware.addressing.rowLabels || Array.from({ length: canonicalRows }, (_, i) => String.fromCharCode(65 + i))
  const canonicalColLabels = labware.addressing.columnLabels || Array.from({ length: canonicalCols }, (_, i) => String(i + 1))
  const isPortrait = resolved === 'portrait'

  const displayRows = isPortrait ? canonicalCols : canonicalRows
  const displayCols = isPortrait ? canonicalRows : canonicalCols
  const displayRowLabels = isPortrait ? canonicalColLabels : canonicalRowLabels
  const displayColLabels = isPortrait ? canonicalRowLabels : canonicalColLabels

  const canonicalToDisplay = (wellId: WellId): { row: number; col: number } | null => {
    const parsed = parseGridWell(wellId)
    if (!parsed) return null
    const r = canonicalRowLabels.indexOf(parsed.row)
    const c = canonicalColLabels.indexOf(String(parsed.col))
    if (r < 0 || c < 0) return null
    if (isPortrait) return { row: c, col: r }
    return { row: r, col: c }
  }

  const displayToCanonical = (displayRow: number, displayCol: number): WellId | null => {
    if (isPortrait) {
      const r = displayCol
      const c = displayRow
      if (r < 0 || c < 0 || r >= canonicalRowLabels.length || c >= canonicalColLabels.length) return null
      return `${canonicalRowLabels[r]}${canonicalColLabels[c]}` as WellId
    }
    const r = displayRow
    const c = displayCol
    if (r < 0 || c < 0 || r >= canonicalRowLabels.length || c >= canonicalColLabels.length) return null
    return `${canonicalRowLabels[r]}${canonicalColLabels[c]}` as WellId
  }

  return {
    orientation: resolved,
    displayRows,
    displayCols,
    displayRowLabels,
    displayColLabels,
    canonicalRowLabels,
    canonicalColLabels,
    canonicalToDisplay,
    displayToCanonical,
  }
}
