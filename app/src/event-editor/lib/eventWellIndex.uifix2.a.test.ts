/**
 * L2-SUITE-A-uifix2 [A] RED — event well footprints reach the deck tile via the
 * resolved-labware OFFER binding (re-gate DEFECT 1, BLOCKER).
 *
 * Evidence (gate-l2t2130-regate, P3): after an ACCEPTED add_material carrying
 * 42 wells (B1:H6) the plate tile had `[data-affected]="false"` and
 * `[data-affected-well="true"]` count 0 (96 cells drawn). shots
 * 39-p3-after-turn.png, 43-p3-accepted.png.
 *
 * The renderer (LabwareTile/LabwareGlyph, uifix1 D4) is PRESENT and correct —
 * it is fed NOTHING. The compiled add_material record carries `details.wells`
 * (42) but NO labware reference at event level OR details level (verified in
 * the gate's test-deck record, EVG-…-e62a870a…yaml: the add_material has
 * volume/composition/wells but no labwareId; the mix/incubate DO carry
 * labwareId). So `buildEventWellIndex` — which reads labware refs ONLY from
 * the event's details (labwareId / source / target) — has nothing to attribute
 * the wells to.
 *
 * The client-side attribution source is the resolved-labware OFFER binding
 * (resolvedLabwares: {recordId, title?, deckSlot?}, AiResolvedLabware) that
 * rides the SAME turn's draft payload and is ALREADY consumed client-side by
 * the preview path (draftPreview.ts resolved arm → labwareRecordToEditorLabware
 * keys the editor labware BY THE RECORD ID, labwareId === recordId). An
 * add_material with wells but no explicit labware reference therefore
 * attributes to the offer's recordId — the vessel the pipeline bound it
 * against. NO server record-shape change, NO compile change.
 *
 * Arms that MUST mark (orch ruling): same-turn preview + just-accepted.
 * The accepted-then-RELOADED arm is OUT (the offer is not persisted to the
 * record — rides defect 5 / the deck-variant item). EXPLICIT NON-GOAL: the P7
 * mix arm (a mix carries NO wells) is WELLSET-RESOLVER-1's remit — this test
 * asserts the mix is left untouched, never that it gains a fabricated footprint.
 */
import { describe, expect, it } from 'vitest'
import { buildEventWellIndex } from './eventWellIndex'
import type { PlateEvent } from '../../types/events'
import type { EventEditorPreview } from '../EventEditorContext'
import type { AiResolvedLabware } from '../../types/ai'

/** The gate's P3 event: 42 wells B1:H6 (7 rows B..H × 6 cols 1..6). */
const B1H6 = Array.from({ length: 42 }, (_, i) => {
  const row = 'BCDEFGH'[Math.floor(i / 6)] as string
  const col = (i % 6) + 1
  return `${row}${col}`
})

const PLATE = 'lbw-seed-plate-96-flat'
const offer = (recordId: string, title = 'plate1'): AiResolvedLabware => ({ recordId, title })

/** The P3 add_material AS COMPILED: details.wells (42) but NO labwareId at
 *  event level or details level (the gate's record read confirmed this shape). */
const addMaterialNoLabwareRef = (wells: string[], eventId = 'evt-add_material-czwnctg4'): PlateEvent =>
  ({
    eventId,
    event_type: 'add_material',
    details: {
      volumeUl: 100,
      volume: { value: 100, unit: 'uL' },
      material_ref: { kind: 'record', id: 'MAT-dmem-fbs-1c0r', type: 'material', label: 'DMEM + FBS' },
      wells,
    },
  } as unknown as PlateEvent)

/** A mix that carries a labwareId but NO wells (the P7 shape — the NON-GOAL). */
const mixWithLabwareNoWells = (): PlateEvent =>
  ({
    eventId: 'evt-mix-uc1dthrb',
    event_type: 'mix',
    details: { volume: 75, cycles: 3, labwareId: PLATE },
    labwareId: PLATE,
  } as unknown as PlateEvent)

const previewWith = (events: PlateEvent[], binding?: AiResolvedLabware[]): EventEditorPreview =>
  ({
    previewLabwares: {},
    previewPlacements: [],
    previewEvents: events,
    ...(binding ? { resolvedLabwares: binding } : {}),
  } as unknown as EventEditorPreview)

