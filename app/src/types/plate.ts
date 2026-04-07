/**
 * Types for plate visualization and well selection.
 * These are UI-only types - the kernel schemas define the authoritative event model.
 */

/**
 * Well identifier (e.g., "A1", "B12", "P24")
 */
export type WellId = string

/**
 * Plate format specification
 */
export type PlateFormat = '96' | '384'

/**
 * Plate configuration based on format
 */
export interface PlateConfig {
  format: PlateFormat
  rows: number
  columns: number
  rowLabels: string[]
  columnLabels: string[]
}

/**
 * Visual state of a well (for rendering)
 */
export interface WellState {
  wellId: WellId
  hasContent: boolean
  isSelected: boolean
  isHighlighted: boolean
  contentColor?: string
}

/**
 * Well position in grid coordinates
 */
export interface WellPosition {
  row: number    // 0-indexed
  column: number // 0-indexed
}

/**
 * Selection context for managing well selection state
 */
export interface SelectionState {
  selectedWells: Set<WellId>
  highlightedWells: Set<WellId>
  lastClickedWell: WellId | null
}

/**
 * Selection actions
 */
export type SelectionAction =
  | { type: 'SELECT_WELL'; wellId: WellId; mode: 'single' | 'add' | 'range' }
  | { type: 'SELECT_WELLS'; wellIds: WellId[] }
  | { type: 'DESELECT_WELL'; wellId: WellId }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'HIGHLIGHT_WELLS'; wellIds: WellId[] }
  | { type: 'CLEAR_HIGHLIGHT' }

/**
 * Standard plate configurations
 */
export const PLATE_CONFIGS: Record<PlateFormat, PlateConfig> = {
  '96': {
    format: '96',
    rows: 8,
    columns: 12,
    rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    columnLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
  },
  '384': {
    format: '384',
    rows: 16,
    columns: 24,
    rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'],
    columnLabels: Array.from({ length: 24 }, (_, i) => String(i + 1)),
  },
}
