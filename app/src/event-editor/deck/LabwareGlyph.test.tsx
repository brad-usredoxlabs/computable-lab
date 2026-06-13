import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { LabwareGlyph } from './LabwareGlyph'
import { createLabware } from '../../types/labware'

function shapeCount(labwareType: Parameters<typeof createLabware>[0]): number {
  const labware = createLabware(labwareType)
  const { container } = render(<LabwareGlyph labware={labware} orientation="landscape" />)
  return container.querySelectorAll('circle, rect').length
}

describe('LabwareGlyph', () => {
  it('draws one well per position for a multi-position tube rack', () => {
    // 2×6 = 12 wells — must not collapse to a single circle.
    expect(shapeCount('tubeset_4way_12x15ml')).toBe(12)
    // A single row of four 50 mL conicals.
    expect(shapeCount('tubeset_4way_4x50ml')).toBe(4)
    // 4×8 racks.
    expect(shapeCount('tubeset_4way_32x2ml')).toBe(32)
    // Classic dense 5×16 bench rack.
    expect(shapeCount('tubeset_80x2ml')).toBe(80)
  })

  it('still draws a single vessel for a lone tube', () => {
    // A lone tube collapses to one shape (not a grid).
    expect(shapeCount('tube')).toBe(1)
  })
})
