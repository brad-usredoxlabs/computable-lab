import { describe, expect, it } from 'vitest'
import { createLabwareFromRequirement, labwareTypeForRequirement } from './labwareRequirement'

describe('labwareRequirement', () => {
  it('maps baseline plate and reservoir classes to editor labware types', () => {
    expect(labwareTypeForRequirement({ classCurie: 'CL:1536_well_plate' })).toBe('plate_1536')
    expect(labwareTypeForRequirement({ classCurie: 'CL:12_well_reservoir_vertical' })).toBe('reservoir_12')
    expect(labwareTypeForRequirement({ classCurie: 'CL:24_well_reservoir_vertical_384_pitch' })).toBe('reservoir_24')
  })

  it('maps tube rack volume classes to available editor racks', () => {
    expect(labwareTypeForRequirement({ classCurie: 'CL:tube_rack_15ml' })).toBe('tubeset_6x15ml')
    expect(labwareTypeForRequirement({ classCurie: 'CL:tube_rack_50ml' })).toBe('tubeset_4x50ml')
    expect(labwareTypeForRequirement({ classCurie: 'CL:tube_rack', tubeVolumeClass: '1.5ml' })).toBe('tubeset_50x1p5ml')
  })

  it('creates ghostable labware with requirement metadata', () => {
    const labware = createLabwareFromRequirement({
      classCurie: 'CL:96_well_plate',
      constraints: ['CL:black', 'CL:low_binding'],
      reason: 'top-read fluorescence',
    })

    expect(labware.labwareType).toBe('plate_96')
    expect(labware.sourceRecordId).toBe('CL:96_well_plate')
    expect(labware.requirementClassCurie).toBe('CL:96_well_plate')
    expect(labware.requirementSpecificity).toBe('constrained')
    expect(labware.requirementConstraints).toEqual(['CL:black', 'CL:low_binding'])
    expect(labware.notes).toBe('top-read fluorescence')
  })
})
