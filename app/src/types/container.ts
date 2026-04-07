/**
 * Container Types - Enhanced Labware Model
 * 
 * Extends the base labware concept with:
 * - Domain support (labware, animal, field, custom)
 * - Display labels separate from canonical addressing
 * - View state (rotation, orientation)
 * - Address groups (for cage→mice, triplicate wells, etc.)
 * - Container templates for quick creation
 */

import type { AddressingScheme, LabwareGeometry, LabwareType } from './labware'

// =============================================================================
// Container Domain
// =============================================================================

/**
 * Container domain - what kind of container this is
 */
export type ContainerDomain = 'labware' | 'animal' | 'field' | 'custom'

/**
 * Domain display info
 */
export const CONTAINER_DOMAIN_LABELS: Record<ContainerDomain, string> = {
  labware: 'Labware',
  animal: 'Animal',
  field: 'Field',
  custom: 'Custom',
}

// =============================================================================
// Display Labels
// =============================================================================

/**
 * Custom display labels separate from canonical addressing
 */
export interface DisplayLabels {
  /** Custom row labels (e.g., ["Cage 1", "Cage 2", "Cage 3"]) */
  rows?: string[]
  /** Custom column labels */
  columns?: string[]
  /** Custom linear labels */
  linear?: string[]
}

// =============================================================================
// View State (UI Only)
// =============================================================================

/**
 * View state for UI rendering (not persisted to events)
 */
export interface ContainerViewState {
  /** Rotation angle for display */
  rotation: 0 | 90 | 180 | 270
  /** Whether to show row/column headers */
  showHeaders: boolean
  /** Whether to use display labels vs canonical */
  useDisplayLabels: boolean
  /** Zoom level */
  zoom: number
}

/**
 * Default view state
 */
export const DEFAULT_VIEW_STATE: ContainerViewState = {
  rotation: 0,
  showHeaders: true,
  useDisplayLabels: false,
  zoom: 1,
}

// =============================================================================
// Address Groups
// =============================================================================

/**
 * Address group - a named collection of addresses
 */
export interface AddressGroup {
  /** Unique identifier for this group */
  groupId: string
  /** Display name (e.g., "Cage A1", "Triplicate Set 1") */
  displayName: string
  /** Addresses in this group */
  addresses: string[]
  /** Group color (optional) */
  color?: string
  /** Group metadata */
  metadata?: Record<string, unknown>
}

// =============================================================================
// Container (Enhanced Labware)
// =============================================================================

/**
 * Container - enhanced labware with domain support and view features
 */
export interface Container {
  /** Unique identifier */
  containerId: string
  
  /** Reference to template (or undefined for custom) */
  templateId?: string
  
  /** User-editable name */
  name: string
  
  /** Domain this container belongs to */
  domain: ContainerDomain
  
  /** Canonical addressing scheme */
  addressing: AddressingScheme
  
  /** Custom display labels (separate from canonical) */
  displayLabels?: DisplayLabels
  
  /** Physical geometry (optional for non-labware) */
  geometry?: LabwareGeometry
  
  /** Address groups (optional) */
  groups?: AddressGroup[]
  
  /** View state (UI only, not persisted to events) */
  viewState?: ContainerViewState
  
  /** Optional color for visualization */
  color?: string
  
  /** Optional notes */
  notes?: string
  
  /** Legacy labware type (for backwards compatibility) */
  labwareType?: LabwareType
}

// =============================================================================
// Container Templates
// =============================================================================

/**
 * Container template for quick creation
 */
export interface ContainerTemplate {
  /** Template identifier */
  templateId: string
  /** Display name */
  displayName: string
  /** Icon */
  icon: string
  /** Domain */
  domain: ContainerDomain
  /** Default addressing */
  addressing: AddressingScheme
  /** Default geometry */
  geometry?: LabwareGeometry
  /** Default vocab pack */
  defaultVocabPack: string
  /** Render style */
  renderStyle: 'wells' | 'cages' | 'plots' | 'generic'
  /** Default color */
  color?: string
}

// =============================================================================
// Built-in Templates
// =============================================================================

