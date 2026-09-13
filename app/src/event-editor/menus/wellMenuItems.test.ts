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