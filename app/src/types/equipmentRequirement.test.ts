import { describe, expect, it } from 'vitest'
import {
  createEquipmentFromRequirement,
  equipmentClassRefForRequirement,
  normalizeEquipmentClassToken,
} from './equipmentRequirement'

describe('equipmentRequirement', () => {
  it('mints a first-class Equipment entity (never labware geometry) for a kind CURIE', () => {
    const eq = createEquipmentFromRequirement('equipment:water_bath', 'bath 1', { temperature_c: 55 })
    expect(eq.equipmentId).toMatch(/^eqp:CL:water_bath:/)
    expect(eq.name).toBe('bath 1')
    expect(eq.instrumentKind).toBe('water_bath')
    expect(eq.settings).toEqual({ temperature_c: 55 })
    // Brad's O1/O7 ruling (2026-09-19): generic entries are CURIEs in the local
    // computable-lab namespace, not `EQC-` records.
    expect(eq.equipmentClassRef).toEqual({
      kind: 'ontology',
      id: 'CL:water_bath',
      namespace: 'CL',
      label: 'Water bath',
    })
    expect((eq as { labwareType?: string }).labwareType).toBeUndefined()
    expect((eq as { addressing?: unknown }).addressing).toBeUndefined()
  })

  it('defaults the name to the kind label when none is given', () => {
    const eq = createEquipmentFromRequirement('equipment:qpcr')
    expect(eq.name).toBe('qPCR machine')
    expect(eq.instrumentKind).toBe('qpcr')
  })

  it('attaches a generic CL: class ref for an `equipment:` prefix CURIE', () => {
    expect(equipmentClassRefForRequirement('equipment:water_bath')).toEqual({
      kind: 'ontology',
      id: 'CL:water_bath',
      namespace: 'CL',
      label: 'Water bath',
    })
  })

  it('keeps an EQC- id as a record ref (a specific, evidenced model)', () => {
    expect(equipmentClassRefForRequirement('EQC-QUANTSTUDIO5')).toEqual({
      kind: 'record',
      type: 'equipment-class',
      id: 'EQC-QUANTSTUDIO5',
    })
  })

  it('normalizes every incoming spelling to the same CL: CURIE', () => {
    expect(normalizeEquipmentClassToken('equipment:water_bath')).toBe('CL:water_bath')
    expect(normalizeEquipmentClassToken('water_bath')).toBe('CL:water_bath')
    expect(normalizeEquipmentClassToken('CL:water_bath')).toBe('CL:water_bath')
    expect(normalizeEquipmentClassToken('Heater Shaker')).toBe('CL:heater_shaker')
    expect(normalizeEquipmentClassToken('EQC-WATER-BATH')).toBe('EQC-WATER-BATH')
    expect(equipmentClassRefForRequirement('equipment:heater_shaker')?.id).toBe('CL:heater_shaker')
  })

  it('returns no class ref for a token that is neither a CURIE nor a record id', () => {
    expect(equipmentClassRefForRequirement('a grey box on the bench')).toBeUndefined()
    expect(equipmentClassRefForRequirement('')).toBeUndefined()
  })
})
