/**
 * Address Groups - Named collections of wells for easier selection and labeling.
 * 
 * Supports:
 * - Standard groups (rows, columns, quadrants)
 * - Custom user-defined groups
 * - Custom well labels (e.g., "Control", "Treatment 1")
 */

import type { WellId } from './plate'
import type { Labware } from './labware'

// =============================================================================
// Types
// =============================================================================

/**
 * Address group type discriminator
 */
export type AddressGroupType = 
  | 'row'           // All wells in a row (e.g., "Row A")
  | 'column'        // All wells in a column (e.g., "Column 1")
  | 'quadrant'      // Quarter of the plate
  | 'half'          // Half of the plate (left/right or top/bottom)
  | 'custom'        // User-defined group
  | 'replicate'     // Replicate group (same condition)

/**
 * Standard group variants
 */
export type QuadrantPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type HalfPosition = 'left' | 'right' | 'top' | 'bottom'

/**
 * Address group definition
 */
export interface AddressGroup {
  /** Unique ID for this group */
  groupId: string
  /** Display name (e.g., "Row A", "Controls", "Treatment Group 1") */
  name: string
  /** Group type */
  type: AddressGroupType
  /** Wells in this group */
  wells: WellId[]
  /** Color for highlighting */
  color: string
  /** Optional description */
  description?: string
  /** For rows/columns, the index */
  index?: number
  /** For quadrants/halves, the position */
  position?: QuadrantPosition | HalfPosition
}

/**
 * Custom well label (per-well annotation)
 */
export interface WellLabel {
  wellId: WellId
  /** Short label displayed on well (max ~4 chars) */
  shortLabel?: string
  /** Full label for tooltip/details */
  fullLabel?: string
  /** Color override for this well */
  color?: string
  /** Semantic meaning (links to condition, sample, etc.) */
  semanticRef?: string
}

/**
 * Address annotation layer - groups + labels for a labware
 */
export interface AddressAnnotations {
  labwareId: string
  groups: AddressGroup[]
  labels: Map<WellId, WellLabel>
}

// =============================================================================
// Standard Colors
// =============================================================================

const ROW_COLORS = [
  '#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c',
  '#38d9a9', '#4dabf7', '#748ffc', '#da77f2',
]

const COLUMN_COLORS = [
  '#e64980', '#be4bdb', '#7950f2', '#4c6ef5',
  '#228be6', '#15aabf', '#12b886', '#40c057',
  '#82c91e', '#fab005', '#fd7e14', '#f03e3e',
]

const QUADRANT_COLORS: Record<QuadrantPosition, string> = {
  'top-left': '#748ffc',
  'top-right': '#69db7c',
  'bottom-left': '#ffa94d',
  'bottom-right': '#da77f2',
}

const HALF_COLORS: Record<HalfPosition, string> = {
  'left': '#4dabf7',
  'right': '#69db7c',
  'top': '#ffd43b',
  'bottom': '#da77f2',
}

// =============================================================================
// Generator Functions
// =============================================================================

/**
 * Generate a unique group ID
 */
