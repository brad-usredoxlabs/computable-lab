/**
 * The split handle must behave like a split handle: drag from anywhere while
 * held, keyboard-adjustable, and impossible to drag the panes into oblivion.
 */
import { describe, expect, it } from 'vitest'
import {
  clampSplitPct,
  DEFAULT_SPLIT_PCT,
  MAX_SPLIT_PCT,
  MIN_SPLIT_PCT,
  nudgeSplitPct,
  splitPctFromDrag,
} from './splitGeometry'

describe('splitPctFromDrag', () => {
  it('converts a pointer delta into a percentage of the container', () => {
    // 100px to the right in a 1000px container = +10%
    expect(
      splitPctFromDrag({ startPct: 40, startX: 500, clientX: 600, panelWidth: 1000 }),
    ).toBeCloseTo(50, 5)
    // and dragging left shrinks the PDF pane
    expect(
      splitPctFromDrag({ startPct: 40, startX: 500, clientX: 400, panelWidth: 1000 }),
    ).toBeCloseTo(30, 5)
  })

  it('clamps so neither pane can be dragged away', () => {
    expect(splitPctFromDrag({ startPct: 40, startX: 500, clientX: 20, panelWidth: 1000 })).toBe(MIN_SPLIT_PCT)
    expect(splitPctFromDrag({ startPct: 40, startX: 500, clientX: 2000, panelWidth: 1000 })).toBe(MAX_SPLIT_PCT)
  })

  it('holds the current split when the container has no measured width', () => {
    expect(splitPctFromDrag({ startPct: 33, startX: 10, clientX: 900, panelWidth: 0 })).toBe(33)
    expect(splitPctFromDrag({ startPct: 33, startX: 10, clientX: 900, panelWidth: Number.NaN })).toBe(33)
  })
})

describe('clampSplitPct / nudgeSplitPct', () => {
  it('gives a sensible split for a nonsense value', () => {
    expect(clampSplitPct(Number.NaN)).toBe(DEFAULT_SPLIT_PCT)
  })

  it('nudges by keyboard within the same bounds', () => {
    expect(nudgeSplitPct(40, 1)).toBe(42)
    expect(nudgeSplitPct(40, -1)).toBe(38)
    expect(nudgeSplitPct(MAX_SPLIT_PCT, 1)).toBe(MAX_SPLIT_PCT)
  })
})