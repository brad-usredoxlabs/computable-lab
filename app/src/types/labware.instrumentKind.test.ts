import { describe, expect, it } from 'vitest'
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