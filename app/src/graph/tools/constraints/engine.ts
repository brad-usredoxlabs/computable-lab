/**
 * Tool Constraint Engine
 * 
 * Orchestrates strategy selection, expansion, and validation
 * based on tool, container geometry, and operation.
 */

import type {
  Address,
  Selection,
  Operation,
  ContainerGeometry,
  ContainerPredicate,
  OperationPredicate,
  ValidationResult,
  SelectionExpansion,
  SelectionOptions,
  SelectionStrategy,
  MappingStrategy,
  TransferMapping,
  StrategyRule,
  ConstrainedToolType,
} from './types'
import {
  getAddresses,
  flatSelection,
  validResult,
  invalidResult,
  errorMessage,
} from './types'

// =============================================================================
// Predicate Matching
// =============================================================================

/**
 * Check if a container matches a predicate.
 */
export function matchesContainerPredicate(
  predicate: ContainerPredicate,
  geometry: ContainerGeometry
): boolean {
  // Template ID
  if (predicate.templateId !== undefined) {
    const ids = Array.isArray(predicate.templateId)
      ? predicate.templateId
      : [predicate.templateId]
    if (!ids.includes(geometry.templateId ?? '')) {
      return false
    }
  }

  // Geometry type
  if (predicate.type !== undefined && predicate.type !== geometry.type) {
    return false
  }

  // Domain
  if (predicate.domain !== undefined) {
    const domains = Array.isArray(predicate.domain)
      ? predicate.domain
      : [predicate.domain]
    if (!domains.includes(geometry.domain ?? '')) {
      return false
    }
  }

  // Rows
  if (predicate.rows !== undefined) {
    if (typeof predicate.rows === 'number') {
      if (predicate.rows !== geometry.rows) return false
    } else {
      const { min, max } = predicate.rows
      if (min !== undefined && (geometry.rows ?? 0) < min) return false
      if (max !== undefined && (geometry.rows ?? 0) > max) return false
    }
  }

  // Columns
  if (predicate.columns !== undefined) {
    if (typeof predicate.columns === 'number') {
      if (predicate.columns !== geometry.columns) return false
    } else {
      const { min, max } = predicate.columns
      if (min !== undefined && (geometry.columns ?? 0) < min) return false
      if (max !== undefined && (geometry.columns ?? 0) > max) return false
    }
  }

  // Addressing
  if (
    predicate.addressing !== undefined &&
    predicate.addressing !== geometry.addressing
  ) {
    return false
  }

  // Hierarchy level
  if (predicate.hierarchyLevel !== undefined) {
    if (!geometry.hierarchy?.levels.includes(predicate.hierarchyLevel)) {
      return false
    }
  }

  // Custom matcher
  if (predicate.custom !== undefined && !predicate.custom(geometry)) {
    return false
  }

  return true
}

/**
 * Check if an operation matches a predicate.
 */
export function matchesOperationPredicate(
  predicate: OperationPredicate,
  operation: Operation
): boolean {
  // Verb
  if (predicate.verb !== undefined) {
    const verbs = Array.isArray(predicate.verb)
      ? predicate.verb
      : [predicate.verb]
    if (!verbs.includes(operation.verb)) {
      return false
    }
  }

  // Scope
  if (predicate.scope !== undefined && predicate.scope !== operation.scope) {
    return false
  }

  // Domain
  if (predicate.domain !== undefined) {
    const domains = Array.isArray(predicate.domain)
      ? predicate.domain
      : [predicate.domain]
    if (!domains.includes(operation.domain ?? '')) {
      return false
    }
  }

  // Is macro
  if (predicate.isMacro !== undefined && predicate.isMacro !== operation.isMacro) {
    return false
  }

  return true
}

/**
 * Check if a strategy rule matches container + operation.
 */
export function matchesRule(
  rule: StrategyRule,
  geometry: ContainerGeometry,
  operation: Operation
): boolean {
  if (
    rule.when.container &&
    !matchesContainerPredicate(rule.when.container, geometry)
  ) {
    return false
  }
  if (
    rule.when.operation &&
    !matchesOperationPredicate(rule.when.operation, operation)
  ) {
    return false
  }
  return true
}

// =============================================================================
// Default Strategies
// =============================================================================

/**
 * No-expansion strategy: returns just the clicked address.
 */
export const NoExpansionStrategy: SelectionStrategy = {
  strategyId: 'no_expansion',
  displayName: 'No Expansion (Single Address)',

  expand(click) {
    return flatSelection([click])
  },

  validate() {
    return validResult()
  },
}

