/**
 * Vocabulary Pack Types
 * 
 * Vocabulary packs define:
 * - Available verbs (actions)
 * - Parameter schemas per verb
 * - Ontology mappings for semantic export
 * - UI hints (icons, colors, labels)
 */

import type { EventKind } from '../../types/event'

// =============================================================================
// Ontology Types
// =============================================================================

/**
 * Ontology term mapping for semantic export
 */
export interface OntologyTerm {
  /** Full IRI of the ontology term */
  iri: string                            // "http://purl.obolibrary.org/obo/OBI_0000094"
  /** Short label with prefix */
  label: string                          // "obi:material_addition"
  /** Ontology identifier */
  ontology: string                       // "obi", "edam", "bao", "ncit"
}

/**
 * Ontology mappings at the pack level
 */
export interface OntologyMappings {
  /** Primary ontology for processes/verbs */
  processOntology: string                // "obi"
  /** Primary ontology for instruments/tools */
  instrumentOntology: string             // "obi" or "ncit"
  /** Additional ontologies for extended coverage */
  additionalOntologies?: string[]        // ["edam", "bao"]
}

// =============================================================================
// Parameter Schema Types
// =============================================================================

/**
 * Parameter types supported in verb definitions
 */
export type ParamType = 
  | 'number'
  | 'string'
  | 'boolean'
  | 'enum'
  | 'duration'
  | 'object'

/**
 * Schema for a single parameter
 */
export interface ParamSchema {
  /** Parameter name (used as key in parameters object) */
  name: string
  /** Data type */
  type: ParamType
  /** Display label */
  label: string
  /** Unit (for numeric values) */
  unit?: string
  /** Default value */
  defaultValue?: unknown
  /** Options for enum type */
  enumOptions?: string[]
  /** Minimum value for numbers */
  min?: number
  /** Maximum value for numbers */
  max?: number
  /** Decimal places for numbers */
  decimals?: number
  /** Help text */
  description?: string
  /** Whether this param is visible in compact mode */
  showInCompact?: boolean
}

// =============================================================================
// Verb Definition Types
// =============================================================================

/**
 * Base verb definition (shared by primitive and macro)
 */
export interface BaseVerbDefinition {
  /** Verb token (used in event.verb) */
  verb: string                           // "aspirate", "serial_dilution"
  /** Display name */
  displayName: string                    // "Aspirate", "Serial Dilution"
  /** Emoji or icon identifier */
  icon: string                           // "⬆️", "📉"
  /** Color for UI */
  color?: string                         // "#339af0"
  
  /** Whether this verb requires a material reference */
  requiresMaterial: boolean
  /** Whether this verb is a source→target operation */
  requiresSourceTarget: boolean
  /** How this verb affects volume */
  affectsVolume: 'decrease' | 'increase' | 'none'
  
  /** Ontology term for semantic export */
  ontologyTerm?: OntologyTerm
  /** Alternative ontology terms for cross-ontology support */
  altOntologyTerms?: OntologyTerm[]
}

/**
 * Primitive verb definition
 */
export interface PrimitiveVerbDefinition extends BaseVerbDefinition {
  eventKind: 'primitive'
  /** Required parameters */
  requiredParams: ParamSchema[]
  /** Optional parameters */
  optionalParams: ParamSchema[]
  /** Validation rules (future) */
  validationRules?: ValidationRule[]
}

/**
 * Macro verb definition
 */
export interface MacroVerbDefinition extends BaseVerbDefinition {
  eventKind: 'macro'
  /** Schema for macro-specific parameters */
  macroParamsSchema: ParamSchema[]
  /** Reference to expansion function */
  expanderFn: string                     // "expanders/serialDilution"
  /** Primitive verbs this macro expands to */
  expandsTo: string[]                    // ["transfer", "mix"]
}

/**
 * Union type for all verb definitions
 */
export type VerbDefinition = PrimitiveVerbDefinition | MacroVerbDefinition

