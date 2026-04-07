/**
 * Built-in Selection Strategies
 * 
 * Strategies for common tool+container combinations.
 */

import type {
  Address,
  Selection,
  ContainerGeometry,
  Operation,
  SelectionStrategy,
  SelectionOptions,
  ValidationResult,
} from './types'
import {
  flatSelection,
  getAddresses,
  validResult,
  invalidResult,
  errorMessage,
  warningMessage,
  infoMessage,
} from './types'

// =============================================================================
// Address Parsing Utilities
// =============================================================================

/**
 * Parse column number from alphanumeric address (e.g., "A3" → 3, "B12" → 12)
 */
export function parseColumn(address: Address): number {
  const match = address.match(/^[A-Za-z]+(\d+)$/)
  return match ? parseInt(match[1], 10) : 0
}

/**
 * Parse row letter from alphanumeric address (e.g., "A3" → "A", "B12" → "B")
 */
export function parseRow(address: Address): string {
  const match = address.match(/^([A-Za-z]+)\d+$/)
  return match ? match[1].toUpperCase() : ''
}

/**
 * Build address from row and column (e.g., ("A", 3) → "A3")
 */
export function buildAddress(row: string, col: number): Address {
  return `${row}${col}`
}

/**
 * Check if addresses are in same column
 */
export function areSameColumn(addresses: Address[]): boolean {
  if (addresses.length === 0) return true
  const col = parseColumn(addresses[0])
  return addresses.every(a => parseColumn(a) === col)
}

/**
 * Check if addresses are contiguous rows (e.g., A1, B1, C1)
 */
export function areContiguousRows(
  addresses: Address[],
  rowLabels: string[]
): boolean {
  if (addresses.length === 0) return true
  // Check all are in same column first
  if (!areSameColumn(addresses)) return false

  const rows = addresses.map(a => parseRow(a))
  const indices = rows.map(r => rowLabels.indexOf(r)).sort((a, b) => a - b)

  for (let i = 1; i < indices.length; i++) {
    if (indices[i] !== indices[i - 1] + 1) return false
  }
  return true
}

// =============================================================================
// Column8Strategy (8-channel on 96-well)
// =============================================================================

/**
 * 8-channel pipette on 96-well plate: selects full column (A-H)
 */
export const Column8Strategy: SelectionStrategy = {
  strategyId: 'column_8_96well',
  displayName: 'Full Column (8 wells)',

  expand(
    click: Address,
    geometry: ContainerGeometry,
    _operation: Operation,
    _context: 'source' | 'target',
    options?: SelectionOptions
  ): Selection {
    const col = parseColumn(click)
    const rowLabels = geometry.rowLabels ?? ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    const activeChannels = options?.activeChannels ?? 8

    // Take first N rows based on active channels (from top of plate)
    const rows = rowLabels.slice(0, activeChannels)
    const addresses = rows.map(row => buildAddress(row, col))

    return flatSelection(addresses)
  },

  validate(
    selection: Selection,
    geometry: ContainerGeometry,
    _operation: Operation
  ): ValidationResult {
    const addresses = getAddresses(selection)
    const rowLabels = geometry.rowLabels ?? ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

    // Check single column
    if (!areSameColumn(addresses)) {
      return invalidResult([
        errorMessage(
          'MULTI_COLUMN',
          'Must select wells from a single column',
          addresses,
          'Click a single column to select all 8 wells'
        ),
      ])
    }

    // Check channel count (1-8)
    if (addresses.length < 1 || addresses.length > 8) {
      return invalidResult([
        errorMessage(
          'CHANNEL_COUNT',
          `Must select 1-8 wells (got ${addresses.length})`,
          addresses,
          'Select between 1 and 8 wells in a single column'
        ),
      ])
    }

    // Check contiguous (optional warning)
    if (!areContiguousRows(addresses, rowLabels)) {
      return {
        valid: true,
        errors: [],
        warnings: [
          warningMessage(
            'NOT_CONTIGUOUS',
            'Selected wells are not contiguous. This may require tip adjustment.',
            addresses
          ),
        ],
        info: [],
      }
    }

    // Valid: provide info about expansion
    if (addresses.length === 8) {
      return validResult([
        infoMessage('FULL_COLUMN', `Full column selected (8 wells)`, addresses),
      ])
    }

    return validResult([
      infoMessage(
        'PARTIAL_COLUMN',
        `${addresses.length} of 8 channels active`,
        addresses
      ),
    ])
  },
}

