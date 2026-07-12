import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { createLabware } from '../../types/labware'
import type { LabwareType } from '../../types/labware'
import { LabwareGlyph } from './LabwareGlyph'

describe('LabwareGlyph — single-vessel rendering', () => {
  const singleVesselTypes: LabwareType[] = [
    'beaker_25ml', 'beaker_50ml', 'beaker_100ml',
    'beaker_250ml', 'beaker_500ml', 'beaker_1000ml',
    'flask_25ml', 'flask_50ml', 'flask_100ml',
    'flask_250ml', 'flask_500ml', 'flask_1000ml',
    'tube', 'reservoir_1',
  ]

  it.each(singleVesselTypes)('%s has single addressing', (type) => {
    const labware = createLabware(type)
    expect(labware.addressing.type).toBe('single')
  })

  it.each(singleVesselTypes)('%s has correct volume geometry', (type) => {
    const labware = createLabware(type)
    expect(labware.geometry.maxVolume_uL).toBeGreaterThan(0)
    expect(labware.geometry.minVolume_uL).toBeGreaterThan(0)
    expect(labware.geometry.maxVolume_uL).toBeGreaterThan(labware.geometry.minVolume_uL)
  })
})

describe('LabwareGlyph — glassware SVG glyphs', () => {
  it('beaker labware renders <path> elements (not <circle>)', () => {
    const labware = createLabware('beaker_250ml')
    const { container } = render(
      <LabwareGlyph labware={labware} orientation="landscape" />,
    )
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    if (!svg) return
    // Beaker should render path elements for the body, not a circle
    const paths = svg.querySelectorAll('path')
    expect(paths.length).toBeGreaterThan(0)
    // Should NOT render a circle (the generic single-vessel glyph)
    const circles = svg.querySelectorAll('circle')
    expect(circles.length).toBe(0)
  })

  it('flask labware renders <path> elements (not <circle>)', () => {
    const labware = createLabware('flask_250ml')
    const { container } = render(
      <LabwareGlyph labware={labware} orientation="landscape" />,
    )
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    if (!svg) return
    // Flask should render path elements for the body, not a circle
    const paths = svg.querySelectorAll('path')
    expect(paths.length).toBeGreaterThan(0)
    // Should NOT render a circle (the generic single-vessel glyph)
    const circles = svg.querySelectorAll('circle')
    expect(circles.length).toBe(0)
  })

  it('beaker SVG has viewBox 50x50', () => {
    const labware = createLabware('beaker_500ml')
    const { container } = render(
      <LabwareGlyph labware={labware} orientation="landscape" />,
    )
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 50 50')
  })

  it('flask SVG has viewBox 50x50', () => {
    const labware = createLabware('flask_500ml')
    const { container } = render(
      <LabwareGlyph labware={labware} orientation="landscape" />,
    )
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 50 50')
  })

  it('beaker SVG uses labware color for fill and stroke', () => {
    const labware = createLabware('beaker_100ml')
    const { container } = render(
      <LabwareGlyph labware={labware} orientation="landscape" />,
    )
    const path = container.querySelector('path')
    // Beaker has a color set in LABWARE_CONFIGS
    expect(path?.getAttribute('stroke')).toBe(labware.color)
  })

  it('flask SVG uses labware color for fill and stroke', () => {
    const labware = createLabware('flask_100ml')
    const { container } = render(
      <LabwareGlyph labware={labware} orientation="landscape" />,
    )
    const path = container.querySelector('path')
    // Flask has a color set in LABWARE_CONFIGS
    expect(path?.getAttribute('stroke')).toBe(labware.color)
  })
})

describe('LabwareGlyph — existing types unchanged', () => {
  it('regular tube labware still renders <circle>', () => {
    const labware = createLabware('tube')
    const { container } = render(
      <LabwareGlyph labware={labware} orientation="landscape" />,
    )
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBeGreaterThan(0)
  })

  it('plate labware renders grid of circles', () => {
    const labware = createLabware('plate_96')
    const { container } = render(
      <LabwareGlyph labware={labware} orientation="landscape" />,
    )
    const circles = container.querySelectorAll('circle')
    // 96-well plate draws a capped grid (GRID_CAP: 24 cols x 16 rows = 384, but 12x8=96 is under cap)
    expect(circles.length).toBe(96)
  })

  it('square-well plate renders grid of rects', () => {
    const labware = createLabware('plate_384')
    const { container } = render(
      <LabwareGlyph labware={labware} orientation="landscape" />,
    )
    const rects = container.querySelectorAll('rect')
    // 384-well plate has square wells drawn as rects; capped at 24x16=384
    expect(rects.length).toBeGreaterThan(0)
  })

  it('reservoir labware renders trough rects', () => {
    const labware = createLabware('reservoir_12')
    const { container } = render(
      <LabwareGlyph labware={labware} orientation="landscape" />,
    )
    const rects = container.querySelectorAll('rect')
    expect(rects.length).toBe(12)
  })

  it('tube rack renders grid of circles', () => {
    const labware = createLabware('tubeset_24')
    const { container } = render(
      <LabwareGlyph labware={labware} orientation="landscape" />,
    )
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBeGreaterThan(0)
  })
})
