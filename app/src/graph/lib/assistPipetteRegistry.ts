import type { ToolType } from '../tools/types'

export type AssistPipetteFamily = 'voyager' | 'viaflow'
export type AssistSpacingMode = 'fixed_9mm' | 'fixed_4_5mm' | 'adjustable'

export interface AssistPipetteModel {
  id: string
  family: AssistPipetteFamily
  channels: 4 | 6 | 8 | 12 | 16
  volumeClassUl: 12.5 | 50 | 125 | 300 | 1250
  spacingMode: AssistSpacingMode
  spacingRangeMm?: { min: number; max: number }
  baseToolTypeId: ToolType['toolTypeId']
  displayName: string
}

export interface AssistTipFamily {
  id: 'tip_12_5ul' | 'tip_125ul' | 'tip_300ul' | 'tip_1250ul'
  displayName: string
  rackFormat: 96 | 384
  lengths: Array<'short' | 'standard' | 'long'>
  compatiblePipetteVolumesUl: Array<12.5 | 50 | 125 | 300 | 1250>
}

export const ASSIST_TIP_FAMILIES: AssistTipFamily[] = [
  {
    id: 'tip_12_5ul',
    displayName: '12.5 uL GripTip',
    rackFormat: 384,
    lengths: ['short', 'standard', 'long'],
    compatiblePipetteVolumesUl: [12.5],
  },
  {
    id: 'tip_125ul',
    displayName: '125 uL GripTip',
    rackFormat: 384,
    lengths: ['standard'],
    compatiblePipetteVolumesUl: [50, 125],
  },
  {
    id: 'tip_300ul',
    displayName: '300 uL GripTip',
    rackFormat: 96,
    lengths: ['standard', 'long'],
    compatiblePipetteVolumesUl: [300],
  },
  {
    id: 'tip_1250ul',
    displayName: '1250 uL GripTip',
    rackFormat: 96,
    lengths: ['short', 'standard'],
    compatiblePipetteVolumesUl: [1250],
  },
]

