import { describe, expect, it } from 'vitest'
import { eventEditorReducer, eventEditorInitialState, type EventEditorPreview } from './EventEditorContext'
import { buildPreviewWellIndex } from './lib/previewProjection'
import type { Equipment } from '../types/equipment'
import type { Labware } from '../types/labware'
import type { PlateEvent } from '../types/events'

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

/**
 * SH-QC-1 T-B: the preview CONTEXT LIFECYCLE at reducer level — the exact
 * set_preview(A) -> clear_preview -> set_preview(B) cycle the Cancel-and-
 * re-prompt gesture drives (EventEditorContext.tsx set_preview :835-854,
 * clear_preview :857-869). Pins, both directions (bait B8: droppedFocus
 * exists for a reason — a blanket "never drop focus" is wrong):
 *   (i)   preview B fully replaces A (no A placements survive);
 *   (ii)  focus that sat on an A ghost is DROPPED when B does not keep the
 *         id, and SURVIVES when B does;
 *   (iii) after clear, state.preview === null and focus clears when it was
 *         on a preview placement;
 *   (iv)  cycle replay: after clear, set_preview with events carrying
 *         details.labwareId = <committed id> + details.wells buckets 96 wells
 *         (ties the unit layer to the deck ghost gate).
 */
const committedPlate: Labware = {
  labwareId: 'LBW-96-1',
  labwareType: 'plate_96',
  name: 'ghost plate',
  addressing: { type: 'grid', rows: 8, columns: 12 },
  geometry: { maxVolume_uL: 300, minVolume_uL: 10 },
}

const committedPlacement = {
  placementId: 'pl-committed-plate',
  labwareId: 'LBW-96-1',
  location: { kind: 'lawn' as const, xMm: 16, yMm: 16 },
  orientation: 'landscape' as const,
}

const ALL_WELLS: string[] = []
for (const row of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
  for (let col = 1; col <= 12; col += 1) ALL_WELLS.push(`${row}${col}`)
}

function boundEvents(labwareId: string): PlateEvent[] {
  // The deck-matched carrier shape the server emits (report §2a/§2b): the
  // keys collectEventLabwareIds + getAffectedWells read.
  return ALL_WELLS.map((well) => ({
    eventId: `evt-tb-${well}`,
    event_type: 'add_material',
    labwareId,
    details: {
      material: 'DMEM',
      volumeUl: 50,
      volume: { value: 50, unit: 'uL' },
      labwareId,
      wells: [well],
    },
  })) as unknown as PlateEvent[]
}

function ghostPreview(previewLabwareId: string, placementId: string, events: PlateEvent[]): EventEditorPreview {
  const ghostLabware: Labware = {
    labwareId: previewLabwareId,
    labwareType: 'plate_96',
    name: 'proposed plate',
    addressing: { type: 'grid', rows: 8, columns: 12 },
    geometry: { maxVolume_uL: 300, minVolume_uL: 10 },
  }
  return {
    previewLabwares: { [previewLabwareId]: ghostLabware },
    previewPlacements: [
      {
        placementId,
        labwareId: previewLabwareId,
        location: { kind: 'lawn', xMm: 200, yMm: 200 },
        orientation: 'landscape',
      },
    ],
    previewEvents: events,
  }
}

const baseState = {
  ...eventEditorInitialState,
  labwares: { 'LBW-96-1': committedPlate },
  placements: [committedPlacement],
}

