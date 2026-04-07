import type { WellId } from './plate'
import type { PathSpec } from '../shared/expanders/types'
import type { Ref } from './ref'
import type { TransferDetails } from './events'
import type { CompositionEntryValue, ConcentrationValue } from './material'

export type MacroProgramKind = 'serial_dilution' | 'quadrant_replicate' | 'spacing_transition_transfer' | 'transfer_vignette'
export type SerialVolumeMode = 'from_transfer' | 'from_final'
export type SerialEndPolicy = 'keep_last' | 'discard_last_to_waste'
export type SerialTipPolicy = 'reuse' | 'change_each_step' | 'change_each_row'
export type SerialDilutionMode = 'in_place' | 'source_to_target' | 'prepare_then_transfer'
export type SerialPreparationMode = 'external' | 'generate'
export type SerialReplicateMode = 'explicit_lanes' | 'pattern'
export type SerialDiluentMode = 'material_ref' | 'source_wells' | 'prepared_vehicle'
export type SerialSolventPolicyMode = 'ignore' | 'warn_if_inconsistent' | 'enforce_constant_vehicle'
export type SerialEndPolicyV2 = 'keep_last' | 'discard_excess' | 'transfer_all_no_discard'

export interface MacroToolState {
  channel_count_max?: number
  active_channel_indices?: number[]
  spacing_at_aspirate_mm?: number
  spacing_at_dispense_mm?: number
}

export interface MacroPose {
  orientation?: 'portrait' | 'landscape'
  slot?: string
}

export interface MacroConstraints {
  usable_target_wells?: WellId[]
  blocked_target_wells?: WellId[]
}

export interface MacroProgramBase {
  kind: MacroProgramKind
  source_pose?: MacroPose
  target_pose?: MacroPose
  tool_state?: MacroToolState
  execution_mode?: 'parallel_lanes' | 'sequential_lanes'
  constraints?: MacroConstraints
  compiler_version?: string
}

export interface SerialDilutionParamsLegacy {
  pathSpec: PathSpec
  volumeMode: SerialVolumeMode
  dilutionFactor: number
  transferVolume_uL?: number
  targetFinalVolume_uL?: number
  diluentVolume_uL: number
  resolvedTransferVolume_uL: number
  mixCycles: number
  mixVolume_uL: number
  tipPolicy: SerialTipPolicy
  endPolicy: SerialEndPolicy
  diluentMaterial_ref?: string
  normalizeStartWell?: boolean
}

export interface SerialDilutionStartSource {
  kind: 'existing_well' | 'material_source' | 'generated_top_well'
  labwareId?: string
  wellId?: WellId
  materialRef?: Ref
  materialSpecRef?: Ref
  vendorProductRef?: Ref
  concentration?: ConcentrationValue
  compositionSnapshot?: CompositionEntryValue[]
}

export interface SerialDilutionLane {
  laneId: string
  sourceLabwareId?: string
  targetLabwareId: string
  startSource: SerialDilutionStartSource
  path: WellId[]
  finalTargets?: WellId[]
}

export interface SerialDiluentSpec {
  mode: SerialDiluentMode
  materialRef?: Ref
  sourceLabwareId?: string
  sourceWells?: WellId[]
  concentration?: ConcentrationValue
  compositionSnapshot?: CompositionEntryValue[]
}

export interface SerialPreparationSpec {
  topWellMode: SerialPreparationMode
  receivingWellMode: SerialPreparationMode
  transferIntoTargetAfterPreparation?: boolean
  deliveryVolume_uL?: number
  manualSetup?: boolean
}

export interface SerialSolventPolicy {
  mode: SerialSolventPolicyMode
  targetComponents?: CompositionEntryValue[]
  matchedDiluentRef?: Ref
}

export interface SerialDilutionReplicates {
  mode: SerialReplicateMode
  axis?: 'row' | 'column'
  count?: number
  spacing?: number
}

export interface SerialDilutionVolumesV2 {
  factor: number
  volumeModel: SerialVolumeMode
  transferVolume_uL?: number
  retainedVolume_uL?: number
  resolvedTransferVolume_uL: number
  resolvedPrefillVolume_uL: number
  resolvedTopWellStartVolume_uL: number
}

export interface SerialDilutionParamsV2 {
  version: 2
  mode: SerialDilutionMode
  lanes: SerialDilutionLane[]
  replicates?: SerialDilutionReplicates
  dilution: SerialDilutionVolumesV2
  diluent: SerialDiluentSpec
  preparation: SerialPreparationSpec
  solventPolicy?: SerialSolventPolicy
  mix: {
    cycles: number
    volume_uL: number
  }
  tipPolicy: SerialTipPolicy
  endPolicy: SerialEndPolicyV2
  executionHints?: TransferDetails['execution_hints']
}

export type SerialDilutionParams = SerialDilutionParamsLegacy | SerialDilutionParamsV2

export interface SerialDilutionMacroProgram extends MacroProgramBase {
  kind: 'serial_dilution'
  params: SerialDilutionParams
}

export interface QuadrantReplicateParams {
  sourceLabwareId: string
  targetLabwareId: string
  sourceWells: WellId[]
  volume_uL: number
  /** Extra aspirated volume for multidispense accuracy (dead volume/overage) */
  extraVolume_uL?: number
  targetRowOffset?: number
  targetColOffset?: number
  targetRegion?: {
    rowStart?: string
    rowEnd?: string
    colStart?: number
    colEnd?: number
  }
}

export interface QuadrantReplicateMacroProgram extends MacroProgramBase {
  kind: 'quadrant_replicate'
  params: QuadrantReplicateParams
}

export interface SpacingTransitionTransferParams {
  sourceLabwareId: string
  targetLabwareId: string
  sourceWells: WellId[]
  targetWells: WellId[]
  volume_uL: number
  activeChannelIndices?: number[]
  spacingAtAspirate_mm?: number
  spacingAtDispense_mm?: number
  mixAfterDispense?: {
    cycles: number
    volume_uL: number
  }
}

export interface SpacingTransitionTransferMacroProgram extends MacroProgramBase {
  kind: 'spacing_transition_transfer'
  params: SpacingTransitionTransferParams
}

export interface TransferVignetteParams {
  sourceLabwareId?: string
  targetLabwareId?: string
  sourceWells: WellId[]
  targetWells: WellId[]
  volume?: { value: number; unit: string }
  transferMode?: 'transfer' | 'multi_dispense'
  deadVolume?: { value: number; unit: 'uL' | 'mL' | '%' }
  discardToWaste?: boolean
  inputs?: TransferDetails['inputs']
}

export interface TransferVignetteMacroProgram extends MacroProgramBase {
  kind: 'transfer_vignette'
  template_ref?: Ref
  params: TransferVignetteParams
  execution_hints?: TransferDetails['execution_hints']
}

export type MacroProgram =
  | SerialDilutionMacroProgram
  | QuadrantReplicateMacroProgram
  | SpacingTransitionTransferMacroProgram
  | TransferVignetteMacroProgram
