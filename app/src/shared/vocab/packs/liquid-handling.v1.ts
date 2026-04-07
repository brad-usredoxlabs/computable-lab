/**
 * Liquid Handling Vocabulary Pack v1
 * 
 * Standard liquid handling operations for microplates and reservoirs.
 * Includes primitive operations and macro compound operations.
 */

import type { VocabPack, PrimitiveVerbDefinition, MacroVerbDefinition } from '../types'

// =============================================================================
// Primitive Verbs
// =============================================================================

const aspirate: PrimitiveVerbDefinition = {
  verb: 'aspirate',
  displayName: 'Aspirate',
  icon: '⬆️',
  color: '#339af0',
  eventKind: 'primitive',
  
  requiresMaterial: false,
  requiresSourceTarget: false,
  affectsVolume: 'decrease',
  
  requiredParams: [
    {
      name: 'volume_uL',
      type: 'number',
      label: 'Volume',
      unit: 'µL',
      min: 0,
      showInCompact: true,
    },
  ],
  optionalParams: [
    { name: 'rate_uL_s', type: 'number', label: 'Rate', unit: 'µL/s' },
    { name: 'height_mm', type: 'number', label: 'Height', unit: 'mm', description: 'Aspiration height from bottom' },
  ],
  
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000920',
    label: 'fluid aspiration',
    ontology: 'obi',
  },
}

const dispense: PrimitiveVerbDefinition = {
  verb: 'dispense',
  displayName: 'Dispense',
  icon: '⬇️',
  color: '#339af0',
  eventKind: 'primitive',
  
  requiresMaterial: false,
  requiresSourceTarget: false,
  affectsVolume: 'increase',
  
  requiredParams: [
    {
      name: 'volume_uL',
      type: 'number',
      label: 'Volume',
      unit: 'µL',
      min: 0,
      showInCompact: true,
    },
  ],
  optionalParams: [
    { name: 'rate_uL_s', type: 'number', label: 'Rate', unit: 'µL/s' },
    { name: 'height_mm', type: 'number', label: 'Height', unit: 'mm' },
  ],
  
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000921',
    label: 'fluid dispensing',
    ontology: 'obi',
  },
}

const transfer: PrimitiveVerbDefinition = {
  verb: 'transfer',
  displayName: 'Transfer',
  icon: '↔️',
  color: '#be4bdb',
  eventKind: 'primitive',
  
  requiresMaterial: false,
  requiresSourceTarget: true,
  affectsVolume: 'none', // Decreases source, increases dest
  
  requiredParams: [
    {
      name: 'volume_uL',
      type: 'number',
      label: 'Volume',
      unit: 'µL',
      min: 0,
      showInCompact: true,
    },
  ],
  optionalParams: [
    { name: 'mixAfter', type: 'boolean', label: 'Mix After Transfer' },
    { name: 'mixCycles', type: 'number', label: 'Mix Cycles', defaultValue: 3 },
    { name: 'dead_volume_uL', type: 'number', label: 'Dead Volume', unit: 'µL', description: 'Extra volume aspirated and discarded per aspiration' },
  ],
  
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0600036',
    label: 'material transfer',
    ontology: 'obi',
  },
}

/**
 * Multi-dispense: Single aspiration, multiple dispenses
 * 
 * Different from Transfer:
 * - Transfer (1 source → N dests): Aspirates once per dest. Source loses (volume + dead) × N.
 * - Multi-dispense: Aspirates once, dispenses N times. Source loses (volume × N) + dead.
 * 
 * Use for repeat dispense operations with an 8-channel pipette.
 */
const multiDispense: PrimitiveVerbDefinition = {
  verb: 'multi_dispense',
  displayName: 'Multi-Dispense',
  icon: '⬇️⬇️',
  color: '#7950f2',
  eventKind: 'primitive',
  
  requiresMaterial: false,
  requiresSourceTarget: true,
  affectsVolume: 'none', // Decreases source, increases dest
  
  requiredParams: [
    {
      name: 'volume_uL',
      type: 'number',
      label: 'Volume per Dispense',
      unit: 'µL',
      min: 0,
      showInCompact: true,
    },
  ],
  optionalParams: [
    { name: 'dead_volume_uL', type: 'number', label: 'Dead Volume', unit: 'µL', description: 'Extra volume aspirated (once per aspiration)' },
    { name: 'mixAfter', type: 'boolean', label: 'Mix After' },
  ],
  
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000921',
    label: 'fluid dispensing',
    ontology: 'obi',
  },
}

const addMaterial: PrimitiveVerbDefinition = {
  verb: 'add_material',
  displayName: 'Add Material',
  icon: '💧',
  color: '#339af0',
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
      min: 0,
      showInCompact: true,
    },
  ],
  optionalParams: [
    { name: 'concentration', type: 'number', label: 'Concentration' },
    { name: 'concentrationUnit', type: 'enum', label: 'Conc. Unit', enumOptions: ['µM', 'mM', 'M', 'ng/µL', 'µg/µL', 'mg/mL', '%'] },
  ],
  
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000094',
    label: 'material addition',
    ontology: 'obi',
  },
}

