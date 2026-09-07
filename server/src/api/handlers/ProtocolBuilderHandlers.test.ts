import { describe, expect, it } from 'vitest'
import {
  isGenericRoleLabel,
  backfillRolesFromSteps,
} from './ProtocolBuilderHandlers'

describe('isGenericRoleLabel', () => {
  it('flags placeholder / generic labels', () => {
    expect(isGenericRoleLabel('material:role')).toBe(true)
    expect(isGenericRoleLabel('equipment:role')).toBe(true)
    expect(isGenericRoleLabel('labware:role')).toBe(true)
    expect(isGenericRoleLabel('role')).toBe(true)
    expect(isGenericRoleLabel('n/a')).toBe(true)
    expect(isGenericRoleLabel('n/a')).toBe(true)
    expect(isGenericRoleLabel('material')).toBe(false) // a real noun "material" is fine
    expect(isGenericRoleLabel('reagent')).toBe(false)
    expect(isGenericRoleLabel(undefined)).toBe(true)
    expect(isGenericRoleLabel('')).toBe(true)
  })

  it('does NOT flag real nouns', () => {
    expect(isGenericRoleLabel('CellROX Detection Reagent')).toBe(false)
    expect(isGenericRoleLabel('Flow Cytometer')).toBe(false)
    expect(isGenericRoleLabel('SYTOX Dead Cell Stain')).toBe(false)
  })
})

describe('backfillRolesFromSteps', () => {
  it('drops generic roles and backfills real names from steps', () => {
    const out = backfillRolesFromSteps(
      [{ label: 'material:role' }],
      [{ materials: ['CellROX Detection Reagent', 'SYTOX Dead Cell Stain'] }],
      'materials',
    )
    expect(out.map((x) => x.label)).toEqual(['CellROX Detection Reagent', 'SYTOX Dead Cell Stain'])
  })

  it('does not duplicate an existing real role', () => {
    const out = backfillRolesFromSteps(
      [{ label: 'Flow Cytometer' }],
      [{ equipment: ['Flow Cytometer'] }],
      'equipment',
    )
    expect(out.map((x) => x.label)).toEqual(['Flow Cytometer'])
  })

  it('dedupes names across steps (case-insensitive)', () => {
    const out = backfillRolesFromSteps(
      [],
      [
        { labware: ['96-well plate'] },
        { labware: ['96-WELL PLATE'] },
      ],
      'labware',
    )
    expect(out.map((x) => x.label)).toEqual(['96-well plate'])
  })
})