import { describe, expect, it, vi } from 'vitest'
import { buildWellMenuItems } from './wellMenuItems'
import { createLabware } from '../../types/labware'
import { computeLabwareStates } from '../../graph/lib/eventGraph'
import type { EventEditorActions } from '../EventEditorContext'

function noopActions(): EventEditorActions {
  // buildWellMenuItems only reads actions for the well-specific entries;
  // the plate-level assertions below never touch it.
  return {} as EventEditorActions
}

describe('buildWellMenuItems plate-level actions', () => {
  it('puts Rotate and Read plate at the top, above any well-specific items', () => {
    const plate = createLabware('plate_96', 'plate')
    const states = computeLabwareStates([], new Map([[plate.labwareId, plate]]))
    const onRotate = vi.fn()
    const onReadPlate = vi.fn()

    const { items } = buildWellMenuItems({
      labware: plate,
      labwareStates: states,
      targetWells: ['A1'],
      tip: { kind: 'empty' },
      actions: noopActions(),
      onClearSelection: vi.fn(),
      onRotate,
      onReadPlate,
    })

    const ids = items.map((i) => i.id)
    const rotIdx = ids.indexOf('plate-rotate')
    const readIdx = ids.indexOf('plate-read')
    const firstWellIdx = ids.indexOf('aspirate')
    // Rotate and Read plate lead the menu, ahead of aspirate/dispense/etc.
    expect(rotIdx).toBeGreaterThanOrEqual(0)
    expect(readIdx).toBeGreaterThanOrEqual(0)
    expect(rotIdx).toBeLessThan(firstWellIdx)
    expect(readIdx).toBeLessThan(firstWellIdx)
    // A separator follows the plate-level block.
    expect(items[Math.max(rotIdx, readIdx) + 1].separator).toBe(true)

    const rotate = items.find((i) => i.id === 'plate-rotate')
    const read = items.find((i) => i.id === 'plate-read')
    rotate!.onSelect!()
    read!.onSelect!()
    expect(onRotate).toHaveBeenCalledTimes(1)
    expect(onReadPlate).toHaveBeenCalledTimes(1)
  })

  it('omits the plate-level block when no plate callbacks are wired', () => {
    const plate = createLabware('plate_96', 'plate')
    const states = computeLabwareStates([], new Map([[plate.labwareId, plate]]))

    const { items } = buildWellMenuItems({
      labware: plate,
      labwareStates: states,
      targetWells: ['A1'],
      tip: { kind: 'empty' },
      actions: noopActions(),
      onClearSelection: vi.fn(),
    })

    expect(items.some((i) => i.id === 'plate-rotate' || i.id === 'plate-read')).toBe(false)
    // A context menu that only ever used the header would leave Aspirate first.
    expect(items[0].id).toBe('aspirate')
  })
})

describe('buildWellMenuItems plate-scoped menu (no wells)', () => {
  const plate = () => createLabware('plate_96', 'plate')

  it('emits only the labware-wide actions when nothing is selected', () => {
    const labware = plate()
    const states = computeLabwareStates([], new Map([[labware.labwareId, labware]]))

    const { title, items } = buildWellMenuItems({
      labware,
      labwareStates: states,
      targetWells: [],
      plateOnly: true,
      tip: { kind: 'empty' },
      actions: noopActions(),
      onClearSelection: vi.fn(),
      onRotate: vi.fn(),
      onReadPlate: vi.fn(),
    })

    expect(items.map((i) => i.id)).toEqual(['plate-rotate', 'plate-read'])
    // No well-scoped entry may survive: there is no well to act on.
    const wellOnly = ['aspirate', 'dispense', 'add-material', 'mix', 'inspect', 'clear-selection']
    expect(items.some((i) => wellOnly.includes(i.id))).toBe(false)
    // Title names the plate, never a fabricated "0 wells (undefined…undefined)".
    expect(title).toContain('plate')
    expect(title).not.toContain('undefined')
  })

  it('stands a disabled row in when no plate callbacks are wired', () => {
    const labware = plate()
    const states = computeLabwareStates([], new Map([[labware.labwareId, labware]]))

    const { items } = buildWellMenuItems({
      labware,
      labwareStates: states,
      targetWells: [],
      plateOnly: true,
      tip: { kind: 'empty' },
      actions: noopActions(),
      onClearSelection: vi.fn(),
    })

    expect(items).toHaveLength(1)
    expect(items[0].disabled).toBe(true)
  })
})