/**
 * L2-SUITE-A-uifix1 [D4] RED (component seam) — the deck SLOT tile must mark
 * the affected WELLS, data-driven from the event record (staged OR
 * committed). Gate shape: 96-well plate, 42-well add_material staged or
 * accepted → `document.querySelectorAll('[data-affected="true"]').length`
 * must reflect the footprint, and the affected WELL CELLS inside the tile
 * glyph must be individually marked (`[data-affected-well="true"]`), because
 * the tile-level flag alone is what the gate saw zero of (the wells "simply
 * not reaching the tile").
 *
 * Contract pinned here (the LabwareTile/LabwareGlyph extension):
 *  - `LabwareTile` accepts `affectedWells?: ReadonlySet<WellId>`;
 *  - every drawn well cell carries `data-well-id`; the cells whose id is in
 *    `affectedWells` carry `data-affected-well="true"`;
 *  - the tile-level `data-affected` flips true when the set is non-empty
 *    (the existing attention surface + "Preview" tag stay).
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LabwareTile } from './LabwareTile'
import type { Labware } from '../../types/labware'
import { getAllWellIds } from '../../shared/utils/wellUtils'
import { PLATE_CONFIGS, type PlateConfig } from '../../types/plate'
import type { EventEditorPlacement } from '../types'

const plate96: Labware = {
  labwareId: 'lbw-plate',
  labwareType: 'plate',
  name: 'plate1',
  addressing: { type: 'grid', rows: 8, columns: 12 },
  geometry: { wellSpacing_mm: 9, wellShape: 'round' },
  recordId: 'lbw-seed-plate-96-flat',
} as unknown as Labware

const slotPlacement: EventEditorPlacement = {
  placementId: 'pl-1',
  labwareId: 'lbw-plate',
  location: { kind: 'slot', slotId: 'PLATE' },
  orientation: 'landscape',
}

const B1H6 = Array.from({ length: 42 }, (_, i) => {
  const row = 'BCDEFGH'[Math.floor(i / 6)] as string
  return `${row}${(i % 6) + 1}`
})

// A NON-square footprint (rows E-G × cols 6-9 — a 3×4 rectangular slice):
// transposed ids are DISTINCT from layout ids for most of its cells, so this
// catches a transpose that a square footprint would mask. In the bugged
// (drawn-axis) code a layout well (r,c) drawn in portrait got the id
// letter(c)+(r+1) — so E6..I9 (r 4..6, c 5..8) rendered as
// {F5,G5,H5,I5,F6,G6,H6,I6,F7,G7,H7,I7}, and drawn rows I..L produced the
// 32 impossible ids (I1..L8) the gate's probe counted.
const E6_I9 = new Set(['E6', 'E7', 'E8', 'E9', 'F6', 'F7', 'F8', 'F9', 'G6', 'G7', 'G8', 'G9'])

afterEach(cleanup)

describe('LabwareTile — L2-SUITE-A-uifix1 D4: affected well footprints reach the tile', () => {
  it('marks exactly the affected well cells (42 of 96) when a 42-well event touches the plate', () => {
    render(
      <LabwareTile
        labware={plate96}
        placement={slotPlacement}
        orientation="landscape"
        variant="slot"
        affectedWells={new Set(B1H6)}
      />,
    )
    // The tile-level attention surface flips (the existing badge contract).
    const tileEl = screen.queryByTestId('tile') ?? document.querySelector('.tile')
    expect(tileEl).not.toBeNull()
    const tile = document.querySelector('.tile')!
    expect(tile.getAttribute('data-affected')).toBe('true')
    // THE WELL SET: every drawn well cell is identified…
    const cells = document.querySelectorAll('[data-well-id]')
    expect(cells.length).toBe(96)
    // …and exactly the 42 affected cells are marked — nothing else.
    const marked = document.querySelectorAll('[data-affected-well="true"]')
    expect(marked.length).toBe(42)
    const markedIds = new Set(Array.from(marked).map((el) => el.getAttribute('data-well-id')))
    for (const well of B1H6) expect(markedIds.has(well)).toBe(true)
    expect(markedIds.has('A1')).toBe(false)
  })

  it('marks nothing when no well is affected (no phantom footprints)', () => {
    render(
      <LabwareTile
        labware={plate96}
        placement={slotPlacement}
        orientation="landscape"
        variant="slot"
      />,
    )
    expect(document.querySelectorAll('[data-affected-well="true"]').length).toBe(0)
    expect(document.querySelector('.tile')!.getAttribute('data-affected')).toBe('false')
  })

  it('F2: a PORTRAIT placement marks the affected cells with the labware LAYOUT ids — zero impossible ids, footprint on the right cells', () => {
    // The D4 gap the gate found: portrait transposes the DRAWN grid
    // ([cols,rows]=[rows,cols]) but the well id was built from the DRAWN
    // loop indices, so (a) drawn rows beyond the layout's row count produced
    // impossible ids (I1..L8 on an 8-row plate — the gate's 32 invalidIds)
    // and (b) every marked cell carried the id of a DIFFERENT physical well.
    const portraitPlacement: EventEditorPlacement = {
      placementId: 'pl-p',
      labwareId: 'lbw-plate',
      location: { kind: 'slot', slotId: 'PLATE' },
      orientation: 'portrait',
    }
    render(
      <LabwareTile
        labware={plate96}
        placement={portraitPlacement}
        orientation="portrait"
        variant="slot"
        affectedWells={E6_I9}
      />,
    )
    // Every drawn well cell is identified by its LAYOUT id — the drawn
    // 8×12 transpose draws 96 cells, and the id space is the plate's own
    // 8×12 (A1..H12), so the multiset of ids equals the plate's addressing
    // exactly: ZERO impossible ids (the bugged code produced 32 of I1..L8).
    const cells = document.querySelectorAll('[data-well-id]')
    expect(cells.length).toBe(96)
    const plateConfig: PlateConfig = {
      ...PLATE_CONFIGS['96'],
      rows: 8,
      columns: 12,
    }
    const plateIds = getAllWellIds(plateConfig)
    const drawnIds = Array.from(cells).map((el) => el.getAttribute('data-well-id'))
    expect(new Set(drawnIds).size).toBe(96)
    expect(drawnIds.every((id) => plateIds.includes(id!))).toBe(true)
    // THE POSITION CLAIM: the affected footprint marks on the cells that
    // ARE the layout wells E6..G9 — the bugged code marked a transposed
    // slice (F5..I7) instead, and the affected set E6..G9 would have hit
    // only the 4 cells the transposition happens to agree on.
    const marked = document.querySelectorAll('[data-affected-well="true"]')
    expect(marked.length).toBe(E6_I9.size)
    const markedIds = new Set(Array.from(marked).map((el) => el.getAttribute('data-well-id')))
    for (const well of E6_I9) expect(markedIds.has(well)).toBe(true)
  })
})
