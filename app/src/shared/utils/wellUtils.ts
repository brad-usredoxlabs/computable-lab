/**
 * Utility functions for well ID parsing and manipulation.
 */

import type { WellId, WellPosition, PlateConfig } from '../../types/plate'

/**
 * Parse a well ID (e.g., "A1", "B12") into row/column indices.
 */
export function parseWellId(wellId: WellId): WellPosition | null {
  const match = wellId.match(/^([A-P])(\d+)$/i)
  if (!match) return null

  const rowLetter = match[1].toUpperCase()
  const column = parseInt(match[2], 10) - 1 // 0-indexed

  const row = rowLetter.charCodeAt(0) - 'A'.charCodeAt(0)

  return { row, column }
}

/**
 * Create a well ID from row/column indices.
 */
export function createWellId(row: number, column: number): WellId {
  const rowLetter = String.fromCharCode('A'.charCodeAt(0) + row)
  return `${rowLetter}${column + 1}`
}

/**
 * Get all well IDs for a plate configuration.
 */
export function getAllWellIds(config: PlateConfig): WellId[] {
  const wells: WellId[] = []
  for (let row = 0; row < config.rows; row++) {
    for (let col = 0; col < config.columns; col++) {
      wells.push(createWellId(row, col))
    }
  }
  return wells
}

/**
 * Expand a rectangular selection from start to end well.
 * Used for shift-click range selection.
 */
export function expandWellRange(
  startWell: WellId,
  endWell: WellId,
  config: PlateConfig
): WellId[] {
  const start = parseWellId(startWell)
  const end = parseWellId(endWell)

  if (!start || !end) return []

  const minRow = Math.min(start.row, end.row)
  const maxRow = Math.max(start.row, end.row)
  const minCol = Math.min(start.column, end.column)
  const maxCol = Math.max(start.column, end.column)

  // Clamp to plate bounds
  const clampedMinRow = Math.max(0, minRow)
  const clampedMaxRow = Math.min(config.rows - 1, maxRow)
  const clampedMinCol = Math.max(0, minCol)
  const clampedMaxCol = Math.min(config.columns - 1, maxCol)

  const wells: WellId[] = []
  for (let row = clampedMinRow; row <= clampedMaxRow; row++) {
    for (let col = clampedMinCol; col <= clampedMaxCol; col++) {
      wells.push(createWellId(row, col))
    }
  }

  return wells
}

/**
 * Check if a well ID is valid for a given plate configuration.
 */
export function isValidWellId(wellId: WellId, config: PlateConfig): boolean {
  const pos = parseWellId(wellId)
  if (!pos) return false
  return pos.row >= 0 && pos.row < config.rows && pos.column >= 0 && pos.column < config.columns
}

/**
 * Sort well IDs in standard plate order (row-major, A1 → A12 → B1 → ...).
 */
export function sortWellIds(wellIds: WellId[]): WellId[] {
  return [...wellIds].sort((a, b) => {
    const posA = parseWellId(a)
    const posB = parseWellId(b)
    if (!posA || !posB) return 0

    if (posA.row !== posB.row) {
      return posA.row - posB.row
    }
    return posA.column - posB.column
  })
}

/**
 * Format a list of well IDs into a compact string representation.
 * E.g., ["A1", "A2", "A3"] → "A1-A3"
 */
export function formatWellList(wellIds: WellId[]): string {
  if (wellIds.length === 0) return ''
  if (wellIds.length === 1) return wellIds[0]

  const sorted = sortWellIds(wellIds)
  // Simple join for now - could implement range compression later
  return sorted.join(', ')
}

/**
 * Parse a well range string (e.g., "A1:B6") into individual well IDs.
 */
export function parseWellRange(
  rangeStr: string,
  config: PlateConfig
): WellId[] {
  // Handle single well
  if (!rangeStr.includes(':') && !rangeStr.includes('-')) {
    const wellId = rangeStr.trim().toUpperCase()
    if (isValidWellId(wellId, config)) {
      return [wellId]
    }
    return []
  }

  // Handle range (A1:B6 or A1-B6)
  const [startStr, endStr] = rangeStr.split(/[:\-]/).map(s => s.trim().toUpperCase())
  if (!startStr || !endStr) return []

  return expandWellRange(startStr, endStr, config)
}
