import { getLabwareDefaultOrientation, type Labware } from '../../types/labware'
import type { SelectedTool } from '../tools/ToolSelector'
import { resolveEffectiveLinearAxisForLabware, type LabwareOrientation } from './labwareView'
import {
  getLabwareDefinitionById,
  getLabwareDefinitionByLegacyType,
  resolveDefinitionMultichannelSourceMode,
} from '../../types/labwareDefinition'

export type MappingMode = 'single_source_multichannel' | 'per_channel' | 'invalid'
export type CompatibilityTargetPlatform = 'manual' | 'integra_assist' | 'opentrons_ot2' | 'opentrons_flex'

export interface CompatibilityIssue {
  severity: 'warning'
  code: string
  message: string
}

export function resolvePipetteChannelAxis(_tool: SelectedTool | null, _platform: CompatibilityTargetPlatform): 'x' | 'y' {
  // v1 invariant: multichannel pipette channels run front-to-back relative to deck.
  return 'y'
}

interface PipetteFamily {
  volumeMinUl: number
  volumeMaxUl: number
  spacingMinMm: number
  spacingMaxMm: number
}

interface PipetteCapabilityLite {
  channels: number
  families: PipetteFamily[]
}

const DEFAULT_FIXED_FAMILY: PipetteFamily = {
  volumeMinUl: 0.1,
  volumeMaxUl: 5000,
  spacingMinMm: 9,
  spacingMaxMm: 9,
}

const VOYAGER_CAPABILITIES: Record<string, PipetteCapabilityLite> = {
  pipette_4ch_adjustable: {
    channels: 4,
    families: [{ volumeMinUl: 300, volumeMaxUl: 1250, spacingMinMm: 9, spacingMaxMm: 33 }],
  },
  pipette_6ch_adjustable: {
    channels: 6,
    families: [{ volumeMinUl: 300, volumeMaxUl: 1250, spacingMinMm: 9, spacingMaxMm: 19.8 }],
  },
  pipette_8ch_adjustable: {
    channels: 8,
    families: [
      { volumeMinUl: 300, volumeMaxUl: 1250, spacingMinMm: 9, spacingMaxMm: 14 },
      { volumeMinUl: 12.5, volumeMaxUl: 125, spacingMinMm: 4.5, spacingMaxMm: 14 },
    ],
  },
  pipette_12ch_adjustable: {
    channels: 12,
    families: [{ volumeMinUl: 12.5, volumeMaxUl: 125, spacingMinMm: 4.5, spacingMaxMm: 9 }],
  },
}

function resolvePipetteCapability(tool: SelectedTool | null): PipetteCapabilityLite | null {
  if (!tool || !tool.toolTypeId.includes('pipette')) return null
  const voyager = VOYAGER_CAPABILITIES[tool.toolTypeId] ?? VOYAGER_CAPABILITIES[tool.toolType.toolTypeId]
  if (voyager) return voyager
  return {
    channels: tool.toolType.channelCount || 1,
    families: [DEFAULT_FIXED_FAMILY],
  }
}

function resolveDefinition(labware: Labware) {
  return getLabwareDefinitionById(labware.definitionId) || getLabwareDefinitionByLegacyType(labware.labwareType)
}

