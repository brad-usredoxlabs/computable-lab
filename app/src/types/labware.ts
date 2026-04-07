/**
 * Labware types and configurations.
 * Supports multiple labware types: plates, reservoirs, tubes, etc.
 */

import type { WellId } from './plate'
import {
  buildAddressingFromDefinition,
  getDefinitionAllowedOrientations,
  getDefinitionDefaultOrientation,
  getLabwareDefinitionById,
  getLabwareDefinitionByLegacyType,
  validateLabwareDefinition,
  type LabwareDefinition,
} from './labwareDefinition'

/**
 * Labware type discriminator
 */
export type LabwareType =
  | 'plate_96'
  | 'plate_384'
  | 'reservoir_12'
  | 'reservoir_8'
  | 'reservoir_1'
  | 'tube'
  | 'tubeset_24'
  | 'deepwell_96'
  | 'tiprack_ot2_20'
  | 'tiprack_ot2_200'
  | 'tiprack_ot2_300'
  | 'tiprack_ot2_1000'
  | 'tiprack_flex_50'
  | 'tiprack_flex_200'
  | 'tiprack_flex_1000'
  | 'tiprack_assist_12_5_384'
  | 'tiprack_assist_125_384'
  | 'tiprack_assist_300'
  | 'tiprack_assist_1250'

/**
 * Labware type display names
 */
export const LABWARE_TYPE_LABELS: Record<LabwareType, string> = {
  plate_96: '96-Well Plate (200 µL)',
  plate_384: '384-Well Plate (112 µL)',
  reservoir_12: '12-Channel Reservoir',
  reservoir_8: '8-Channel Reservoir',
  reservoir_1: 'Single Reservoir',
  tube: 'Single Tube',
  tubeset_24: '24-Tube Rack',
  deepwell_96: '96-Well Deep Well (2 mL)',
  tiprack_ot2_20: 'OT-2 Tip Rack 20 uL',
  tiprack_ot2_200: 'OT-2 Tip Rack 200 uL',
  tiprack_ot2_300: 'OT-2 Tip Rack 300 uL',
  tiprack_ot2_1000: 'OT-2 Tip Rack 1000 uL',
  tiprack_flex_50: 'Flex Tip Rack 50 uL',
  tiprack_flex_200: 'Flex Tip Rack 200 uL',
  tiprack_flex_1000: 'Flex Tip Rack 1000 uL',
  tiprack_assist_12_5_384: 'Assist Tip Rack 12.5 uL (384)',
  tiprack_assist_125_384: 'Assist Tip Rack 125 uL (384)',
  tiprack_assist_300: 'Assist Tip Rack 300 uL (96)',
  tiprack_assist_1250: 'Assist Tip Rack 1250 uL (96)',
}

/**
 * Labware type icons
 */
export const LABWARE_TYPE_ICONS: Record<LabwareType, string> = {
  plate_96: '🔬',
  plate_384: '🔬',
  reservoir_12: '📦',
  reservoir_8: '📦',
  reservoir_1: '🧴',
  tube: '🧪',
  tubeset_24: '🧪',
  deepwell_96: '🔬',
  tiprack_ot2_20: '🪡',
  tiprack_ot2_200: '🪡',
  tiprack_ot2_300: '🪡',
  tiprack_ot2_1000: '🪡',
  tiprack_flex_50: '🪡',
  tiprack_flex_200: '🪡',
  tiprack_flex_1000: '🪡',
  tiprack_assist_12_5_384: '🪡',
  tiprack_assist_125_384: '🪡',
  tiprack_assist_300: '🪡',
  tiprack_assist_1250: '🪡',
}

/**
 * Labware category for grouping in UI
 */
export type LabwareCategory = 'plate' | 'reservoir' | 'tube' | 'tiprack'