export const CONTAINER_TEMPLATES: ContainerTemplate[] = [
  // Labware - Plates
  {
    templateId: 'plate_96',
    displayName: '96-Well Plate',
    icon: '🔬',
    domain: 'labware',
    addressing: {
      type: 'grid',
      rows: 8,
      columns: 12,
      rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      columnLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    },
    geometry: { maxVolume_uL: 300, minVolume_uL: 10, wellShape: 'round' },
    defaultVocabPack: 'liquid-handling/v1',
    renderStyle: 'wells',
    color: '#339af0',
  },
  {
    templateId: 'plate_384',
    displayName: '384-Well Plate',
    icon: '🔬',
    domain: 'labware',
    addressing: {
      type: 'grid',
      rows: 16,
      columns: 24,
      rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'],
      columnLabels: Array.from({ length: 24 }, (_, i) => String(i + 1)),
    },
    geometry: { maxVolume_uL: 120, minVolume_uL: 5, wellShape: 'square' },
    defaultVocabPack: 'liquid-handling/v1',
    renderStyle: 'wells',
    color: '#7950f2',
  },
  {
    templateId: 'deepwell_96',
    displayName: '96-Well Deep Well',
    icon: '🔬',
    domain: 'labware',
    addressing: {
      type: 'grid',
      rows: 8,
      columns: 12,
      rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      columnLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    },
    geometry: { maxVolume_uL: 2000, minVolume_uL: 100, wellShape: 'square' },
    defaultVocabPack: 'liquid-handling/v1',
    renderStyle: 'wells',
    color: '#845ef7',
  },
  
  // Labware - Reservoirs
  {
    templateId: 'reservoir_12',
    displayName: '12-Channel Reservoir',
    icon: '📦',
    domain: 'labware',
    addressing: {
      type: 'linear',
      linearLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    },
    geometry: { maxVolume_uL: 20000, minVolume_uL: 1000, wellShape: 'v-bottom' },
    defaultVocabPack: 'liquid-handling/v1',
    renderStyle: 'wells',
    color: '#20c997',
  },
  {
    templateId: 'reservoir_1',
    displayName: 'Single Reservoir',
    icon: '🧴',
    domain: 'labware',
    addressing: {
      type: 'single',
    },
    geometry: { maxVolume_uL: 300000, minVolume_uL: 5000, wellShape: 'square' },
    defaultVocabPack: 'liquid-handling/v1',
    renderStyle: 'generic',
    color: '#099268',
  },
  
  // Labware - Tubes
  {
    templateId: 'tubeset_24',
    displayName: '24-Tube Rack',
    icon: '🧪',
    domain: 'labware',
    addressing: {
      type: 'grid',
      rows: 4,
      columns: 6,
      rowLabels: ['A', 'B', 'C', 'D'],
      columnLabels: ['1', '2', '3', '4', '5', '6'],
    },
    geometry: { maxVolume_uL: 1500, minVolume_uL: 50, wellShape: 'round' },
    defaultVocabPack: 'liquid-handling/v1',
    renderStyle: 'wells',
    color: '#fd7e14',
  },
  
  // Animal - Cage Racks
  {
    templateId: 'mouse_cage_rack_3x3',
    displayName: 'Mouse Cage Rack (3×3)',
    icon: '🐁',
    domain: 'animal',
    addressing: {
      type: 'grid',
      rows: 3,
      columns: 3,
      rowLabels: ['A', 'B', 'C'],
      columnLabels: ['1', '2', '3'],
    },
    defaultVocabPack: 'animal-handling/v1',
    renderStyle: 'cages',
    color: '#fab005',
  },
  {
    templateId: 'mouse_cage_rack_4x6',
    displayName: 'Mouse Cage Rack (4×6)',
    icon: '🐁',
    domain: 'animal',
    addressing: {
      type: 'grid',
      rows: 4,
      columns: 6,
      rowLabels: ['A', 'B', 'C', 'D'],
      columnLabels: ['1', '2', '3', '4', '5', '6'],
    },
    defaultVocabPack: 'animal-handling/v1',
    renderStyle: 'cages',
    color: '#f59f00',
  },
  
  // Custom
  {
    templateId: 'custom_grid',
    displayName: 'Custom Grid',
    icon: '⬜',
    domain: 'custom',
    addressing: {
      type: 'grid',
      rows: 8,
      columns: 12,
      rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      columnLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    },
    defaultVocabPack: 'liquid-handling/v1',
    renderStyle: 'generic',
    color: '#868e96',
  },
]

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Generate a unique container ID
 */
