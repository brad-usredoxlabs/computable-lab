import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { createLabware } from '../../types/labware'
import { LabwareGlyph } from './LabwareGlyph'

describe('LabwareGlyph — edge cases for glassware detection boundaries', () => {
  // Edge case: empty labwareType string (simulated via spread)
  it('empty labwareType falls back to tube rendering (no crash)', () => {
    const labware = createLabware('beaker_25ml')
    const labwareNoType = { ...labware, labwareType: '' as any }
    const { container } = render(
      <LabwareGlyph labware={labwareNoType} orientation="landscape" />,
    )
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  // Edge case: custom color override
  it('beaker with custom color uses the custom color', () => {
    const labware = createLabware('beaker_250ml')
    const customLabware = { ...labware, color: '#ff0000' }
    const { container } = render(
      <LabwareGlyph labware={customLabware} orientation="landscape" />,
    )
    const path = container.querySelector('path')
    expect(path?.getAttribute('stroke')).toBe('#ff0000')
  })

  // Edge case: no color (undefined)
  it('labware without color falls back to currentColor', () => {
    const labware = createLabware('beaker_250ml')
    const noColorLabware = { ...labware, color: undefined }
    const { container } = render(
      <LabwareGlyph labware={noColorLabware} orientation="landscape" />,
    )
    const path = container.querySelector('path')
    expect(path?.getAttribute('stroke')).toBe('currentColor')
  })

  // Edge case: beaker vs flask type confusion at largest sizes
  it('beaker_1000ml renders beaker paths (not flask)', () => {
    const labware = createLabware('beaker_1000ml')
    const { container } = render(
      <LabwareGlyph labware={labware} orientation="landscape" />,
    )
    const paths = container.querySelectorAll('path')
    expect(paths.length).toBeGreaterThanOrEqual(2)
    expect(container.querySelectorAll('circle').length).toBe(0)
  })

  it('flask_1000ml renders flask paths (not beaker)', () => {
    const labware = createLabware('flask_1000ml')
    const { container } = render(
      <LabwareGlyph labware={labware} orientation="landscape" />,
    )
    const paths = container.querySelectorAll('path')
    expect(paths.length).toBeGreaterThanOrEqual(2)
    expect(container.querySelectorAll('circle').length).toBe(0)
  })

  // Edge case: portrait orientation should not affect glassware
  it('glassware renders same in portrait and landscape', () => {
    const labware = createLabware('beaker_500ml')
    const { container: landscape } = render(
      <LabwareGlyph labware={labware} orientation="landscape" />,
    )
    const { container: portrait } = render(
      <LabwareGlyph labware={labware} orientation="portrait" />,
    )
    expect(landscape.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 50 50')
    expect(portrait.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 50 50')
    expect(landscape.querySelectorAll('path').length).toBe(
      portrait.querySelectorAll('path').length
    )
  })

  // Edge case: non-glassware types should NOT match glassware
  it('tubeset_4x50ml does NOT render as glassware', () => {
    const labware = createLabware('tubeset_4x50ml')
    const { container } = render(
      <LabwareGlyph labware={labware} orientation="landscape" />,
    )
    expect(container.querySelectorAll('circle').length).toBeGreaterThan(0)
  })

  it('reservoir_12 does NOT render as glassware', () => {
    const labware = createLabware('reservoir_12')
    const { container } = render(
      <LabwareGlyph labware={labware} orientation="landscape" />,
    )
    expect(container.querySelectorAll('rect').length).toBe(12)
  })

  it('deepwell_96 does NOT render as glassware', () => {
    const labware = createLabware('deepwell_96')
    const { container } = render(
      <LabwareGlyph labware={labware} orientation="landscape" />,
    )
    expect(container.querySelectorAll('circle').length).toBeGreaterThan(0)
  })

  // Edge case: preserveAspectRatio attribute
  it('beaker SVG has preserveAspectRatio=xMidYMid meet', () => {
    const labware = createLabware('beaker_25ml')
    const { container } = render(
      <LabwareGlyph labware={labware} orientation="landscape" />,
    )
    expect(container.querySelector('svg')?.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet')
  })

  it('flask SVG has preserveAspectRatio=xMidYMid meet', () => {
    const labware = createLabware('flask_25ml')
    const { container } = render(
      <LabwareGlyph labware={labware} orientation="landscape" />,
    )
    expect(container.querySelector('svg')?.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet')
  })
})