export const LABWARE_CATEGORIES: Record<LabwareType, LabwareCategory> = {
  plate_96: 'plate',
  plate_384: 'plate',
  reservoir_12: 'reservoir',
  reservoir_8: 'reservoir',
  reservoir_1: 'reservoir',
  tube: 'tube',
  tubeset_24: 'tube',
  deepwell_96: 'plate',
  tiprack_ot2_20: 'tiprack',
  tiprack_ot2_200: 'tiprack',
  tiprack_ot2_300: 'tiprack',
  tiprack_ot2_1000: 'tiprack',
  tiprack_flex_50: 'tiprack',
  tiprack_flex_200: 'tiprack',
  tiprack_flex_1000: 'tiprack',
  tiprack_assist_12_5_384: 'tiprack',
  tiprack_assist_125_384: 'tiprack',
  tiprack_assist_300: 'tiprack',
  tiprack_assist_1250: 'tiprack',
}

/**
 * Addressing scheme for labware locations
 */
export interface AddressingScheme {
  /** Type of addressing */
  type: 'grid' | 'linear' | 'single'
  /** Number of rows (for grid) */
  rows?: number
  /** Number of columns (for grid) */
  columns?: number
  /** Row labels (e.g., ['A', 'B', 'C', ...]) */
  rowLabels?: string[]
  /** Column labels (e.g., ['1', '2', '3', ...]) */
  columnLabels?: string[]
  /** Linear labels for reservoirs/tubes (e.g., ['1', '2', ...]) */
  linearLabels?: string[]
}

/**
 * Labware geometry for volume calculations
 */
export interface LabwareGeometry {
  /** Maximum volume per well/slot in µL */
  maxVolume_uL: number
  /** Minimum recommended volume in µL */
  minVolume_uL: number
  /** Well shape (optional for visualization) */
  wellShape?: 'round' | 'square' | 'v-bottom'
  /** Well diameter in mm (optional) */
  wellDiameter_mm?: number
}

/**
 * Labware instance - a specific labware in an experiment
 */
export interface Labware {
  /** Unique identifier for this labware instance */
  labwareId: string
  /** Type of labware */
  labwareType: LabwareType
  /** User-friendly name (e.g., "Source Plate", "Cell Plate 1") */
  name: string
  /** How wells/slots are addressed */
  addressing: AddressingScheme
  /** Physical geometry */
  geometry: LabwareGeometry
  /** Canonical layout family (geometry semantics) */
  layoutFamily?: 'sbs_plate' | 'hamilton_strip_carrier' | 'reservoir' | 'tube'
  /** Canonical center-to-center pitch in mm (grid labware) */
  wellPitch_mm?: number
  /** Orientation behavior policy for view transforms */
  orientationPolicy?: 'rotatable' | 'fixed_columns'
  /** Optional color for visualization */
  color?: string
  /** Canonical labware definition id (new pipeline) */
  definitionId?: string
  /** Definition binding state */
  definitionSource?: 'registry' | 'legacy_fallback' | 'unmapped'
  /** Optional platform alias that generated this instance */
  platformAlias?: string
  /** Visual render profile from definition */
  renderProfile?: 'plate' | 'tiprack' | 'reservoir' | 'tubeset' | 'tube'
  /** Linear well style hint from definition */
  linearWellStyle?: 'trough' | 'channels'
  /** Canonical linear axis in landscape orientation */
  linearAxis?: 'x' | 'y'
  /** Definition validation/derivation warnings */
  definitionWarnings?: string[]
  /** Optional notes */
  notes?: string
}

/**
 * Standard labware configurations
 */
