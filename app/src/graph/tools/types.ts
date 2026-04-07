/**
 * Tool Types
 * 
 * Tools are applicators that emit events with constraints.
 * They guide well selection and validate operations.
 */

import type { OntologyTerm } from '../../shared/vocab/types'

// =============================================================================
// Tool Type Definition
// =============================================================================

/**
 * Tool type definition - describes a category of tools
 */
export interface ToolType {
  /** Tool type identifier */
  toolTypeId: string              // "pipette_8ch_fixed"
  /** Display name */
  displayName: string             // "8-Channel Fixed Spacing Pipette"
  /** Icon (emoji or identifier) */
  icon: string
  
  /** Capabilities: which verbs this tool can emit */
  capabilities: string[]          // ["aspirate", "dispense", "mix", "transfer"]
  
  /** Selection constraints */
  selectionConstraints: SelectionConstraint[]
  
  /** Number of channels (for multi-channel tools) */
  channelCount?: number           // 8 for 8-channel pipette
  
  /** How this tool groups selections */
  groupingMode?: 'channel' | 'cage' | 'none'
  
  /** Volume range (for pipettes) */
  volumeRange?: {
    min_uL: number
    max_uL: number
  }
  
  /** Ontology term for semantic export */
  ontologyTerm?: OntologyTerm
}

/**
 * Tool instance - a specific tool in the workspace
 */
export interface ToolInstance {
  /** Instance ID */
  toolId: string                  // "pipette-8ch-1"
  /** Reference to tool type */
  toolTypeId: string              // "pipette_8ch_fixed"
  /** User's name for this tool */
  displayName: string             // "My 8-Channel Pipette"
  
  /** Instance-specific configuration */
  config?: Record<string, unknown>
  
  /** Notes */
  notes?: string
}

// =============================================================================
// Selection Constraints
// =============================================================================

/**
 * Selection constraint union type
 */
export type SelectionConstraint =
  | ChannelCountConstraint
  | PatternConstraint
  | MappingConstraint
  | GroupConstraint

/**
 * Channel count constraint - must select exactly N addresses
 */
export interface ChannelCountConstraint {
  type: 'channelCount'
  /** Number of addresses required */
  count: number                   // 8 for 8-channel pipette
  /** Mode: exact count or multiple of count */
  mode: 'exact' | 'multiple'      // 'exact' = must be 8, 'multiple' = 8, 16, 24...
}

/**
 * Pattern constraint - selection must match a valid pattern
 */
export interface PatternConstraint {
  type: 'pattern'
  /** Valid selection patterns */
  patterns: SelectionPattern[]
  /** Only applies to these labware types (optional) */
  labwareTypes?: string[]
}

/**
 * Selection pattern definition
 */
export interface SelectionPattern {
  /** Pattern name */
  name: string                    // "column_8", "row_12"
  /** Human-readable description */
  description: string
  /** Validator function (serialized reference or inline) */
  validatorRef?: string           // "validators/column8"
  /** Inline validator (for simple patterns) */
  validator?: (addresses: string[], geometry: AddressingInfo) => boolean
}

/**
 * Addressing info for pattern validation
 */
export interface AddressingInfo {
  type: 'grid' | 'linear' | 'single'
  rows?: number
  columns?: number
  rowLabels?: string[]
  columnLabels?: string[]
  linearLabels?: string[]
}

/**
 * Mapping constraint - source-to-target mapping rules
 */
export interface MappingConstraint {
  type: 'mapping'
  /** Mapping mode */
  mode: 'one-to-one' | 'one-to-many' | 'many-to-one'
  /** Source and target count must match */
  countMustMatch: boolean
}

/**
 * Group constraint - for cage/batch operations
 */
export interface GroupConstraint {
  type: 'group'
  /** What to group by */
  groupBy: 'container' | 'row' | 'column' | 'custom'
  /** Selecting one auto-selects all in group */
  selectEntireGroup: boolean
  /** How to emit events for the group */
  emitAs: 'single' | 'multiple'
  /** If multiple, link with actionGroupId */
  linkEvents?: boolean
}

// =============================================================================
// Validation Result
// =============================================================================

/**
 * Result of validating a selection against tool constraints
 */
export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
  suggestions?: SelectionSuggestion[]
}

/**
 * Validation error
 */
export interface ValidationError {
  type: 'channelCount' | 'pattern' | 'mapping' | 'group' | 'volume' | 'custom'
  message: string
  addresses?: string[]            // Affected addresses
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  type: string
  message: string
  addresses?: string[]
}