const mix: PrimitiveVerbDefinition = {
  verb: 'mix',
  displayName: 'Mix',
  icon: '🔄',
  color: '#20c997',
  eventKind: 'primitive',
  
  requiresMaterial: false,
  requiresSourceTarget: false,
  affectsVolume: 'none',
  
  requiredParams: [],
  optionalParams: [
    { name: 'cycles', type: 'number', label: 'Cycles', defaultValue: 3, showInCompact: true },
    { name: 'volume_uL', type: 'number', label: 'Mix Volume', unit: 'µL' },
    { name: 'speed', type: 'enum', label: 'Speed', enumOptions: ['slow', 'medium', 'fast'] },
  ],
  
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000920',
    label: 'mixing',
    ontology: 'obi',
  },
}

const wash: PrimitiveVerbDefinition = {
  verb: 'wash',
  displayName: 'Wash',
  icon: '🚿',
  color: '#74c0fc',
  eventKind: 'primitive',
  
  requiresMaterial: false,
  requiresSourceTarget: false,
  affectsVolume: 'none', // Aspirates then dispenses
  
  requiredParams: [],
  optionalParams: [
    { name: 'buffer_ref', type: 'string', label: 'Buffer' },
    { name: 'volume_uL', type: 'number', label: 'Volume', unit: 'µL', showInCompact: true },
    { name: 'cycles', type: 'number', label: 'Cycles', defaultValue: 1 },
    { name: 'aspirate_height_mm', type: 'number', label: 'Aspirate Height', unit: 'mm' },
  ],
  
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0302888',
    label: 'washing',
    ontology: 'obi',
  },
}

const incubate: PrimitiveVerbDefinition = {
  verb: 'incubate',
  displayName: 'Incubate',
  icon: '🌡️',
  color: '#f59f00',
  eventKind: 'primitive',
  
  requiresMaterial: false,
  requiresSourceTarget: false,
  affectsVolume: 'none',
  
  requiredParams: [],
  optionalParams: [
    { name: 'duration', type: 'duration', label: 'Duration', showInCompact: true },
    { name: 'temperature_C', type: 'number', label: 'Temperature', unit: '°C' },
    { name: 'shaking', type: 'boolean', label: 'Shaking' },
    { name: 'shaking_rpm', type: 'number', label: 'Shaking Speed', unit: 'rpm' },
  ],
  
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0600027',
    label: 'incubation',
    ontology: 'obi',
  },
}

const read: PrimitiveVerbDefinition = {
  verb: 'read',
  displayName: 'Read',
  icon: '📊',
  color: '#ff6b6b',
  eventKind: 'primitive',
  
  requiresMaterial: false,
  requiresSourceTarget: false,
  affectsVolume: 'none',
  
  requiredParams: [],
  optionalParams: [
    { name: 'assay_ref', type: 'string', label: 'Assay' },
    { name: 'instrument', type: 'string', label: 'Instrument' },
    { name: 'wavelength_nm', type: 'number', label: 'Wavelength', unit: 'nm' },
    { name: 'readMode', type: 'enum', label: 'Read Mode', enumOptions: ['absorbance', 'fluorescence', 'luminescence'] },
  ],
  
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000070',
    label: 'assay',
    ontology: 'obi',
  },
}

const harvest: PrimitiveVerbDefinition = {
  verb: 'harvest',
  displayName: 'Harvest',
  icon: '🧪',
  color: '#40c057',
  eventKind: 'primitive',
  
  requiresMaterial: false,
  requiresSourceTarget: false,
  affectsVolume: 'decrease',
  
  requiredParams: [],
  optionalParams: [
    { name: 'method', type: 'string', label: 'Method' },
    { name: 'destination', type: 'string', label: 'Destination' },
    { name: 'volume_uL', type: 'number', label: 'Volume', unit: 'µL' },
  ],
  
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000659',
    label: 'specimen collection',
    ontology: 'obi',
  },
}

// =============================================================================
// Macro Verbs
// =============================================================================

