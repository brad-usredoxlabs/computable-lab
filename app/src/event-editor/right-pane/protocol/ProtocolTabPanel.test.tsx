import { describe, it, expect } from 'vitest'
import { splitHumanSteps, extractLocalProtocolSetup, extractUniversalProtocolSetup, setupSuggestionIndices, extractUniversalRoleIds } from './ProtocolTabPanel'

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

describe('extractUniversalProtocolSetup', () => {
  const roles = {
    labwareRoles: [
      { roleId: 'labware_bashingbead_lysis_rack', description: 'BashingBead Lysis Rack' },
    ],
    instrumentRoles: [{ roleId: 'instrument_bead_beater', description: 'Bead-Beating' }],
    materialRoles: [{ roleId: 'material_zymobiomics_lysis_solution', description: 'ZymoBIOMICS Lysis Solution' }],
  }

  it('derives read-only setup rows from a universal protocol roles.*', () => {
    const env = { recordId: 'CAN-1', payload: { kind: 'protocol', title: 'Zymo', roles } }
    expect(extractUniversalProtocolSetup(env)).toEqual({
      labwares: [{ role: 'labware_bashingbead_lysis_rack', description: 'BashingBead Lysis Rack' }],
      equipment: [{ role: 'instrument_bead_beater', description: 'Bead-Beating' }],
      materials: [{ role: 'material_zymobiomics_lysis_solution', description: 'ZymoBIOMICS Lysis Solution' }],
    })
  })

  it('keeps roles without a description (role-only row), drops fully empty ones', () => {
    const env = {
      recordId: 'CAN-2',
      payload: {
        kind: 'protocol',
        roles: { labwareRoles: [{ roleId: 'no_desc' }, { roleId: 'ok', description: 'Plate' }, {}] },
      },
    }
    expect(extractUniversalProtocolSetup(env)).toEqual({
      labwares: [{ role: 'no_desc' }, { role: 'ok', description: 'Plate' }],
    })
  })

  it('drops empty sections', () => {
    const env = {
      recordId: 'CAN-3',
      payload: { kind: 'protocol', roles: { labwareRoles: [], materialRoles: [{ roleId: 'm', description: 'Dye' }] } },
    }
    expect(extractUniversalProtocolSetup(env)).toEqual({
      materials: [{ role: 'm', description: 'Dye' }],
    })
  })

  it('returns null for non-protocol records, missing/empty roles, and null input', () => {
    expect(
      extractUniversalProtocolSetup({ recordId: 'LPR-1', payload: { kind: 'local-protocol', roles: { labwareRoles: [{ roleId: 'a', description: 'A' }] } } }),
    ).toBeNull()
    expect(extractUniversalProtocolSetup({ recordId: 'CAN-4', payload: { kind: 'protocol', title: 'Bare' } })).toBeNull()
    expect(extractUniversalProtocolSetup({ recordId: 'CAN-5', payload: { kind: 'protocol', roles: { labwareRoles: [] } } })).toBeNull()
    expect(extractUniversalProtocolSetup(null)).toBeNull()
    expect(extractUniversalProtocolSetup(undefined)).toBeNull()
  })
})

describe('setupSuggestionIndices', () => {
  const universalRoles = ['labware_96_well_plate', 'labware_bashingbead_lysis_rack']

  it('flags unbound rows whose role matches a universal role id as suggestions', () => {
    expect(
      setupSuggestionIndices(
        [
          { role: 'labware_96_well_plate', description: '96-well plate' },
          { role: 'Sample plate', ref: { kind: 'record', id: 'LBW-1', type: 'labware' } },
          { role: 'Reservoir' }, // user-added role, not in the universal protocol
        ],
        universalRoles,
      ),
    ).toEqual([0])
  })

  it('excludes rows that have a ref, even when the role matches', () => {
    expect(
      setupSuggestionIndices(
        [
          { role: 'labware_96_well_plate', ref: { kind: 'record', id: 'L1', type: 'labware' } },
          { role: 'labware_bashingbead_lysis_rack' },
        ],
        universalRoles,
      ),
    ).toEqual([1])
  })

  it('falls back to "no ref" when universal role ids are unknown', () => {
    expect(
      setupSuggestionIndices([
        { role: 'Anything' },
        { role: 'Bound', ref: { kind: 'record', id: 'L1', type: 'labware' } },
      ]),
    ).toEqual([0])
  })

  it('tolerates empty arrays and non-array input', () => {
    expect(setupSuggestionIndices([])).toEqual([])
    expect(setupSuggestionIndices(undefined)).toEqual([])
    expect(setupSuggestionIndices(null)).toEqual([])
  })
})

describe('extractUniversalRoleIds', () => {
  it('extracts declared role ids per section from a universal protocol record', () => {
    expect(
      extractUniversalRoleIds({
        recordId: 'CAN-1',
        payload: {
          kind: 'protocol',
          roles: {
            labwareRoles: [{ roleId: 'labware_96_well_plate' }, { roleId: 'labware_rack', description: 'rack' }],
            instrumentRoles: [{ roleId: 'instrument_centrifuge' }],
            materialRoles: [{ roleId: 'material_buffer' }, {}],
          },
        },
      }),
    ).toEqual({
      labwares: ['labware_96_well_plate', 'labware_rack'],
      equipment: ['instrument_centrifuge'],
      materials: ['material_buffer'],
    })
  })

  it('returns null for non-records, missing roles, and null input', () => {
    expect(extractUniversalRoleIds({ recordId: 'LPR-1', payload: { kind: 'local-protocol' } })).toBeNull()
    expect(extractUniversalRoleIds(null)).toBeNull()
    expect(extractUniversalRoleIds(undefined)).toBeNull()
  })
})
