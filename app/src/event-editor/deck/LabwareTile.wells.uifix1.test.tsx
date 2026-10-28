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
})
