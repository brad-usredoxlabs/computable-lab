/**
 * RefPickerConfig types and default configurations for UI components.
 * 
 * These configs control which sources are searched for each type of ref picker
 * (combobox, autocomplete, etc.) in the UI.
 */

import type { SpecialtyProvider, OntologyDomain } from './domains.js'

/**
 * Configuration for a ref picker UI component.
 * 
 * Determines what kinds of refs can be selected and where to search for them.
 */
export interface RefPickerConfig {
  /** Which kinds of refs are allowed: record (local), ontology (external), or both */
  allowedKinds: ('record' | 'ontology')[]
  
  /** Record types to search in local library (e.g., ["material", "labware"]) */
  localRecordTypes?: string[]
  
  /** OLS ontology names to search (e.g., ["chebi", "cl", "uberon"]) */
  olsOntologies?: string[]
  
  /** Specialty providers to use (uniprot, reactome, ncbi_taxon) */
  specialtyProviders?: SpecialtyProvider[]
  
  /** Placeholder text for the search input */
  placeholder?: string
  
  /** Label for the picker field */
  label?: string
  
  /** Minimum characters before searching remote (default: 2 for ontology, 1 for local) */
  minQueryLength?: number
  
  /** Debounce delay in ms for remote search (default: 300) */
  debounceMs?: number
  
  /** Maximum results to show per source (default: 10) */
  maxResults?: number
  
  /** Whether to allow creating new local records from ontology terms */
  allowPromoteToLocal?: boolean
  
  /** Domain hint for contextual help */
  domain?: OntologyDomain
}

/**
 * Default picker configurations for common use cases.
 * 
 * These can be used directly or extended for specific form fields.
 */
export const DEFAULT_PICKER_CONFIGS: Record<string, RefPickerConfig> = {
  /**
   * Material picker - searches local materials and ChEBI
   */
  material: {
    allowedKinds: ['record', 'ontology'],
    localRecordTypes: ['material'],
    olsOntologies: ['chebi', 'cl', 'uberon', 'go', 'ncbitaxon', 'ncit'],
    placeholder: 'Search materials or chemicals...',
    label: 'Material',
    allowPromoteToLocal: true,
    domain: 'chemical',
  },

  /**
   * Cell type picker - ontology only (CL)
   */
  cellType: {
    allowedKinds: ['ontology'],
    olsOntologies: ['cl'],
    placeholder: 'Search cell types...',
    label: 'Cell Type',
    domain: 'cellType',
  },

  /**
   * Tissue picker - ontology only (Uberon)
   */
  tissue: {
    allowedKinds: ['ontology'],
    olsOntologies: ['uberon'],
    placeholder: 'Search tissues...',
    label: 'Tissue',
    domain: 'tissue',
  },

  /**
   * Labware picker - local records only
   */
  labware: {
    allowedKinds: ['record'],
    localRecordTypes: ['labware'],
    placeholder: 'Search labware...',
    label: 'Labware',
  },

  /**
   * Unit picker - ontology only (UO)
   */
  unit: {
    allowedKinds: ['ontology'],
    olsOntologies: ['uo'],
    placeholder: 'Search units...',
    label: 'Unit',
    domain: 'unit',
  },

  /**
   * Species picker - NCBI Taxonomy
   */
  species: {
    allowedKinds: ['ontology'],
    olsOntologies: ['ncbitaxon'],
    specialtyProviders: ['ncbi_taxon'],
    placeholder: 'Search species...',
    label: 'Species',
    domain: 'species',
  },

  /**
   * Protein picker - UniProt
   */
  protein: {
    allowedKinds: ['ontology'],
    specialtyProviders: ['uniprot'],
    placeholder: 'Search proteins...',
    label: 'Protein',
    domain: 'protein',
  },

  /**
   * Pathway picker - Reactome
   */
  pathway: {
    allowedKinds: ['ontology'],
    specialtyProviders: ['reactome'],
    placeholder: 'Search pathways...',
    label: 'Pathway',
    domain: 'pathway',
  },

  /**
   * Cellular component picker - GO
   */
  cellularComponent: {
    allowedKinds: ['ontology'],
    olsOntologies: ['go'],
    placeholder: 'Search cellular components...',
    label: 'Cellular Component',
    domain: 'cellularComponent',
  },

  /**
   * Experimental action picker - OBI
   */
  experimentalAction: {
    allowedKinds: ['ontology'],
    olsOntologies: ['obi'],
    placeholder: 'Search experimental actions...',
    label: 'Action',
    domain: 'experimentalAction',
  },

  /**
   * Disease picker - MONDO
   */
  disease: {
    allowedKinds: ['ontology'],
    olsOntologies: ['mondo'],
    placeholder: 'Search diseases...',
    label: 'Disease',
    domain: 'disease',
  },

  /**
   * Biological process picker - GO
   */
  biologicalProcess: {
    allowedKinds: ['ontology'],
    olsOntologies: ['go'],
    placeholder: 'Search biological processes...',
    label: 'Biological Process',
    domain: 'biologicalProcess',
  },

  /**
   * Generic ref picker - allows both record and ontology from any source
   */
  generic: {
    allowedKinds: ['record', 'ontology'],
    localRecordTypes: ['material', 'labware', 'study', 'protocol'],
    olsOntologies: ['chebi', 'cl', 'uberon', 'go', 'obi', 'uo'],
    placeholder: 'Search...',
    label: 'Reference',
  },
}

