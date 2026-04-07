/**
 * Macro Expander Types
 * 
 * Macro events expand into sequences of primitive events.
 * Expanders are deterministic functions that take macro params
 * and produce primitive events.
 */

import type { MacroEvent, PrimitiveEvent, Subjects } from '../../types/event'

// =============================================================================
// Expander Interface
// =============================================================================

/**
 * Context provided to expanders
 */
export interface ExpansionContext {
  /** Containers in the workspace */
  containers: Map<string, ContainerInfo>
  /** Currently selected tool */
  tool?: ToolInfo
  /** View transforms (for orientation-aware operations) */
  viewTransforms?: Map<string, ViewTransform>
}

/**
 * Container info needed by expanders
 */
export interface ContainerInfo {
  containerId: string
  rows: number
  columns: number
  rowLabels: string[]
  columnLabels: string[]
}

/**
 * Tool info needed by expanders
 */
export interface ToolInfo {
  toolId: string
  toolType: string
  channelCount?: number
}

/**
 * View transform state
 */
export interface ViewTransform {
  rotation: 0 | 90 | 180 | 270
}

/**
 * MacroExpander interface - all expanders must implement this
 */
export interface MacroExpander {
  /** Verb this expander handles */
  verb: string
  
  /** Expand a macro event into primitive events */
  expand(event: MacroEvent, context: ExpansionContext): PrimitiveEvent[]
  
  /** Validate macro params before expansion */
  validate?(event: MacroEvent, context: ExpansionContext): ExpansionValidation
  
  /** Get preview info without full expansion */
  preview?(event: MacroEvent, context: ExpansionContext): ExpansionPreview
}

// =============================================================================
// Expansion Results
// =============================================================================

/**
 * Validation result for macro params
 */
export interface ExpansionValidation {
  valid: boolean
  errors: ExpansionError[]
  warnings: ExpansionWarning[]
}

/**
 * Expansion error
 */
export interface ExpansionError {
  field?: string
  message: string
}

/**
 * Expansion warning
 */
export interface ExpansionWarning {
  field?: string
  message: string
  addresses?: string[]
}

/**
 * Preview info for UI (without full expansion)
 */
export interface ExpansionPreview {
  /** Path of addresses involved */
  path: string[]
  /** Direction if applicable */
  direction?: 'right' | 'left' | 'down' | 'up'
  /** Number of operations */
  operationCount: number
  /** Operation types */
  operationTypes: string[]
  /** Warnings */
  warnings: ExpansionWarning[]
  /** Summary text */
  summary: string
}

// =============================================================================
// Path Specification Types
// =============================================================================

/**
 * Path specification for serial operations
 */
export interface PathSpec {
  containerId: string
  /** Direction of operation */
  direction: 'right' | 'left' | 'down' | 'up'
  /** Starting address */
  startAddress: string
  /** Number of steps */
  stepCount: number
  /** OR explicit addresses */
  addresses?: string[]
}

/**
 * Resolve a path spec to ordered addresses
 */
export function resolvePathSpec(
  pathSpec: PathSpec,
  container: ContainerInfo
): string[] {
  // If explicit addresses provided, use them
  if (pathSpec.addresses && pathSpec.addresses.length > 0) {
    return pathSpec.addresses
  }

  const { direction, startAddress, stepCount } = pathSpec
  const { rowLabels, columnLabels, rows, columns } = container

  // Parse start address (e.g., "A1" -> row=0, col=0)
  const startRow = rowLabels.indexOf(startAddress.charAt(0))
  const startCol = columnLabels.indexOf(startAddress.slice(1))

  if (startRow < 0 || startCol < 0) {
    return []
  }

  const addresses: string[] = []

  for (let i = 0; i < stepCount; i++) {
    let row = startRow
    let col = startCol

    switch (direction) {
      case 'right':
        col = startCol + i
        break
      case 'left':
        col = startCol - i
        break
      case 'down':
        row = startRow + i
        break
      case 'up':
        row = startRow - i
        break
    }

    // Bounds check
    if (row < 0 || row >= rows || col < 0 || col >= columns) {
      break
    }

    addresses.push(`${rowLabels[row]}${columnLabels[col]}`)
  }

  return addresses
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a primitive event as part of expansion
 */
export function createExpandedPrimitive(
  parentEvent: MacroEvent,
  verb: string,
  subjects: Subjects,
  parameters: Record<string, unknown>,
  index: number,
  destSubjects?: Subjects
): PrimitiveEvent {
  return {
    eventId: `${parentEvent.eventId}-${verb}-${index}`,
    verb,
    vocabPackId: parentEvent.vocabPackId,
    eventKind: 'primitive',
    subjects,
    destSubjects,
    parameters,
    toolRef: parentEvent.toolRef,
    provenance: {
      ...parentEvent.provenance,
      parentEventId: parentEvent.eventId,
    },
  }
}

/**
 * Parse address to row/column indices
 */
export function parseAddress(
  address: string,
  container: ContainerInfo
): { row: number; col: number } | null {
  // Simple A1 format
  const match = address.match(/^([A-Z]+)(\d+)$/)
  if (!match) return null

  const rowLabel = match[1]
  const colLabel = match[2]

  const row = container.rowLabels.indexOf(rowLabel)
  const col = container.columnLabels.indexOf(colLabel)

  if (row < 0 || col < 0) return null

  return { row, col }
}

/**
 * Create address from row/column indices
 */
export function createAddress(
  row: number,
  col: number,
  container: ContainerInfo
): string | null {
  if (row < 0 || row >= container.rows || col < 0 || col >= container.columns) {
    return null
  }
  return `${container.rowLabels[row]}${container.columnLabels[col]}`
}
