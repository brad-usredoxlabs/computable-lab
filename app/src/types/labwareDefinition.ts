export type DefinitionAddressing = 'grid' | 'linear' | 'single'
export type DefinitionOrientation = 'landscape' | 'portrait'

export interface PlatformAlias {
  platform: 'opentrons_ot2' | 'opentrons_flex' | 'integra_assist_plus' | 'generic'
  alias: string
}

export interface LabwareDefinition {
  id: string
  display_name: string
  vendor?: string
  source?: 'opentrons' | 'integra' | 'custom' | 'generic'
  specificity?: 'concrete' | 'generic'
  read_only?: boolean
  platform_aliases?: PlatformAlias[]
  legacy_labware_types: string[]
  topology: {
    addressing: DefinitionAddressing
    rows?: number
    columns?: number
    linear_count?: number
    linear_axis?: 'x' | 'y'
    row_pitch_mm?: number
    col_pitch_mm?: number
    well_pitch_mm?: number
    orientation_default?: DefinitionOrientation
    orientation_allowed?: DefinitionOrientation[]
  }
  capacity: {
    max_well_volume_uL: number
    min_working_volume_uL?: number
  }
  aspiration_hints?: {
    multichannel_source_mode?: 'single_well' | 'per_channel'
    single_well_multichannel_source?: boolean
    per_channel_source_expected?: boolean
    notes?: string
  }
  render_hints?: {
    profile?: 'plate' | 'tiprack' | 'reservoir' | 'tubeset' | 'tube'
    linear_well_style?: 'trough' | 'channels'
  }
}

function gridDefinition(
  id: string,
  displayName: string,
  legacy: string[],
  rows: number,
  columns: number,
  maxWellVolumeUl: number,
  wellPitchMm: number,
  profile: 'plate' | 'tiprack' | 'tubeset' = 'plate'
): LabwareDefinition {
  return {
    id,
    display_name: displayName,
    legacy_labware_types: legacy,
    topology: {
      addressing: 'grid',
      rows,
      columns,
      well_pitch_mm: wellPitchMm,
      orientation_default: 'landscape',
      orientation_allowed: ['landscape', 'portrait'],
    },
    capacity: {
      max_well_volume_uL: maxWellVolumeUl,
      min_working_volume_uL: 1,
    },
    render_hints: { profile },
  }
}