/**
 * Suggested selection (for auto-assist)
 */
export interface SelectionSuggestion {
  /** Description of suggestion */
  description: string
  /** Suggested addresses to select */
  addresses: string[]
  /** Confidence score (0-1) */
  confidence: number
}

// =============================================================================
// Built-in Tool Types
// =============================================================================

/**
 * Single-channel pipette
 */
export const pipette1ch: ToolType = {
  toolTypeId: 'pipette_1ch',
  displayName: 'Single-Channel Pipette',
  icon: '💉',
  capabilities: ['aspirate', 'dispense', 'mix', 'transfer', 'add_material'],
  selectionConstraints: [],
  channelCount: 1,
  groupingMode: 'none',
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000428',
    label: 'pipette',
    ontology: 'obi',
  },
}

/**
 * 8-channel fixed spacing pipette
 */
export const pipette8chFixed: ToolType = {
  toolTypeId: 'pipette_8ch_fixed',
  displayName: '8-Channel Fixed Pipette',
  icon: '🔬',
  capabilities: ['aspirate', 'dispense', 'mix', 'transfer'],
  channelCount: 8,
  groupingMode: 'channel',
  selectionConstraints: [
    {
      type: 'channelCount',
      count: 8,
      mode: 'exact',
    },
    {
      type: 'pattern',
      patterns: [
        {
          name: 'column_8',
          description: 'Full column (A-H)',
          validatorRef: 'validators/column8',
        },
      ],
    },
    {
      type: 'mapping',
      mode: 'one-to-one',
      countMustMatch: true,
    },
  ],
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000426',
    label: 'multichannel pipette',
    ontology: 'obi',
  },
}

/**
 * 4-channel fixed spacing pipette
 */
export const pipette4chFixed: ToolType = {
  toolTypeId: 'pipette_4ch_fixed',
  displayName: '4-Channel Fixed Pipette',
  icon: '🔬',
  capabilities: ['aspirate', 'dispense', 'mix', 'transfer'],
  channelCount: 4,
  groupingMode: 'channel',
  selectionConstraints: [
    { type: 'channelCount', count: 4, mode: 'exact' },
    { type: 'mapping', mode: 'one-to-one', countMustMatch: true },
  ],
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000426',
    label: 'multichannel pipette',
    ontology: 'obi',
  },
}

/**
 * 6-channel fixed spacing pipette
 */
export const pipette6chFixed: ToolType = {
  toolTypeId: 'pipette_6ch_fixed',
  displayName: '6-Channel Fixed Pipette',
  icon: '🔬',
  capabilities: ['aspirate', 'dispense', 'mix', 'transfer'],
  channelCount: 6,
  groupingMode: 'channel',
  selectionConstraints: [
    { type: 'channelCount', count: 6, mode: 'exact' },
    { type: 'mapping', mode: 'one-to-one', countMustMatch: true },
  ],
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000426',
    label: 'multichannel pipette',
    ontology: 'obi',
  },
}

/**
 * 12-channel pipette (for 384-well plates)
 */
export const pipette12ch: ToolType = {
  toolTypeId: 'pipette_12ch',
  displayName: '12-Channel Pipette',
  icon: '🔬',
  capabilities: ['aspirate', 'dispense', 'mix', 'transfer'],
  channelCount: 12,
  groupingMode: 'channel',
  selectionConstraints: [
    {
      type: 'channelCount',
      count: 12,
      mode: 'exact',
    },
    {
      type: 'pattern',
      patterns: [
        {
          name: 'row_12',
          description: 'Full row (1-12)',
          validatorRef: 'validators/row12',
        },
      ],
    },
    {
      type: 'mapping',
      mode: 'one-to-one',
      countMustMatch: true,
    },
  ],
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000426',
    label: 'multichannel pipette',
    ontology: 'obi',
  },
}

/**
 * 4-channel adjustable spacing pipette (e.g., VOYAGER-style)
 */
export const pipette4chAdjustable: ToolType = {
  toolTypeId: 'pipette_4ch_adjustable',
  displayName: '4-Channel Adjustable Pipette',
  icon: '🧬',
  capabilities: ['aspirate', 'dispense', 'mix', 'transfer'],
  channelCount: 4,
  groupingMode: 'channel',
  selectionConstraints: [
    { type: 'channelCount', count: 4, mode: 'exact' },
    { type: 'mapping', mode: 'one-to-one', countMustMatch: true },
  ],
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000426',
    label: 'multichannel pipette',
    ontology: 'obi',
  },
}

