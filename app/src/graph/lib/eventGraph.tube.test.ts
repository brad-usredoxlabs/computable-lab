import { describe, expect, it } from 'vitest'
import { computeLabwareStates, getWellState } from './eventGraph'
import { createLabware, type Labware } from '../../types/labware'
import type { PlateEvent } from '../../types/events'

function rackMap(...racks: Labware[]): Map<string, Labware> {
  return new Map(racks.map((r) => [r.labwareId, r]))
}

describe('eventGraph tube occupancy', () => {
  it('place_tube records a tube; capacity follows the placed tube, not the rack', () => {
    // A 0.5 mL tube placed in a rack whose default is 2 mL.
    const rack = createLabware('tubeset_4way_32x2ml', 'rack')
    const events: PlateEvent[] = [{
      eventId: 'e1',
      event_type: 'place_tube',
      details: { labwareId: rack.labwareId, wells: ['A1'], tube: { sizeLabel: '0.5 mL', maxVolume_uL: 500 } },
    }]
    const a1 = getWellState(computeLabwareStates(events, rackMap(rack)), rack.labwareId, 'A1')
    expect(a1.tube?.sizeLabel).toBe('0.5 mL')
    expect(a1.tube?.maxVolume_uL).toBe(500)
    expect(a1.tube?.implied).toBeUndefined()
    expect(a1.volume_uL).toBe(0)
  })

  it('auto-implies a default tube when material lands in a tubeless rack well', () => {
    const rack = createLabware('tubeset_4way_32x2ml', 'rack')
    const events: PlateEvent[] = [{
      eventId: 'e1',
      event_type: 'add_material',
      details: { labwareId: rack.labwareId, wells: ['A1'], material_ref: 'water', volume: { value: 100, unit: 'uL' } },
    }]
    const a1 = getWellState(computeLabwareStates(events, rackMap(rack)), rack.labwareId, 'A1')
    expect(a1.tube?.implied).toBe(true)
    expect(a1.volume_uL).toBe(100)
  })

  it('does not imply a tube on a plate well', () => {
    const plate = createLabware('plate_96', 'plate')
    const events: PlateEvent[] = [{
      eventId: 'e1',
      event_type: 'add_material',
      details: { labwareId: plate.labwareId, wells: ['A1'], material_ref: 'water', volume: { value: 100, unit: 'uL' } },
    }]
    const a1 = getWellState(computeLabwareStates(events, rackMap(plate)), plate.labwareId, 'A1')
    expect(a1.tube).toBeUndefined()
  })

  it('remove_tube clears the tube and its contents', () => {
    const rack = createLabware('tubeset_4way_32x2ml', 'rack')
    const events: PlateEvent[] = [
      { eventId: 'e1', event_type: 'place_tube', details: { labwareId: rack.labwareId, wells: ['A1'], tube: { sizeLabel: '2 mL', maxVolume_uL: 2000 } } },
      { eventId: 'e2', event_type: 'add_material', details: { labwareId: rack.labwareId, wells: ['A1'], material_ref: 'water', volume: { value: 200, unit: 'uL' } } },
      { eventId: 'e3', event_type: 'remove_tube', details: { labwareId: rack.labwareId, wells: ['A1'] } },
    ]
    const a1 = getWellState(computeLabwareStates(events, rackMap(rack)), rack.labwareId, 'A1')
    expect(a1.tube).toBeUndefined()
    expect(a1.volume_uL).toBe(0)
    expect(a1.materials).toEqual([])
  })

  it('move_tube within a rack carries contents and empties the source', () => {
    const rack = createLabware('tubeset_80x2ml', 'rack')
    const events: PlateEvent[] = [
      { eventId: 'e1', event_type: 'place_tube', details: { labwareId: rack.labwareId, wells: ['A1'], tube: { sizeLabel: '2 mL', maxVolume_uL: 2000 } } },
      { eventId: 'e2', event_type: 'add_material', details: { labwareId: rack.labwareId, wells: ['A1'], material_ref: 'water', volume: { value: 300, unit: 'uL' } } },
      { eventId: 'e3', event_type: 'move_tube', details: { source: { labwareId: rack.labwareId, well: 'A1' }, target: { labwareId: rack.labwareId, well: 'B2' } } },
    ]
    const states = computeLabwareStates(events, rackMap(rack))
    const a1 = getWellState(states, rack.labwareId, 'A1')
    const b2 = getWellState(states, rack.labwareId, 'B2')
    expect(a1.tube).toBeUndefined()
    expect(a1.volume_uL).toBe(0)
    expect(b2.tube?.sizeLabel).toBe('2 mL')
    expect(b2.volume_uL).toBe(300)
  })

  it('move_tube between racks relocates the tube and its contents', () => {
    const rackA = createLabware('tubeset_80x2ml', 'A')
    const rackB = createLabware('tubeset_80x2ml', 'B')
    const events: PlateEvent[] = [
      { eventId: 'e1', event_type: 'place_tube', details: { labwareId: rackA.labwareId, wells: ['A1'], tube: { sizeLabel: '2 mL', maxVolume_uL: 2000 } } },
      { eventId: 'e2', event_type: 'add_material', details: { labwareId: rackA.labwareId, wells: ['A1'], material_ref: 'water', volume: { value: 250, unit: 'uL' } } },
      { eventId: 'e3', event_type: 'move_tube', details: { source: { labwareId: rackA.labwareId, well: 'A1' }, target: { labwareId: rackB.labwareId, well: 'C3' } } },
    ]
    const states = computeLabwareStates(events, rackMap(rackA, rackB))
    expect(getWellState(states, rackA.labwareId, 'A1').tube).toBeUndefined()
    const dest = getWellState(states, rackB.labwareId, 'C3')
    expect(dest.tube?.maxVolume_uL).toBe(2000)
    expect(dest.volume_uL).toBe(250)
  })
})
