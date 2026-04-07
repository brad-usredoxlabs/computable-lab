/**
 * Tools Module
 * 
 * Re-exports tool types, constraint system, and utilities
 */

// Legacy types (basic tool definitions) - these are the original simple types
export {
  type ToolType,
  type ToolInstance,
  type SelectionConstraint,
  type ChannelCountConstraint,
  type PatternConstraint,
  type MappingConstraint,
  type GroupConstraint,
  type SelectionPattern,
  type AddressingInfo,
  type ValidationError,
  type ValidationWarning,
  type SelectionSuggestion,
  pipette1ch,
  pipette8chFixed,
  pipette12ch,
  pipette96ch,
  plateWasher,
  plateReader,
  BUILTIN_TOOL_TYPES,
  getToolType,
  getToolsForVerbs,
} from './types'

// Export legacy ValidationResult with an alias to avoid conflict
export { type ValidationResult as LegacyValidationResult } from './types'

// Constraint system (new architecture)
// Export with namespace to keep things clean
export * as constraints from './constraints'

// Re-export commonly used constraint types directly
export {
  type Address,
  type Selection,
  type Operation,
  type ContainerGeometry,
  type ContainerPredicate,
  type OperationPredicate,
  type HierarchySpec,
  type ValidationResult,
  type ValidationMessage,
  type SelectionExpansion,
  type SelectionOptions,
  type SelectionStrategy,
  type MappingStrategy,
  type TransferMapping,
  type StrategyRule,
  type ConstrainedToolType,
  flatSelection,
  groupedSelection,
  getAddresses,
  validResult,
  invalidResult,
  errorMessage,
  warningMessage,
  infoMessage,
  ToolConstraintEngine,
  constraintEngine,
  NoExpansionStrategy,
  OneToOneMappingStrategy,
  Column8Strategy,
  AlternatingColumn8Strategy,
  Row12Strategy,
  EntireContainerStrategy,
  HierarchicalGroupStrategy,
  SingleItemStrategy,
  parseColumn,
  parseRow,
  buildAddress,
} from './constraints'

// Constrained tool definitions
export {
  constrainedPipette1ch,
  constrainedPipette8ch,
  constrainedPipette12ch,
  constrainedPlateWasher,
  constrainedPlateReader,
  constrainedFeedingTool,
  constrainedScale,
  CONSTRAINED_TOOLS,
  getConstrainedTool,
  getConstrainedToolsForVerb,
} from './constrainedTools'
/**
 * Tools Components
 */

export { ToolSelector } from './ToolSelector'
export type { ToolSelectorProps, SelectedTool } from './ToolSelector'