export function resolvePipetteLabwareCompatibility(input: {
  labware: Labware
  tool: SelectedTool | null
  spacingMm: number
  role: 'source' | 'target'
  orientation?: LabwareOrientation
  platform?: CompatibilityTargetPlatform
}): { mode: MappingMode; issues: CompatibilityIssue[]; pipetteAxis?: 'x' | 'y'; effectiveLinearAxis?: 'x' | 'y' } {
  const issues: CompatibilityIssue[] = []
  const capability = resolvePipetteCapability(input.tool)
  if (!capability || capability.channels <= 1) {
    return { mode: 'per_channel', issues }
  }

  const definition = resolveDefinition(input.labware)
  const topology = definition?.topology

  const hasSpacingMatch = capability.families.some(
    (family) => input.spacingMm >= family.spacingMinMm && input.spacingMm <= family.spacingMaxMm
  )
  if (!hasSpacingMatch) {
    const ranges = capability.families.map((f) => `${f.spacingMinMm}-${f.spacingMaxMm}mm`).join(' or ')
    issues.push({
      severity: 'warning',
      code: 'SPACING_UNSUPPORTED',
      message: `${input.tool?.displayName || 'Tool'} spacing ${input.spacingMm}mm is outside supported range (${ranges}).`,
    })
  }

  if (topology?.addressing === 'linear') {
    const orientation = input.orientation || getLabwareDefaultOrientation(input.labware)
    const platform = input.platform || 'manual'
    const pipetteAxis = resolvePipetteChannelAxis(input.tool, platform)
    const effectiveLinearAxis = resolveEffectiveLinearAxisForLabware(input.labware, orientation)
    const linearCount = topology.linear_count || input.labware.addressing.linearLabels?.length || 0
    const sourceMode = definition ? resolveDefinitionMultichannelSourceMode(definition) : 'per_channel'
    if (sourceMode === 'per_channel' && pipetteAxis !== effectiveLinearAxis) {
      issues.push({
        severity: 'warning',
        code: 'LINEAR_AXIS_MISMATCH',
        message: `Linear labware axis (${effectiveLinearAxis}) does not align with pipette channel axis (${pipetteAxis}); using single-well multichannel mode.`,
      })
      return { mode: 'single_source_multichannel', issues, pipetteAxis, effectiveLinearAxis }
    }
    if (input.role === 'source' && sourceMode === 'single_well') {
      return { mode: 'single_source_multichannel', issues, pipetteAxis, effectiveLinearAxis }
    }
    if (sourceMode === 'per_channel') {
      if (capability.channels > linearCount) {
        issues.push({
          severity: 'warning',
          code: 'CHANNEL_COUNT_EXCEEDS_LABWARE',
          message: `${input.tool?.displayName || 'Tool'} has ${capability.channels} channels but labware has ${linearCount} linear wells.`,
        })
        return { mode: 'invalid', issues, pipetteAxis, effectiveLinearAxis }
      }
      return { mode: 'per_channel', issues, pipetteAxis, effectiveLinearAxis }
    }
    if (capability.channels > linearCount && linearCount > 0) {
      issues.push({
        severity: 'warning',
        code: 'CHANNEL_COUNT_EXCEEDS_LINEAR_WELLS',
        message: `${capability.channels} channels exceed ${linearCount} linear wells.`,
      })
      return { mode: 'invalid', issues, pipetteAxis, effectiveLinearAxis }
    }
  }

  if (input.labware.addressing.type === 'linear' && input.role === 'source' && input.labware.labwareType === 'reservoir_1') {
    return { mode: 'single_source_multichannel', issues }
  }

  return { mode: 'per_channel', issues }
}

export interface LinearAxisMatrixCase {
  id: string
  labwareAxis: 'x' | 'y'
  orientation: LabwareOrientation
  pipetteAxis: 'x' | 'y'
  expectedModeWhenPerChannelDefinition: MappingMode
}

export const LINEAR_AXIS_MATRIX_CASES: LinearAxisMatrixCase[] = [
  { id: 'x-landscape-vs-y-pipette', labwareAxis: 'x', orientation: 'landscape', pipetteAxis: 'y', expectedModeWhenPerChannelDefinition: 'single_source_multichannel' },
  { id: 'x-portrait-vs-y-pipette', labwareAxis: 'x', orientation: 'portrait', pipetteAxis: 'y', expectedModeWhenPerChannelDefinition: 'per_channel' },
  { id: 'y-landscape-vs-y-pipette', labwareAxis: 'y', orientation: 'landscape', pipetteAxis: 'y', expectedModeWhenPerChannelDefinition: 'per_channel' },
  { id: 'y-portrait-vs-y-pipette', labwareAxis: 'y', orientation: 'portrait', pipetteAxis: 'y', expectedModeWhenPerChannelDefinition: 'single_source_multichannel' },
]