export const LABWARE_CONFIGS: Record<LabwareType, Omit<Labware, 'labwareId' | 'name' | 'notes'>> = {
  plate_96: {
    labwareType: 'plate_96',
    addressing: {
      type: 'grid',
      rows: 8,
      columns: 12,
      rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      columnLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    },
    geometry: {
      maxVolume_uL: 300,
      minVolume_uL: 10,
      wellShape: 'round',
    },
    layoutFamily: 'sbs_plate',
    wellPitch_mm: 9,
    orientationPolicy: 'rotatable',
    color: '#339af0',
  },
  plate_384: {
    labwareType: 'plate_384',
    addressing: {
      type: 'grid',
      rows: 16,
      columns: 24,
      rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'],
      columnLabels: Array.from({ length: 24 }, (_, i) => String(i + 1)),
    },
    geometry: {
      maxVolume_uL: 120,
      minVolume_uL: 5,
      wellShape: 'square',
    },
    layoutFamily: 'sbs_plate',
    wellPitch_mm: 4.5,
    orientationPolicy: 'rotatable',
    color: '#7950f2',
  },
  reservoir_12: {
    labwareType: 'reservoir_12',
    addressing: {
      type: 'linear',
      linearLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    },
    geometry: {
      maxVolume_uL: 20000,
      minVolume_uL: 1000,
      wellShape: 'v-bottom',
    },
    layoutFamily: 'reservoir',
    orientationPolicy: 'fixed_columns',
    color: '#20c997',
  },
  reservoir_8: {
    labwareType: 'reservoir_8',
    addressing: {
      type: 'linear',
      linearLabels: ['1', '2', '3', '4', '5', '6', '7', '8'],
    },
    geometry: {
      maxVolume_uL: 30000,
      minVolume_uL: 1000,
      wellShape: 'v-bottom',
    },
    layoutFamily: 'reservoir',
    orientationPolicy: 'fixed_columns',
    color: '#12b886',
  },
  reservoir_1: {
    labwareType: 'reservoir_1',
    addressing: {
      type: 'single',
    },
    geometry: {
      maxVolume_uL: 300000,
      minVolume_uL: 5000,
      wellShape: 'square',
    },
    layoutFamily: 'reservoir',
    orientationPolicy: 'fixed_columns',
    color: '#099268',
  },
  tube: {
    labwareType: 'tube',
    addressing: {
      type: 'single',
    },
    geometry: {
      maxVolume_uL: 50000,
      minVolume_uL: 100,
      wellShape: 'v-bottom',
    },
    layoutFamily: 'tube',
    orientationPolicy: 'fixed_columns',
    color: '#f59f00',
  },
  tubeset_24: {
    labwareType: 'tubeset_24',
    addressing: {
      type: 'grid',
      rows: 4,
      columns: 6,
      rowLabels: ['A', 'B', 'C', 'D'],
      columnLabels: ['1', '2', '3', '4', '5', '6'],
    },
    geometry: {
      maxVolume_uL: 1500,
      minVolume_uL: 50,
      wellShape: 'round',
    },
    layoutFamily: 'tube',
    wellPitch_mm: 13.5,
    orientationPolicy: 'rotatable',
    color: '#fd7e14',
  },
  deepwell_96: {
    labwareType: 'deepwell_96',
    addressing: {
      type: 'grid',
      rows: 8,
      columns: 12,
      rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      columnLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    },
    geometry: {
      maxVolume_uL: 2000,
      minVolume_uL: 100,
      wellShape: 'square',
    },
    layoutFamily: 'sbs_plate',
    wellPitch_mm: 9,
    orientationPolicy: 'rotatable',
    color: '#845ef7',
  },
  tiprack_ot2_20: {
    labwareType: 'tiprack_ot2_20',
    addressing: {
      type: 'grid',
      rows: 8,
      columns: 12,
      rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      columnLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    },
    geometry: { maxVolume_uL: 20, minVolume_uL: 1, wellShape: 'round' },
    layoutFamily: 'sbs_plate',
    wellPitch_mm: 9,
    orientationPolicy: 'fixed_columns',
    color: '#0f766e',
  },
  tiprack_ot2_200: {
    labwareType: 'tiprack_ot2_200',
    addressing: {
      type: 'grid',
      rows: 8,
      columns: 12,
      rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      columnLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    },
    geometry: { maxVolume_uL: 200, minVolume_uL: 1, wellShape: 'round' },
    layoutFamily: 'sbs_plate',
    wellPitch_mm: 9,
    orientationPolicy: 'fixed_columns',
    color: '#0f766e',
  },
  tiprack_ot2_300: {
    labwareType: 'tiprack_ot2_300',
    addressing: {
      type: 'grid',
      rows: 8,
      columns: 12,
      rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      columnLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    },
    geometry: { maxVolume_uL: 300, minVolume_uL: 1, wellShape: 'round' },
    layoutFamily: 'sbs_plate',
    wellPitch_mm: 9,
    orientationPolicy: 'fixed_columns',
    color: '#0f766e',
  },
  tiprack_ot2_1000: {
    labwareType: 'tiprack_ot2_1000',
    addressing: {
      type: 'grid',
      rows: 8,
      columns: 12,
      rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      columnLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    },
    geometry: { maxVolume_uL: 1000, minVolume_uL: 1, wellShape: 'round' },
    layoutFamily: 'sbs_plate',
    wellPitch_mm: 9,
    orientationPolicy: 'fixed_columns',
    color: '#0f766e',
  },
  tiprack_flex_50: {
    labwareType: 'tiprack_flex_50',
    addressing: {
      type: 'grid',
      rows: 8,
      columns: 12,
      rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      columnLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    },
    geometry: { maxVolume_uL: 50, minVolume_uL: 1, wellShape: 'round' },
    layoutFamily: 'sbs_plate',
    wellPitch_mm: 9,
    orientationPolicy: 'fixed_columns',
    color: '#0369a1',
  },
  tiprack_flex_200: {
    labwareType: 'tiprack_flex_200',
    addressing: {
      type: 'grid',
      rows: 8,
      columns: 12,
      rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      columnLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    },
    geometry: { maxVolume_uL: 200, minVolume_uL: 1, wellShape: 'round' },
    layoutFamily: 'sbs_plate',
    wellPitch_mm: 9,
    orientationPolicy: 'fixed_columns',
    color: '#0369a1',
  },
  tiprack_flex_1000: {
    labwareType: 'tiprack_flex_1000',
    addressing: {
      type: 'grid',
      rows: 8,
      columns: 12,
      rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      columnLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    },
    geometry: { maxVolume_uL: 1000, minVolume_uL: 1, wellShape: 'round' },
    layoutFamily: 'sbs_plate',
    wellPitch_mm: 9,
    orientationPolicy: 'fixed_columns',
    color: '#0369a1',
  },
  tiprack_assist_12_5_384: {
    labwareType: 'tiprack_assist_12_5_384',
    addressing: {
      type: 'grid',
      rows: 16,
      columns: 24,
      rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'],
      columnLabels: Array.from({ length: 24 }, (_, i) => String(i + 1)),
    },
    geometry: { maxVolume_uL: 12.5, minVolume_uL: 1, wellShape: 'round' },
    layoutFamily: 'sbs_plate',
    wellPitch_mm: 4.5,
    orientationPolicy: 'rotatable',
    color: '#7c3aed',
  },
  tiprack_assist_125_384: {
    labwareType: 'tiprack_assist_125_384',
    addressing: {
      type: 'grid',
      rows: 16,
      columns: 24,
      rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'],
      columnLabels: Array.from({ length: 24 }, (_, i) => String(i + 1)),
    },
    geometry: { maxVolume_uL: 125, minVolume_uL: 1, wellShape: 'square' },
    layoutFamily: 'sbs_plate',
    wellPitch_mm: 4.5,
    orientationPolicy: 'rotatable',
    color: '#7c3aed',
  },
  tiprack_assist_300: {
    labwareType: 'tiprack_assist_300',
    addressing: {
      type: 'grid',
      rows: 8,
      columns: 12,
      rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      columnLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    },
    geometry: { maxVolume_uL: 300, minVolume_uL: 1, wellShape: 'round' },
    layoutFamily: 'sbs_plate',
    wellPitch_mm: 9,
    orientationPolicy: 'rotatable',
    color: '#7c3aed',
  },
  tiprack_assist_1250: {
    labwareType: 'tiprack_assist_1250',
    addressing: {
      type: 'grid',
      rows: 8,
      columns: 12,
      rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      columnLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    },
    geometry: { maxVolume_uL: 1250, minVolume_uL: 1, wellShape: 'round' },
    layoutFamily: 'sbs_plate',
    wellPitch_mm: 9,
    orientationPolicy: 'rotatable',
    color: '#7c3aed',
  },
}

