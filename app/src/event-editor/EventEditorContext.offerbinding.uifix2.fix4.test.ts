/**
 * L2-SUITE-A-uifix2 FIX4 (advc2 cycle-2, defect 1): the PRODUCT HALF of the
 * tri-state offer binding is pinned — the PRODUCER path, not just the
 * consumer.
 *
 * The cycle-1 ADVC3 pins (eventWellIndex.uifix2.fix2.test.ts) call
 * buildEventWellIndex and hand the ambiguous marker in by hand, so the code
 * that DECIDES "multi-offer -> marker" — the per-batch offer capture
 * (EventEditorContext.tsx committedOfferCapturesForPreview, the only
 * producer of the marker) and the commit_preview merge that lands the
 * capture into state — was exercised by NO test. The reviewer's
 * falsification: reverting EventEditorContext.tsx to e19c23fc kept the whole
 * pin set GREEN while the cycle-1 bug (a multi-vessel batch absorbed by the
 * deck's single placed vessel) returned.
 *
 * This file pins ALL THREE tri-state cases END-TO-END THROUGH THE PRODUCER
 * — the capture at commit time and its merge into the running state maps,
 * exactly as the deck later reads them (no marker is handed in by hand):
 *   - MULTI distinct offers  -> binding entry ABSENT + the ambiguous marker
 *     set for every batch event; and the committed state attributes the
 *     batch's wells to NOTHING even with a single placed vessel (the
 *     reviewer's cycle-1 probe, end-to-end through the state the reducer
 *     lands).
 *   - ZERO offers            -> no marker AND no binding entry (absent =
 *     no offer); the D2 placed-vessel fallback still fires end-to-end (the
 *     no-offer batch falls back to the single placed vessel — the D2 arm is
 *     preserved).
 *   - EXACTLY ONE offer      -> binding = that recordId, no marker; the
 *     wells attribute to the OFFER (not the placed vessel).
 *
 * RED at HEAD (proven before the fix): the multi-offer leg (marker missing
 * + fallback fired), the zero-offer leg (the legacy {e: null} sentinel
 * present where the fixed shape writes NOTHING), and the per-batch merge
 * leg. The single-offer leg is a regression guard (it passes at HEAD — the
 * producer already wrote the recordId there; it must not be broken by the
 * shape change).
 */
import { describe, expect, it } from 'vitest'
import {
  eventEditorInitialState,
  eventEditorReducer,
  type EventEditorPreview,
  type EventEditorState,
} from './EventEditorContext'
import { buildEventWellIndex } from './lib/eventWellIndex'
import type { PlateEvent } from '../types/events'
import type { AiResolvedLabware } from '../types/ai'

const PLATE = 'lbw-placed-plate'

const offer = (recordId: string): AiResolvedLabware => ({ recordId })

/** A well-bearing add_material with NO labware reference (the REAL committed
 *  shape — the one the placed-vessel fallback was built for). */
const noRefEvent = (wells: string[], eventId: string): PlateEvent =>
  ({
    eventId,
    event_type: 'add_material',
    details: { volumeUl: 100, volume: { value: 100, unit: 'uL' }, material_ref: { kind: 'record' }, wells },
  } as unknown as PlateEvent)

const previewWith = (events: PlateEvent[], offers: AiResolvedLabware[]): EventEditorPreview =>
  ({
    previewLabwares: {},
    previewPlacements: [],
    previewEvents: events,
    resolvedLabwares: offers,
  } as unknown as EventEditorPreview)

const commit = (state: EventEditorState): EventEditorState =>
  eventEditorReducer(state, { type: 'commit_preview' })

/** The exact maps the deck's event-well index reads off committed state —
 *  the producer's capture as it LIVES in state after the merge. */
const deckMaps = (state: EventEditorState): [Record<string, string | null>, Record<string, boolean>] =>
  [state.committedOfferByEvent ?? {}, state.committedOfferAmbiguousByEvent ?? {}]

