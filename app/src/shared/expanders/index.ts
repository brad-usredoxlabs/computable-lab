/**
 * Expanders Module
 * 
 * Macro expanders transform compound events into primitive event sequences.
 */

// Types
export * from './types'

// Registry
export {
  expanderRegistry,
  registerExpander,
  getExpander,
  getAllExpanders,
  hasExpander,
  expandMacro,
  validateMacro,
  previewMacro,
} from './registry'