const VOYAGER_MODELS: AssistPipetteModel[] = [
  {
    id: 'pipette_assist_voyager_4ch_300',
    family: 'voyager',
    channels: 4,
    volumeClassUl: 300,
    spacingMode: 'adjustable',
    spacingRangeMm: { min: 9, max: 33 },
    baseToolTypeId: 'pipette_4ch_adjustable',
    displayName: 'VOYAGER 4ch 300 uL (9-33 mm)',
  },
  {
    id: 'pipette_assist_voyager_4ch_1250',
    family: 'voyager',
    channels: 4,
    volumeClassUl: 1250,
    spacingMode: 'adjustable',
    spacingRangeMm: { min: 9, max: 33 },
    baseToolTypeId: 'pipette_4ch_adjustable',
    displayName: 'VOYAGER 4ch 1250 uL (9-33 mm)',
  },
  {
    id: 'pipette_assist_voyager_6ch_300',
    family: 'voyager',
    channels: 6,
    volumeClassUl: 300,
    spacingMode: 'adjustable',
    spacingRangeMm: { min: 9, max: 19.8 },
    baseToolTypeId: 'pipette_6ch_adjustable',
    displayName: 'VOYAGER 6ch 300 uL (9-19.8 mm)',
  },
  {
    id: 'pipette_assist_voyager_6ch_1250',
    family: 'voyager',
    channels: 6,
    volumeClassUl: 1250,
    spacingMode: 'adjustable',
    spacingRangeMm: { min: 9, max: 19.8 },
    baseToolTypeId: 'pipette_6ch_adjustable',
    displayName: 'VOYAGER 6ch 1250 uL (9-19.8 mm)',
  },
  {
    id: 'pipette_assist_voyager_8ch_12_5',
    family: 'voyager',
    channels: 8,
    volumeClassUl: 12.5,
    spacingMode: 'adjustable',
    spacingRangeMm: { min: 4.5, max: 14 },
    baseToolTypeId: 'pipette_8ch_adjustable',
    displayName: 'VOYAGER 8ch 12.5 uL (4.5-14 mm)',
  },
  {
    id: 'pipette_assist_voyager_8ch_50',
    family: 'voyager',
    channels: 8,
    volumeClassUl: 50,
    spacingMode: 'adjustable',
    spacingRangeMm: { min: 4.5, max: 14 },
    baseToolTypeId: 'pipette_8ch_adjustable',
    displayName: 'VOYAGER 8ch 50 uL (4.5-14 mm)',
  },
  {
    id: 'pipette_assist_voyager_8ch_125',
    family: 'voyager',
    channels: 8,
    volumeClassUl: 125,
    spacingMode: 'adjustable',
    spacingRangeMm: { min: 4.5, max: 14 },
    baseToolTypeId: 'pipette_8ch_adjustable',
    displayName: 'VOYAGER 8ch 125 uL (4.5-14 mm)',
  },
  {
    id: 'pipette_assist_voyager_8ch_300',
    family: 'voyager',
    channels: 8,
    volumeClassUl: 300,
    spacingMode: 'adjustable',
    spacingRangeMm: { min: 9, max: 14 },
    baseToolTypeId: 'pipette_8ch_adjustable',
    displayName: 'VOYAGER 8ch 300 uL (9-14 mm)',
  },
  {
    id: 'pipette_assist_voyager_8ch_1250',
    family: 'voyager',
    channels: 8,
    volumeClassUl: 1250,
    spacingMode: 'adjustable',
    spacingRangeMm: { min: 9, max: 14 },
    baseToolTypeId: 'pipette_8ch_adjustable',
    displayName: 'VOYAGER 8ch 1250 uL (9-14 mm)',
  },
  {
    id: 'pipette_assist_voyager_12ch_12_5',
    family: 'voyager',
    channels: 12,
    volumeClassUl: 12.5,
    spacingMode: 'adjustable',
    spacingRangeMm: { min: 4.5, max: 9 },
    baseToolTypeId: 'pipette_12ch_adjustable',
    displayName: 'VOYAGER 12ch 12.5 uL (4.5-9 mm)',
  },
  {
    id: 'pipette_assist_voyager_12ch_50',
    family: 'voyager',
    channels: 12,
    volumeClassUl: 50,
    spacingMode: 'adjustable',
    spacingRangeMm: { min: 4.5, max: 9 },
    baseToolTypeId: 'pipette_12ch_adjustable',
    displayName: 'VOYAGER 12ch 50 uL (4.5-9 mm)',
  },
  {
    id: 'pipette_assist_voyager_12ch_125',
    family: 'voyager',
    channels: 12,
    volumeClassUl: 125,
    spacingMode: 'adjustable',
    spacingRangeMm: { min: 4.5, max: 9 },
    baseToolTypeId: 'pipette_12ch_adjustable',
    displayName: 'VOYAGER 12ch 125 uL (4.5-9 mm)',
  },
]

