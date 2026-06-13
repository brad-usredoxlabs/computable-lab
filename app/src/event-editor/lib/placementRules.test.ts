import { describe, expect, it } from 'vitest'
import { validatePlacement } from './placementRules'
import { createLabware } from '../../types/labware'
import type { PlatformManifest, PlatformVariantManifest } from '../../types/platformRegistry'

const PLATFORM: PlatformManifest = {
  id: 'test',
  label: 'Test',
  allowedVocabIds: [],
  defaultVariant: 'v',
  toolTypeIds: [],
  modules: [],
  variants: [],
}

const VARIANT: PlatformVariantManifest = {
  id: 'v',
  title: 'Test Deck',
  slots: [{ id: 'A1', kind: 'standard', row: 1, col: 1, reachable: true }],
}

describe('validatePlacement — lawn-only labware', () => {
  it('rejects a lawn-only bench rack on an automation slot', () => {
    const labware = createLabware('tubeset_4way_4x50ml')
    const result = validatePlacement({
      platform: PLATFORM,
      variant: VARIANT,
      location: { kind: 'slot', slotId: 'A1' },
      labware,
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/freeform bench/i)
  })

  it('allows a lawn-only bench rack on a lawn surface', () => {
    const labware = createLabware('tubeset_4way_12x15ml')
    const result = validatePlacement({
      platform: PLATFORM,
      variant: VARIANT,
      location: { kind: 'lawn', xMm: 100, yMm: 50 },
      labware,
    })
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('still allows normal labware on a slot', () => {
    const labware = createLabware('plate_96')
    const result = validatePlacement({
      platform: PLATFORM,
      variant: VARIANT,
      location: { kind: 'slot', slotId: 'A1' },
      labware,
    })
    expect(result.ok).toBe(true)
  })
})
