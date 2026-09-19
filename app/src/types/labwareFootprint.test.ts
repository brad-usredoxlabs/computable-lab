import { describe, expect, it } from 'vitest'
import {
  EDGE_MARGIN_MM,
  LEGACY_SBS_FOOTPRINT_MM,
  deriveGridFootprintMm,
  labwareFootprintAspect,
  labwareFootprintMm,
} from './labwareFootprint'
import type { Labware } from './labware'

/**
 * Hand-built definition-driven 5×16 rack (13 mm pitch): no stamp, no bound
 * definition — resolves via grid derivation: (16·13+12) × (5·13+12) = 220×77.
 */
function rackLabware(overrides: Partial<Labware> = {}): Labware {
  return {
    labwareId: 'lw-1',
    labwareType: 'definition',
    name: 'r',
    addressing: { type: 'grid', rows: 5, columns: 16 },
    geometry: { maxVolume_uL: 2000, minVolume_uL: 100, wellShape: 'round' },
    wellPitch_mm: 13,
    ...overrides,
  }
}

describe('deriveGridFootprintMm', () => {
  it('derives a 5×16 rack at 13 mm pitch as 220×77 mm', () => {
    expect(deriveGridFootprintMm(5, 16, 13)).toEqual({ length: 220, width: 77 })
  })

  it('exposes one shared edge margin constant', () => {
    expect(EDGE_MARGIN_MM).toBe(6)
  })
})

describe('labwareFootprintMm', () => {
  it('resolves a definition-driven 5×16 rack landscape to 220×77', () => {
    expect(labwareFootprintMm(rackLabware(), 'landscape')).toEqual({ length: 220, width: 77 })
  })

  it('swaps the axes for portrait placement', () => {
    expect(labwareFootprintMm(rackLabware(), 'portrait')).toEqual({ length: 77, width: 220 })
  })

  it('defaults to landscape when orientation is omitted', () => {
    expect(labwareFootprintMm(rackLabware())).toEqual({ length: 220, width: 77 })
  })

  it('prefers a stamped physicalFootprintMm over grid derivation', () => {
    const stamped = rackLabware({ physicalFootprintMm: { length: 207, width: 130 } })
    expect(labwareFootprintMm(stamped, 'landscape')).toEqual({ length: 207, width: 130 })
    expect(labwareFootprintMm(stamped, 'portrait')).toEqual({ length: 130, width: 207 })
  })

  it('resolves a bound definition instance to a sane vendor/derived footprint', () => {
    // Shape invariants ONLY: the sibling S2 task may concurrently pin
    // physical_geometry 127×85 on the opentrons/nest mirror entry; until then
    // the definition's 9 mm topology derives 120×84. Both satisfy the
    // invariants; the exact 127×85-via-definition assertion is added by the
    // parent after S2 lands (do not couple this test to that timing).
    const bound = rackLabware({
      definitionId: 'opentrons/nest_96_wellplate_200ul_flat@v1',
      wellPitch_mm: undefined,
      addressing: { type: 'grid', rows: 8, columns: 12 },
    })
    const fp = labwareFootprintMm(bound)
    expect(fp.length).toBeGreaterThanOrEqual(fp.width)
    expect(fp.length).toBeGreaterThanOrEqual(120)
  })

  it('falls back to the legacy SBS 127×85 for topology-less single vessels', () => {
    const tube: Labware = {
      labwareId: 'lw-tube',
      labwareType: 'tube',
      name: 'Tube',
      addressing: { type: 'single' },
      geometry: { maxVolume_uL: 5000, minVolume_uL: 0, wellShape: 'round' },
      layoutFamily: 'tube',
    }
    // This is THE legacy 127×85 constant's only surviving home — the helper's
    // final fallback branch (delete with task #13, not before).
    expect(labwareFootprintMm(tube, 'landscape')).toEqual({ ...LEGACY_SBS_FOOTPRINT_MM, length: 127, width: 85 })
  })
})

describe('labwareFootprintAspect', () => {
  it('is the long ÷ short ratio of the rack’s real footprint (2.86, not the plate’s 1.49)', () => {
    expect(labwareFootprintAspect(rackLabware())).toBeCloseTo(220 / 77, 5)
    expect(labwareFootprintAspect(rackLabware())).not.toBeCloseTo(127 / 85, 2)
  })

  it('is orientation-invariant — rotating swaps the axes, not the shape', () => {
    // Portrait/landscape only decide which axis is long at render time
    // (WellGrid), so the fit ratio the focus stage uses must not change.
    expect(labwareFootprintAspect(rackLabware({ physicalFootprintMm: { length: 77, width: 220 } })))
      .toBeCloseTo(220 / 77, 5)
  })

  it('falls back to the SBS ratio for topology-less labware', () => {
    const tube: Labware = {
      labwareId: 'lw-tube',
      labwareType: 'tube',
      name: 'Tube',
      addressing: { type: 'single' },
      geometry: { maxVolume_uL: 5000, minVolume_uL: 0, wellShape: 'round' },
      layoutFamily: 'tube',
    }
    expect(labwareFootprintAspect(tube)).toBeCloseTo(127 / 85, 5)
  })
})
