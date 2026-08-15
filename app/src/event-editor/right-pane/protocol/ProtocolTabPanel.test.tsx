import { describe, it, expect } from 'vitest'
import { splitHumanSteps, extractLocalProtocolSetup } from './ProtocolTabPanel'

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

describe('extractLocalProtocolSetup', () => {
  it('returns the three sections from a local-protocol envelope', () => {
    const env = {
      recordId: 'LPR-1',
      payload: {
        kind: 'local-protocol',
        title: 'Rotenone assay',
        labwares: [{ role: 'Sample plate', ref: { kind: 'record', id: 'LBW-1', type: 'labware' } }],
        equipment: [{ role: 'Plate reader' }],
        materials: [{ role: 'Treatment', ref: { kind: 'record', id: 'MAT-1', type: 'material-spec' } }],
      },
    }
    expect(extractLocalProtocolSetup(env)).toEqual({
      labwares: [{ role: 'Sample plate', ref: { kind: 'record', id: 'LBW-1', type: 'labware' } }],
      equipment: [{ role: 'Plate reader' }],
      materials: [{ role: 'Treatment', ref: { kind: 'record', id: 'MAT-1', type: 'material-spec' } }],
    })
  })

  it('returns null for non-local-protocol records (universal protocol)', () => {
    const env = {
      recordId: 'PRT-1',
      payload: { kind: 'protocol', title: 'Universal', labwares: [{ role: 'x' }] },
    }
    expect(extractLocalProtocolSetup(env)).toBeNull()
  })

  it('returns null when a local protocol declares no setup rows', () => {
    expect(
      extractLocalProtocolSetup({ recordId: 'LPR-2', payload: { kind: 'local-protocol', title: 'Bare' } }),
    ).toBeNull()
  })

  it('drops empty section arrays and keeps non-empty ones', () => {
    const env = {
      recordId: 'LPR-3',
      payload: { kind: 'local-protocol', title: 'Partial', labwares: [], equipment: [{ role: 'Reader' }] },
    }
    expect(extractLocalProtocolSetup(env)).toEqual({ equipment: [{ role: 'Reader' }] })
  })

  it('tolerates a bare payload (no envelope wrapper) and null/undefined', () => {
    expect(
      extractLocalProtocolSetup({ kind: 'local-protocol', materials: [{ role: 'Dye' }] }),
    ).toEqual({ materials: [{ role: 'Dye' }] })
    expect(extractLocalProtocolSetup(null)).toBeNull()
    expect(extractLocalProtocolSetup(undefined)).toBeNull()
  })
})