// =============================================================================
// AlternatingColumn8Strategy (8-channel on 384-well)
// =============================================================================

/**
 * 8-channel pipette on 384-well plate: selects alternating rows
 * (every other row to account for 9mm spacing vs 4.5mm wells)
 */
export const AlternatingColumn8Strategy: SelectionStrategy = {
  strategyId: 'alternating_8_384well',
  displayName: 'Alternating Rows (384-well)',

  expand(
    click: Address,
    geometry: ContainerGeometry,
    _operation: Operation,
    _context: 'source' | 'target',
    options?: SelectionOptions
  ): Selection {
    const col = parseColumn(click)
    const clickedRow = parseRow(click)
    const rowLabels = geometry.rowLabels ?? [
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
      'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P',
    ]
    const rowIdx = rowLabels.indexOf(clickedRow)
    const startOffset = rowIdx % 2 // 0 for even rows (A, C, E...), 1 for odd (B, D, F...)
    const activeChannels = options?.activeChannels ?? 8

    // Select every other row starting from clicked row's parity
    const selectedRows = rowLabels
      .filter((_, i) => i % 2 === startOffset)
      .slice(0, activeChannels)

    const addresses = selectedRows.map(row => buildAddress(row, col))
    return flatSelection(addresses)
  },

  validate(
    selection: Selection,
    geometry: ContainerGeometry,
    _operation: Operation
  ): ValidationResult {
    const addresses = getAddresses(selection)
    const rowLabels = geometry.rowLabels ?? [
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
      'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P',
    ]

    // Check single column
    if (!areSameColumn(addresses)) {
      return invalidResult([
        errorMessage(
          'MULTI_COLUMN',
          'Must select wells from a single column',
          addresses
        ),
      ])
    }

    // Check channel count
    if (addresses.length < 1 || addresses.length > 8) {
      return invalidResult([
        errorMessage(
          'CHANNEL_COUNT',
          `Must select 1-8 wells (got ${addresses.length})`,
          addresses
        ),
      ])
    }

    // Check alternating pattern
    const rows = addresses.map(a => parseRow(a))
    const indices = rows.map(r => rowLabels.indexOf(r)).sort((a, b) => a - b)

    const isAlternating = indices.every((idx, i) => {
      if (i === 0) return true
      return idx === indices[i - 1] + 2 // Every other row
    })

    if (!isAlternating) {
      return {
        valid: true,
        errors: [],
        warnings: [
          warningMessage(
            'NOT_ALTERNATING',
            'Selection does not follow alternating row pattern for 384-well plate',
            addresses,
            'For 8-channel on 384-well, select every other row (A, C, E, G, I, K, M, O)'
          ),
        ],
        info: [],
      }
    }

    return validResult([
      infoMessage(
        'ALTERNATING_PATTERN',
        `384-well alternating pattern: ${addresses.join(', ')}`,
        addresses
      ),
    ])
  },
}

// =============================================================================
// Row12Strategy (12-channel on 96-well)
// =============================================================================

/**
 * 12-channel pipette on 96-well: selects full row (1-12)
 */
export const Row12Strategy: SelectionStrategy = {
  strategyId: 'row_12_96well',
  displayName: 'Full Row (12 wells)',

  expand(
    click: Address,
    geometry: ContainerGeometry,
    _operation: Operation,
    _context: 'source' | 'target',
    options?: SelectionOptions
  ): Selection {
    const row = parseRow(click)
    const columnCount = geometry.columns ?? 12
    const activeChannels = options?.activeChannels ?? 12

    const addresses: Address[] = []
    for (let col = 1; col <= Math.min(columnCount, activeChannels); col++) {
      addresses.push(buildAddress(row, col))
    }

    return flatSelection(addresses)
  },

  validate(
    selection: Selection,
    _geometry: ContainerGeometry,
    _operation: Operation
  ): ValidationResult {
    const addresses = getAddresses(selection)

    // Check single row
    const rows = new Set(addresses.map(parseRow))
    if (rows.size !== 1) {
      return invalidResult([
        errorMessage(
          'MULTI_ROW',
          'Must select wells from a single row',
          addresses
        ),
      ])
    }

    // Check channel count
    if (addresses.length < 1 || addresses.length > 12) {
      return invalidResult([
        errorMessage(
          'CHANNEL_COUNT',
          `Must select 1-12 wells (got ${addresses.length})`,
          addresses
        ),
      ])
    }

    return validResult()
  },
}

// =============================================================================
// EntireContainerStrategy (plate washer, reader)
// =============================================================================

