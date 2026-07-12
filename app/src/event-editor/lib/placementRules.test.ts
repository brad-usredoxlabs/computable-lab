import { describe, expect, it } from 'vitest'
import { validatePlacement } from './placementRules'
import { createLabware, isLawnOnlyLabwareType } from '../../types/labware'
import type { LabwareType } from '../../types/labware'
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

describe('validatePlacement — beaker/flask lawn-only', () => {
  const beakerTypes: LabwareType[] = ['beaker_25ml', 'beaker_50ml', 'beaker_100ml', 'beaker_250ml', 'beaker_500ml', 'beaker_1000ml']
  const flaskTypes: LabwareType[] = ['flask_25ml', 'flask_50ml', 'flask_100ml', 'flask_250ml', 'flask_500ml', 'flask_1000ml']

  it.each(beakerTypes)('rejects %s on automation slot', (type) => {
    const labware = createLabware(type)
    const result = validatePlacement({
      platform: PLATFORM,
      variant: VARIANT,
      location: { kind: 'slot', slotId: 'A1' },
      labware,
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/freeform bench/i)
  })

  it.each(flaskTypes)('rejects %s on automation slot', (type) => {
    const labware = createLabware(type)
    const result = validatePlacement({
      platform: PLATFORM,
      variant: VARIANT,
      location: { kind: 'slot', slotId: 'A1' },
      labware,
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/freeform bench/i)
  })

  it.each(beakerTypes)('allows %s on lawn surface', (type) => {
    const labware = createLabware(type)
    const result = validatePlacement({
      platform: PLATFORM,
      variant: VARIANT,
      location: { kind: 'lawn', xMm: 100, yMm: 50 },
      labware,
    })
    expect(result.ok).toBe(true)
  })

  it.each(flaskTypes)('allows %s on lawn surface', (type) => {
    const labware = createLabware(type)
    const result = validatePlacement({
      platform: PLATFORM,
      variant: VARIANT,
      location: { kind: 'lawn', xMm: 100, yMm: 50 },
      labware,
    })
    expect(result.ok).toBe(true)
  })
})

describe('isLawnOnlyLabwareType — beaker/flask', () => {
  const beakerTypes: LabwareType[] = ['beaker_25ml', 'beaker_50ml', 'beaker_100ml', 'beaker_250ml', 'beaker_500ml', 'beaker_1000ml']
  const flaskTypes: LabwareType[] = ['flask_25ml', 'flask_50ml', 'flask_100ml', 'flask_250ml', 'flask_500ml', 'flask_1000ml']

  it('returns true for all beaker types', () => {
    for (const type of beakerTypes) {
      expect(isLawnOnlyLabwareType(type)).toBe(true)
    }
  })

  it('returns true for all flask types', () => {
    for (const type of flaskTypes) {
      expect(isLawnOnlyLabwareType(type)).toBe(true)
    }
  })
})
