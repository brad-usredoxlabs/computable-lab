/**
 * The PDF preview must FIT its pane by default and stay zoomable in both
 * directions. Regression from the bench: pages rendered at a hardcoded 1.4
 * scale, which is wider than the 40% review pane, so the document scrolled out
 * of the window sideways with no way to zoom out.
 */
import { describe, expect, it } from 'vitest'
import { clampZoom, fitWidthScale, MAX_ZOOM, MIN_ZOOM, steppedZoom } from './pdfZoom'

describe('fitWidthScale', () => {
  it('fits a letter page into a narrow review pane', () => {
    // 612pt page in a 600px pane with 16px padding per side → 568/612
    expect(fitWidthScale(600, 612, 16)).toBeCloseTo(0.928, 3)
  })

  it('never upscales past the max, and never shrinks past the min', () => {
    // a tiny pane (split dragged far left) lands on the floor, not on 0
    expect(fitWidthScale(120, 612, 16)).toBe(MIN_ZOOM)
    // a very wide pane is capped so a page cannot become a billboard
    expect(fitWidthScale(5000, 612, 16)).toBe(MAX_ZOOM)
  })

  it('is safe before the pane is measured', () => {
    expect(fitWidthScale(0, 612, 16)).toBe(MIN_ZOOM)
    expect(fitWidthScale(600, 0, 16)).toBe(1)
    expect(fitWidthScale(Number.NaN, 612, 16)).toBe(1)
  })
})

describe('steppedZoom / clampZoom', () => {
  it('steps in and out by a readable increment', () => {
    expect(steppedZoom(1, 1)).toBeCloseTo(1.15, 3)
    expect(steppedZoom(1, -1)).toBeCloseTo(0.85, 3)
  })

  it('holds the bounds', () => {
    expect(steppedZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM)
    expect(steppedZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM)
    expect(clampZoom(Number.NaN)).toBe(1)
  })
})