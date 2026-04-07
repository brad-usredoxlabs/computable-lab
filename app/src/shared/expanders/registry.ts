/**
 * Expander Registry
 * 
 * Manages registration and lookup of macro expanders.
 */

import type { MacroEvent, PrimitiveEvent } from '../../types/event'
import type { MacroExpander, ExpansionContext, ExpansionPreview, ExpansionValidation } from './types'

/**
 * Internal registry storage
 */
const expanders = new Map<string, MacroExpander>()

/**
 * Initialize with built-in expanders
 */
function initializeRegistry(): void {
  // Add more expanders as they are created:
  // registerExpander(plateCopyExpander)
  // registerExpander(washCycleExpander)
}

/**
 * Register an expander
 */
export function registerExpander(expander: MacroExpander): void {
  expanders.set(expander.verb, expander)
}

/**
 * Get an expander by verb
 */
export function getExpander(verb: string): MacroExpander | undefined {
  ensureInitialized()
  return expanders.get(verb)
}

/**
 * Get all registered expanders
 */
export function getAllExpanders(): MacroExpander[] {
  ensureInitialized()
  return Array.from(expanders.values())
}

/**
 * Check if an expander exists for a verb
 */
export function hasExpander(verb: string): boolean {
  ensureInitialized()
  return expanders.has(verb)
}

/**
 * Expand a macro event using its registered expander
 */
export function expandMacro(
  event: MacroEvent,
  context: ExpansionContext
): PrimitiveEvent[] {
  const expander = getExpander(event.verb)
  if (!expander) {
    console.warn(`No expander registered for verb: ${event.verb}`)
    return []
  }
  return expander.expand(event, context)
}

/**
 * Validate a macro event using its registered expander
 */
export function validateMacro(
  event: MacroEvent,
  context: ExpansionContext
): ExpansionValidation {
  const expander = getExpander(event.verb)
  if (!expander) {
    return {
      valid: false,
      errors: [{ message: `No expander registered for verb: ${event.verb}` }],
      warnings: [],
    }
  }
  if (expander.validate) {
    return expander.validate(event, context)
  }
  return { valid: true, errors: [], warnings: [] }
}

/**
 * Get preview for a macro event
 */
export function previewMacro(
  event: MacroEvent,
  context: ExpansionContext
): ExpansionPreview | null {
  const expander = getExpander(event.verb)
  if (!expander || !expander.preview) {
    return null
  }
  return expander.preview(event, context)
}

/**
 * Ensure registry is initialized
 */
let initialized = false
function ensureInitialized(): void {
  if (!initialized) {
    initializeRegistry()
    initialized = true
  }
}

// =============================================================================
// Default Export
// =============================================================================

export const expanderRegistry = {
  registerExpander,
  getExpander,
  getAllExpanders,
  hasExpander,
  expandMacro,
  validateMacro,
  previewMacro,
}

export default expanderRegistry