export function generateContainerId(): string {
  return `cnt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}

/**
 * Create a container from a template
 */
export function createContainerFromTemplate(
  templateId: string,
  name?: string
): Container | null {
  const template = CONTAINER_TEMPLATES.find(t => t.templateId === templateId)
  if (!template) return null

  return {
    containerId: generateContainerId(),
    templateId: template.templateId,
    name: name || template.displayName,
    domain: template.domain,
    addressing: { ...template.addressing },
    geometry: template.geometry ? { ...template.geometry } : undefined,
    viewState: { ...DEFAULT_VIEW_STATE },
    color: template.color,
  }
}

/**
 * Get a template by ID
 */
export function getContainerTemplate(templateId: string): ContainerTemplate | undefined {
  return CONTAINER_TEMPLATES.find(t => t.templateId === templateId)
}

/**
 * Get templates by domain
 */
export function getTemplatesByDomain(domain: ContainerDomain): ContainerTemplate[] {
  return CONTAINER_TEMPLATES.filter(t => t.domain === domain)
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get all addresses in a container
 */
export function getContainerAddresses(container: Container): string[] {
  const { addressing } = container
  const addresses: string[] = []

  if (addressing.type === 'grid') {
    const rows = addressing.rowLabels || []
    const cols = addressing.columnLabels || []
    for (const row of rows) {
      for (const col of cols) {
        addresses.push(`${row}${col}`)
      }
    }
  } else if (addressing.type === 'linear') {
    addresses.push(...(addressing.linearLabels || []))
  } else if (addressing.type === 'single') {
    addresses.push('1')
  }

  return addresses
}

/**
 * Get display label for an address
 */
export function getAddressDisplayLabel(
  container: Container,
  address: string
): string {
  if (!container.displayLabels || !container.viewState?.useDisplayLabels) {
    return address
  }

  // For grid addressing, parse and lookup display labels
  if (container.addressing.type === 'grid') {
    const match = address.match(/^([A-Z]+)(\d+)$/)
    if (match) {
      const canonicalRow = match[1]
      const canonicalCol = match[2]
      
      const rowIdx = container.addressing.rowLabels?.indexOf(canonicalRow) ?? -1
      const colIdx = container.addressing.columnLabels?.indexOf(canonicalCol) ?? -1
      
      if (rowIdx >= 0 && colIdx >= 0) {
        const displayRow = container.displayLabels.rows?.[rowIdx] ?? canonicalRow
        const displayCol = container.displayLabels.columns?.[colIdx] ?? canonicalCol
        return `${displayRow}${displayCol}`
      }
    }
  }

  return address
}

/**
 * Get addresses in a group
 */
export function getGroupAddresses(container: Container, groupId: string): string[] {
  const group = container.groups?.find(g => g.groupId === groupId)
  return group?.addresses ?? []
}

/**
 * Find which group an address belongs to
 */
export function findAddressGroup(container: Container, address: string): AddressGroup | undefined {
  return container.groups?.find(g => g.addresses.includes(address))
}

/**
 * Apply rotation to visual coordinates
 */
export function applyViewTransform(
  row: number,
  col: number,
  totalRows: number,
  totalCols: number,
  rotation: 0 | 90 | 180 | 270
): { row: number; col: number } {
  switch (rotation) {
    case 90:
      return { row: col, col: totalRows - 1 - row }
    case 180:
      return { row: totalRows - 1 - row, col: totalCols - 1 - col }
    case 270:
      return { row: totalCols - 1 - col, col: row }
    default:
      return { row, col }
  }
}

/**
 * Get effective dimensions after rotation
 */
export function getRotatedDimensions(
  rows: number,
  cols: number,
  rotation: 0 | 90 | 180 | 270
): { rows: number; cols: number } {
  if (rotation === 90 || rotation === 270) {
    return { rows: cols, cols: rows }
  }
  return { rows, cols }
}
