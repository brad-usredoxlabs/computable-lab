import { describe, expect, it } from 'vitest'
import { eventEditorReducer, eventEditorInitialState } from './EventEditorContext'
import type { Equipment } from '../types/equipment'

const bath: Equipment = {
  equipmentId: 'eqp-1',
  name: 'Water bath 1',
  instrumentKind: 'water_bath',
  settings: { temperature_c: 50 },
}

describe('equipment settings editing', () => {
  it('equipment settings update mutates the placed equipment', () => {
    const placed = eventEditorReducer(
      eventEditorInitialState,
      { type: 'place_equipment', equipment: bath, location: { kind: 'lawn', xMm: 10, yMm: 10 }, orientation: 'landscape' },
    )
    const updated = eventEditorReducer(placed, {
      type: 'update_equipment_settings',
      equipmentId: 'eqp-1',
      settings: { temperature_c: 65 },
    })
    expect(updated.equipments['eqp-1']).toMatchObject({ settings: { temperature_c: 65 } })
    expect(updated.placements).toHaveLength(1)
  })

  it('equipment settings update is a no-op for an unknown equipment id', () => {
    const updated = eventEditorReducer(eventEditorInitialState, {
      type: 'update_equipment_settings',
      equipmentId: 'nope',
      settings: { temperature_c: 65 },
    })
    expect(updated.equipments).toEqual({})
  })
})