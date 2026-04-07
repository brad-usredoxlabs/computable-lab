export type AddressingMode = 'grid' | 'linear' | 'single';
export type OrientationMode = 'landscape' | 'portrait';
export type MappingMode = 'single_source_multichannel' | 'per_channel' | 'invalid';

export interface LabwareDefinitionRecord {
  kind: 'labware-definition';
  recordId: string;
  type: 'labware_definition';
  id: string;
  display_name: string;
  vendor?: string;
  platform_aliases?: Array<{
    platform: 'opentrons_ot2' | 'opentrons_flex' | 'integra_assist_plus' | 'generic';
    alias: string;
  }>;
  read_only?: boolean;
  source?: {
    kind?: 'imported' | 'curated' | 'user';
    url?: string;
    hash?: string;
    version?: string;
  };
  topology: {
    addressing: AddressingMode;
    rows?: number;
    columns?: number;
    linear_count?: number;
    row_pitch_mm?: number;
    col_pitch_mm?: number;
    well_pitch_mm?: number;
    orientation_default?: OrientationMode;
    orientation_allowed?: OrientationMode[];
  };
  capacity: {
    max_well_volume_uL: number;
    min_working_volume_uL?: number;
  };
  aspiration_hints?: {
    single_well_multichannel_source?: boolean;
    per_channel_source_expected?: boolean;
    notes?: string;
  };
  compatibility_tags?: string[];
  notes?: string;
}

export interface PipetteCapabilityRecord {
  kind: 'pipette-capability';
  recordId: string;
  type: 'pipette_capability';
  id: string;
  display_name: string;
  tool_type: 'pipette';
  channels_supported: number[];
  spacing_mode?: 'fixed' | 'adjustable' | 'mixed';
  fixed_spacing_mm?: number;
  volume_families: Array<{
    name: string;
    volume_min_uL: number;
    volume_max_uL: number;
    spacing_min_mm?: number;
    spacing_max_mm?: number;
  }>;
  platform?: 'opentrons_ot2' | 'opentrons_flex' | 'integra_assist_plus' | 'generic';
  notes?: string;
}