/**
 * Entire container strategy: selects all wells
 */
export const EntireContainerStrategy: SelectionStrategy = {
  strategyId: 'entire_container',
  displayName: 'Entire Container',

  expand(
    _click: Address,
    geometry: ContainerGeometry,
    _operation: Operation,
    _context: 'source' | 'target'
  ): Selection {
    const addresses: Address[] = []

    if (geometry.type === 'grid' && geometry.rowLabels && geometry.columns) {
      for (const row of geometry.rowLabels) {
        for (let col = 1; col <= geometry.columns; col++) {
          addresses.push(buildAddress(row, col))
        }
      }
    }

    return flatSelection(addresses)
  },

  validate(): ValidationResult {
    return validResult()
  },
}

// =============================================================================
// Hierarchical Group Strategy (cages, litters)
// =============================================================================

/**
 * Hierarchical group strategy: selects all items in the same group
 */
export const HierarchicalGroupStrategy: SelectionStrategy = {
  strategyId: 'hierarchical_group',
  displayName: 'Entire Group',

  expand(
    click: Address,
    geometry: ContainerGeometry,
    _operation: Operation,
    _context: 'source' | 'target'
  ): Selection {
    if (!geometry.hierarchy) {
      return flatSelection([click])
    }

    // Find parent group
    const parent = geometry.hierarchy.parentOf?.[click]
    if (!parent) {
      return flatSelection([click])
    }

    // Get all items in that group
    const groupMembers = geometry.hierarchy.groups[parent] ?? [click]
    return flatSelection(groupMembers)
  },

  validate(
    selection: Selection,
    geometry: ContainerGeometry,
    _operation: Operation
  ): ValidationResult {
    if (!geometry.hierarchy) {
      return validResult()
    }

    const addresses = getAddresses(selection)
    const parentOf = geometry.hierarchy.parentOf ?? {}

    // Check all items are in the same group
    const groups = new Set(addresses.map(a => parentOf[a]).filter(Boolean))

    if (groups.size > 1) {
      return invalidResult([
        errorMessage(
          'MULTI_GROUP',
          'Must select items from a single group',
          addresses,
          'Select all items from one cage/group only'
        ),
      ])
    }

    return validResult()
  },
}

// =============================================================================
// Single Item Strategy (individual weighing, sampling)
// =============================================================================

/**
 * Single item strategy: no expansion, just the clicked item
 */
export const SingleItemStrategy: SelectionStrategy = {
  strategyId: 'single_item',
  displayName: 'Single Item',

  expand(click: Address): Selection {
    return flatSelection([click])
  },

  validate(selection: Selection): ValidationResult {
    const addresses = getAddresses(selection)

    if (addresses.length !== 1) {
      return invalidResult([
        errorMessage(
          'MULTI_ITEM',
          'Must select exactly one item',
          addresses,
          'This operation requires selecting a single item'
        ),
      ])
    }

    return validResult()
  },
}

// =============================================================================
// Linear All Strategy (8-channel on reservoir)
// =============================================================================

/**
 * Select all wells in a linear container (reservoir)
 * For 8-channel pipette on 8-well reservoir: select all 8 channels
 */
export const LinearAllStrategy: SelectionStrategy = {
  strategyId: 'linear_all',
  displayName: 'All Channels (Reservoir)',

  expand(
    _click: Address,
    geometry: ContainerGeometry,
    _operation: Operation,
    _context: 'source' | 'target',
    options?: SelectionOptions
  ): Selection {
    // For linear containers, select all slots up to active channel count
    const linearLabels = geometry.linearLabels ?? []
    const activeChannels = options?.activeChannels ?? linearLabels.length

    // Take up to activeChannels slots
    const addresses = linearLabels.slice(0, Math.min(activeChannels, linearLabels.length))

    return flatSelection(addresses)
  },

  validate(
    selection: Selection,
    geometry: ContainerGeometry,
    _operation: Operation
  ): ValidationResult {
    const addresses = getAddresses(selection)
    const linearLabels = geometry.linearLabels ?? []

    // Check if all selected addresses are valid
    const invalid = addresses.filter(a => !linearLabels.includes(a))
    if (invalid.length > 0) {
      return invalidResult([
        errorMessage(
          'INVALID_ADDRESS',
          `Invalid well addresses: ${invalid.join(', ')}`,
          invalid
        ),
      ])
    }

    return validResult([
      infoMessage(
        'LINEAR_SELECTION',
        `${addresses.length} wells selected from reservoir`,
        addresses
      ),
    ])
  },
}
