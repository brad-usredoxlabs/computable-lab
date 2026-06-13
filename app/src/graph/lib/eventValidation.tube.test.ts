import { describe, expect, it } from 'vitest'
import { validateEventGraph } from './eventValidation'
import { createLabware, type Labware } from '../../types/labware'
import type { PlateEvent } from '../../types/events'

function rackMap(rack: Labware): Map<string, Labware> {
  return new Map([[rack.labwareId, rack]])
}

describe('eventValidation — tube capacity & occupancy', () => {
  it('overflows against the placed tube, not the rack default', () => {
    // Rack default is 2 mL, but a 0.5 mL tube is placed → 600 µL overflows.
    const rack = createLabware('tubeset_4way_32x2ml', 'rack')
    const events: PlateEvent[] = [
      { eventId: 'e1', event_type: 'place_tube', details: { labwareId: rack.labwareId, wells: ['A1'], tube: { sizeLabel: '0.5 mL', maxVolume_uL: 500 } } },
      { eventId: 'e2', event_type: 'add_material', details: { labwareId: rack.labwareId, wells: ['A1'], material_ref: 'water', volume: { value: 600, unit: 'uL' } } },
    ]
    const result = validateEventGraph(events, rackMap(rack))
    const overfill = result.errors.find((e) => e.code === 'OVERFILL' && e.wellId === 'A1')
    expect(overfill).toBeDefined()
    expect(overfill?.details?.maxVolume).toBe(500)
  })

  it('does NOT overflow when the same volume fits the placed tube', () => {
    const rack = createLabware('tubeset_4way_32x2ml', 'rack')
    const events: PlateEvent[] = [
      { eventId: 'e1', event_type: 'place_tube', details: { labwareId: rack.labwareId, wells: ['A1'], tube: { sizeLabel: '2 mL', maxVolume_uL: 2000 } } },
      { eventId: 'e2', event_type: 'add_material', details: { labwareId: rack.labwareId, wells: ['A1'], material_ref: 'water', volume: { value: 600, unit: 'uL' } } },
    ]
    const result = validateEventGraph(events, rackMap(rack))
    expect(result.errors.find((e) => e.code === 'OVERFILL')).toBeUndefined()
  })

  it('warns when material lands in a rack well with no placed tube', () => {
    const rack = createLabware('tubeset_4way_32x2ml', 'rack')
    const events: PlateEvent[] = [
      { eventId: 'e1', event_type: 'add_material', details: { labwareId: rack.labwareId, wells: ['A1'], material_ref: 'water', volume: { value: 100, unit: 'uL' } } },
    ]
    const result = validateEventGraph(events, rackMap(rack))
    const warn = result.errors.find((e) => e.code === 'TUBELESS_WELL_AUTOFILLED' && e.wellId === 'A1')
    expect(warn).toBeDefined()
    expect(warn?.severity).toBe('warning')
  })

  it('does not warn when a tube was explicitly placed first', () => {
    const rack = createLabware('tubeset_4way_32x2ml', 'rack')
    const events: PlateEvent[] = [
      { eventId: 'e1', event_type: 'place_tube', details: { labwareId: rack.labwareId, wells: ['A1'], tube: { sizeLabel: '2 mL', maxVolume_uL: 2000 } } },
      { eventId: 'e2', event_type: 'add_material', details: { labwareId: rack.labwareId, wells: ['A1'], material_ref: 'water', volume: { value: 100, unit: 'uL' } } },
    ]
    const result = validateEventGraph(events, rackMap(rack))
    expect(result.errors.find((e) => e.code === 'TUBELESS_WELL_AUTOFILLED')).toBeUndefined()
  })
})
