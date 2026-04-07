import type { Labware } from '../../types/labware'
import type { WellId } from '../../types/plate'

export type LabwareOrientation = 'portrait' | 'landscape'

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