/**
 * Generate a unique labware ID
 */
export function generateLabwareId(): string {
  return `lw-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}

/**
 * Create a new labware instance from a type
 */
export function createLabware(labwareType: LabwareType, name?: string): Labware {
  const definition = getLabwareDefinitionByLegacyType(labwareType)
  if (definition) {
    return createLabwareFromDefinition(definition, labwareType, name)
  }

  const config = LABWARE_CONFIGS[labwareType]
  return {
    labwareId: generateLabwareId(),
    name: name || LABWARE_TYPE_LABELS[labwareType],
    ...config,
    definitionSource: 'legacy_fallback',
  }
}

function createLabwareFromDefinition(definition: LabwareDefinition, labwareType: LabwareType, name?: string): Labware {
  const definitionWarnings = validateLabwareDefinition(definition)
  const addressing = buildAddressingFromDefinition(definition)
  const geometry: LabwareGeometry = {
    maxVolume_uL: definition.capacity.max_well_volume_uL,
    minVolume_uL: definition.capacity.min_working_volume_uL ?? 1,
    wellShape:
      definition.render_hints?.profile === 'reservoir'
        ? 'v-bottom'
        : definition.topology.addressing === 'grid'
          ? 'round'
          : 'square',
  }
  const canRotate = (definition.topology.orientation_allowed || []).includes('portrait')
    && (definition.topology.orientation_allowed || []).includes('landscape')

  return {
    labwareId: generateLabwareId(),
    labwareType,
    name: name || definition.display_name || LABWARE_TYPE_LABELS[labwareType],
    addressing,
    geometry,
    layoutFamily:
      definition.render_hints?.profile === 'tube' || definition.render_hints?.profile === 'tubeset'
        ? 'tube'
        : definition.render_hints?.profile === 'reservoir'
          ? 'reservoir'
          : 'sbs_plate',
    wellPitch_mm: definition.topology.well_pitch_mm ?? definition.topology.row_pitch_mm ?? definition.topology.col_pitch_mm,
    orientationPolicy: canRotate ? 'rotatable' : 'fixed_columns',
    definitionId: definition.id,
    definitionSource: 'registry',
    renderProfile: definition.render_hints?.profile,
    linearWellStyle: definition.render_hints?.linear_well_style,
    linearAxis: definition.topology.linear_axis || 'x',
    ...(definitionWarnings.length > 0 ? { definitionWarnings } : {}),
  }
}

export function normalizeLabwareWithDefinition(labware: Labware): Labware {
  const byId = getLabwareDefinitionById(labware.definitionId)
  const byType = getLabwareDefinitionByLegacyType(labware.labwareType)
  const definition = byId || byType
  if (!definition) {
    return {
      ...labware,
      definitionSource: labware.definitionSource || 'unmapped',
    }
  }

  const addressing = buildAddressingFromDefinition(definition)
  const mergedAddressing = labware.addressing?.type ? labware.addressing : addressing
  const mergedGeometry: LabwareGeometry = {
    maxVolume_uL: labware.geometry?.maxVolume_uL ?? definition.capacity.max_well_volume_uL,
    minVolume_uL: labware.geometry?.minVolume_uL ?? definition.capacity.min_working_volume_uL ?? 1,
    ...(labware.geometry?.wellShape ? { wellShape: labware.geometry.wellShape } : {}),
  }
  const orientationAllowed = definition.topology.orientation_allowed || []
  const canRotate = orientationAllowed.includes('portrait') && orientationAllowed.includes('landscape')

  const definitionWarnings = validateLabwareDefinition(definition)

  return {
    ...labware,
    name: labware.name || definition.display_name,
    addressing: mergedAddressing,
    geometry: mergedGeometry,
    layoutFamily:
      labware.layoutFamily ||
      (definition.render_hints?.profile === 'tube' || definition.render_hints?.profile === 'tubeset'
        ? 'tube'
        : definition.render_hints?.profile === 'reservoir'
          ? 'reservoir'
          : 'sbs_plate'),
    wellPitch_mm: labware.wellPitch_mm ?? definition.topology.well_pitch_mm ?? definition.topology.row_pitch_mm ?? definition.topology.col_pitch_mm,
    orientationPolicy: labware.orientationPolicy || (canRotate ? 'rotatable' : 'fixed_columns'),
    definitionId: definition.id,
    definitionSource: 'registry',
    renderProfile: labware.renderProfile || definition.render_hints?.profile,
    linearWellStyle: labware.linearWellStyle || definition.render_hints?.linear_well_style,
    linearAxis: labware.linearAxis || definition.topology.linear_axis || 'x',
    definitionWarnings: (labware.definitionWarnings && labware.definitionWarnings.length > 0)
      ? labware.definitionWarnings
      : (definitionWarnings.length > 0 ? definitionWarnings : undefined),
  }
}

export function getLabwareDefinitionForInstance(labware: Labware): LabwareDefinition | null {
  return getLabwareDefinitionById(labware.definitionId) || getLabwareDefinitionByLegacyType(labware.labwareType)
}

export function getLabwareDefaultOrientation(labware: Labware): 'portrait' | 'landscape' {
  const definition = getLabwareDefinitionForInstance(labware)
  if (definition) {
    return getDefinitionDefaultOrientation(definition)
  }
  if (labware.addressing.type === 'grid') return 'landscape'
  if (labware.linearWellStyle === 'trough') return 'landscape'
  return 'portrait'
}

export function getLabwareAllowedOrientations(labware: Labware): Array<'portrait' | 'landscape'> {
  const definition = getLabwareDefinitionForInstance(labware)
  if (definition) return getDefinitionAllowedOrientations(definition)
  return labware.orientationPolicy === 'fixed_columns' ? ['landscape'] : ['landscape', 'portrait']
}

export function clampLabwareOrientation(
  labware: Labware,
  requested: 'portrait' | 'landscape'
): 'portrait' | 'landscape' {
  const allowed = getLabwareAllowedOrientations(labware)
  if (allowed.includes(requested)) return requested
  return getLabwareDefaultOrientation(labware)
}

/**
 * Get all valid well IDs for a labware
 */
export function getLabwareWellIds(labware: Labware): WellId[] {
  const { addressing } = labware
  const wells: WellId[] = []

  if (addressing.type === 'grid') {
    const rows = addressing.rowLabels || []
    const cols = addressing.columnLabels || []
    for (const row of rows) {
      for (const col of cols) {
        wells.push(`${row}${col}`)
      }
    }
  } else if (addressing.type === 'linear') {
    wells.push(...(addressing.linearLabels || []))
  } else if (addressing.type === 'single') {
    wells.push('1')
  }

  return wells
}

/**
 * Get the total number of wells in a labware
 */
export function getLabwareWellCount(labware: Labware): number {
  const { addressing } = labware
  
  if (addressing.type === 'grid') {
    return (addressing.rows || 0) * (addressing.columns || 0)
  } else if (addressing.type === 'linear') {
    return addressing.linearLabels?.length || 0
  } else {
    return 1
  }
}

/**
 * Check if a well ID is valid for a labware
 */
export function isValidWellId(labware: Labware, wellId: WellId): boolean {
  const validWells = getLabwareWellIds(labware)
  return validWells.includes(wellId)
}

export function isTipRackType(labwareType: LabwareType): boolean {
  return labwareType.startsWith('tiprack_')
}

/**
 * Parse a grid well ID (e.g., "A1") into row/column indices
 */
export function parseGridWellId(wellId: WellId, labware: Labware): { row: number; col: number } | null {
  const { addressing } = labware
  if (addressing.type !== 'grid') return null

  const rowLabels = addressing.rowLabels || []
  const colLabels = addressing.columnLabels || []

  // Extract row letter(s) and column number
  const match = wellId.match(/^([A-Z]+)(\d+)$/)
  if (!match) return null

  const rowLabel = match[1]
  const colLabel = match[2]

  const row = rowLabels.indexOf(rowLabel)
  const col = colLabels.indexOf(colLabel)

  if (row === -1 || col === -1) return null

  return { row, col }
}