/**
 * 6-channel adjustable spacing pipette (e.g., VOYAGER-style)
 */
export const pipette6chAdjustable: ToolType = {
  toolTypeId: 'pipette_6ch_adjustable',
  displayName: '6-Channel Adjustable Pipette',
  icon: '🧬',
  capabilities: ['aspirate', 'dispense', 'mix', 'transfer'],
  channelCount: 6,
  groupingMode: 'channel',
  selectionConstraints: [
    { type: 'channelCount', count: 6, mode: 'exact' },
    { type: 'mapping', mode: 'one-to-one', countMustMatch: true },
  ],
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000426',
    label: 'multichannel pipette',
    ontology: 'obi',
  },
}

/**
 * 8-channel adjustable spacing pipette (e.g., VOYAGER-style)
 */
export const pipette8chAdjustable: ToolType = {
  toolTypeId: 'pipette_8ch_adjustable',
  displayName: '8-Channel Adjustable Pipette',
  icon: '🧬',
  capabilities: ['aspirate', 'dispense', 'mix', 'transfer'],
  channelCount: 8,
  groupingMode: 'channel',
  selectionConstraints: [
    { type: 'channelCount', count: 8, mode: 'exact' },
    { type: 'mapping', mode: 'one-to-one', countMustMatch: true },
  ],
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000426',
    label: 'multichannel pipette',
    ontology: 'obi',
  },
}

/**
 * 12-channel adjustable spacing pipette (e.g., VOYAGER-style)
 */
export const pipette12chAdjustable: ToolType = {
  toolTypeId: 'pipette_12ch_adjustable',
  displayName: '12-Channel Adjustable Pipette',
  icon: '🧬',
  capabilities: ['aspirate', 'dispense', 'mix', 'transfer'],
  channelCount: 12,
  groupingMode: 'channel',
  selectionConstraints: [
    { type: 'channelCount', count: 12, mode: 'exact' },
    { type: 'mapping', mode: 'one-to-one', countMustMatch: true },
  ],
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000426',
    label: 'multichannel pipette',
    ontology: 'obi',
  },
}

/**
 * 96-channel pipette head (for full-plate operations)
 */
export const pipette96ch: ToolType = {
  toolTypeId: 'pipette_96ch',
  displayName: '96-Channel Pipette Head',
  icon: '🔬',
  capabilities: ['aspirate', 'dispense', 'mix', 'transfer'],
  channelCount: 96,
  groupingMode: 'channel',
  selectionConstraints: [
    {
      type: 'channelCount',
      count: 96,
      mode: 'exact',
    },
    {
      type: 'pattern',
      patterns: [
        {
          name: 'full_96',
          description: 'Full 96-well plate',
          validatorRef: 'validators/full96',
        },
      ],
    },
  ],
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000426',
    label: '96-channel pipette',
    ontology: 'obi',
  },
}

/**
 * Plate washer
 */
export const plateWasher: ToolType = {
  toolTypeId: 'plate_washer',
  displayName: 'Plate Washer',
  icon: '🚿',
  capabilities: ['wash', 'aspirate', 'dispense'],
  selectionConstraints: [],
  groupingMode: 'none',
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000568',
    label: 'plate washer',
    ontology: 'obi',
  },
}

/**
 * Plate reader
 */
export const plateReader: ToolType = {
  toolTypeId: 'plate_reader',
  displayName: 'Plate Reader',
  icon: '📊',
  capabilities: ['read'],
  selectionConstraints: [],
  groupingMode: 'none',
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000118',
    label: 'plate reader',
    ontology: 'obi',
  },
}

/**
 * All built-in tool types
 */
export const BUILTIN_TOOL_TYPES: ToolType[] = [
  pipette1ch,
  pipette4chFixed,
  pipette6chFixed,
  pipette8chFixed,
  pipette12ch,
  pipette4chAdjustable,
  pipette6chAdjustable,
  pipette8chAdjustable,
  pipette12chAdjustable,
  pipette96ch,
  plateWasher,
  plateReader,
]

// =============================================================================
// Tool Registry Functions
// =============================================================================

/**
 * Get a tool type by ID
 */
export function getToolType(toolTypeId: string): ToolType | undefined {
  return BUILTIN_TOOL_TYPES.find(t => t.toolTypeId === toolTypeId)
}

/**
 * Get all tool types compatible with given verbs
 */
export function getToolsForVerbs(verbs: string[]): ToolType[] {
  return BUILTIN_TOOL_TYPES.filter(t =>
    verbs.some(v => t.capabilities.includes(v))
  )
}