const VIAFLOW_MODELS: AssistPipetteModel[] = [
  { id: 'pipette_assist_viaflow_8ch_12_5', family: 'viaflow', channels: 8, volumeClassUl: 12.5, spacingMode: 'fixed_9mm', baseToolTypeId: 'pipette_8ch_fixed', displayName: 'VIAFLOW 8ch 12.5 uL (fixed 9 mm)' },
  { id: 'pipette_assist_viaflow_8ch_50', family: 'viaflow', channels: 8, volumeClassUl: 50, spacingMode: 'fixed_9mm', baseToolTypeId: 'pipette_8ch_fixed', displayName: 'VIAFLOW 8ch 50 uL (fixed 9 mm)' },
  { id: 'pipette_assist_viaflow_8ch_125', family: 'viaflow', channels: 8, volumeClassUl: 125, spacingMode: 'fixed_9mm', baseToolTypeId: 'pipette_8ch_fixed', displayName: 'VIAFLOW 8ch 125 uL (fixed 9 mm)' },
  { id: 'pipette_assist_viaflow_8ch_300', family: 'viaflow', channels: 8, volumeClassUl: 300, spacingMode: 'fixed_9mm', baseToolTypeId: 'pipette_8ch_fixed', displayName: 'VIAFLOW 8ch 300 uL (fixed 9 mm)' },
  { id: 'pipette_assist_viaflow_8ch_1250', family: 'viaflow', channels: 8, volumeClassUl: 1250, spacingMode: 'fixed_9mm', baseToolTypeId: 'pipette_8ch_fixed', displayName: 'VIAFLOW 8ch 1250 uL (fixed 9 mm)' },
  { id: 'pipette_assist_viaflow_12ch_12_5', family: 'viaflow', channels: 12, volumeClassUl: 12.5, spacingMode: 'fixed_9mm', baseToolTypeId: 'pipette_12ch', displayName: 'VIAFLOW 12ch 12.5 uL (fixed 9 mm)' },
  { id: 'pipette_assist_viaflow_12ch_50', family: 'viaflow', channels: 12, volumeClassUl: 50, spacingMode: 'fixed_9mm', baseToolTypeId: 'pipette_12ch', displayName: 'VIAFLOW 12ch 50 uL (fixed 9 mm)' },
  { id: 'pipette_assist_viaflow_12ch_125', family: 'viaflow', channels: 12, volumeClassUl: 125, spacingMode: 'fixed_9mm', baseToolTypeId: 'pipette_12ch', displayName: 'VIAFLOW 12ch 125 uL (fixed 9 mm)' },
  { id: 'pipette_assist_viaflow_12ch_300', family: 'viaflow', channels: 12, volumeClassUl: 300, spacingMode: 'fixed_9mm', baseToolTypeId: 'pipette_12ch', displayName: 'VIAFLOW 12ch 300 uL (fixed 9 mm)' },
  { id: 'pipette_assist_viaflow_12ch_1250', family: 'viaflow', channels: 12, volumeClassUl: 1250, spacingMode: 'fixed_9mm', baseToolTypeId: 'pipette_12ch', displayName: 'VIAFLOW 12ch 1250 uL (fixed 9 mm)' },
  { id: 'pipette_assist_viaflow_16ch_12_5', family: 'viaflow', channels: 16, volumeClassUl: 12.5, spacingMode: 'fixed_4_5mm', baseToolTypeId: 'pipette_12ch', displayName: 'VIAFLOW 16ch 12.5 uL (fixed 4.5 mm)' },
  { id: 'pipette_assist_viaflow_16ch_50', family: 'viaflow', channels: 16, volumeClassUl: 50, spacingMode: 'fixed_4_5mm', baseToolTypeId: 'pipette_12ch', displayName: 'VIAFLOW 16ch 50 uL (fixed 4.5 mm)' },
  { id: 'pipette_assist_viaflow_16ch_125', family: 'viaflow', channels: 16, volumeClassUl: 125, spacingMode: 'fixed_4_5mm', baseToolTypeId: 'pipette_12ch', displayName: 'VIAFLOW 16ch 125 uL (fixed 4.5 mm)' },
]

export const ASSIST_PIPETTE_MODELS: AssistPipetteModel[] = [
  ...VOYAGER_MODELS,
  ...VIAFLOW_MODELS,
]

const ASSIST_PIPETTE_BY_ID = new Map(ASSIST_PIPETTE_MODELS.map((model) => [model.id, model]))

export function getAssistPipetteModelById(modelId?: string | null): AssistPipetteModel | null {
  if (!modelId) return null
  return ASSIST_PIPETTE_BY_ID.get(modelId) ?? null
}

export function getAssistPipetteTipFamilies(modelId?: string | null): AssistTipFamily[] {
  const model = getAssistPipetteModelById(modelId)
  if (!model) return []
  return ASSIST_TIP_FAMILIES.filter((family) => family.compatiblePipetteVolumesUl.includes(model.volumeClassUl))
}

