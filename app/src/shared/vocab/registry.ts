/**
 * Vocabulary Pack Registry
 * 
 * Manages registration and lookup of vocabulary packs.
 */

import type { 
  VocabPack, 
  VerbDefinition, 
  PrimitiveVerbDefinition, 
  MacroVerbDefinition,
  VocabPackRegistry 
} from './types'
import { isPrimitiveVerb, isMacroVerb } from './types'
import type { EventKind } from '../../types/event'

// Built-in packs
import { liquidHandlingV1 } from './packs/liquid-handling.v1'
import { animalHandlingV1 } from './packs/animal-handling.v1'

/**
 * Internal registry storage
 */
const packs = new Map<string, VocabPack>()

/**
 * Initialize with built-in packs
 */
function initializeRegistry(): void {
  registerPack(liquidHandlingV1)
  registerPack(animalHandlingV1)
  // Add more built-in packs here as they are created
}

/**
 * Register a vocabulary pack
 */
export function registerPack(pack: VocabPack): void {
  packs.set(pack.packId, pack)
}

/**
 * Get a pack by ID
 */
export function getPack(packId: string): VocabPack | undefined {
  ensureInitialized()
  return packs.get(packId)
}

/**
 * Get all registered packs
 */
export function getAllPacks(): VocabPack[] {
  ensureInitialized()
  return Array.from(packs.values())
}

/**
 * Get a verb definition from a pack
 */
export function getVerb(packId: string, verb: string): VerbDefinition | undefined {
  const pack = getPack(packId)
  if (!pack) return undefined
  return pack.verbs.find(v => v.verb === verb)
}

/**
 * Get all verbs for a pack, optionally filtered by kind
 */
export function getVerbs(packId: string, kind?: EventKind): VerbDefinition[] {
  const pack = getPack(packId)
  if (!pack) return []
  
  if (!kind) return pack.verbs
  
  return pack.verbs.filter(v => v.eventKind === kind)
}

/**
 * Get primitive verbs only
 */
export function getPrimitiveVerbs(packId: string): PrimitiveVerbDefinition[] {
  return getVerbs(packId, 'primitive').filter(isPrimitiveVerb)
}

/**
 * Get macro verbs only
 */
export function getMacroVerbs(packId: string): MacroVerbDefinition[] {
  return getVerbs(packId, 'macro').filter(isMacroVerb)
}

/**
 * Get display info for all verbs in a pack
 */
export function getVerbsForDisplay(packId: string): Array<{
  verb: string
  displayName: string
  icon: string
  color: string
  eventKind: EventKind
  section: 'primitives' | 'macros'
}> {
  const pack = getPack(packId)
  if (!pack) return []
  
  return pack.verbs.map(v => ({
    verb: v.verb,
    displayName: v.displayName,
    icon: v.icon,
    color: v.color || '#868e96',
    eventKind: v.eventKind,
    section: v.eventKind === 'primitive' ? 'primitives' as const : 'macros' as const,
  }))
}

/**
 * Get pack for a given container domain
 */
export function getPackForDomain(domain: string): VocabPack | undefined {
  ensureInitialized()
  
  // Map domains to default packs
  const domainPacks: Record<string, string> = {
    'labware': 'liquid-handling/v1',
    'animal': 'animal-handling/v1',
    'field': 'field-ops/v1',
    'custom': 'liquid-handling/v1', // Default fallback
  }
  
  const packId = domainPacks[domain]
  return packId ? getPack(packId) : undefined
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
// Registry Object (for interface compliance)
// =============================================================================

/**
 * Registry object that implements VocabPackRegistry interface
 */
export const vocabRegistry: VocabPackRegistry = {
  getPack,
  getAllPacks,
  registerPack,
  getVerb,
  getVerbs,
  getPrimitiveVerbs,
  getMacroVerbs,
}

// =============================================================================
// Default Export
// =============================================================================

export default vocabRegistry
