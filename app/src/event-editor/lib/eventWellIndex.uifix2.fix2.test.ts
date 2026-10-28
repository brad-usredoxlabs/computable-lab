/**
 * L2-SUITE-A-uifix2 FIX2 [D2] RED — an ACCEPTED well-bearing add_material paints
 * its footprint on the tile that carries it, even when the committed event
 * carries NO labware reference at event level OR details level (the REAL
 * committed shape).
 *
 * Gate re-gate-3 defect 2 (BLOCKER), shots 41-04-p3-accepted-footprint.png:
 * the deck tile rendered 96 cells with [data-affected]="false" and
 * [data-affected-well] count 0 BEFORE and AFTER accept, while the record's
 * add_material carried details.wells (42 wells B1:H6).
 *
 * The REAL committed shape (verified live at :3093, EVG-…-40ac4623, and
 * quoted in the gate's states-captured.txt p3_record):
 *   the accepted add_material carries `details.wells` (42) but NO labwareId
 *   at event level NOR details level (the mix/incubate DO carry labwareId).
 * The uifix2 committedOfferByEvent binding is present in the served module,
 * but the P3 add_material targets the ALREADY-PLACED plate (P2), so the
 * draft carried NO resolvedLabware offer for it → the per-batch binding is
 * null → nothing reaches the renderer.
 *
 * THE FIX (this file pins it): a well-bearing COMMITTED event with NO explicit
 * labware reference AND no per-batch offer binding attributes to the SINGLE
 * placed labware on the deck (the vessel the plate tile carries). Multiple
 * placed labwares => genuinely ambiguous => attribute to NOTHING (never guess).
 * This makes the attribution work with the REAL committed shape. The
 * offer-binding path is kept (it works when the draft carries resolvedLabwares)
 * and an explicit-reference event is never re-routed.
 */
import { describe, expect, it } from 'vitest'
import { buildEventWellIndex } from './eventWellIndex'
import type { PlateEvent } from '../../types/events'
import type { EventEditorPreview } from '../EventEditorContext'

/** The gate's P3 event: 42 wells B1:H6 (7 rows B..H × 6 cols 1..6). */
const B1H6 = Array.from({ length: 42 }, (_, i) => {
  const row = 'BCDEFGH'[Math.floor(i / 6)] as string
  const col = (i % 6) + 1
  return `${row}${col}`
})

const PLATE = 'lbw-seed-plate-96-flat'

/**
 * The P3 add_material AS COMMITTED: details.wells (42) but NO labwareId at
 * event level or details level — the REAL committed shape (the gate's record
 * read + the live :3093 record both confirmed this). This is the exact shape
 * the tile failed to mark.
 */
const committedAddMaterialNoRef = (wells: string[], eventId = 'evt-add_material-czwnctg4'): PlateEvent =>
  ({
    eventId,
    event_type: 'add_material',
    details: {
      volumeUl: 100,
      volume: { value: 100, unit: 'uL' },
      material_ref: { kind: 'record', id: 'MAT-dmem-fbs-1c0r', type: 'material', label: 'DMEM + FBS' },
      formulation_kind: 'mixture',
      material_source_requirement: { kind: 'record' },
      material_spec_ref: { kind: 'record' },
      composition_snapshot: { kind: 'record' },
      wells,
      // NO labwareId at details level — the real committed shape.
    },
    // NO labwareId at event level — the real committed shape.
  } as unknown as PlateEvent)

describe('buildEventWellIndex — L2-SUITE-A-uifix2 FIX2 [D2]: the real committed shape (wells, no labware ref) marks the single placed vessel', () => {
  it('attributes a COMMITTED offer-less, reference-less add_material to the SINGLE placed labware (the gate P3 arm)', () => {
    const committed = [committedAddMaterialNoRef(B1H6)]
    // No per-batch offer binding (the draft carried no resolvedLabware offer
    // for the already-placed plate). The deck holds exactly ONE placed vessel.
    const index = buildEventWellIndex(committed, null, {}, [PLATE])
    expect(index.get(PLATE)?.size).toBe(42)
    expect([...(index.get(PLATE) ?? [])].sort()).toEqual([...B1H6].sort())
  })

  it('attributes to NOTHING when the deck holds MULTIPLE placed labwares (ambiguous — never guess)', () => {
    const committed = [committedAddMaterialNoRef(B1H6)]
    // Two distinct placed vessels: the add_material's target is genuinely
    // ambiguous (no offer, no explicit ref) → honest no-attribution.
    const index = buildEventWellIndex(committed, null, {}, [PLATE, 'LAB-other-plate'])
    expect(index.size).toBe(0)
  })

  it('attributes to NOTHING with ZERO placed labwares (honest — nothing on the bench)', () => {
    const committed = [committedAddMaterialNoRef(B1H6)]
    const index = buildEventWellIndex(committed, null, {}, [])
    expect(index.size).toBe(0)
  })

  it('the per-batch OFFER binding still wins when present (the offer path is kept, not replaced)', () => {
    const committed = [committedAddMaterialNoRef(['A1'])]
    // An explicit offer binding routes the wells to the OFFER's recordId —
    // even though a different single vessel is placed (the offer is the
    // pipeline's own attribution and outranks the deck fallback).
    const index = buildEventWellIndex(committed, null, { [committed[0]!.eventId]: 'lbw-offer' }, [PLATE])
    expect(index.get('lbw-offer')?.size).toBe(1)
    expect(index.get(PLATE)).toBeUndefined()
  })

  it('an event WITH an explicit labware reference is NEVER re-routed by the placed-vessel fallback', () => {
    // A transfer names its own vessels; the single placed plate must not
    // absorb its wells (the reference wins; the fallback only fills the
    // reference-LESS, offer-LESS gap).
    const transfer: PlateEvent = {
      eventId: 'EVT-x',
      event_type: 'transfer',
      details: {
        source: { labwareId: 'lbw-src', wells: ['A1'] },
        target: { labwareId: 'lbw-dst', wells: ['B1', 'B2'] },
      },
    } as unknown as PlateEvent
    const index = buildEventWellIndex([transfer], null, {}, [PLATE])
    expect(index.get('lbw-src')?.size).toBe(1)
    expect(index.get('lbw-dst')?.size).toBe(2)
    expect(index.get(PLATE)).toBeUndefined()
  })

  it('a mix that carries a labwareId but NO wells never fabricates a footprint (the P7 non-goal holds)', () => {
    const mix: PlateEvent = {
      eventId: 'evt-mix-uc1dthrb',
      event_type: 'mix',
      details: { volume: 75, cycles: 3, labwareId: PLATE },
      labwareId: PLATE,
    } as unknown as PlateEvent
    const index = buildEventWellIndex([mix], null, {}, [PLATE])
    expect(index.get(PLATE)?.size ?? 0).toBe(0)
  })

  it('unions a committed offer-less add_material with a staged one on the same placed plate', () => {
    const committed = [committedAddMaterialNoRef(['A1'])]
    const staged: EventEditorPreview = {
      previewLabwares: {},
      previewPlacements: [],
      previewEvents: [committedAddMaterialNoRef(['B1', 'B2'], 'evt-staged')],
    } as unknown as EventEditorPreview
    const index = buildEventWellIndex(committed, staged, {}, [PLATE])
    expect(index.get(PLATE)?.size).toBe(3)
    expect(index.get(PLATE)?.has('A1')).toBe(true)
    expect(index.get(PLATE)?.has('B2')).toBe(true)
  })
})