export const LABWARE_DEFINITIONS: LabwareDefinition[] = [
  {
    ...gridDefinition('opentrons/nest_96_wellplate_200ul_flat@v1', 'NEST 96 Well Plate 200 µL Flat', ['plate_96'], 8, 12, 200, 9, 'plate'),
    vendor: 'Opentrons',
    source: 'opentrons',
    specificity: 'concrete',
    read_only: true,
    platform_aliases: [
      { platform: 'opentrons_ot2', alias: 'nest_96_wellplate_200ul_flat' },
      { platform: 'opentrons_flex', alias: 'nest_96_wellplate_200ul_flat' },
    ],
  },
  {
    ...gridDefinition('opentrons/corning_384_wellplate_112ul_flat@v1', 'Corning 384 Well Plate 112 µL Flat', ['plate_384'], 16, 24, 112, 4.5, 'plate'),
    vendor: 'Opentrons',
    source: 'opentrons',
    specificity: 'concrete',
    read_only: true,
    platform_aliases: [
      { platform: 'opentrons_ot2', alias: 'corning_384_wellplate_112ul_flat' },
      { platform: 'opentrons_flex', alias: 'corning_384_wellplate_112ul_flat' },
    ],
  },
  {
    ...gridDefinition('opentrons/nest_96_wellplate_2ml_deep@v1', 'NEST 96 Well Plate 2 mL Deep', ['deepwell_96'], 8, 12, 2000, 9, 'plate'),
    vendor: 'Opentrons',
    source: 'opentrons',
    specificity: 'concrete',
    read_only: true,
    platform_aliases: [
      { platform: 'opentrons_ot2', alias: 'nest_96_wellplate_2ml_deep' },
      { platform: 'opentrons_flex', alias: 'nest_96_wellplate_2ml_deep' },
    ],
  },
  {
    id: 'opentrons/nest_12_reservoir_22ml@v1',
    display_name: '12-Channel Reservoir',
    vendor: 'Opentrons',
    read_only: true,
    platform_aliases: [
      { platform: 'opentrons_ot2', alias: 'nest_12_reservoir_22ml' },
      { platform: 'opentrons_flex', alias: 'nest_12_reservoir_22ml' },
    ],
    legacy_labware_types: ['reservoir_12'],
    topology: {
      addressing: 'linear',
      linear_count: 12,
      linear_axis: 'x',
      orientation_default: 'landscape',
      orientation_allowed: ['landscape', 'portrait'],
    },
    capacity: {
      max_well_volume_uL: 22000,
      min_working_volume_uL: 1000,
    },
    aspiration_hints: {
      multichannel_source_mode: 'single_well',
      single_well_multichannel_source: true,
      per_channel_source_expected: false,
    },
    render_hints: {
      profile: 'reservoir',
      linear_well_style: 'trough',
    },
  },
  {
    id: 'opentrons/nest_8_reservoir_22ml@v1',
    display_name: '8-Channel Reservoir',
    vendor: 'Opentrons',
    read_only: true,
    platform_aliases: [
      { platform: 'opentrons_ot2', alias: 'nest_8_reservoir_22ml' },
      { platform: 'opentrons_flex', alias: 'nest_8_reservoir_22ml' },
    ],
    legacy_labware_types: ['reservoir_8'],
    topology: {
      addressing: 'linear',
      linear_count: 8,
      linear_axis: 'y',
      orientation_default: 'landscape',
      orientation_allowed: ['landscape', 'portrait'],
    },
    capacity: {
      max_well_volume_uL: 22000,
      min_working_volume_uL: 1000,
    },
    aspiration_hints: {
      multichannel_source_mode: 'per_channel',
      single_well_multichannel_source: false,
      per_channel_source_expected: true,
    },
    render_hints: {
      profile: 'reservoir',
      linear_well_style: 'channels',
    },
  },
  {
    id: 'generic/reservoir_1@v1',
    display_name: 'Single Reservoir',
    legacy_labware_types: ['reservoir_1'],
    topology: {
      addressing: 'single',
      orientation_default: 'portrait',
      orientation_allowed: ['portrait', 'landscape'],
    },
    capacity: {
      max_well_volume_uL: 300000,
      min_working_volume_uL: 5000,
    },
    render_hints: { profile: 'reservoir' },
  },
  {
    id: 'generic/tube_1@v1',
    display_name: 'Single Tube',
    legacy_labware_types: ['tube'],
    topology: {
      addressing: 'single',
      orientation_default: 'portrait',
      orientation_allowed: ['portrait', 'landscape'],
    },
    capacity: {
      max_well_volume_uL: 50000,
      min_working_volume_uL: 100,
    },
    render_hints: { profile: 'tube' },
  },
  {
    id: 'opentrons/corning_24_wellplate_3.4ml_flat@v1',
    display_name: 'corning_24_wellplate_3.4ml_flat',
    vendor: 'Opentrons',
    source: 'opentrons',
    specificity: 'concrete',
    read_only: true,
    platform_aliases: [
      { platform: 'opentrons_ot2', alias: 'corning_24_wellplate_3.4ml_flat' },
      { platform: 'opentrons_flex', alias: 'corning_24_wellplate_3.4ml_flat' },
    ],
    legacy_labware_types: ['tubeset_24'],
    topology: {
      addressing: 'grid',
      rows: 4,
      columns: 6,
      well_pitch_mm: 13.5,
      orientation_default: 'landscape',
      orientation_allowed: ['landscape', 'portrait'],
    },
    capacity: {
      max_well_volume_uL: 3400,
      min_working_volume_uL: 50,
    },
    render_hints: { profile: 'tubeset' },
  },
  gridDefinition('opentrons/tiprack_20ul@v1', 'OT-2 Tip Rack 20 uL', ['tiprack_ot2_20'], 8, 12, 20, 9, 'tiprack'),
  gridDefinition('opentrons/tiprack_200ul@v1', 'OT-2 Tip Rack 200 uL', ['tiprack_ot2_200'], 8, 12, 200, 9, 'tiprack'),
  gridDefinition('opentrons/tiprack_300ul@v1', 'OT-2 Tip Rack 300 uL', ['tiprack_ot2_300'], 8, 12, 300, 9, 'tiprack'),
  gridDefinition('opentrons/tiprack_1000ul@v1', 'OT-2 Tip Rack 1000 uL', ['tiprack_ot2_1000'], 8, 12, 1000, 9, 'tiprack'),
  gridDefinition('opentrons_flex/tiprack_50ul@v1', 'Flex Tip Rack 50 uL', ['tiprack_flex_50'], 8, 12, 50, 9, 'tiprack'),
  gridDefinition('opentrons_flex/tiprack_200ul@v1', 'Flex Tip Rack 200 uL', ['tiprack_flex_200'], 8, 12, 200, 9, 'tiprack'),
  gridDefinition('opentrons_flex/tiprack_1000ul@v1', 'Flex Tip Rack 1000 uL', ['tiprack_flex_1000'], 8, 12, 1000, 9, 'tiprack'),
  gridDefinition('integra/tiprack_12_5ul_384@v1', 'Assist Tip Rack 12.5 uL (384)', ['tiprack_assist_12_5_384'], 16, 24, 12.5, 4.5, 'tiprack'),
  gridDefinition('integra/tiprack_125ul_384@v1', 'Assist Tip Rack 125 uL (384)', ['tiprack_assist_125_384'], 16, 24, 125, 4.5, 'tiprack'),
  gridDefinition('integra/tiprack_300ul_96@v1', 'Assist Tip Rack 300 uL (96)', ['tiprack_assist_300'], 8, 12, 300, 9, 'tiprack'),
  gridDefinition('integra/tiprack_1250ul_96@v1', 'Assist Tip Rack 1250 uL (96)', ['tiprack_assist_1250'], 8, 12, 1250, 9, 'tiprack'),
]

