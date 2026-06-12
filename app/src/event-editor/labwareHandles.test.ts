import { describe, expect, it } from 'vitest'
import { createLabware } from '../types/labware'
import { assignVisibleLabwareHandle, findLabwareNameConflict } from './labwareHandles'

describe('labwareHandles', () => {
  it('defaults generic plate and reservoir names to prompt-friendly handles', () => {
    const plate = assignVisibleLabwareHandle(createLabware('plate_96'), [])
    const reservoir = assignVisibleLabwareHandle(createLabware('reservoir_12'), [plate])

    expect(plate.name).toBe('plate1')
    expect(reservoir.name).toBe('res1')
  })

  it('increments handles for multi-plate decks', () => {
    const plate1 = assignVisibleLabwareHandle(createLabware('plate_96'), [])
    const plate2 = assignVisibleLabwareHandle(createLabware('plate_96'), [plate1])

    expect(plate1.name).toBe('plate1')
    expect(plate2.name).toBe('plate2')
  })

  it('preserves an explicit user name', () => {
    const named = assignVisibleLabwareHandle(createLabware('plate_96', 'assay plate'), [])

    expect(named.name).toBe('assay plate')
  })
})

describe('findLabwareNameConflict', () => {
  it('finds case-insensitive, whitespace-trimmed collisions', () => {
    const bob = createLabware('plate_96', 'bob')
    expect(findLabwareNameConflict('BOB', [bob])).toBe(bob)
    expect(findLabwareNameConflict('  bob ', [bob])).toBe(bob)
    expect(findLabwareNameConflict('alice', [bob])).toBeNull()
  })

  it('excludes the labware being renamed so a self case-change is allowed', () => {
    const bob = createLabware('plate_96', 'bob')
    expect(findLabwareNameConflict('Bob', [bob], bob.labwareId)).toBeNull()
  })

  it('treats empty names as non-conflicting', () => {
    const bob = createLabware('plate_96', 'bob')
    expect(findLabwareNameConflict('   ', [bob])).toBeNull()
  })
})
