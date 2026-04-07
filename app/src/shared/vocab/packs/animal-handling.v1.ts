/**
 * Animal Handling Vocabulary Pack v1
 * 
 * Operations for cell culture, animal studies, and biological specimens.
 * Includes seeding, passaging, feeding, and observation operations.
 */

import type { VocabPack, PrimitiveVerbDefinition, MacroVerbDefinition } from '../types'

// =============================================================================
// Primitive Verbs - Cell Culture
// =============================================================================

const seed: PrimitiveVerbDefinition = {
  verb: 'seed',
  displayName: 'Seed Cells',
  icon: '🌱',
  color: '#40c057',
  eventKind: 'primitive',
  
  requiresMaterial: true,
  requiresSourceTarget: false,
  affectsVolume: 'increase',
  
  requiredParams: [
    {
      name: 'cellCount',
      type: 'number',
      label: 'Cell Count',
      unit: 'cells',
      showInCompact: true,
    },
    {
      name: 'volume_uL',
      type: 'number',
      label: 'Volume',
      unit: 'µL',
      showInCompact: true,
    },
  ],
  optionalParams: [
    { name: 'cellLine', type: 'string', label: 'Cell Line' },
    { name: 'passage', type: 'number', label: 'Passage Number' },
    { name: 'density', type: 'number', label: 'Density', unit: 'cells/mL' },
    { name: 'viability', type: 'number', label: 'Viability', unit: '%' },
  ],
  
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000887',
    label: 'cell seeding',
    ontology: 'obi',
  },
}

const passage: PrimitiveVerbDefinition = {
  verb: 'passage',
  displayName: 'Passage',
  icon: '🔀',
  color: '#7950f2',
  eventKind: 'primitive',
  
  requiresMaterial: false,
  requiresSourceTarget: true,
  affectsVolume: 'none',
  
  requiredParams: [
    {
      name: 'splitRatio',
      type: 'string',
      label: 'Split Ratio',
      description: 'e.g., 1:3, 1:5, 1:10',
      showInCompact: true,
    },
  ],
  optionalParams: [
    { name: 'newPassageNumber', type: 'number', label: 'New Passage #' },
    { name: 'trypsinTime_min', type: 'number', label: 'Trypsin Time', unit: 'min' },
    { name: 'volume_uL', type: 'number', label: 'Volume per Well', unit: 'µL' },
  ],
  
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0002144',
    label: 'cell passaging',
    ontology: 'obi',
  },
}

const feed: PrimitiveVerbDefinition = {
  verb: 'feed',
  displayName: 'Feed/Media Change',
  icon: '🍽️',
  color: '#f59f00',
  eventKind: 'primitive',
  
  requiresMaterial: false,
  requiresSourceTarget: false,
  affectsVolume: 'none', // Aspirate old, add new
  
  requiredParams: [
    {
      name: 'volume_uL',
      type: 'number',
      label: 'New Volume',
      unit: 'µL',
      showInCompact: true,
    },
  ],
  optionalParams: [
    { name: 'media_ref', type: 'string', label: 'Media Type' },
    { name: 'fullChange', type: 'boolean', label: 'Full Media Change', defaultValue: true },
    { name: 'percentChange', type: 'number', label: 'Percent Change', unit: '%', description: 'For partial media change' },
  ],
  
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0001614',
    label: 'cell feeding',
    ontology: 'obi',
  },
}

const treat: PrimitiveVerbDefinition = {
  verb: 'treat',
  displayName: 'Treat',
  icon: '💊',
  color: '#e64980',
  eventKind: 'primitive',
  
  requiresMaterial: true,
  requiresSourceTarget: false,
  affectsVolume: 'increase',
  
  requiredParams: [
    {
      name: 'volume_uL',
      type: 'number',
      label: 'Volume',
      unit: 'µL',
      showInCompact: true,
    },
  ],
  optionalParams: [
    { name: 'compound_ref', type: 'string', label: 'Compound' },
    { name: 'concentration', type: 'number', label: 'Concentration' },
    { name: 'concentrationUnit', type: 'enum', label: 'Conc. Unit', enumOptions: ['nM', 'µM', 'mM', 'M', 'ng/mL', 'µg/mL', 'mg/mL'] },
    { name: 'treatmentDuration', type: 'duration', label: 'Duration' },
  ],
  
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000094',
    label: 'compound treatment',
    ontology: 'obi',
  },
}

