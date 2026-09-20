import { describe, expect, it } from 'vitest'

/**
 * Equipment requirements arrive as tokens (`equipment:heater_shaker`,
 * `CL:plate_reader`). Before the token normalization these fell through to
 * `generic` (a `\b` sees no boundary after "heater" when `_` follows), so a
 * minted instrument drew the generic glyph.
 */
describe('inferInstrumentKind on equipment tokens', () => {
  const cases: Array<[string, string]> = [
    ['equipment:water_bath', 'water_bath'],
    ['equipment:heat_block', 'heater_shaker'],
    ['equipment:heater_shaker', 'heater_shaker'],
    ['equipment:orbital_shaker', 'heater_shaker'],
    ['equipment:rocker', 'heater_shaker'],
    ['equipment:vortex_mixer', 'vortex'],
    ['equipment:qpcr', 'qpcr'],
    ['equipment:plate_reader', 'plate_reader'],
    ['CL:water_bath', 'water_bath'],
    ['CL:clamshell_heater_shaker', 'heater_shaker'],
  ]

  it.each(cases)('%s -> %s (never generic)', (token, expected) => {
    expect(inferInstrumentKind(token)).toBe(expected)
  })

  it('keeps the generic fallback for something we cannot classify', () => {
    expect(inferInstrumentKind('equipment:incu_mixer_9000')).toBe('generic')
  })
})
import { INSTRUMENT_KINDS, inferInstrumentKind } from './labware'

describe('instrument kinds', () => {
  it('includes a water-bath kind', () => {
    expect(INSTRUMENT_KINDS).toContain('water_bath')
  })
  it('infers water_bath from common labels', () => {
    expect(inferInstrumentKind('water bath')).toBe('water_bath')
    expect(inferInstrumentKind('Water Bath 55C')).toBe('water_bath')
    expect(inferInstrumentKind('circulating water bath')).toBe('water_bath')
  })
})