import { describe, it, expect } from 'vitest'
import { LABWARE_DEFINITIONS } from './labwareDefinition'
import type { LabwareDefinition } from './labwareDefinition'
import { resolveByLegacyType } from './labwareDefinitionResolver'

function def(partial: Partial<LabwareDefinition> & Pick<LabwareDefinition, 'id'>): LabwareDefinition {
  return {
    display_name: partial.id,
    legacy_labware_types: partial.legacy_labware_types ?? [],
    topology: { addressing: 'grid' },
    capacity: { max_well_volume_uL: 100 },
    ...partial,
  } as LabwareDefinition
}

describe('resolveByLegacyType', () => {
  it('returns undefined for empty defs', () => {
    expect(resolveByLegacyType([], 'plate_96')).toBeUndefined()
  })

  it('returns undefined for unknown legacy type', () => {
    expect(resolveByLegacyType(LABWARE_DEFINITIONS, 'no_such_type')).toBeUndefined()
  })

  it('returns the sole match when only one candidate', () => {
    const a = def({ id: 'x/a@v1', legacy_labware_types: ['foo'], specificity: 'concrete' })
    expect(resolveByLegacyType([a], 'foo')).toBe(a)
  })

  it('prefers concrete over generic', () => {
    const concrete = def({ id: 'x/concrete@v1', legacy_labware_types: ['foo'], specificity: 'concrete' })
    const generic = def({ id: 'x/generic@v1', legacy_labware_types: ['foo'], specificity: 'generic' })
    expect(resolveByLegacyType([generic, concrete], 'foo')).toBe(concrete)
  })

  it('prefers generic over undefined specificity', () => {
    const generic = def({ id: 'x/generic@v1', legacy_labware_types: ['foo'], specificity: 'generic' })
    const undef = def({ id: 'x/undef@v1', legacy_labware_types: ['foo'] })
    expect(resolveByLegacyType([undef, generic], 'foo')).toBe(generic)
  })

  it('breaks concrete-vs-concrete ties by opentrons > integra > other', () => {
    const other = def({ id: 'other/x@v1', legacy_labware_types: ['foo'], specificity: 'concrete', source: 'custom' })
    const integra = def({ id: 'integra/x@v1', legacy_labware_types: ['foo'], specificity: 'concrete', source: 'integra' })
    const ot = def({ id: 'opentrons/x@v1', legacy_labware_types: ['foo'], specificity: 'concrete', source: 'opentrons' })
    expect(resolveByLegacyType([other, integra, ot], 'foo')).toBe(ot)
  })

  it('breaks source ties by ascending id', () => {
    const b = def({ id: 'opentrons/b@v1', legacy_labware_types: ['foo'], specificity: 'concrete', source: 'opentrons' })
    const a = def({ id: 'opentrons/a@v1', legacy_labware_types: ['foo'], specificity: 'concrete', source: 'opentrons' })
    expect(resolveByLegacyType([b, a], 'foo')).toBe(a)
  })

  it('breaks generic-vs-generic ties by ascending id', () => {
    const b = def({ id: 'generic/tube_50ml@v1', legacy_labware_types: ['tube'], specificity: 'generic' })
    const a = def({ id: 'generic/tube_15ml@v1', legacy_labware_types: ['tube'], specificity: 'generic' })
    expect(resolveByLegacyType([b, a], 'tube')).toBe(a)
  })

  it('works on real LABWARE_DEFINITIONS for plate_96', () => {
    const result = resolveByLegacyType(LABWARE_DEFINITIONS, 'plate_96')
    expect(result).toBeDefined()
    expect(result?.id).toBe('opentrons/nest_96_wellplate_200ul_flat@v1')
  })

  it('works on real LABWARE_DEFINITIONS for reservoir_12', () => {
    const result = resolveByLegacyType(LABWARE_DEFINITIONS, 'reservoir_12')
    expect(result?.id).toBe('opentrons/nest_12_reservoir_22ml@v1')
  })
})