const stimulate: PrimitiveVerbDefinition = {
  verb: 'stimulate',
  displayName: 'Stimulate',
  icon: '⚡',
  color: '#fab005',
  eventKind: 'primitive',
  
  requiresMaterial: false,
  requiresSourceTarget: false,
  affectsVolume: 'none',
  
  requiredParams: [],
  optionalParams: [
    { name: 'stimulus_ref', type: 'string', label: 'Stimulus', showInCompact: true },
    { name: 'intensity', type: 'number', label: 'Intensity' },
    { name: 'intensityUnit', type: 'string', label: 'Intensity Unit' },
    { name: 'duration', type: 'duration', label: 'Duration' },
  ],
  
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/GO_0051716',
    label: 'cellular response to stimulus',
    ontology: 'go',
  },
}

const observe: PrimitiveVerbDefinition = {
  verb: 'observe',
  displayName: 'Observe/Image',
  icon: '🔬',
  color: '#339af0',
  eventKind: 'primitive',
  
  requiresMaterial: false,
  requiresSourceTarget: false,
  affectsVolume: 'none',
  
  requiredParams: [],
  optionalParams: [
    { name: 'imagingMode', type: 'enum', label: 'Mode', enumOptions: ['brightfield', 'phase', 'fluorescence', 'confocal'], showInCompact: true },
    { name: 'magnification', type: 'enum', label: 'Magnification', enumOptions: ['4x', '10x', '20x', '40x', '60x', '100x'] },
    { name: 'channel', type: 'string', label: 'Channel/Filter' },
    { name: 'exposure_ms', type: 'number', label: 'Exposure', unit: 'ms' },
    { name: 'zStack', type: 'boolean', label: 'Z-Stack' },
  ],
  
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000070',
    label: 'microscopy imaging',
    ontology: 'obi',
  },
}

const lyse: PrimitiveVerbDefinition = {
  verb: 'lyse',
  displayName: 'Lyse',
  icon: '💥',
  color: '#fa5252',
  eventKind: 'primitive',
  
  requiresMaterial: true,
  requiresSourceTarget: false,
  affectsVolume: 'increase',
  
  requiredParams: [
    {
      name: 'volume_uL',
      type: 'number',
      label: 'Lysis Buffer Vol',
      unit: 'µL',
      showInCompact: true,
    },
  ],
  optionalParams: [
    { name: 'lysisBuffer_ref', type: 'string', label: 'Lysis Buffer' },
    { name: 'incubationTime_min', type: 'number', label: 'Incubation Time', unit: 'min' },
    { name: 'temperature_C', type: 'number', label: 'Temperature', unit: '°C' },
  ],
  
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000887',
    label: 'cell lysis',
    ontology: 'obi',
  },
}

const fix: PrimitiveVerbDefinition = {
  verb: 'fix',
  displayName: 'Fix',
  icon: '🧊',
  color: '#15aabf',
  eventKind: 'primitive',
  
  requiresMaterial: true,
  requiresSourceTarget: false,
  affectsVolume: 'increase',
  
  requiredParams: [],
  optionalParams: [
    { name: 'fixative_ref', type: 'string', label: 'Fixative', showInCompact: true },
    { name: 'volume_uL', type: 'number', label: 'Volume', unit: 'µL' },
    { name: 'fixationTime_min', type: 'number', label: 'Fix Time', unit: 'min' },
    { name: 'temperature_C', type: 'number', label: 'Temperature', unit: '°C' },
  ],
  
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000887',
    label: 'fixation',
    ontology: 'obi',
  },
}

const stain: PrimitiveVerbDefinition = {
  verb: 'stain',
  displayName: 'Stain',
  icon: '🎨',
  color: '#be4bdb',
  eventKind: 'primitive',
  
  requiresMaterial: true,
  requiresSourceTarget: false,
  affectsVolume: 'increase',
  
  requiredParams: [],
  optionalParams: [
    { name: 'stain_ref', type: 'string', label: 'Stain', showInCompact: true },
    { name: 'dilution', type: 'string', label: 'Dilution', description: 'e.g., 1:500, 1:1000' },
    { name: 'volume_uL', type: 'number', label: 'Volume', unit: 'µL' },
    { name: 'incubationTime_min', type: 'number', label: 'Incubation', unit: 'min' },
    { name: 'temperature_C', type: 'number', label: 'Temperature', unit: '°C' },
  ],
  
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000887',
    label: 'staining',
    ontology: 'obi',
  },
}

// =============================================================================
// Macro Verbs
// =============================================================================