describe('buildEventWellIndex — L2-SUITE-A-uifix2 A: the resolved-labware offer binding attributes an offer-less add_material', () => {
  it('attributes a COMMITTED add_material that has wells but NO labware reference to the turn offer recordId (just-accepted arm)', () => {
    const committed = [addMaterialNoLabwareRef(B1H6)]
    const index = buildEventWellIndex(committed, null, { [committed[0]!.eventId]: PLATE })
    expect([...(index.get(PLATE) ?? [])].sort()).toEqual([...B1H6].sort())
    expect(index.get(PLATE)?.size).toBe(42)
  })

  it('attributes a STAGED (preview) offer-less add_material to the preview offer (same-turn preview arm)', () => {
    const index = buildEventWellIndex([], previewWith([addMaterialNoLabwareRef(B1H6)], [offer(PLATE)]))
    expect(index.get(PLATE)?.size).toBe(42)
    expect(index.get(PLATE)?.has('B1')).toBe(true)
    expect(index.get(PLATE)?.has('H6')).toBe(true)
  })

  it('unions a committed offer-less add_material with a staged one on the same plate', () => {
    const committed = [addMaterialNoLabwareRef(['A1'])]
    const staged = previewWith([addMaterialNoLabwareRef(['B1', 'B2'])], [offer(PLATE)])
    const index = buildEventWellIndex(committed, staged, { [committed[0]!.eventId]: PLATE })
    expect(index.get(PLATE)?.size).toBe(3)
    expect(index.get(PLATE)?.has('A1')).toBe(true)
    expect(index.get(PLATE)?.has('B2')).toBe(true)
  })

  it('leaves an event WITH an explicit labware reference UNTOUCHED by the binding (no over-attribution)', () => {
    // A transfer names its own vessels; the offer must not re-route its wells.
    const transfer: PlateEvent = {
      eventId: 'EVT-x',
      event_type: 'transfer',
      details: {
        source: { labwareId: 'lbw-src', wells: ['A1'] },
        target: { labwareId: 'lbw-dst', wells: ['B1', 'B2'] },
      },
    } as unknown as PlateEvent
    const index = buildEventWellIndex([transfer], null, { [transfer.eventId]: PLATE })
    expect(index.get('lbw-src')?.size).toBe(1)
    expect(index.get('lbw-dst')?.size).toBe(2)
    // The offer's plate gains NOTHING from a fully-attributed event.
    expect(index.get(PLATE)).toBeUndefined()
  })

  it('does NOT fabricate a footprint on a mix that carries a labwareId but NO wells (the P7 non-goal)', () => {
    const index = buildEventWellIndex([mixWithLabwareNoWells()], null, { 'evt-mix-uc1dthrb': PLATE })
    // The mix's labwareId is explicit, so it is attributed to itself — but a
    // mix has NO wells, so the footprint is EMPTY (never invented).
    expect(index.get(PLATE)?.size ?? 0).toBe(0)
  })

  it('attributes an offer-less add_material to NOTHING when no offer is present (the no-binding arm stays honest)', () => {
    const index = buildEventWellIndex([addMaterialNoLabwareRef(B1H6)], null)
    expect(index.size).toBe(0)
  })

  /**
   * L2-SUITE-A-uifix2-fix1 [D1] — the cross-turn invariant the prior comment
   * CLAIMED but the code VIOLATED: a single global `turnOfferLabwares` field,
   * overwritten on every commit and applied to ALL committed events, re-routes
   * (or erases) an earlier turn's footprints onto the LATEST commit's single
   * offer. The fix carries the binding WITH each committed batch (per-event),
   * so a second accepted turn cannot touch the first turn's marks.
   *
   * These two tests are the RED for fix1 D1: pre-fix the 3rd arg is
   * `AiResolvedLabware[]` and the walker calls `(binding ?? []).map(...)` —
   * a per-event map has no `.map`, so the tests THROW (TypeError) before the
   * fix, and even if coerced the single-offer walk would paint turn1's A1 on
   * plate B (re-route) or drop it when the latest commit carries no offer
   * (erase). Both are the exact reviewer probe (advc1 command 8).
   */
  it('D1: a SECOND accepted turn must not re-route (or erase) the FIRST turn\'s footprints — attribution is per-batch', () => {
    // turn1: add_material on plate A (well A1), staged with plate A's offer.
    // turn2: add_material on plate B (well B1), staged with plate B's offer.
    const turn1 = addMaterialNoLabwareRef(['A1'], 'evt-turn1')
    const turn2 = addMaterialNoLabwareRef(['B1'], 'evt-turn2')
    const committed = [turn1, turn2]
    // Per-batch binding: each committed event carries the offer that was live
    // when ITS batch was staged (turn1 -> plate A, turn2 -> plate B).
    const index = buildEventWellIndex(committed, null, {
      [turn1.eventId]: 'lbw-plate-A',
      [turn2.eventId]: 'lbw-plate-B',
    })
    // turn1's footprint STAYS on plate A — it is never re-routed to plate B.
    expect([...(index.get('lbw-plate-A') ?? [])].sort()).toEqual(['A1'])
    expect(index.get('lbw-plate-B')?.has('A1')).toBe(false)
    // turn2's footprint lands on plate B.
    expect([...(index.get('lbw-plate-B') ?? [])].sort()).toEqual(['B1'])
    expect(index.get('lbw-plate-A')?.has('B1')).toBe(false)
  })

  it('D1: a NO-OFFER second commit must not erase the first turn\'s footprints (the binding rides the batch, not a global field)', () => {
    const turn1 = addMaterialNoLabwareRef(['A1'], 'evt-turn1')
    const turn2 = addMaterialNoLabwareRef(['B1'], 'evt-turn2')
    const committed = [turn1, turn2]
    // turn1 was staged with plate A's offer; turn2's batch carried NO offer.
    const index = buildEventWellIndex(committed, null, { [turn1.eventId]: 'lbw-plate-A' })
    // turn1's footprint survives on plate A (it does NOT vanish when the next
    // commit carries no offer).
    expect([...(index.get('lbw-plate-A') ?? [])].sort()).toEqual(['A1'])
    // turn2's unbound wells attribute to NOTHING (honest — never fabricated).
    expect(index.size).toBe(1)
  })
})