describe('preview context lifecycle across the cancel/re-prompt cycle (SH-QC-1 T-B)', () => {
  it('(i) a second set_preview fully replaces the first — no A placements survive', () => {
    const withA = eventEditorReducer(baseState, { type: 'set_preview', preview: ghostPreview('lbw-a', 'pl-preview-a', boundEvents('lbw-a')) })
    const withB = eventEditorReducer(withA, { type: 'set_preview', preview: ghostPreview('lbw-b', 'pl-preview-b', boundEvents('lbw-b')) })
    expect(withB.preview).not.toBeNull()
    expect(withB.preview!.previewPlacements.map((p) => p.placementId)).toEqual(['pl-preview-b'])
    expect(Object.keys(withB.preview!.previewLabwares)).toEqual(['lbw-b'])
    expect(withB.preview!.previewEvents.length).toBe(96)
  })

  it('(ii) focus on an A ghost is DROPPED when B does not keep the placement id', () => {
    const withA = eventEditorReducer(baseState, { type: 'set_preview', preview: ghostPreview('lbw-a', 'pl-preview-a', boundEvents('lbw-a')) })
    const drilled = eventEditorReducer(withA, { type: 'set_focus', placementId: 'pl-preview-a' })
    expect(drilled.focusPlacementId).toBe('pl-preview-a')
    const replaced = eventEditorReducer(drilled, { type: 'set_preview', preview: ghostPreview('lbw-b', 'pl-preview-b', boundEvents('lbw-b')) })
    // The stale orphan ghost must not keep the focus pane mounted (the
    // droppedFocus condition, EventEditorContext.tsx:844-848).
    expect(replaced.focusPlacementId).toBeNull()
    expect(replaced.selection).toBeNull()
  })

  it('(ii-b) focus SURVIVES when the replacement preview keeps the placement id', () => {
    const withA = eventEditorReducer(baseState, { type: 'set_preview', preview: ghostPreview('lbw-a', 'pl-preview-a', boundEvents('lbw-a')) })
    const drilled = eventEditorReducer(withA, { type: 'set_focus', placementId: 'pl-preview-a' })
    const replaced = eventEditorReducer(drilled, { type: 'set_preview', preview: ghostPreview('lbw-a', 'pl-preview-a', boundEvents('lbw-a')) })
    expect(replaced.focusPlacementId).toBe('pl-preview-a')
  })

  it('(iii) clear_preview nulls the preview and drops focus that sat on a ghost placement', () => {
    const withA = eventEditorReducer(baseState, { type: 'set_preview', preview: ghostPreview('lbw-a', 'pl-preview-a', boundEvents('lbw-a')) })
    const drilled = eventEditorReducer(withA, { type: 'set_focus', placementId: 'pl-preview-a' })
    const cleared = eventEditorReducer(drilled, { type: 'clear_preview' })
    expect(cleared.preview).toBeNull()
    expect(cleared.focusPlacementId).toBeNull()
    expect(cleared.selection).toBeNull()
  })

  it('(iii-b) clear_preview keeps focus when it sat on a COMMITTED placement', () => {
    const withA = eventEditorReducer(baseState, { type: 'set_preview', preview: ghostPreview('lbw-a', 'pl-preview-a', boundEvents('lbw-a')) })
    const drilled = eventEditorReducer(withA, { type: 'set_focus', placementId: 'pl-committed-plate' })
    const cleared = eventEditorReducer(drilled, { type: 'clear_preview' })
    expect(cleared.preview).toBeNull()
    expect(cleared.focusPlacementId).toBe('pl-committed-plate')
  })

  it('(iv) cycle replay: after clear, a preview whose events carry details.labwareId = committed id + details.wells buckets 96 wells', () => {
    const withA = eventEditorReducer(baseState, { type: 'set_preview', preview: ghostPreview('lbw-a', 'pl-preview-a', boundEvents('lbw-a')) })
    const cleared = eventEditorReducer(withA, { type: 'clear_preview' })
    // Cycle 2 of the deck-matched scenario: the server re-binds the proposal
    // onto the COMMITTED deck id; the client must bucket it onto the committed
    // placement (the exact gate the CYCLE e2e leg drives).
    const cycle2 = eventEditorReducer(cleared, {
      type: 'set_preview',
      preview: { ...ghostPreview('lbw-cycle2', 'pl-preview-cycle2', boundEvents('LBW-96-1')), previewLabwares: {}, previewPlacements: [] },
    })
    const index = buildPreviewWellIndex(cycle2.preview)
    expect([...(index.byLabware.get('LBW-96-1') ?? [])].length).toBe(96)
    expect(index.eventsByLabware.get('LBW-96-1')!.length).toBe(96)
  })
})