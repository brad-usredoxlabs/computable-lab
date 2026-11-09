/**
 * L2-PROMPT1-GHOST-1 — accepted AI add_material events visible on the
 * Labware-focus grid (RED-first).
 *
 * The REAL committed shape (scout receipt record-after.json, event
 * evt-add_material-9dbjge70): details = { material, volumeUl, volume,
 * wells (30, A2..H5) }, provenance = { actor: ai-agent, method: compiler },
 * NO details.labwareId at event or details level. The deck tile renders it
 * (eventWellIndex D2 single-placed-vessel rule); the grid's projection
 * computeLabwareStates hard-skipped it (`if (!labwareId) continue`) so the
 * Labware-focus grid showed every well empty — on accept AND cold reload.
 *
 * The ruled fix: the SAME single-placed-vessel attribution rule the deck
 * tile already applies (one shared helper, ONE vocabulary) is applied
 * inside computeLabwareStates — never-guess: zero or MULTIPLE placed
 * labwares => attribute to NOTHING; an explicit reference is never
 * re-routed. getWellEvents (history) must agree with the fill.
 */
import { describe, expect, it } from 'vitest'
import { computeLabwareStates, getWellEvents, getWellState } from './eventGraph'
import { buildEventWellIndex } from '../../event-editor/lib/eventWellIndex'
import { createLabware } from '../../types/labware'
import type { Labware } from '../../types/labware'
import type { PlateEvent } from '../../types/events'
import type { WellId } from '../../types/plate'

// The receipt's 30 wells A2..H5 (rows A..H, cols 2..5), verbatim order.
const RECEIPT_WELLS: WellId[] = [
  'A2', 'A3', 'A4', 'A5',
  'B2', 'B3', 'B4', 'B5',
  'C2', 'C3', 'C4', 'C5',
  'D2', 'D3', 'D4', 'D5',
  'E2', 'E3', 'E4', 'E5',
  'F2', 'F3', 'F4', 'F5',
  'G2', 'G3', 'G4', 'G5',
  'H2', 'H3', 'H4', 'H5',
]
const RECEIPT_MATERIAL = 'Thermo trypsin-EDTA + Thermo DMEM + Thermo FBS + HepG2 cells'

/** The REAL committed shape (record-after.json) — wells + material +
 *  volume, NO labwareId anywhere. Fixture data, not policy. */
function realShapedAddMaterial(eventId = 'evt-add_material-9dbjge70'): PlateEvent {
  return {
    eventId,
    event_type: 'add_material',
    verb: 'add_material',
    vocabPackId: 'general',
    details: {
      material: RECEIPT_MATERIAL,
      volumeUl: 100,
      volume: { value: 100, unit: 'uL' },
      wells: RECEIPT_WELLS,
    },
    provenance: {
      actor: 'ai-agent',
      timestamp: '2026-11-01T21:44:00.724Z',
      method: 'compiler',
      actionGroupId: 'compiler-draft',
    },
  } as unknown as PlateEvent
}

function placedPlates(n: number): { plates: Labware[]; ids: string[] } {
  const plates: Labware[] = []
  for (let i = 0; i < n; i += 1) {
    plates.push(createLabware('plate_96', `placed-${i + 1}`))
  }
  return { plates, ids: plates.map((p) => p.labwareId) }
}

describe('L2-PROMPT1-GHOST-1 — computeLabwareStates: the real committed shape projects onto the grid', () => {
  it('RED: one placed labware + the REAL reference-less shape -> empty well states at HEAD', () => {
    const { plates, ids } = placedPlates(1)
    const plate = plates[0]!
    const states = computeLabwareStates(
      [realShapedAddMaterial()],
      new Map(plates.map((p) => [p.labwareId, p])),
    )
    // 30 affected wells carry the material + volume (GREEN after fix).
    for (const wellId of RECEIPT_WELLS) {
      const state = states.get(plate.labwareId)?.get(wellId)
      expect(state?.volume_uL, `well ${wellId} must carry the volume`).toBe(100)
      expect(state?.eventHistory, `well ${wellId} must record the event`).toContain('evt-add_material-9dbjge70')
    }
    // An unaffected well stays empty (no over-attribution) — read the way
    // the grid reads: getWellState resolves absent wells to an empty state.
    expect(getWellState(states, plate.labwareId, 'A1').volume_uL).toBe(0)
    // The labware entry exists (pre-seeded), nothing leaked to other ids.
    expect(ids).toHaveLength(1)
  })

  it('zero placed labwares -> the reference-less event attributes to NOTHING (never guess)', () => {
    const states = computeLabwareStates([realShapedAddMaterial()], new Map())
    expect(Array.from(states.values()).every((s) => s.size === 0)).toBe(true)
  })

  it('TWO placed labwares -> the reference-less event attributes to NOTHING (D2 invariant — never guess)', () => {
    const { plates, ids } = placedPlates(2)
    const states = computeLabwareStates(
      [realShapedAddMaterial()],
      new Map(plates.map((p) => [p.labwareId, p])),
    )
    for (const p of plates) {
      expect(getWellState(states, p.labwareId, 'A2').volume_uL, `labware ${p.labwareId} must stay empty`).toBe(0)
    }
    expect(ids).toHaveLength(2)
  })

  it('an event WITH an explicit details.labwareId is never re-routed by the placed-vessel rule', () => {
    const { plates } = placedPlates(1)
    const explicit: PlateEvent = {
      eventId: 'evt-explicit',
      event_type: 'add_material',
      details: {
        labwareId: 'lbw-named',
        wells: ['A2'],
        volume: { value: 100, unit: 'uL' },
        material: 'explicit material',
      },
    } as unknown as PlateEvent
    const states = computeLabwareStates(
      [explicit],
      new Map(plates.map((p) => [p.labwareId, p])),
    )
    expect(states.get('lbw-named')?.get('A2')?.volume_uL).toBe(100)
    expect(getWellState(states, plates[0]!.labwareId, 'A2').volume_uL).toBe(0)
  })
})

