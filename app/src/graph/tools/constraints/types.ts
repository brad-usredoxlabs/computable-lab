/**
 * Tool Constraint System - Core Types
 * 
 * Defines types for operation-aware, predicate-based tool constraints.
 */

// =============================================================================
// Basic Types
// =============================================================================

/** Address in a container (well ID, animal ID, etc.) */
export type Address = string

/**
 * A selection can be flat (single-channel) or grouped (multi-channel).
 * Grouped selections preserve channel semantics for multi-step operations.
 */
export type Selection =
  | { kind: 'flat'; addresses: Address[] }
  | { kind: 'grouped'; groups: Address[][] }

/** Helper to get all addresses from a selection */
export function getAddresses(selection: Selection): Address[] {
  return selection.kind === 'flat'
    ? selection.addresses
    : selection.groups.flat()
}

/** Helper to create a flat selection */
export function flatSelection(addresses: Address[]): Selection {
  return { kind: 'flat', addresses }
}

/** Helper to create a grouped selection */
export function groupedSelection(groups: Address[][]): Selection {
  return { kind: 'grouped', groups }
}

// =============================================================================
// Operation Context
// =============================================================================

/**
 * Describes what the user is trying to do.
 * Affects which selection/mapping strategies apply.
 */
export interface Operation {
  /** Event type / verb: 'transfer', 'mix', 'wash', 'serial_dilution', 'feed', 'weigh' */
  verb: string
  
  /** Scope: within same container or between containers */
  scope: 'within' | 'between'
  
  /** Is this a macro that expands to multiple primitives? */
  isMacro?: boolean
  
  /** Domain hint (liquid-handling, animal-handling, etc.) */
  domain?: string
}

// =============================================================================
// Container Geometry (JSON-safe)
// =============================================================================

/**
 * Specification for hierarchical containers (cages, litters, cohorts).
 * Uses Record instead of Map for JSON serialization.
 */
export interface HierarchySpec {
  /** Level names from top to bottom: ['cage', 'mouse'] */
  levels: string[]
  
  /** Parent→children mapping (JSON-safe Record) */
  groups: Record<string, string[]>
  
  /** Child→parent reverse lookup (optional for fast queries) */
  parentOf?: Record<string, string>
}

/**
 * Container geometry describes addressing and structure.
 */
export interface ContainerGeometry {
  /** Geometry type */
  type: 'grid' | 'linear' | 'hierarchical' | 'arbitrary'
  
  /** Container template ID if known */
  templateId?: string  // 'plate_96', 'plate_384', 'mouse_cage_rack'
  
  /** Addressing scheme */
  addressing: 'alphanumeric' | 'numeric' | 'custom'
  
  /** Domain (affects strategy selection) */
  domain?: 'liquid-handling' | 'animal-handling' | 'imaging' | string
  
  // Grid containers
  rows?: number
  columns?: number
  rowLabels?: string[]   // A-H for 96-well, A-P for 384-well
  columnLabels?: string[]
  viewOrientation?: 'landscape' | 'portrait'
  
  // Linear containers (reservoirs)
  linearLabels?: string[]  // ['1', '2', ..., '8'] for 8-well reservoir
  
  // Hierarchical containers
  hierarchy?: HierarchySpec
}

// =============================================================================
// Predicates (for strategy matching)
// =============================================================================

/**
 * Predicate to match containers.
 * All specified fields must match (AND logic).
 */
export interface ContainerPredicate {
  /** Match by template ID */
  templateId?: string | string[]
  
  /** Match by geometry type */
  type?: 'grid' | 'linear' | 'hierarchical' | 'arbitrary'
  
  /** Match by domain */
  domain?: string | string[]
  
  /** Match by dimensions */
  rows?: number | { min?: number; max?: number }
  columns?: number | { min?: number; max?: number }
  
  /** Match by addressing */
  addressing?: 'alphanumeric' | 'numeric' | 'custom'
  
  /** Match by hierarchy level */
  hierarchyLevel?: string
  
  /** Custom matcher for complex cases */
  custom?: (geometry: ContainerGeometry) => boolean
}

/**
 * Predicate to match operations.
 */
export interface OperationPredicate {
  verb?: string | string[]
  scope?: 'within' | 'between'
  domain?: string | string[]
  isMacro?: boolean
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validation message with type, code, and details.
 */
export interface ValidationMessage {
  type: 'error' | 'warning' | 'info'
  code: string            // 'CHANNEL_COUNT_MISMATCH', 'NOT_CONTIGUOUS', etc.
  message: string         // Human-readable
  addresses?: Address[]   // Affected addresses for visual highlighting
  suggestion?: string     // How to fix
}

/**
 * Result of validating a selection or mapping.
 */
export interface ValidationResult {
  valid: boolean
  
  /** Blocking errors - operation cannot proceed */
  errors: ValidationMessage[]
  
  /** Non-blocking warnings - operation can proceed with caution */
  warnings: ValidationMessage[]
  
