import { describe, expect, it } from 'vitest'
import { createLabware } from '../types/labware'
import type { Labware } from '../types/labware'
import type { PlateEvent } from '../types/events'
import {
  eventEditorReducer as reduce,
  eventEditorInitialState,
  type EventEditorAction,
  type EventEditorState,
} from './EventEditorContext'

function run(actions: EventEditorAction[], from: EventEditorState = eventEditorInitialState): EventEditorState {
  return actions.reduce(reduce, from)
}

function event(id: string): PlateEvent {
  return { eventId: id, event_type: 'mix', details: {} } as PlateEvent
}

function place(labware: Labware): EventEditorAction {
  return {
    type: 'place_new_labware',
    labware,
    location: { kind: 'lawn', xMm: 10, yMm: 10 },
    orientation: 'landscape',
  }
}

describe('editorHistory (via eventEditorReducer)', () => {
  it('pushes an undo entry per undoable action and skips reducer no-ops', () => {
    let s = run([{ type: 'append_event', event: event('e1') }])
    expect(s.history.past).toHaveLength(1)

    // rename of an unknown labware is a base-reducer no-op — no push
    s = reduce(s, { type: 'rename_labware', labwareId: 'nope', name: 'x' })
    expect(s.history.past).toHaveLength(1)

    // dispense with an empty tip is a no-op — no push
    s = reduce(s, { type: 'dispense_commit', destLabwareId: 'lw', destWells: ['A1'] })
    expect(s.history.past).toHaveLength(1)

    // transient actions never push
    s = reduce(s, { type: 'set_focus', placementId: null })
    expect(s.history.past).toHaveLength(1)
  })

  it('undo restores events and redo round-trips', () => {
    const s1 = run([{ type: 'append_event', event: event('e1') }])
    const s2 = reduce(s1, { type: 'append_event', event: event('e2') })
    expect(s2.events.map((e) => e.eventId)).toEqual(['e1', 'e2'])

    const undone = reduce(s2, { type: 'undo' })
    expect(undone.events.map((e) => e.eventId)).toEqual(['e1'])
    expect(undone.history.future).toHaveLength(1)

    const redone = reduce(undone, { type: 'redo' })
    expect(redone.events.map((e) => e.eventId)).toEqual(['e1', 'e2'])
    expect(redone.history.future).toHaveLength(0)
  })

  it('undo on empty history and redo on empty future are no-ops', () => {
    expect(reduce(eventEditorInitialState, { type: 'undo' })).toBe(eventEditorInitialState)
    expect(reduce(eventEditorInitialState, { type: 'redo' })).toBe(eventEditorInitialState)
  })

  it('a new mutation clears the redo stack', () => {
    const s = run([
      { type: 'append_event', event: event('e1') },
      { type: 'undo' },
      { type: 'append_event', event: event('e2') },
    ])
    expect(s.history.future).toHaveLength(0)
    expect(s.events.map((e) => e.eventId)).toEqual(['e2'])
  })

  it('undo of place_new_labware removes the labware and clears dangling focus', () => {
    // Placing into the single-plate slot focuses the new placement.
    const placed = reduce(eventEditorInitialState, {
      type: 'place_new_labware',
      labware: createLabware('plate_96'),
      location: { kind: 'slot', slotId: 'PLATE' },
      orientation: 'landscape',
    })
    expect(placed.placements).toHaveLength(1)
    expect(placed.focusPlacementId).not.toBeNull()

    const undone = reduce(placed, { type: 'undo' })
    expect(undone.placements).toHaveLength(0)
    expect(Object.keys(undone.labwares)).toHaveLength(0)
    expect(undone.focusPlacementId).toBeNull()
  })

  it('undo of remove_placement restores labware, placement, and plate rail', () => {
    const placed = reduce(eventEditorInitialState, place(createLabware('plate_96')))
    const placementId = placed.placements[0]!.placementId
    const withRail = reduce(placed, {
      type: 'update_plate_rail',
      placementId,
      patch: { protocol: { title: 'My protocol' } },
    })
    const removed = reduce(withRail, { type: 'remove_placement', placementId })
    expect(removed.placements).toHaveLength(0)
    expect(removed.plateRail[placementId]).toBeUndefined()

    const undone = reduce(removed, { type: 'undo' })
    expect(undone.placements).toHaveLength(1)
    expect(Object.keys(undone.labwares)).toHaveLength(1)
    expect(undone.plateRail[placementId]?.protocol.title).toBe('My protocol')
  })

  it('undo of dispense_commit restores the loaded tip', () => {
    const loaded = reduce(eventEditorInitialState, {
      type: 'set_tip',
      tipState: {
        kind: 'loaded',
        sourceLabwareId: 'lw-src',
        sourceWells: ['A1'],
        volume_uL: 50,
        sourceLabel: 'water',
      },
    })
    const dispensed = reduce(loaded, {
      type: 'dispense_commit',
      destLabwareId: 'lw-dst',
      destWells: ['B2'],
    })
    expect(dispensed.tipState.kind).toBe('empty')
    expect(dispensed.events).toHaveLength(1)

    const undone = reduce(dispensed, { type: 'undo' })
    expect(undone.tipState.kind).toBe('loaded')
    expect(undone.events).toHaveLength(0)
  })

  it('coalesces consecutive update_plate_rail for the same placement', () => {
    const placed = reduce(eventEditorInitialState, place(createLabware('plate_96')))
    const placementId = placed.placements[0]!.placementId
    let s = placed
    for (const title of ['M', 'My', 'My p']) {
      s = reduce(s, { type: 'update_plate_rail', placementId, patch: { protocol: { title } } })
    }
    // place (1) + first rail edit (1, coalesced thereafter)
    expect(s.history.past).toHaveLength(2)

    // one undo reverts the whole edit run
    const undone = reduce(s, { type: 'undo' })
    expect(undone.plateRail[placementId]?.protocol.title ?? '').toBe('')
  })

  it('breaks rail coalescing across a different action and across undo', () => {
    const placed = reduce(eventEditorInitialState, place(createLabware('plate_96')))
    const placementId = placed.placements[0]!.placementId
    let s = reduce(placed, { type: 'update_plate_rail', placementId, patch: { protocol: { title: 'a' } } })
    s = reduce(s, { type: 'append_event', event: event('e1') })
    s = reduce(s, { type: 'update_plate_rail', placementId, patch: { protocol: { title: 'b' } } })
    expect(s.history.past).toHaveLength(4)

    // after an undo, the next rail edit must push (not coalesce into a stale entry)
    s = reduce(s, { type: 'undo' })
    const depth = s.history.past.length
    s = reduce(s, { type: 'update_plate_rail', placementId, patch: { protocol: { title: 'c' } } })
    expect(s.history.past.length).toBe(depth + 1)
  })

  it('caps history depth at 50', () => {
    let s = eventEditorInitialState
    for (let i = 0; i < 60; i++) {
      s = reduce(s, { type: 'append_event', event: event(`e${i}`) })
    }
    expect(s.history.past).toHaveLength(50)
    expect(s.events).toHaveLength(60)
  })

  it('resets history when a graph or platform loads', () => {
    const dirty = run([{ type: 'append_event', event: event('e1') }])
    const loaded = reduce(dirty, {
      type: 'load_event_graph_success',
      eventGraphId: 'EVG-1',
      runId: null,
      events: [],
      labwares: {},
      placements: [],
    })
    expect(loaded.history.past).toHaveLength(0)
    expect(loaded.history.future).toHaveLength(0)

    const dirty2 = run([{ type: 'append_event', event: event('e1') }])
    const switched = reduce(dirty2, { type: 'set_platform', platformId: 'other' })
    expect(switched.history.past).toHaveLength(0)
  })

  it('undo of commit_preview removes committed ghosts without resurrecting the preview', () => {
    const labware = createLabware('plate_96')
    const preview = {
      previewLabwares: { [labware.labwareId]: labware },
      previewPlacements: [
        {
          placementId: 'pl-ghost-1',
          labwareId: labware.labwareId,
          location: { kind: 'lawn' as const, xMm: 5, yMm: 5 },
          orientation: 'landscape' as const,
        },
      ],
      previewEvents: [event('ghost-e1')],
    }
    const staged = reduce(eventEditorInitialState, { type: 'set_preview', preview })
    expect(staged.history.past).toHaveLength(0) // staging is not undoable
    const committed = reduce(staged, { type: 'commit_preview' })
    expect(committed.events).toHaveLength(1)
    expect(committed.placements).toHaveLength(1)
    expect(committed.preview).toBeNull()

    const undone = reduce(committed, { type: 'undo' })
    expect(undone.events).toHaveLength(0)
    expect(undone.placements).toHaveLength(0)
    expect(undone.preview).toBeNull()
  })

  it('rejects renaming to a duplicate name (case-insensitive) but allows self case-change', () => {
    const s = run([place(createLabware('plate_96')), place(createLabware('plate_96'))])
    const [a, b] = Object.values(s.labwares)
    expect(a!.name).toBe('plate1')
    expect(b!.name).toBe('plate2')

    const rejected = reduce(s, { type: 'rename_labware', labwareId: b!.labwareId, name: 'PLATE1' })
    expect(rejected).toBe(s) // rejected rename is a no-op — and pushes no history

    const selfCase = reduce(s, { type: 'rename_labware', labwareId: a!.labwareId, name: 'Plate1' })
    expect(selfCase.labwares[a!.labwareId]!.name).toBe('Plate1')
  })
})
