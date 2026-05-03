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
  // TODO: migrate to record-store-driven labware types (see task #13 / future UI-migration session)
  | 'tubeset_6x15ml'
  | 'tubeset_4x50ml'
  | 'tubeset_50x1p5ml'
  | 'tubeset_96x0p2ml'
  | 'tubeset_mixed_4x50ml_6x15ml'
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
  tubeset_6x15ml: '6 × 15 mL Tube Rack',
  tubeset_4x50ml: '4 × 50 mL Tube Rack',
  tubeset_50x1p5ml: '50 × 1.5 mL Tube Rack',
  tubeset_96x0p2ml: '96 × 0.2 mL PCR Tube Rack',
  tubeset_mixed_4x50ml_6x15ml: '10-Tube Mixed Rack (4×50mL + 6×15mL)',
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
  tubeset_6x15ml: '🧪',
  tubeset_4x50ml: '🧪',
  tubeset_50x1p5ml: '🧪',
  tubeset_96x0p2ml: '🧪',
  tubeset_mixed_4x50ml_6x15ml: '🧪',
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
  tubeset_6x15ml: 'tube',
  tubeset_4x50ml: 'tube',
  tubeset_50x1p5ml: 'tube',
  tubeset_96x0p2ml: 'tube',
  tubeset_mixed_4x50ml_6x15ml: 'tube',
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
  wellShape?: 'round' | 'square' | 'v-bottom' | 'conical'
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
  /** Source record ID if this labware was created from a persisted record */
  sourceRecordId?: string
  /** Optional per-well geometry overrides for heterogeneous labware (e.g., mixed tube racks) */
  wellOverrides?: Record<string, { maxVolume_uL?: number; wellShape?: 'round' | 'square' | 'v-bottom' | 'conical' }>
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
  // TODO: migrate to record-store-driven labware types (see task #13 / future UI-migration session)
  tubeset_6x15ml: {
    labwareType: 'tubeset_6x15ml',
    addressing: {
      type: 'grid',
      rows: 2,
      columns: 3,
      rowLabels: ['A', 'B'],
      columnLabels: ['1', '2', '3'],
    },
    geometry: {
      maxVolume_uL: 15000,
      minVolume_uL: 200,
      wellShape: 'conical',
    },
    layoutFamily: 'tube',
    wellPitch_mm: 20,
    orientationPolicy: 'rotatable',
    color: '#fd7e14',
  },
  tubeset_4x50ml: {
    labwareType: 'tubeset_4x50ml',
    addressing: {
      type: 'grid',
      rows: 2,
      columns: 2,
      rowLabels: ['A', 'B'],
      columnLabels: ['1', '2'],
    },
    geometry: {
      maxVolume_uL: 50000,
      minVolume_uL: 500,
      wellShape: 'conical',
    },
    layoutFamily: 'tube',
    wellPitch_mm: 30,
    orientationPolicy: 'rotatable',
    color: '#fd7e14',
  },
  tubeset_50x1p5ml: {
    labwareType: 'tubeset_50x1p5ml',
    addressing: {
      type: 'grid',
      rows: 5,
      columns: 10,
      rowLabels: ['A', 'B', 'C', 'D', 'E'],
      columnLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
    },
    geometry: {
      maxVolume_uL: 1500,
      minVolume_uL: 50,
      wellShape: 'round',
    },
    layoutFamily: 'tube',
    wellPitch_mm: 13,
    orientationPolicy: 'rotatable',
    color: '#fd7e14',
  },
  tubeset_96x0p2ml: {
    labwareType: 'tubeset_96x0p2ml',
    addressing: {
      type: 'grid',
      rows: 8,
      columns: 12,
      rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      columnLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    },
    geometry: {
      maxVolume_uL: 200,
      minVolume_uL: 10,
      wellShape: 'round',
    },
    layoutFamily: 'tube',
    wellPitch_mm: 9,
    orientationPolicy: 'rotatable',
    color: '#fd7e14',
  },
  // Opentrons opentrons_10_tuberack_falcon_4x50ml_6x15ml_conical.
  // Wells A1, B1, A2, B2, A3, B3 hold 15 mL conicals.
  // Wells A4, B4, A5, B5 hold 50 mL conicals.
  // Geometry and max volume vary per cell — use heterogeneous well
  // entries below.
  // Note: wellOverrides is an optional field added to support mixed-tube racks.
  // It is not part of the YAML schema, only the TypeScript config type.
  tubeset_mixed_4x50ml_6x15ml: {
    labwareType: 'tubeset_mixed_4x50ml_6x15ml',
    addressing: {
      type: 'grid',
      rows: 2,
      columns: 5,
      rowLabels: ['A', 'B'],
      columnLabels: ['1', '2', '3', '4', '5'],
    },
    geometry: {
      maxVolume_uL: 15000,
      minVolume_uL: 50,
      wellShape: 'conical',
    },
    layoutFamily: 'tube',
    wellPitch_mm: 25,
    orientationPolicy: 'rotatable',
    color: '#fd7e14',
    wellOverrides: {
      A1: { maxVolume_uL: 15000, wellShape: 'conical' },
      B1: { maxVolume_uL: 15000, wellShape: 'conical' },
      A2: { maxVolume_uL: 15000, wellShape: 'conical' },
      B2: { maxVolume_uL: 15000, wellShape: 'conical' },
      A3: { maxVolume_uL: 15000, wellShape: 'conical' },
      B3: { maxVolume_uL: 15000, wellShape: 'conical' },
      A4: { maxVolume_uL: 50000, wellShape: 'conical' },
      B4: { maxVolume_uL: 50000, wellShape: 'conical' },
      A5: { maxVolume_uL: 50000, wellShape: 'conical' },
      B5: { maxVolume_uL: 50000, wellShape: 'conical' },
    },
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
  if (!config) {
    throw new Error(
      `createLabware: unknown labwareType "${labwareType}". ` +
      `Use labwareRecordToEditorLabware() for persisted records.`,
    )
  }
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
  if (labware.addressing?.type === 'grid') return 'landscape'
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

/**
 * Payload shape for a persisted labware record from the record store.
 * This is the shape returned from the /ai/search-records endpoint for labware records.
 */
export interface LabwareRecordPayload {
  kind: 'labware'
  recordId: string
  name: string
  labwareType?: string
  format?: {
    rows?: number
    cols?: number
    wellCount?: number
    wellNaming?: string
  }
  manufacturer?: {
    name?: string
    catalogNumber?: string
    url?: string
  }
  tags?: string[]
  aliases?: string[]
}

function normalizeDefinitionRecordId(recordId: string): string {
  return recordId.startsWith('def:') ? recordId.slice(4) : recordId
}

export function labwareDefinitionRecordToPayload(recordId: string): LabwareRecordPayload | null {
  const definition = getLabwareDefinitionById(normalizeDefinitionRecordId(recordId))
  if (!definition) return null
  return {
    kind: 'labware',
    recordId,
    name: definition.display_name,
    labwareType: definition.legacy_labware_types[0],
    format: {
      rows: definition.topology.rows,
      cols: definition.topology.columns ?? definition.topology.linear_count,
      wellCount: definition.topology.addressing === 'grid'
        ? (definition.topology.rows ?? 1) * (definition.topology.columns ?? 1)
        : definition.topology.linear_count,
    },
    aliases: definition.platform_aliases?.map((alias) => alias.alias),
  }
}

/**
 * Map a persisted labware record (from the record store) into the in-memory
 * editor Labware shape. The editor's reducer uses a small fixed union of
 * LabwareType values for rendering. This mapper picks the best-matching
 * LabwareType from the record's format + labwareType fields.
 */
export function labwareRecordToEditorLabware(
  record: LabwareRecordPayload,
): Labware {
  const editorType = pickEditorLabwareType(record)
  // Delegate geometry/wells/etc. to the existing factory, then overwrite
  // name + a few metadata fields from the record.
  const base = createLabware(editorType, record.name)
  return {
    ...base,
    labwareId: record.recordId,
    // Store the source recordId so the editor knows this labware came
    // from a persisted record rather than a manual click.
    sourceRecordId: record.recordId,
  }
}

export function pickEditorLabwareType(record: LabwareRecordPayload): LabwareType {
  const format = record.format ?? {}
  const rows = format.rows
  const cols = format.cols
  const wellCount = format.wellCount ?? (rows && cols ? rows * cols : undefined)
  const kind = (record.labwareType ?? '').toLowerCase()
  const tagBlob = (record.tags ?? []).join(' ').toLowerCase()
  const nameBlob = (record.name ?? '').toLowerCase()
  const aliasBlob = (record.aliases ?? []).join(' ').toLowerCase()
  const haystack = `${kind} ${tagBlob} ${nameBlob} ${aliasBlob}`

  // Pull a "<n> well/channel/position" count out of the haystack as a fallback
  // for records whose `format` field is missing (e.g. a search hit that
  // couldn't load full payload).
  const countMatch = haystack.match(/(\d+)\s*[-\s]?\s*(?:well|channel|chan|position)/)
  const namedCount = countMatch ? Number(countMatch[1]) : undefined

  // Reservoirs
  if (kind.includes('reservoir') || haystack.includes('reservoir')) {
    if (cols === 12 || namedCount === 12) return 'reservoir_12'
    if (cols === 8 || namedCount === 8) return 'reservoir_8'
    if (cols === 1 || namedCount === 1) return 'reservoir_1'
    return 'reservoir_1'
  }

  // Tip racks — keep as plate_96 for now unless the union has a tip type
  if (kind.includes('tip')) {
    return 'plate_96'
  }

  // Tube racks and tubes
  if (kind.includes('tube_rack') || kind.includes('tuberack')) {
    return 'tubeset_24'
  }
  if (kind.includes('tube')) {
    return 'tube'
  }

  // Plates — prefer explicit wellCount, then fall back to name/tag hints.
  if (wellCount === 384 || namedCount === 384 || haystack.includes('384')) return 'plate_384'
  if ((wellCount === 96 && kind.includes('deep')) || haystack.includes('deep-well') || haystack.includes('deepwell') || haystack.includes('deep well')) return 'deepwell_96'
  if (wellCount === 96 || namedCount === 96 || haystack.includes('96-well') || haystack.includes('96 well')) return 'plate_96'

  return 'plate_96'
}
