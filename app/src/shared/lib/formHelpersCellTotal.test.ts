/**
 * CELLRATE-1 Plane 3 — the ONE display helper (spec §5.3): the single home of
 * the "X/well = A/unit x B unit (derived)" grammar across all display surfaces.
 *
 * THE WALL on the display side: derivation is DISPLAY truth over declared data.
 * A declared-absolute count is NEVER multiplied (bait 7 — that would reproduce
 * the 100x disease in the display layer). An ambiguous bare count says exactly
 * `absolute, unverified` (OQ-3 RULED wording) — no invented unit.
 *
 * Five-state table (spec §5.3, exhaustive):
 *  1. rate + volume            -> derived total with the operands readable
 *  2. rate, volume absent      -> rate shown + per-well total unknown
 *  3. bare count + volume      -> absolute shown + OQ-3 wording, NO multiply
 *  4. count AND rate AND volume-> agree: the derivation reads as the math;
 *                                disagree: BOTH declared numbers shown, the
 *                                mismatch flagged via the honesty idiom — a
 *                                silent pick between two declared numbers is
 *                                forbidden
 *  5. no count, no rate        -> null (surface unchanged)
 */
import { describe, expect, it } from 'vitest'
import { describeCellTotal } from './formHelpers'

const RATE = { value: 200, unit: 'cells/uL', basis: 'count_per_volume' } as const

describe('describeCellTotal — the five-state table (CELLRATE-1)', () => {
  it('state 1: rate + volume -> the derived total with the derivation readable (literal, en-US locale)', () => {
    expect(describeCellTotal({ rate: RATE, volume_uL: 100 })).toBe('20,000/well = 200/uL x 100 uL (derived)')
  })

  it('state 2: rate declared, volume absent -> rate shown + per-well total unknown', () => {
    expect(describeCellTotal({ rate: RATE })).toBe('200 cells/uL · per-well total unknown')
  })

  it('state 3: bare count + volume, no rate anywhere -> absolute shown + the OQ-3 wording, NO multiplication, NO invented unit', () => {
    expect(describeCellTotal({ count: 200, volume_uL: 100 })).toBe('200 · absolute, unverified')
  })

  it('state 4a: count AND rate AND volume AGREE -> the derivation reads as the math', () => {
    expect(describeCellTotal({ count: 20000, rate: RATE, volume_uL: 100 })).toBe('20,000/well = 200/uL x 100 uL (derived)')
  })

  it('state 4b: count AND rate AND volume DISAGREE -> both declared numbers shown, mismatch flagged (no silent pick)', () => {
    expect(describeCellTotal({ count: 50000, rate: RATE, volume_uL: 100 }))
      .toBe('50,000 · absolute, unverified · 200/uL x 100 uL (derived 20,000)')
  })

  it('state 5: no count, no rate -> null (surface unchanged)', () => {
    expect(describeCellTotal({ volume_uL: 100 })).toBeNull()
    expect(describeCellTotal({})).toBeNull()
  })

  it('density (the ledger row counterDensity) serves as the declared rate when no rate arm is surfaced', () => {
    expect(describeCellTotal({ density: { value: 500, unit: 'cells/uL' }, volume_uL: 100 }))
      .toBe('50,000/well = 500/uL x 100 uL (derived)')
  })

  it('NO unit conversion in the display layer: a rate whose per-volume denominator differs from the well volume unit shows the rate honestly, total unknown', () => {
    expect(describeCellTotal({ rate: { value: 200, unit: 'cells/mL', basis: 'count_per_volume' }, volume_uL: 100 }))
      .toBe('200 cells/mL · per-well total unknown')
  })
})