export function generateGroupId(): string {
  return `grp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
}

/**
 * Generate row groups for a labware
 */
export function generateRowGroups(labware: Labware): AddressGroup[] {
  const { addressing } = labware
  if (addressing.type !== 'grid') return []

  const rowLabels = addressing.rowLabels || []
  const colLabels = addressing.columnLabels || []

  return rowLabels.map((rowLabel, idx) => ({
    groupId: generateGroupId(),
    name: `Row ${rowLabel}`,
    type: 'row' as const,
    wells: colLabels.map(col => `${rowLabel}${col}`),
    color: ROW_COLORS[idx % ROW_COLORS.length],
    index: idx,
  }))
}

/**
 * Generate column groups for a labware
 */
export function generateColumnGroups(labware: Labware): AddressGroup[] {
  const { addressing } = labware
  if (addressing.type !== 'grid') return []

  const rowLabels = addressing.rowLabels || []
  const colLabels = addressing.columnLabels || []

  return colLabels.map((colLabel, idx) => ({
    groupId: generateGroupId(),
    name: `Col ${colLabel}`,
    type: 'column' as const,
    wells: rowLabels.map(row => `${row}${colLabel}`),
    color: COLUMN_COLORS[idx % COLUMN_COLORS.length],
    index: idx,
  }))
}

/**
 * Generate quadrant groups for a labware
 */
export function generateQuadrantGroups(labware: Labware): AddressGroup[] {
  const { addressing } = labware
  if (addressing.type !== 'grid') return []

  const rows = addressing.rows || 0
  const cols = addressing.columns || 0
  const rowLabels = addressing.rowLabels || []
  const colLabels = addressing.columnLabels || []

  const midRow = Math.floor(rows / 2)
  const midCol = Math.floor(cols / 2)

  const positions: QuadrantPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
  
  return positions.map(position => {
    const wells: WellId[] = []
    
    const rowStart = position.includes('top') ? 0 : midRow
    const rowEnd = position.includes('top') ? midRow : rows
    const colStart = position.includes('left') ? 0 : midCol
    const colEnd = position.includes('left') ? midCol : cols

    for (let r = rowStart; r < rowEnd; r++) {
      for (let c = colStart; c < colEnd; c++) {
        wells.push(`${rowLabels[r]}${colLabels[c]}`)
      }
    }

    return {
      groupId: generateGroupId(),
      name: position.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      type: 'quadrant' as const,
      wells,
      color: QUADRANT_COLORS[position],
      position,
    }
  })
}

/**
 * Generate half groups for a labware
 */
export function generateHalfGroups(labware: Labware): AddressGroup[] {
  const { addressing } = labware
  if (addressing.type !== 'grid') return []

  const rows = addressing.rows || 0
  const cols = addressing.columns || 0
  const rowLabels = addressing.rowLabels || []
  const colLabels = addressing.columnLabels || []

  const midRow = Math.floor(rows / 2)
  const midCol = Math.floor(cols / 2)

  const positions: HalfPosition[] = ['left', 'right', 'top', 'bottom']
  
  return positions.map(position => {
    const wells: WellId[] = []
    
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let include = false
        switch (position) {
          case 'left': include = c < midCol; break
          case 'right': include = c >= midCol; break
          case 'top': include = r < midRow; break
          case 'bottom': include = r >= midRow; break
        }
        if (include) {
          wells.push(`${rowLabels[r]}${colLabels[c]}`)
        }
      }
    }

    return {
      groupId: generateGroupId(),
      name: position.charAt(0).toUpperCase() + position.slice(1) + ' Half',
      type: 'half' as const,
      wells,
      color: HALF_COLORS[position],
      position,
    }
  })
}

/**
 * Generate all standard groups for a labware
 */
export function generateAllStandardGroups(labware: Labware): {
  rows: AddressGroup[]
  columns: AddressGroup[]
  quadrants: AddressGroup[]
  halves: AddressGroup[]
} {
  return {
    rows: generateRowGroups(labware),
    columns: generateColumnGroups(labware),
    quadrants: generateQuadrantGroups(labware),
    halves: generateHalfGroups(labware),
  }
}

/**
 * Create a custom group
 */
export function createCustomGroup(
  name: string, 
  wells: WellId[], 
  color?: string,
  description?: string
): AddressGroup {
  return {
    groupId: generateGroupId(),
    name,
    type: 'custom',
    wells,
    color: color || '#868e96',
    description,
  }
}

/**
 * Create a replicate group
 */
export function createReplicateGroup(
  name: string,
  wells: WellId[],
  color?: string
): AddressGroup {
  return {
    groupId: generateGroupId(),
    name,
    type: 'replicate',
    wells,
    color: color || '#20c997',
    description: `Replicate wells: ${wells.join(', ')}`,
  }
}

// =============================================================================
// Label Functions
// =============================================================================

/**
 * Create a well label
 */
export function createWellLabel(
  wellId: WellId,
  shortLabel?: string,
  fullLabel?: string,
  color?: string
): WellLabel {
  return {
    wellId,
    shortLabel,
    fullLabel,
    color,
  }
}

/**
 * Generate sequential labels for wells (e.g., "1", "2", "3" or "A", "B", "C")
 */
export function generateSequentialLabels(
  wells: WellId[],
  prefix?: string,
  startIndex: number = 1
): WellLabel[] {
  return wells.map((wellId, i) => ({
    wellId,
    shortLabel: `${prefix || ''}${startIndex + i}`,
    fullLabel: `${prefix || 'Sample '}${startIndex + i}`,
  }))
}

/**
 * Common label presets
 */
export const LABEL_PRESETS = {
  controls: {
    positive: { shortLabel: '+', fullLabel: 'Positive Control', color: '#40c057' },
    negative: { shortLabel: '-', fullLabel: 'Negative Control', color: '#fa5252' },
    blank: { shortLabel: 'B', fullLabel: 'Blank', color: '#868e96' },
    vehicle: { shortLabel: 'V', fullLabel: 'Vehicle Control', color: '#fab005' },
  },
  samples: {
    unknown: { shortLabel: '?', fullLabel: 'Unknown Sample', color: '#339af0' },
    standard: { shortLabel: 'S', fullLabel: 'Standard', color: '#7950f2' },
    qc: { shortLabel: 'QC', fullLabel: 'Quality Control', color: '#15aabf' },
  },
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Find which groups contain a well
 */
export function findGroupsForWell(well: WellId, groups: AddressGroup[]): AddressGroup[] {
  return groups.filter(g => g.wells.includes(well))
}

/**
 * Check if two groups overlap
 */
export function groupsOverlap(a: AddressGroup, b: AddressGroup): boolean {
  return a.wells.some(w => b.wells.includes(w))
}

/**
 * Merge groups (union of wells)
 */
export function mergeGroups(groups: AddressGroup[], name: string, color?: string): AddressGroup {
  const allWells = [...new Set(groups.flatMap(g => g.wells))]
  return createCustomGroup(name, allWells, color || groups[0]?.color)
}

/**
 * Get wells at intersection of groups
 */
export function intersectGroups(groups: AddressGroup[]): WellId[] {
  if (groups.length === 0) return []
  
  let result = new Set(groups[0].wells)
  for (let i = 1; i < groups.length; i++) {
    const groupWells = new Set(groups[i].wells)
    result = new Set([...result].filter(w => groupWells.has(w)))
  }
  return [...result]
}