/**
 * Default 1:1 mapping strategy.
 */
export const OneToOneMappingStrategy: MappingStrategy = {
  strategyId: 'one_to_one',
  displayName: '1:1 Mapping',

  validateMapping(sourceSelection, targetSelection) {
    const srcAddresses = getAddresses(sourceSelection)
    const tgtAddresses = getAddresses(targetSelection)

    if (srcAddresses.length !== tgtAddresses.length) {
      return invalidResult([
        errorMessage(
          'COUNT_MISMATCH',
          `Source has ${srcAddresses.length} addresses, target has ${tgtAddresses.length}`,
          undefined,
          'Select the same number of addresses in source and target'
        ),
      ])
    }

    return validResult()
  },

  computeMapping(sourceSelection, targetSelection) {
    const srcAddresses = getAddresses(sourceSelection)
    const tgtAddresses = getAddresses(targetSelection)

    return srcAddresses.map((source, i) => ({
      source,
      target: tgtAddresses[i],
      channelIndex: i,
    }))
  },

  suggestTargets(sourceSelection) {
    // Default: same addresses in target
    return sourceSelection
  },
}

// =============================================================================
// Tool Constraint Engine
// =============================================================================

export class ToolConstraintEngine {
  /**
   * Find the best matching selection strategy for tool + container + operation.
   */
  getSelectionStrategy(
    tool: ConstrainedToolType,
    geometry: ContainerGeometry,
    operation: Operation
  ): SelectionStrategy {
    // Sort rules by priority (descending)
    const sortedRules = [...tool.selectionRules].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
    )

    for (const rule of sortedRules) {
      if (matchesRule(rule, geometry, operation)) {
        return rule.strategy
      }
    }

    return tool.defaultSelectionStrategy
  }

  /**
   * Expand a click to a full selection.
   */
  expandSelection(
    tool: ConstrainedToolType,
    geometry: ContainerGeometry,
    click: Address,
    operation: Operation,
    context: 'source' | 'target',
    options?: SelectionOptions
  ): SelectionExpansion {
    // In manual mode, don't expand
    if (options?.mode === 'manual') {
      return {
        original: click,
        selection: flatSelection([click]),
        strategyId: 'manual',
        validation: validResult(),
      }
    }

    const strategy = this.getSelectionStrategy(tool, geometry, operation)
    const selection = strategy.expand(click, geometry, operation, context, options)
    const validation = strategy.validate(selection, geometry, operation)

    return {
      original: click,
      selection,
      strategyId: strategy.strategyId,
      validation,
    }
  }

  /**
   * Validate a manual selection.
   */
  validateSelection(
    tool: ConstrainedToolType,
    geometry: ContainerGeometry,
    selection: Selection,
    operation: Operation
  ): ValidationResult {
    const strategy = this.getSelectionStrategy(tool, geometry, operation)
    return strategy.validate(selection, geometry, operation)
  }

  /**
   * Validate and compute mapping.
   */
  computeMapping(
    tool: ConstrainedToolType,
    source: { selection: Selection; geometry: ContainerGeometry },
    target: { selection: Selection; geometry: ContainerGeometry },
    operation: Operation
  ): { mapping: TransferMapping[]; validation: ValidationResult } {
    const mappingStrategy = tool.mappingStrategy ?? OneToOneMappingStrategy

    const validation = mappingStrategy.validateMapping(
      source.selection,
      target.selection,
      source.geometry,
      target.geometry,
      operation
    )

    if (!validation.valid) {
      return { mapping: [], validation }
    }

    const mapping = mappingStrategy.computeMapping(
      source.selection,
      target.selection,
      source.geometry,
      target.geometry,
      operation
    )

    return { mapping, validation }
  }

  /**
   * Suggest targets for source selection.
   */
  suggestTargets(
    tool: ConstrainedToolType,
    source: { selection: Selection; geometry: ContainerGeometry },
    targetGeometry: ContainerGeometry,
    operation: Operation
  ): Selection {
    const mappingStrategy = tool.mappingStrategy ?? OneToOneMappingStrategy

    return mappingStrategy.suggestTargets(
      source.selection,
      source.geometry,
      targetGeometry,
      operation
    )
  }

  /**
   * Get available verbs for a tool.
   */
  getCapabilities(tool: ConstrainedToolType): string[] {
    return tool.capabilities
  }

  /**
   * Check if a tool supports a specific verb.
   */
  supportsVerb(tool: ConstrainedToolType, verb: string): boolean {
    return tool.capabilities.includes(verb)
  }
}

// Singleton instance
export const constraintEngine = new ToolConstraintEngine()