const serialDilution: MacroVerbDefinition = {
  verb: 'serial_dilution',
  displayName: 'Serial Dilution',
  icon: '📉',
  color: '#7950f2',
  eventKind: 'macro',
  
  requiresMaterial: false,
  requiresSourceTarget: false, // Path is defined in macroParams
  affectsVolume: 'none', // Complex - handled by expansion
  
  macroParamsSchema: [
    {
      name: 'mode',
      type: 'enum',
      label: 'Mode',
      enumOptions: ['in_place', 'source_to_target', 'prepare_then_transfer'],
      defaultValue: 'in_place',
    },
    {
      name: 'lanes',
      type: 'object',
      label: 'Lane Paths',
      description: 'Explicit dilution lanes with start wells and ordered well paths',
    },
    {
      name: 'dilution',
      type: 'object',
      label: 'Dilution Parameters',
      description: 'Fold dilution, retained volume, transfer volume, and resolved prefill volumes',
    },
    {
      name: 'diluent',
      type: 'object',
      label: 'Diluent',
      description: 'Diluent material or source wells used to prefill dilution wells',
    },
    {
      name: 'preparation',
      type: 'object',
      label: 'Preparation',
      description: 'Whether top-well setup and receiving-well prefills are generated or external',
    },
    {
      name: 'solventPolicy',
      type: 'object',
      label: 'Solvent Policy',
      description: 'Optional matched-vehicle policy and target solvent components',
    },
    {
      name: 'mix.cycles',
      type: 'number',
      label: 'Mix Cycles',
      defaultValue: 3,
    },
    {
      name: 'mix.volume_uL',
      type: 'number',
      label: 'Mix Volume',
      unit: 'µL',
      showInCompact: true,
    },
    {
      name: 'tipPolicy',
      type: 'enum',
      label: 'Tip Policy',
      enumOptions: ['reuse', 'change_each_step', 'change_each_row'],
      defaultValue: 'reuse',
    },
    {
      name: 'endPolicy',
      type: 'enum',
      label: 'End Policy',
      enumOptions: ['keep_last', 'discard_excess', 'transfer_all_no_discard'],
      defaultValue: 'keep_last',
    },
  ],
  
  expanderFn: 'expanders/serialDilution',
  expandsTo: ['transfer', 'mix'],
  
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0000921',
    label: 'serial dilution',
    ontology: 'obi',
  },
}

const plateCopy: MacroVerbDefinition = {
  verb: 'plate_copy',
  displayName: 'Plate Copy',
  icon: '📋',
  color: '#be4bdb',
  eventKind: 'macro',
  
  requiresMaterial: false,
  requiresSourceTarget: true,
  affectsVolume: 'none',
  
  macroParamsSchema: [
    {
      name: 'volume_uL',
      type: 'number',
      label: 'Volume per Well',
      unit: 'µL',
      min: 0,
      showInCompact: true,
    },
    {
      name: 'wells',
      type: 'object',
      label: 'Wells to Copy',
      description: 'Source wells to replicate',
    },
    {
      name: 'mapping',
      type: 'enum',
      label: 'Mapping',
      enumOptions: ['1:1', 'column', 'row', 'quadrant'],
      defaultValue: '1:1',
    },
  ],
  
  expanderFn: 'expanders/plateCopy',
  expandsTo: ['transfer'],
  
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0600036',
    label: 'plate replication',
    ontology: 'obi',
  },
}

const washCycle: MacroVerbDefinition = {
  verb: 'wash_cycle',
  displayName: 'Wash Cycle',
  icon: '🚿',
  color: '#74c0fc',
  eventKind: 'macro',
  
  requiresMaterial: false,
  requiresSourceTarget: false,
  affectsVolume: 'none',
  
  macroParamsSchema: [
    {
      name: 'cycles',
      type: 'number',
      label: 'Cycles',
      defaultValue: 3,
      min: 1,
      showInCompact: true,
    },
    {
      name: 'washVolume_uL',
      type: 'number',
      label: 'Wash Volume',
      unit: 'µL',
    },
    {
      name: 'aspirateVolume_uL',
      type: 'number',
      label: 'Aspirate Volume',
      unit: 'µL',
      description: 'Volume to aspirate (can be more than wash volume)',
    },
    {
      name: 'soakTime_s',
      type: 'number',
      label: 'Soak Time',
      unit: 's',
      defaultValue: 0,
    },
    {
      name: 'buffer_ref',
      type: 'string',
      label: 'Buffer',
    },
  ],
  
  expanderFn: 'expanders/washCycle',
  expandsTo: ['aspirate', 'dispense'],
  
  ontologyTerm: {
    iri: 'http://purl.obolibrary.org/obo/OBI_0302888',
    label: 'plate washing',
    ontology: 'obi',
  },
}

// =============================================================================
// Pack Definition
// =============================================================================

export const liquidHandlingV1: VocabPack = {
  packId: 'liquid-handling/v1',
  version: '1.0.0',
  displayName: 'Liquid Handling',
  description: 'Standard liquid handling operations for microplates and reservoirs',
  
  compatibleAddressing: ['grid', 'linear', 'single'],
  compatibleToolTypes: ['pipette_*', 'plate_washer', 'dispenser', 'plate_reader'],
  defaultRenderStyle: 'wells',
  
  ontologyMappings: {
    processOntology: 'obi',
    instrumentOntology: 'obi',
    additionalOntologies: ['edam', 'bao'],
  },
  
  verbs: [
    // Primitives
    aspirate,
    dispense,
    transfer,
    multiDispense,
    addMaterial,
    mix,
    wash,
    incubate,
    read,
    harvest,
    // Macros
    serialDilution,
    plateCopy,
    washCycle,
  ],
}