/**
 * Type guard for primitive verb
 */
export function isPrimitiveVerb(verb: VerbDefinition): verb is PrimitiveVerbDefinition {
  return verb.eventKind === 'primitive'
}

/**
 * Type guard for macro verb
 */
export function isMacroVerb(verb: VerbDefinition): verb is MacroVerbDefinition {
  return verb.eventKind === 'macro'
}

// =============================================================================
// Validation Rule Types (Future)
// =============================================================================

/**
 * Validation rule for verb parameters
 */
export interface ValidationRule {
  /** Rule type */
  type: 'range' | 'required_if' | 'custom'
  /** Rule configuration */
  config: Record<string, unknown>
  /** Error message */
  message: string
}

// =============================================================================
// Vocabulary Pack
// =============================================================================

/**
 * Vocabulary Pack - a collection of related verbs for a domain
 */
export interface VocabPack {
  /** Pack identifier */
  packId: string                         // "liquid-handling/v1"
  /** Semantic version */
  version: string                        // "1.0.0"
  /** Display name */
  displayName: string                    // "Liquid Handling"
  /** Description */
  description: string
  
  /** All verbs defined in this pack */
  verbs: VerbDefinition[]
  
  /** Compatible container addressing schemes */
  compatibleAddressing: ('grid' | 'linear' | 'single')[]
  
  /** Compatible tool type patterns (supports wildcards) */
  compatibleToolTypes: string[]          // ["pipette_*", "plate_washer"]
  
  /** Default render style for containers using this pack */
  defaultRenderStyle: 'wells' | 'cages' | 'plots' | 'generic'
  
  /** Ontology mappings for semantic export */
  ontologyMappings: OntologyMappings
}

// =============================================================================
// Pack Registry
// =============================================================================

/**
 * Registry for managing vocabulary packs
 */
export interface VocabPackRegistry {
  /** Get a pack by ID */
  getPack(packId: string): VocabPack | undefined
  
  /** Get all registered packs */
  getAllPacks(): VocabPack[]
  
  /** Register a new pack */
  registerPack(pack: VocabPack): void
  
  /** Get verb definition */
  getVerb(packId: string, verb: string): VerbDefinition | undefined
  
  /** Get all verbs for a pack, optionally filtered by kind */
  getVerbs(packId: string, kind?: EventKind): VerbDefinition[]
  
  /** Get primitive verbs only */
  getPrimitiveVerbs(packId: string): PrimitiveVerbDefinition[]
  
  /** Get macro verbs only */
  getMacroVerbs(packId: string): MacroVerbDefinition[]
}

// =============================================================================
// Display Helpers
// =============================================================================

/**
 * Get display info for a verb
 */
export interface VerbDisplayInfo {
  verb: string
  displayName: string
  icon: string
  color: string
  eventKind: EventKind
}

/**
 * Get display info from a verb definition
 */
export function getVerbDisplayInfo(verbDef: VerbDefinition): VerbDisplayInfo {
  return {
    verb: verbDef.verb,
    displayName: verbDef.displayName,
    icon: verbDef.icon,
    color: verbDef.color || '#868e96',
    eventKind: verbDef.eventKind,
  }
}

/**
 * Default colors by verb for liquid handling
 */
export const DEFAULT_VERB_COLORS: Record<string, string> = {
  aspirate: '#339af0',
  dispense: '#339af0',
  transfer: '#be4bdb',
  add_material: '#339af0',
  mix: '#20c997',
  wash: '#74c0fc',
  incubate: '#f59f00',
  read: '#ff6b6b',
  harvest: '#40c057',
  serial_dilution: '#7950f2',
  plate_copy: '#be4bdb',
  wash_cycle: '#74c0fc',
  // Animal handling
  inject: '#fa5252',
  feed: '#fab005',
  weigh: '#868e96',
  observe: '#15aabf',
  sample: '#e64980',
}