  /** Informational messages */
  info: ValidationMessage[]
}

/** Create a valid result */
export function validResult(
  info: ValidationMessage[] = []
): ValidationResult {
  return { valid: true, errors: [], warnings: [], info }
}

/** Create an invalid result with errors */
export function invalidResult(
  errors: ValidationMessage[],
  warnings: ValidationMessage[] = []
): ValidationResult {
  return { valid: false, errors, warnings, info: [] }
}

/** Create an error message */
export function errorMessage(
  code: string,
  message: string,
  addresses?: Address[],
  suggestion?: string
): ValidationMessage {
  return { type: 'error', code, message, addresses, suggestion }
}

/** Create a warning message */
export function warningMessage(
  code: string,
  message: string,
  addresses?: Address[],
  suggestion?: string
): ValidationMessage {
  return { type: 'warning', code, message, addresses, suggestion }
}

/** Create an info message */
export function infoMessage(
  code: string,
  message: string,
  addresses?: Address[]
): ValidationMessage {
  return { type: 'info', code, message, addresses }
}

// =============================================================================
// Selection Strategy
// =============================================================================

/**
 * Options for selection expansion.
 */
export interface SelectionOptions {
  /** Number of active channels (1-8 for 8-channel, allows partial) */
  activeChannels?: number
  
  /** Manual mode disables auto-expansion, just validates */
  mode?: 'constrained' | 'manual'
}

/**
 * Result of expanding a click into a selection.
 */
export interface SelectionExpansion {
  original: Address
  selection: Selection
  strategyId: string
  validation: ValidationResult
}

/**
 * Strategy for computing and validating selections.
 */
export interface SelectionStrategy {
  strategyId: string
  displayName: string
  
  /**
   * Expand a single click to a full selection.
   * Takes operation into account (transfer vs mix vs wash behave differently).
   */
  expand(
    click: Address,
    geometry: ContainerGeometry,
    operation: Operation,
    context: 'source' | 'target',
    options?: SelectionOptions
  ): Selection
  
  /**
   * Validate a selection against tool+operation constraints.
   */
  validate(
    selection: Selection,
    geometry: ContainerGeometry,
    operation: Operation
  ): ValidationResult
  
  /**
   * Check if this strategy applies to the given container+operation.
   * Used by StrategyRule matching (optional, predicate matching is primary).
   */
  appliesTo?(geometry: ContainerGeometry, operation: Operation): boolean
}

// =============================================================================
// Mapping Strategy
// =============================================================================

/**
 * A single source→target mapping entry.
 */
export interface TransferMapping {
  source: Address
  target: Address
  channelIndex?: number    // Which tip/channel (0-7 for 8-channel)
  groupIndex?: number      // Which group (for multi-step operations)
}

/**
 * Strategy for computing and validating source→target mappings.
 */
export interface MappingStrategy {
  strategyId: string
  displayName: string
  
  /**
   * Validate that source and target selections can be mapped.
   * Called BEFORE computeMapping.
   */
  validateMapping(
    sourceSelection: Selection,
    targetSelection: Selection,
    sourceGeometry: ContainerGeometry,
    targetGeometry: ContainerGeometry,
    operation: Operation
  ): ValidationResult
  
  /**
   * Compute the actual address-to-address mapping.
   * Assumes validation has passed.
   */
  computeMapping(
    sourceSelection: Selection,
    targetSelection: Selection,
    sourceGeometry: ContainerGeometry,
    targetGeometry: ContainerGeometry,
    operation: Operation
  ): TransferMapping[]
  
  /**
   * Suggest target selection given source selection.
   * Used for auto-populate when user selects source first.
   */
  suggestTargets(
    sourceSelection: Selection,
    sourceGeometry: ContainerGeometry,
    targetGeometry: ContainerGeometry,
    operation: Operation
  ): Selection
}

// =============================================================================
// Strategy Rules
// =============================================================================

/**
 * Rule that binds a strategy to containers+operations matching predicates.
 */
export interface StrategyRule {
  /** When does this rule apply? */
  when: {
    container?: ContainerPredicate
    operation?: OperationPredicate
  }
  
  /** Strategy to use when matched */
  strategy: SelectionStrategy
  
  /** Priority (higher = evaluated first) */
  priority?: number
}

// =============================================================================
// Enhanced Tool Type (for constraint engine)
// =============================================================================

import type { OntologyTerm } from '../../../shared/vocab/types'

/**
 * Enhanced tool type with constraint rules.
 */
export interface ConstrainedToolType {
  toolTypeId: string
  displayName: string
  icon: string
  
  /** Capabilities: which verbs this tool can emit */
  capabilities: string[]
  
  /** Number of channels (for multi-channel tools) */
  channelCount?: number
  
  /** Min/max active channels (default: all channels) */
  minActiveChannels?: number
  maxActiveChannels?: number
  
  /** 
   * Selection rules (predicate-based, ordered by priority).
   * First matching rule wins.
   */
  selectionRules: StrategyRule[]
  
  /** Default selection strategy if no rules match */
  defaultSelectionStrategy: SelectionStrategy
  
  /** 
   * Mapping strategy for source→target operations.
   */
  mappingStrategy?: MappingStrategy
  
  /** Ontology term for semantic export */
  ontologyTerm?: OntologyTerm
}
