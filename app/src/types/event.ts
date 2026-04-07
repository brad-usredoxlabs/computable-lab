/**
 * Universal Event Types
 * 
 * Domain-agnostic event structure supporting:
 * - Primitive events (single atomic operations)
 * - Macro events (compound operations that expand to primitives)
 * - Vocabulary-pack-driven verbs
 * - Tool references
 * - Ontology mappings for semantic export
 */

// =============================================================================
// Core Types
// =============================================================================

/**
 * Event kind discriminator
 */
export type EventKind = 'primitive' | 'macro'

/**
 * Reference to a material
 */
export interface MaterialRef {
  materialRef: string                    // Reference to material definition
  volume_uL?: number
  concentration?: { value: number; unit: string }
  mass_mg?: number
  // Extensible for other material properties
  [key: string]: unknown
}

/**
 * Reference to a tool
 */
export interface ToolRef {
  toolId: string                         // Instance ID
  toolType: string                       // e.g., "pipette_8ch_variable"
}

/**
 * Provenance information
 */
export interface Provenance {
  actor: string                          // Who applied
  timestamp: string                      // ISO datetime
  method?: 'manual' | 'automated' | 'imported'
  actionGroupId?: string                 // Links related events
  parentEventId?: string                 // For expanded primitives, reference to macro
}

/**
 * Subject specification - container + addresses
 */
export interface Subjects {
  containerId: string
  addresses: string[]                    // ["A1"] or ["A1", "A2", "A3"]
}

// =============================================================================
// Base Event Interface
// =============================================================================

/**
 * BaseEvent - fields common to all events
 */
export interface BaseEvent {
  eventId: string
  
  /** Verb token from vocabulary pack */
  verb: string                           // "aspirate", "feed", "inject", etc.
  
  /** Vocabulary pack this event belongs to */
  vocabPackId: string                    // "liquid-handling/v1"
  
  /** Event kind: primitive or macro */
  eventKind: EventKind
  
  /** Tool reference (optional) */
  toolRef?: ToolRef
  
  /** Timing - actual execution time */
  at?: string                            // ISO datetime
  
  /** Timing - planned offset from run start */
  t_offset?: string                      // ISO duration
  
  /** Free-text notes */
  notes?: string
  
  /** Provenance information */
  provenance: Provenance
}

// =============================================================================
// Primitive Event
// =============================================================================

/**
 * PrimitiveEvent - single atomic operation
 */
export interface PrimitiveEvent extends BaseEvent {
  eventKind: 'primitive'
  
  /** Subject(s) - container and addresses affected */
  subjects: Subjects
  
  /** Optional destination for transfer-type operations */
  destSubjects?: Subjects
  
  /** Material reference (optional) */
  material?: MaterialRef
  
  /** Verb-specific parameters */
  parameters: Record<string, unknown>
}

// =============================================================================
// Macro Event
// =============================================================================

/**
 * MacroEvent - compound operation that expands to primitives
 */
export interface MacroEvent extends BaseEvent {
  eventKind: 'macro'
  
  /** Macro-specific parameters (for deterministic expansion) */
  macroParams: Record<string, unknown>
  
  /** Cached expansion (optional, for display/validation) */
  expansion?: PrimitiveEvent[]
}

// =============================================================================
// Union Type
// =============================================================================

/**
 * UniversalEvent - union of all event types
 */
export type UniversalEvent = PrimitiveEvent | MacroEvent

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if event is a primitive
 */
export function isPrimitiveEvent(event: UniversalEvent): event is PrimitiveEvent {
  return event.eventKind === 'primitive'
}

/**
 * Check if event is a macro
 */
export function isMacroEvent(event: UniversalEvent): event is MacroEvent {
  return event.eventKind === 'macro'
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Generate a unique event ID
 */
export function generateEventId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}

/**
 * Create provenance with current user and timestamp
 */
export function createProvenance(
  actor: string = 'user',
  method: 'manual' | 'automated' | 'imported' = 'manual'
): Provenance {
  return {
    actor,
    timestamp: new Date().toISOString(),
    method,
  }
}

/**
 * Create an empty primitive event
 */
export function createPrimitiveEvent(
  verb: string,
  vocabPackId: string,
  subjects: Subjects,
  parameters: Record<string, unknown> = {},
  actor: string = 'user'
): PrimitiveEvent {
  return {
    eventId: generateEventId(),
    verb,
    vocabPackId,
    eventKind: 'primitive',
    subjects,
    parameters,
    provenance: createProvenance(actor),
  }
}

/**
 * Create an empty macro event
 */
export function createMacroEvent(
  verb: string,
  vocabPackId: string,
  macroParams: Record<string, unknown> = {},
  actor: string = 'user'
): MacroEvent {
  return {
    eventId: generateEventId(),
    verb,
    vocabPackId,
    eventKind: 'macro',
    macroParams,
    provenance: createProvenance(actor),
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get all affected addresses from an event (for highlighting, etc.)
 */
export function getEventAddresses(event: UniversalEvent): string[] {
  if (isPrimitiveEvent(event)) {
    const addresses = [...event.subjects.addresses]
    if (event.destSubjects) {
      addresses.push(...event.destSubjects.addresses)
    }
    return [...new Set(addresses)]
  } else {
    // For macros, expand if we have cached expansion
    if (event.expansion) {
      const addresses: string[] = []
      for (const primitive of event.expansion) {
        addresses.push(...getEventAddresses(primitive))
      }
      return [...new Set(addresses)]
    }
    return []
  }
}

/**
 * Get container IDs involved in an event
 */
export function getEventContainerIds(event: UniversalEvent): string[] {
  if (isPrimitiveEvent(event)) {
    const containerIds = [event.subjects.containerId]
    if (event.destSubjects) {
      containerIds.push(event.destSubjects.containerId)
    }
    return [...new Set(containerIds)]
  } else {
    if (event.expansion) {
      const containerIds: string[] = []
      for (const primitive of event.expansion) {
        containerIds.push(...getEventContainerIds(primitive))
      }
      return [...new Set(containerIds)]
    }
    return []
  }
}
