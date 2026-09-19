import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLabware } from '../../types/labware'
import type { Labware } from '../../types/labware'
import { WellGrid } from './WellGrid'

/**
 * The zoom-in (focus) well grid must draw the labware's RESOLVED PHYSICAL
 * FOOTPRINT, not a hardcoded 127×85 SBS plate frame.
 *
 * Regression: a 5×16 benchtop tube rack (220×77 mm, derived from 13 mm pitch)
 * looked correctly proportioned as a deck chip, then snapped to a 2:3 plate on
 * click — the same object, a different shape. The frame comes from
 * types/labwareFootprint.ts (stamped dims → definition vendor dims → pitch
 * derivation → legacy SBS fallback).
 */

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** Definition-driven 5×16 rack at 13 mm pitch: 220×77 mm, no stamp. */
function rackLabware(overrides: Partial<Labware> = {}): Labware {
  const rows = ['A', 'B', 'C', 'D', 'E']
  const columns = Array.from({ length: 16 }, (_, i) => String(i + 1))
  return {
    labwareId: 'lw-rack',
    labwareType: 'tubeset_80x2ml',
    name: '5x16 Rack',
    addressing: { type: 'grid', rows: 5, columns: 16, rowLabels: rows, columnLabels: columns },
    geometry: { maxVolume_uL: 2000, minVolume_uL: 100, wellShape: 'round' },
    wellPitch_mm: 13,
    ...overrides,
  }
}

function renderGrid(labware: Labware, orientation: 'landscape' | 'portrait', size: number) {
  const { container } = render(
    <WellGrid
      labware={labware}
      orientation={orientation}
      size={size}
      hoveredWellId={null}
      selectedWellIds={new Set()}
      onHover={() => undefined}
    />,
  )
  const svg = container.querySelector('svg') as SVGSVGElement
  return {
    viewBox: svg.getAttribute('viewBox'),
    width: Number(svg.getAttribute('width')),
    height: Number(svg.getAttribute('height')),
    wellCount: container.querySelectorAll('[data-well-id]').length,
  }
}

describe('WellGrid focus frame = physical footprint', () => {
  it('draws a 5×16 rack in its real 220×77 proportions, not the SBS plate frame', () => {
    const rack = renderGrid(rackLabware(), 'landscape', 300)

    expect(rack.viewBox).toBe('0 0 220 77')
    // `size` is the LONG edge, so the object fills the stage along its long axis.
    expect(rack.width).toBe(300)
    expect(rack.height).toBeCloseTo((300 * 77) / 220, 5)

    // The bug: the frame used to collapse to 127:85 for every labware.
    expect(rack.viewBox).not.toBe('0 0 127 85')
    expect(rack.width / rack.height).toBeCloseTo(220 / 77, 5)
  })

  it('swaps the axes for a portrait-placed rack (the object as it actually sits)', () => {
    const rack = renderGrid(rackLabware(), 'portrait', 300)

    expect(rack.viewBox).toBe('0 0 77 220')
    expect(rack.width).toBeCloseTo((300 * 77) / 220, 5)
    expect(rack.height).toBe(300)
  })

  it('keeps every one of the rack’s 80 positions addressable in the closeup', () => {
    expect(renderGrid(rackLabware(), 'landscape', 300).wellCount).toBe(80)
  })

  it('honours a stamped (vendor-sheet) footprint over the pitch derivation', () => {
    const stamped = renderGrid(
      rackLabware({ physicalFootprintMm: { length: 207, width: 130 } }),
      'landscape',
      300,
    )

    expect(stamped.viewBox).toBe('0 0 207 130')
    expect(stamped.height).toBeCloseTo((300 * 130) / 207, 5)
  })

  it('still frames a topology-less labware with the documented legacy SBS fallback', () => {
    // createLabware('plate_96') has no definition/physicalFootprintMm in the
    // jsdom fixture, so it lands on the single remaining SBS fallback branch
    // (delete with task #13) — and the frame follows it.
    const plate = renderGrid(createLabware('plate_96', '96-Well Plate'), 'landscape', 300)

    expect(plate.viewBox).toBe('0 0 127 85')
    expect(plate.width).toBe(300)
  })
})
