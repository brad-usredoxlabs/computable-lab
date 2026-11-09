/**
 * L2-SUITE-A-uifix1 [D4] RED — event well footprints never render on the deck.
 *
 * Gate evidence: with an add_material carrying 42 wells (B1:H6) staged OR
 * accepted, the deck plate tile showed 96 visually identical, unmarked wells:
 * `document.querySelectorAll('[data-affected="true"]').length === 0`, 0
 * ghosts, no badge/tier row (run2/shots/35-05-p3-b1h6.png,
 * 39-05-p3-b1h6-accepted.png — the accepted shot proves it survives commit,
 * so the index must cover COMMITTED events, not only the preview).
 *
 * Root cause: the per-labware well index existed for the FOCUS surface only
 * (wellStateProjection.ts, computed from LabwareStates); the deck tiles
 * consumed `previewIndex.byLabware.has(labwareId)` — a binary tile-level
 * flag from PREVIEW events alone — and the tile/glyph had no per-well input,
 * so the well SET never reached the tile at any point (staged or committed).
 *
 * The fix is DATA-DRIVEN from the event record (no hardcoded well lists):
 *  - a per-labware index over COMMITTED + preview events' details.wells
 *    (buildEventWellIndex — the deck's mirror of the focus surface's
 *    eventsWithPreviewState discipline, previewProjection's walker);
 *  - the tile/glyph receives the affected WELL SET and marks exactly those
 *    wells (per-well `data-affected-well` marker on the drawn glyph cells;
 *    the tile-level `data-affected` / "Preview" tag stays as the attention
 *    surface the existing badge contract already has).
 */
import { describe, it, expect } from 'vitest'
import { buildEventWellIndex } from './eventWellIndex'
import type { PlateEvent } from '../../types/events'
import type { EventEditorPreview } from '../EventEditorContext'

/** The gate's P3 event: 42 wells B1:H6 (7 rows B..H × 6 cols 1..6). */
const B1H6 = Array.from({ length: 42 }, (_, i) => {
  const row = 'BCDEFGH'[Math.floor(i / 6)] as string
  const col = (i % 6) + 1
  return `${row}${col}`
})

const addMaterialOnPlate = (wells: string[]): PlateEvent =>
  ({
    eventId: 'EVT-well',
    event_type: 'add_material',
    details: { labwareId: 'lbw-plate', materialRef: 'mat-1', volume: { value: 100, unit: 'uL' }, wells },
  } as unknown as PlateEvent)

const previewWith = (events: PlateEvent[]): EventEditorPreview =>
  ({
    previewLabwares: {},
    previewEquipments: {},
    previewPlacements: [],
    previewEvents: events,
  } as unknown as EventEditorPreview)

describe('buildEventWellIndex — L2-SUITE-A-uifix1 D4: the deck tile index covers staged AND committed events', () => {
  it('indexes committed events (the accepted state — the gate reloaded and still saw nothing)', () => {
    const committed = [addMaterialOnPlate(B1H6)]
    const index = buildEventWellIndex(committed, null)
    expect([...(index.get('lbw-plate') ?? [])].sort()).toEqual([...B1H6].sort())
  })

  it('indexes staged (preview) events for a labware not in the committed set', () => {
    const index = buildEventWellIndex([], previewWith([addMaterialOnPlate(['A1', 'A2', 'H12'])]))
    expect(index.get('lbw-plate')?.size).toBe(3)
  })

  it('unions committed + staged wells per labware (a revise turn widens the footprint)', () => {
    const committed = [addMaterialOnPlate(['A1'])]
    const staged = previewWith([addMaterialOnPlate(['B2'])])
    const index = buildEventWellIndex(committed, staged)
    expect(index.get('lbw-plate')?.size).toBe(2)
    expect(index.get('lbw-plate')?.has('A1')).toBe(true)
    expect(index.get('lbw-plate')?.has('B2')).toBe(true)
  })

  it('follows source/dest labware references (transfers affect both sides)', () => {
    const transfer: PlateEvent = {
      eventId: 'EVT-x',
      event_type: 'transfer',
      details: {
        source: { labwareId: 'lbw-src', wells: ['A1'] },
        target: { labwareId: 'lbw-dst', wells: ['B1', 'B2'] },
      },
    } as unknown as PlateEvent
    const index = buildEventWellIndex([transfer], null)
    expect(index.get('lbw-src')?.size).toBe(1)
    expect(index.get('lbw-dst')?.size).toBe(2)
  })

  it('returns an empty index for an empty deck (no crash, no phantom wells)', () => {
    const index = buildEventWellIndex([], null)
    expect(index.size).toBe(0)
  })
})