describe('L2-PROMPT1-GHOST-1 — getWellEvents history agrees with the fill (history-vs-fill)', () => {
  it('an attributed well lists its reference-less add_material in history (single placed labware)', () => {
    const { plates, ids } = placedPlates(1)
    const plate = plates[0]!
    const events = [realShapedAddMaterial()]
    const history = getWellEvents(events, plate.labwareId, 'A2', new Map(plates.map((p) => [p.labwareId, p])))
    expect(history.map((e) => e.eventId)).toEqual(['evt-add_material-9dbjge70'])
    // Same labwares map as the fill — the reader the grid uses.
    const fill = getWellState(computeLabwareStates(events, new Map(plates.map((p) => [p.labwareId, p]))), plate.labwareId, 'A2')
    expect(fill.eventHistory).toContain(history[0]!.eventId)
    expect(ids).toHaveLength(1)
  })

  it('TWO placed labwares -> history agrees with the empty fill (nothing on either)', () => {
    const { plates, ids } = placedPlates(2)
    const events = [realShapedAddMaterial()]
    const labwares = new Map(plates.map((p) => [p.labwareId, p]))
    for (const p of plates) {
      expect(getWellEvents(events, p.labwareId, 'A2', labwares)).toHaveLength(0)
      expect(
        getWellState(computeLabwareStates(events, labwares), p.labwareId, 'A2').volume_uL,
      ).toBe(0)
    }
    expect(ids).toHaveLength(2)
  })

  it('an explicit-labware event does NOT match a well of the labware it did not affect (well membership still enforced)', () => {
    const { plates } = placedPlates(1)
    const plate = plates[0]!
    const explicit: PlateEvent = {
      eventId: 'evt-explicit',
      event_type: 'add_material',
      details: { labwareId: plate.labwareId, wells: ['A2'], volume: { value: 100, unit: 'uL' } },
    } as unknown as PlateEvent
    // The event references the plate explicitly but only affects A2. B1 of the
    // SAME plate never received it: history must stay empty there (RED pin —
    // the generic arm returning `details.labwareId === labwareId` without the
    // well-membership test lists it on every well of the labware).
    expect(getWellEvents([explicit], plate.labwareId, 'B1')).toHaveLength(0)
    // Same under the 4-arg reader the grid uses, and the fill must agree
    // (history-vs-fill: B1 has no event in its state either).
    const labwares = new Map(plates.map((p) => [p.labwareId, p]))
    expect(getWellEvents([explicit], plate.labwareId, 'B1', labwares)).toHaveLength(0)
    expect(getWellState(computeLabwareStates([explicit], labwares), plate.labwareId, 'B1').eventHistory)
      .toHaveLength(0)
    // The affected well still matches (control: the membership test is on the
    // well, not the labware ref alone).
    expect(getWellEvents([explicit], plate.labwareId, 'A2', labwares).map((e) => e.eventId))
      .toEqual(['evt-explicit'])
  })

  it('legacy call shape (no labwares arg) keeps strict reference matching', () => {
    const { plates } = placedPlates(1)
    const plate = plates[0]!
    const explicit: PlateEvent = {
      eventId: 'evt-explicit',
      event_type: 'add_material',
      details: { labwareId: plate.labwareId, wells: ['A2'], volume: { value: 100, unit: 'uL' } },
    } as unknown as PlateEvent
    const referenceless = realShapedAddMaterial()
    // Explicit ref still matches; the reference-less one does not without
    // the labwares context (no guess at the legacy boundary).
    expect(getWellEvents([explicit, referenceless], plate.labwareId, 'A2').map((e) => e.eventId))
      .toEqual(['evt-explicit'])
  })
})

describe('L2-PROMPT1-GHOST-1 — shared-rule pin: deck tile and grid projection pick the SAME labware', () => {
  it('the deck index and computeLabwareStates attribute the same event to the same single placed vessel', () => {
    const { plates, ids } = placedPlates(1)
    const plate = plates[0]!
    const events = [realShapedAddMaterial()]
    const deckIndex = buildEventWellIndex(events, null, {}, ids)
    const gridStates = computeLabwareStates(events, new Map(plates.map((p) => [p.labwareId, p])))
    // One vocabulary: the SAME rule on the SAME facts picks the SAME vessel.
    expect([...deckIndex.keys()]).toEqual([plate.labwareId])
    expect(gridStates.get(plate.labwareId)?.get('A2')?.volume_uL).toBe(100)
    // Multi-vessel: the SAME rule refuses on BOTH surfaces (never guess).
    const two = placedPlates(2)
    const deckTwo = buildEventWellIndex(events, null, {}, two.ids)
    const gridTwo = computeLabwareStates(events, new Map(two.plates.map((p) => [p.labwareId, p])))
    expect(deckTwo.size).toBe(0)
    for (const p of two.plates) {
      expect(getWellState(gridTwo, p.labwareId, 'A2').volume_uL).toBe(0)
    }
  })
})