const BY_ID = new Map(LABWARE_DEFINITIONS.map((d) => [d.id, d]))
const BY_LEGACY_TYPE = new Map<string, LabwareDefinition>()
for (const definition of LABWARE_DEFINITIONS) {
  for (const legacyType of definition.legacy_labware_types) {
    if (!BY_LEGACY_TYPE.has(legacyType)) {
      BY_LEGACY_TYPE.set(legacyType, definition)
    }
  }
}

export function getLabwareDefinitionById(id?: string | null): LabwareDefinition | null {
  if (!id) return null
  return BY_ID.get(id) || null
}

export function getLabwareDefinitionByLegacyType(labwareType?: string | null): LabwareDefinition | null {
  if (!labwareType) return null
  return BY_LEGACY_TYPE.get(labwareType) || null
}

function rowLabel(index: number): string {
  return String.fromCharCode(65 + index)
}

export function buildAddressingFromDefinition(definition: LabwareDefinition): {
  type: DefinitionAddressing
  rows?: number
  columns?: number
  rowLabels?: string[]
  columnLabels?: string[]
  linearLabels?: string[]
} {
  if (definition.topology.addressing === 'grid') {
    const rows = Math.max(1, definition.topology.rows || 1)
    const columns = Math.max(1, definition.topology.columns || 1)
    return {
      type: 'grid',
      rows,
      columns,
      rowLabels: Array.from({ length: rows }, (_, i) => rowLabel(i)),
      columnLabels: Array.from({ length: columns }, (_, i) => String(i + 1)),
    }
  }
  if (definition.topology.addressing === 'linear') {
    const count = Math.max(1, definition.topology.linear_count || 1)
    return {
      type: 'linear',
      linearLabels: Array.from({ length: count }, (_, i) => String(i + 1)),
    }
  }
  return { type: 'single' }
}

export function getDefinitionAliasForPlatform(
  definition: LabwareDefinition | null,
  platform: 'opentrons_ot2' | 'opentrons_flex' | 'integra_assist_plus' | 'generic'
): string | null {
  if (!definition?.platform_aliases) return null
  return definition.platform_aliases.find((alias) => alias.platform === platform)?.alias || null
}

export function getDefinitionDefaultOrientation(definition: LabwareDefinition): DefinitionOrientation {
  return definition.topology.orientation_default || 'landscape'
}

export function getDefinitionAllowedOrientations(definition: LabwareDefinition): DefinitionOrientation[] {
  const allowed = definition.topology.orientation_allowed || [getDefinitionDefaultOrientation(definition)]
  return allowed.length > 0 ? allowed : ['landscape']
}

export function resolveDefinitionMultichannelSourceMode(definition: LabwareDefinition): 'single_well' | 'per_channel' {
  if (definition.aspiration_hints?.multichannel_source_mode) {
    return definition.aspiration_hints.multichannel_source_mode
  }
  if (definition.aspiration_hints?.single_well_multichannel_source) return 'single_well'
  if (definition.aspiration_hints?.per_channel_source_expected) return 'per_channel'
  return 'per_channel'
}

export function validateLabwareDefinition(definition: LabwareDefinition): string[] {
  const warnings: string[] = []
  if (definition.topology.addressing === 'linear') {
    if (!definition.topology.linear_axis) {
      warnings.push(`Definition ${definition.id} is linear but missing topology.linear_axis; defaulting to x.`)
    }
    if (!definition.topology.linear_count || definition.topology.linear_count < 1) {
      warnings.push(`Definition ${definition.id} is linear but missing topology.linear_count; defaulting to 1.`)
    }
    if (!definition.aspiration_hints?.multichannel_source_mode
      && !definition.aspiration_hints?.single_well_multichannel_source
      && !definition.aspiration_hints?.per_channel_source_expected) {
      warnings.push(`Definition ${definition.id} is linear but missing aspiration_hints source mode; defaulting to per_channel.`)
    }
  }
  return warnings
}
