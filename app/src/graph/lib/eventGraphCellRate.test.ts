/**
 * CELLRATE-1 Plane 3 — eventGraph projection: the ledger keeps the DECLARED
 * rate on a rate-only cells row.
 *
 * Defect (spec §5.3): the density attach predicate required a count
 * (`count !== undefined && details.counter_density`), which ERASES the rate on
 * a rate-only event — the new post-fix compiled shape (counter_density, no
 * count). Widen so counter_density attaches whenever present on the row the
 * count grant targets or a cells row (same generic discipline as the
 * :529-530 comment — never a name lookup). Legacy events (count + density)
 * stay byte-stable. The ledger stores density, NOT a computed total (quantity
 * law: no arithmetic in the projection).
 */
import { describe, expect, it } from 'vitest'
import { computeLabwareStates } from './eventGraph'
import { createLabware } from '../../types/labware'
import type { PlateEvent } from '../../types/events'

/** The post-fix compiled shape: counter_density declared, NO count key. */
function rateOnlyEvent(labwareId: string): PlateEvent {
  return {
    eventId: 'evt-rate-only',
    event_type: 'add_material',
    details: {
      labwareId,
      wells: ['A1'],
      volume: { value: 100, unit: 'uL' },
      counter_density: { value: 200, unit: 'cells/uL', basis: 'count_per_volume' },
      composition_snapshot: [
        { component_ref: { kind: 'draft', id: 'mint:DMEM', label: 'DMEM' }, role: 'buffer_component', source: '100% of the mixture' },
        { component_ref: { kind: 'draft', id: 'mint:HepG2 cells', label: 'HepG2 cells' }, role: 'cells' },
      ],
    },
  }
}

/** The legacy shape: count + density (byte-stability leg). */
function legacyEvent(labwareId: string): PlateEvent {
  return {
    eventId: 'evt-legacy',
    event_type: 'add_material',
    details: {
      labwareId,
      wells: ['A1'],
      volume: { value: 100, unit: 'uL' },
      count: 50000,
      counter_density: { value: 500, unit: 'cells/uL' },
      composition_snapshot: [
        { component_ref: { kind: 'draft', id: 'mint:DMEM', label: 'DMEM' }, role: 'buffer_component', source: '100% of the mixture' },
        { component_ref: { kind: 'draft', id: 'mint:HepG2 cells', label: 'HepG2 cells' }, role: 'cells' },
      ],
    },
  }
}

function rowsFor(build: (labwareId: string) => PlateEvent) {
  // createLabware mints a RANDOM labwareId — the event must carry the labware's
  // own id or computeLabwareStates skips it (fixture pitfall, not a defect).
  const labware = createLabware('plate_96', 'cellrate-proj')
  const states = computeLabwareStates([build(labware.labwareId)], new Map([[labware.labwareId, labware]]))
  const a1 = states.get(labware.labwareId)?.get('A1')
  if (!a1) throw new Error('A1 state missing')
  return a1
}

describe('eventGraph rate-only projection (CELLRATE-1)', () => {
  it('rate-only event: counter_density stays on the cells row (RED at base — the count-gated predicate drops it)', () => {
    const a1 = rowsFor(rateOnlyEvent)
    const cells = a1.materials.find((m) => m.role === 'cells')
    expect(cells).toBeTruthy()
    expect(cells?.counterDensity?.value).toBe(200)
    expect(cells?.counterDensity?.unit).toBe('cells/uL')
    // The ledger stores the DECLARED rate, never a computed total.
    expect(cells?.count).toBeUndefined()
    // No arithmetic in the projection: the well total is the declared volume.
    expect(a1.volume_uL).toBe(100)
  })

  it('legacy count+density row stays byte-stable (characterization)', () => {
    const a1 = rowsFor(legacyEvent)
    const cells = a1.materials.find((m) => m.role === 'cells')
    expect(cells?.count).toBe(50000)
    expect(cells?.counterDensity?.value).toBe(500)
    expect(cells?.counterDensity?.unit).toBe('cells/uL')
  })
})