const doseResponse: MacroVerbDefinition = {
  verb: 'dose_response',
  displayName: 'Dose Response',
  icon: '📈',
  color: '#7950f2',
  eventKind: 'macro',
  
  requiresMaterial: true,
  requiresSourceTarget: false,
  affectsVolume: 'increase',
  
  macroParamsSchema: [
    {
      name: 'pathSpec',
      type: 'object',
      label: 'Dilution Path',
      description: 'Direction and extent of dose titration',
    },
    {
      name: 'topConcentration',
      type: 'number',
      label: 'Top Concentration',
      showInCompact: true,
    },
    {
      name: 'concentrationUnit',
      type: 'enum',
      label: 'Unit',
      enumOptions: ['nM', 'µM', 'mM', 'ng/mL', 'µg/mL'],
      defaultValue: 'µM',
    },
    {
      name: 'dilutionFactor',
      type: 'number',
      label: 'Dilution Factor',
      defaultValue: 3,
      description: 'e.g., 3 for 3-fold dilutions',
    },
    {
      name: 'volume_uL',
      type: 'number',
      label: 'Final Volume',
      unit: 'µL',
    },
  ],
  
  expanderFn: 'expanders/doseResponse',
  expandsTo: ['treat'],
  
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000887',
    label: 'dose-response assay',
    ontology: 'obi',
  },
}

const immunostaining: MacroVerbDefinition = {
  verb: 'immunostaining',
  displayName: 'Immunostaining',
  icon: '🔬',
  color: '#be4bdb',
  eventKind: 'macro',
  
  requiresMaterial: true,
  requiresSourceTarget: false,
  affectsVolume: 'none',
  
  macroParamsSchema: [
    {
      name: 'primaryAntibody_ref',
      type: 'string',
      label: 'Primary Antibody',
      showInCompact: true,
    },
    {
      name: 'primaryDilution',
      type: 'string',
      label: 'Primary Dilution',
      description: 'e.g., 1:500',
    },
    {
      name: 'secondaryAntibody_ref',
      type: 'string',
      label: 'Secondary Antibody',
    },
    {
      name: 'secondaryDilution',
      type: 'string',
      label: 'Secondary Dilution',
    },
    {
      name: 'primaryIncubation_h',
      type: 'number',
      label: 'Primary Incubation',
      unit: 'hours',
      defaultValue: 1,
    },
    {
      name: 'secondaryIncubation_min',
      type: 'number',
      label: 'Secondary Incubation',
      unit: 'min',
      defaultValue: 60,
    },
    {
      name: 'washCycles',
      type: 'number',
      label: 'Wash Cycles',
      defaultValue: 3,
    },
  ],
  
  expanderFn: 'expanders/immunostaining',
  expandsTo: ['wash', 'stain', 'incubate'],
  
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000887',
    label: 'immunofluorescence staining',
    ontology: 'obi',
  },
}

const transfection: MacroVerbDefinition = {
  verb: 'transfection',
  displayName: 'Transfection',
  icon: '🧬',
  color: '#12b886',
  eventKind: 'macro',
  
  requiresMaterial: true,
  requiresSourceTarget: false,
  affectsVolume: 'increase',
  
  macroParamsSchema: [
    {
      name: 'nucleicAcid_ref',
      type: 'string',
      label: 'DNA/RNA',
      showInCompact: true,
    },
    {
      name: 'nucleicAcid_ng',
      type: 'number',
      label: 'Amount',
      unit: 'ng',
    },
    {
      name: 'reagent_ref',
      type: 'string',
      label: 'Transfection Reagent',
    },
    {
      name: 'reagent_uL',
      type: 'number',
      label: 'Reagent Volume',
      unit: 'µL',
    },
    {
      name: 'complexTime_min',
      type: 'number',
      label: 'Complexing Time',
      unit: 'min',
      defaultValue: 20,
    },
    {
      name: 'mediaChange_h',
      type: 'number',
      label: 'Media Change After',
      unit: 'hours',
      description: 'Hours after transfection to change media',
    },
  ],
  
  expanderFn: 'expanders/transfection',
  expandsTo: ['add_material', 'incubate', 'feed'],
  
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000887',
    label: 'transfection',
    ontology: 'obi',
  },
}

// =============================================================================
// Pack Definition
// =============================================================================

export const animalHandlingV1: VocabPack = {
  packId: 'animal-handling/v1',
  version: '1.0.0',
  displayName: 'Cell/Animal Handling',
  description: 'Cell culture, animal studies, and biological specimen operations',
  
  compatibleAddressing: ['grid', 'linear', 'single'],
  compatibleToolTypes: ['pipette_*', 'microscope', 'incubator', 'cell_counter'],
  defaultRenderStyle: 'wells',
  
  ontologyMappings: {
    processOntology: 'obi',
    instrumentOntology: 'obi',
    additionalOntologies: ['cl', 'uberon', 'go'],
  },
  
  verbs: [
    // Primitives
    seed,
    passage,
    feed,
    treat,
    stimulate,
    observe,
    lyse,
    fix,
    stain,
    // Macros
    doseResponse,
    immunostaining,
    transfection,
  ],
}
