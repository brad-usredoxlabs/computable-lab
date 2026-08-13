import { describe, it, expect } from 'vitest'
import { splitHumanSteps } from './ProtocolTabPanel'

describe('splitHumanSteps', () => {
  it('keys a whole-text protocol at ordinal 1 when it does not split', () => {
    expect(splitHumanSteps('Add reagent then seal the plate')).toEqual({
      1: 'Add reagent then seal the plate',
    })
  })

  it('splits ordinal-keyed sections into a map', () => {
    expect(splitHumanSteps('1. Add cells\n2. Incubate 30 min at 37C')).toEqual({
      1: 'Add cells',
      2: 'Incubate 30 min at 37C',
    })
  })

  it('preserves multi-line bodies under a single ordinal', () => {
    expect(splitHumanSteps('1. First\n   second line\n2. Last step')).toEqual({
      1: 'First\n   second line',
      2: 'Last step',
    })
  })

  it('handles leading whitespace and empty sections', () => {
    expect(splitHumanSteps('  1. A\n\n2. B')).toEqual({ 1: 'A', 2: 'B' })
  })
})