/**
 * Get a picker config by name, with optional overrides.
 */
export function getPickerConfig(
  name: keyof typeof DEFAULT_PICKER_CONFIGS,
  overrides?: Partial<RefPickerConfig>
): RefPickerConfig {
  const base = DEFAULT_PICKER_CONFIGS[name]
  if (!base) {
    throw new Error(`Unknown picker config: ${name}`)
  }
  
  if (!overrides) {
    return base
  }
  
  // Build result carefully to avoid undefined values on optional properties
  const result: RefPickerConfig = {
    allowedKinds: overrides.allowedKinds ?? base.allowedKinds,
  }
  
  // Copy non-array properties
  if (overrides.placeholder !== undefined) {
    result.placeholder = overrides.placeholder
  } else if (base.placeholder !== undefined) {
    result.placeholder = base.placeholder
  }
  
  if (overrides.label !== undefined) {
    result.label = overrides.label
  } else if (base.label !== undefined) {
    result.label = base.label
  }
  
  if (overrides.minQueryLength !== undefined) {
    result.minQueryLength = overrides.minQueryLength
  } else if (base.minQueryLength !== undefined) {
    result.minQueryLength = base.minQueryLength
  }
  
  if (overrides.debounceMs !== undefined) {
    result.debounceMs = overrides.debounceMs
  } else if (base.debounceMs !== undefined) {
    result.debounceMs = base.debounceMs
  }
  
  if (overrides.maxResults !== undefined) {
    result.maxResults = overrides.maxResults
  } else if (base.maxResults !== undefined) {
    result.maxResults = base.maxResults
  }
  
  if (overrides.allowPromoteToLocal !== undefined) {
    result.allowPromoteToLocal = overrides.allowPromoteToLocal
  } else if (base.allowPromoteToLocal !== undefined) {
    result.allowPromoteToLocal = base.allowPromoteToLocal
  }
  
  if (overrides.domain !== undefined) {
    result.domain = overrides.domain
  } else if (base.domain !== undefined) {
    result.domain = base.domain
  }
  
  // Copy array properties
  if (overrides.localRecordTypes !== undefined) {
    result.localRecordTypes = overrides.localRecordTypes
  } else if (base.localRecordTypes !== undefined) {
    result.localRecordTypes = base.localRecordTypes
  }
  
  if (overrides.olsOntologies !== undefined) {
    result.olsOntologies = overrides.olsOntologies
  } else if (base.olsOntologies !== undefined) {
    result.olsOntologies = base.olsOntologies
  }
  
  if (overrides.specialtyProviders !== undefined) {
    result.specialtyProviders = overrides.specialtyProviders
  } else if (base.specialtyProviders !== undefined) {
    result.specialtyProviders = base.specialtyProviders
  }
  
  return result
}

/**
 * Create a custom picker config.
 */
export function createPickerConfig(config: RefPickerConfig): RefPickerConfig {
  return {
    minQueryLength: 2,
    debounceMs: 300,
    maxResults: 10,
    ...config,
  }
}

/**
 * Check if a config allows local record search
 */
export function allowsLocalSearch(config: RefPickerConfig): boolean {
  return (
    config.allowedKinds.includes('record') &&
    (config.localRecordTypes?.length ?? 0) > 0
  )
}

/**
 * Check if a config allows OLS ontology search
 */
export function allowsOLSSearch(config: RefPickerConfig): boolean {
  return (
    config.allowedKinds.includes('ontology') &&
    (config.olsOntologies?.length ?? 0) > 0
  )
}

/**
 * Check if a config uses specialty providers
 */
export function hasSpecialtyProviders(config: RefPickerConfig): boolean {
  return (config.specialtyProviders?.length ?? 0) > 0
}
