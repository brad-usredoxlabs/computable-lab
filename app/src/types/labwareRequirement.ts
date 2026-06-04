import { createLabware, type Labware, type LabwareType } from './labware'

export type LabwareRequirementSpecificity = 'generic' | 'constrained' | 'concrete'

export interface LabwareRequirement {
  classCurie: string
  handle?: string
  deckSlot?: string
  constraints?: string[]
  specificity?: LabwareRequirementSpecificity
  reason?: string
  tubeVolumeClass?: '1.5ml' | '2ml' | '5ml' | '15ml' | '50ml'
  rows?: number
  columns?: number
}

export const BASELINE_LABWARE_CLASSES = [
  'CL:96_well_plate',
  'CL:96_deepwell_plate',
  'CL:384_well_plate',
  'CL:1536_well_plate',
  'CL:6_well_plate',
  'CL:12_well_plate',
  'CL:24_well_plate',
  'CL:48_well_plate',
  'CL:8_well_reservoir_horizontal',
  'CL:12_well_reservoir_vertical',
  'CL:single_well_reservoir_sbs',
  'CL:16_well_reservoir_horizontal_384_pitch',
  'CL:24_well_reservoir_vertical_384_pitch',
  'CL:tube_rack',
  'CL:tube_rack_1p5ml',
  'CL:tube_rack_2ml',
  'CL:tube_rack_5ml',
  'CL:tube_rack_15ml',
  'CL:tube_rack_50ml',
] as const

function normalizeClassCurie(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('CL:')) return trimmed
  const lower = trimmed.toLowerCase().replace(/[\s-]+/g, '_')
  if (lower.includes('1536')) return 'CL:1536_well_plate'
  if (lower.includes('384')) return 'CL:384_well_plate'
  if (lower.includes('96') && lower.includes('deep')) return 'CL:96_deepwell_plate'
  if (lower.includes('96')) return 'CL:96_well_plate'
  if (lower.includes('48')) return 'CL:48_well_plate'
  if (lower.includes('24') && lower.includes('reservoir')) return 'CL:24_well_reservoir_vertical_384_pitch'
  if (lower.includes('24')) return 'CL:24_well_plate'
  if (lower.includes('12') && lower.includes('reservoir')) return 'CL:12_well_reservoir_vertical'
  if (lower.includes('12')) return 'CL:12_well_plate'
  if (lower.includes('8') && lower.includes('reservoir')) return 'CL:8_well_reservoir_horizontal'
  if (lower.includes('6')) return 'CL:6_well_plate'
  if (lower.includes('single') && lower.includes('reservoir')) return 'CL:single_well_reservoir_sbs'
  if (lower.includes('tube')) return 'CL:tube_rack'
  return trimmed
}

export function labwareTypeForRequirement(req: LabwareRequirement): LabwareType {
  const classCurie = normalizeClassCurie(req.classCurie)
  switch (classCurie) {
    case 'CL:96_well_plate':
      return 'plate_96'
    case 'CL:384_well_plate':
      return 'plate_384'
    case 'CL:1536_well_plate':
      return 'plate_1536'
    case 'CL:96_deepwell_plate':
      return 'deepwell_96'
    case 'CL:6_well_plate':
      return 'plate_6'
    case 'CL:12_well_plate':
      return 'plate_12'
    case 'CL:24_well_plate':
      return 'plate_24'
    case 'CL:48_well_plate':
      return 'plate_48'
    case 'CL:8_well_reservoir_horizontal':
      return 'reservoir_8'
    case 'CL:12_well_reservoir_vertical':
      return 'reservoir_12'
    case 'CL:single_well_reservoir_sbs':
      return 'reservoir_1'
    case 'CL:16_well_reservoir_horizontal_384_pitch':
      return 'reservoir_16'
    case 'CL:24_well_reservoir_vertical_384_pitch':
      return 'reservoir_24'
    case 'CL:tube_rack_1p5ml':
    case 'CL:tube_rack_2ml':
      return 'tubeset_50x1p5ml'
    case 'CL:tube_rack_15ml':
      return 'tubeset_6x15ml'
    case 'CL:tube_rack_50ml':
      return 'tubeset_4x50ml'
    case 'CL:tube_rack_5ml':
    case 'CL:tube_rack':
    default:
      if (req.tubeVolumeClass === '15ml') return 'tubeset_6x15ml'
      if (req.tubeVolumeClass === '50ml') return 'tubeset_4x50ml'
      if (req.tubeVolumeClass === '1.5ml' || req.tubeVolumeClass === '2ml') return 'tubeset_50x1p5ml'
      return 'tubeset_24'
  }
}

export function defaultHandleForRequirement(req: LabwareRequirement): string | undefined {
  if (req.handle?.trim()) return req.handle.trim()
  const labwareType = labwareTypeForRequirement(req)
  if (labwareType.startsWith('plate_') || labwareType === 'deepwell_96') return undefined
  if (labwareType.startsWith('reservoir_')) return undefined
  if (labwareType === 'tube') return undefined
  if (labwareType.startsWith('tubeset_')) return undefined
  return undefined
}

function requirementName(req: LabwareRequirement): string | undefined {
  const handle = defaultHandleForRequirement(req)
  if (handle) return handle
  return undefined
}

export function createLabwareFromRequirement(req: LabwareRequirement): Labware {
  const classCurie = normalizeClassCurie(req.classCurie)
  const labware = createLabware(labwareTypeForRequirement({ ...req, classCurie }), requirementName(req))
  return {
    ...labware,
    labwareId: `req:${classCurie}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
    sourceRecordId: classCurie,
    requirementClassCurie: classCurie,
    requirementConstraints: req.constraints ?? [],
    requirementSpecificity: req.specificity ?? ((req.constraints?.length ?? 0) > 0 ? 'constrained' : 'generic'),
    ...(req.reason ? { notes: req.reason } : {}),
  }
}
