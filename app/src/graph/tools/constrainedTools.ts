/**
 * Constrained Tool Definitions
 * 
 * Tool types with selection rules and mapping strategies.
 */

import type { ConstrainedToolType } from './constraints'
import {
  Column8Strategy,
  AlternatingColumn8Strategy,
  Row12Strategy,
  EntireContainerStrategy,
  SingleItemStrategy,
  HierarchicalGroupStrategy,
  NoExpansionStrategy,
  OneToOneMappingStrategy,
  LinearAllStrategy,
} from './constraints'

// =============================================================================
// 8-Channel Fixed Pipette
// =============================================================================

export const constrainedPipette8ch: ConstrainedToolType = {
  toolTypeId: 'pipette_8ch_fixed',
  displayName: '8-Channel Fixed Pipette',
  icon: '🔬',
  capabilities: ['aspirate', 'dispense', 'mix', 'transfer'],
  channelCount: 8,
  minActiveChannels: 1,
  maxActiveChannels: 8,

  selectionRules: [
    // 384-well plates: alternating rows (every other row for 9mm spacing)
    {
      when: {
        container: { rows: 16, columns: 24 },
      },
      strategy: AlternatingColumn8Strategy,
      priority: 10,
    },
    // Linear reservoirs (8-well, 12-well): select all channels
    {
      when: {
        container: { type: 'linear' },
      },
      strategy: LinearAllStrategy,
      priority: 8,
    },
    // 96-well plates: full column
    {
      when: {
        container: { rows: 8, columns: 12 },
      },
      strategy: Column8Strategy,
      priority: 5,
    },
  ],

  defaultSelectionStrategy: NoExpansionStrategy,
  mappingStrategy: OneToOneMappingStrategy,

  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000426',
    label: 'multichannel pipette',
    ontology: 'obi',
  },
}

// =============================================================================
// 12-Channel Pipette
// =============================================================================

export const constrainedPipette12ch: ConstrainedToolType = {
  toolTypeId: 'pipette_12ch',
  displayName: '12-Channel Pipette',
  icon: '🔬',
  capabilities: ['aspirate', 'dispense', 'mix', 'transfer'],
  channelCount: 12,
  minActiveChannels: 1,
  maxActiveChannels: 12,

  selectionRules: [
    // 96-well plates: full row
    {
      when: {
        container: { rows: 8, columns: 12 },
      },
      strategy: Row12Strategy,
      priority: 5,
    },
  ],

  defaultSelectionStrategy: NoExpansionStrategy,
  mappingStrategy: OneToOneMappingStrategy,

  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000426',
    label: 'multichannel pipette',
    ontology: 'obi',
  },
}

// =============================================================================
// Single-Channel Pipette
// =============================================================================

export const constrainedPipette1ch: ConstrainedToolType = {
  toolTypeId: 'pipette_1ch',
  displayName: 'Single-Channel Pipette',
  icon: '💉',
  capabilities: ['aspirate', 'dispense', 'mix', 'transfer', 'add_material'],
  channelCount: 1,

  selectionRules: [],

  defaultSelectionStrategy: SingleItemStrategy,
  mappingStrategy: OneToOneMappingStrategy,

  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000428',
    label: 'pipette',
    ontology: 'obi',
  },
}

// =============================================================================
// Plate Washer
// =============================================================================

export const constrainedPlateWasher: ConstrainedToolType = {
  toolTypeId: 'plate_washer',
  displayName: 'Plate Washer',
  icon: '🚿',
  capabilities: ['wash', 'aspirate', 'dispense'],

  selectionRules: [
    // Grid containers: entire plate
    {
      when: {
        container: { type: 'grid' },
      },
      strategy: EntireContainerStrategy,
      priority: 5,
    },
  ],

  defaultSelectionStrategy: EntireContainerStrategy,

  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000568',
    label: 'plate washer',
    ontology: 'obi',
  },
}

// =============================================================================
// Plate Reader
// =============================================================================

export const constrainedPlateReader: ConstrainedToolType = {
  toolTypeId: 'plate_reader',
  displayName: 'Plate Reader',
  icon: '📊',
  capabilities: ['read'],

  selectionRules: [
    // Grid containers: entire plate
    {
      when: {
        container: { type: 'grid' },
      },
      strategy: EntireContainerStrategy,
      priority: 5,
    },
  ],

  defaultSelectionStrategy: EntireContainerStrategy,

  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000118',
    label: 'plate reader',
    ontology: 'obi',
  },
}

// =============================================================================
// Feeding Tool (Animal Handling)
// =============================================================================

export const constrainedFeedingTool: ConstrainedToolType = {
  toolTypeId: 'feeding_tool',
  displayName: 'Feeding Tool',
  icon: '🍽️',
  capabilities: ['feed'],

  selectionRules: [
    // Hierarchical containers (cages): select entire cage
    {
      when: {
        container: { type: 'hierarchical' },
        operation: { verb: 'feed' },
      },
      strategy: HierarchicalGroupStrategy,
      priority: 10,
    },
  ],

  defaultSelectionStrategy: HierarchicalGroupStrategy,
}

// =============================================================================
// Scale (Weighing Tool)
// =============================================================================

export const constrainedScale: ConstrainedToolType = {
  toolTypeId: 'scale',
  displayName: 'Scale',
  icon: '⚖️',
  capabilities: ['weigh'],

  selectionRules: [
    // Single item selection for weighing
    {
      when: {
        operation: { verb: 'weigh' },
      },
      strategy: SingleItemStrategy,
      priority: 10,
    },
  ],

  defaultSelectionStrategy: SingleItemStrategy,
}

// =============================================================================
// Registry
// =============================================================================

/**
 * All constrained tool types
 */
export const CONSTRAINED_TOOLS: ConstrainedToolType[] = [
  constrainedPipette1ch,
  constrainedPipette8ch,
  constrainedPipette12ch,
  constrainedPlateWasher,
  constrainedPlateReader,
  constrainedFeedingTool,
  constrainedScale,
]

/**
 * Get a constrained tool type by ID
 */
export function getConstrainedTool(toolTypeId: string): ConstrainedToolType | undefined {
  return CONSTRAINED_TOOLS.find(t => t.toolTypeId === toolTypeId)
}

/**
 * Get constrained tools that support a specific verb
 */
export function getConstrainedToolsForVerb(verb: string): ConstrainedToolType[] {
  return CONSTRAINED_TOOLS.filter(t => t.capabilities.includes(verb))
}
