/**
 * Tool Constraints Module
 * 
 * Exports types, engine, and strategies for tool constraint system.
 */

// Types
export * from './types'

// Engine
export {
  ToolConstraintEngine,
  constraintEngine,
  matchesContainerPredicate,
  matchesOperationPredicate,
  matchesRule,
  NoExpansionStrategy,
  OneToOneMappingStrategy,
} from './engine'

// Built-in strategies
export {
  Column8Strategy,
  AlternatingColumn8Strategy,
  Row12Strategy,
  EntireContainerStrategy,
  HierarchicalGroupStrategy,
  SingleItemStrategy,
  LinearAllStrategy,
  parseColumn,
  parseRow,
  buildAddress,
  areSameColumn,
  areContiguousRows,
} from './strategies'