describe('commit_preview (the capture + merge — the PRODUCER path) — the tri-state at its source', () => {
  it('a MULTI-offer batch lands with the marker and NO binding entry — and the deck index attributes its wells to NOTHING (the reviewer cycle-1 probe, end-to-end)', () => {
    const staged = eventEditorReducer(eventEditorInitialState, {
      type: 'set_preview',
      preview: previewWith(
        [noRefEvent(['A1'], 'e1'), noRefEvent(['B1'], 'e2')],
        [offer('lbw-vessel-A'), offer('lbw-vessel-B')],
      ),
    })
    const committed = commit(staged)
    // The state the deck actually reads: the marker set for EVERY batch
    // event, and NO binding entry for either (the >1 case must not write a
    // recordId NOR the legacy null sentinel — one fact, one
    // representation: the marker ALONE carries the ambiguity, so the
    // binding map and the marker map cannot disagree).
    expect(committed.committedOfferAmbiguousByEvent).toEqual({ e1: true, e2: true })
    expect('e1' in (committed.committedOfferByEvent ?? {})).toBe(false)
    expect('e2' in (committed.committedOfferByEvent ?? {})).toBe(false)
    // End-to-end: a single placed vessel must NOT absorb the batch — the
    // exact cycle-1 defect (the deck's tile painting a genuinely ambiguous
    // batch's wells) is what this pin kills.
    const [binding, ambiguous] = deckMaps(committed)
    const index = buildEventWellIndex(committed.events, null, binding, [PLATE], ambiguous)
    expect(index.size).toBe(0)
  })

  it('a ZERO-offer batch lands with NO marker and NO binding entry — and the D2 fallback STILL fires end-to-end (a no-offer batch falls back to the single placed vessel)', () => {
    const staged = eventEditorReducer(eventEditorInitialState, {
      type: 'set_preview',
      preview: previewWith([noRefEvent(['A1'], 'e1')], []),
    })
    const committed = commit(staged)
    // Absent = no offer: the capture writes NOTHING for a zero-offer batch
    // (at HEAD it wrote the legacy {e1: null} sentinel — the entry the
    // binding boundary now classifies as ambiguous, which is why the
    // shape must change).
    expect(committed.committedOfferAmbiguousByEvent ?? {}).toEqual({})
    expect(committed.committedOfferByEvent ?? {}).toEqual({})
    expect('e1' in (committed.committedOfferByEvent ?? {})).toBe(false)
    // End-to-end: the no-offer batch still falls back to the single placed
    // vessel (the D2 arm survives the tri-state tightening).
    const [binding, ambiguous] = deckMaps(committed)
    const index = buildEventWellIndex(committed.events, null, binding, [PLATE], ambiguous)
    expect(index.get(PLATE)?.size).toBe(1)
  })

  it('a single-offer batch lands with binding = that recordId and NO marker — and the wells attribute to the OFFER, not the placed vessel', () => {
    const staged = eventEditorReducer(eventEditorInitialState, {
      type: 'set_preview',
      preview: previewWith([noRefEvent(['A1'], 'e1')], [offer('lbw-offer')]),
    })
    const committed = commit(staged)
    expect(committed.committedOfferByEvent).toEqual({ e1: 'lbw-offer' })
    expect(committed.committedOfferAmbiguousByEvent ?? {}).toEqual({})
    const [binding, ambiguous] = deckMaps(committed)
    const index = buildEventWellIndex(committed.events, null, binding, [PLATE], ambiguous)
    expect(index.get('lbw-offer')?.size).toBe(1)
    expect(index.get(PLATE)).toBeUndefined()
  })

  it('the SAME vessel listed twice is still the single-offer case (distinctness, not count)', () => {
    const staged = eventEditorReducer(eventEditorInitialState, {
      type: 'set_preview',
      preview: previewWith([noRefEvent(['A1'], 'e1')], [offer('lbw-only'), offer('lbw-only')]),
    })
    const committed = commit(staged)
    expect(committed.committedOfferByEvent).toEqual({ e1: 'lbw-only' })
    expect(committed.committedOfferAmbiguousByEvent ?? {}).toEqual({})
  })

  it('a later ZERO-offer batch neither re-routes nor erases an earlier MULTI-offer batch marker (the per-batch merge discipline survives the shape change)', () => {
    const turn1 = eventEditorReducer(eventEditorInitialState, {
      type: 'set_preview',
      preview: previewWith([noRefEvent(['A1'], 'e1')], [offer('lbw-vessel-A'), offer('lbw-vessel-B')]),
    })
    const afterTurn1 = commit(turn1)
    const turn2 = eventEditorReducer(afterTurn1, {
      type: 'set_preview',
      preview: previewWith([noRefEvent(['B1'], 'e2')], []),
    })
    const afterTurn2 = commit(turn2)
    expect(afterTurn2.committedOfferAmbiguousByEvent).toEqual({ e1: true })
    // Neither batch wrote a binding entry (multi -> absent, zero -> absent)
    // — turn2's commit did not re-route (or "erase by null") turn1's fact.
    expect(afterTurn2.committedOfferByEvent ?? {}).toEqual({})
    expect('e2' in (afterTurn2.committedOfferByEvent ?? {})).toBe(false)
  })
})
