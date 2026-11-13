import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { BindingModeEditor } from './BindingModeEditor'
import { apiClient } from '../../shared/api/client'
import type { RecordEnvelope } from '../../types/kernel'
import type { RecordWithUIResponse } from '../../types/uiSpec'

// L2-SUBPROTOCOL-EXPAND-1 u8pickuniv (G3-D1 picker half): the role pickers are
// fed from the seam's candidate universe — `labware` / `material` records, the
// kinds the proposals endpoint names — NOT the `*-instance` kinds (0 served).

vi.mock('../../shared/hooks/usePlatformRegistry', () => ({ usePlatformRegistry: () => ({ platforms: [], loading: false }) }))
vi.mock('../labware/DeckVisualizationPanel', () => ({ DeckVisualizationPanel: () => <div /> }))
vi.mock('./DeckPickerSelect', () => ({ DeckPickerSelect: () => <div /> }))
vi.mock('./SampleBindingPanel', () => ({ SampleBindingPanel: () => <div /> }))
vi.mock('../../shared/api/client', () => ({
  apiClient: { getRecordWithUI: vi.fn(), listRecordsByKind: vi.fn(), compileRunPlan: vi.fn(), updatePlannedRunBindings: vi.fn() },
}))

const env = (recordId: string, kind: string, name: string): RecordEnvelope => ({
  recordId, schemaId: kind, meta: { kind }, payload: { kind, name },
})

const mockPlannedRun: RecordEnvelope = {
  recordId: 'PLR-PICK-01', schemaId: 'planned-run', meta: { kind: 'planned-run' },
  payload: { kind: 'planned-run', state: 'draft', title: 'Pick Universe Plan', localProtocolRef: { kind: 'record', id: 'LPR-PICK-01' }, bindings: { labware: [], materials: [] } },
}
const mockLocalProtocol: RecordEnvelope = {
  recordId: 'LPR-PICK-01', schemaId: 'local-protocol', meta: { kind: 'local-protocol' },
  payload: { kind: 'local-protocol', inherits_from: { kind: 'record', id: 'PRT-PICK-UNIV' } },
}
const mockUniversalProtocol: RecordEnvelope = {
  recordId: 'PRT-PICK-UNIV', schemaId: 'protocol', meta: { kind: 'protocol' },
  payload: { kind: 'protocol', roles: { labwareRoles: [{ roleId: 'plate' }, { roleId: 'reservoir' }], materialRoles: [{ roleId: 'wash_buffer' }, { roleId: 'dye' }] } },
}
// Seam universe: real `labware` / `material` records (the kinds the proposals endpoint names)
const labwareUniverse = [env('LW-96W', 'labware', '96-Well Plate'), env('LW-RESV', 'labware', 'Reservoir')]
const materialUniverse = [env('MAT-WASH', 'material', 'Wash Buffer'), env('MAT-DYE', 'material', 'Dye')]

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/runs/PLR-PICK-01/bindings']}>
      <Routes><Route path="/runs/:runId/bindings" element={children} /></Routes>
    </MemoryRouter>
  )
}

function optionsFor(roleId: string): string[] {
  const select = screen.queryByTestId(`role-binding-${roleId}`)?.querySelector('select')
  return select ? Array.from(select.querySelectorAll('option')).map((o) => o.value).filter(Boolean) : []
}

function optionText(roleId: string, value: string): string | null {
  const select = screen.queryByTestId(`role-binding-${roleId}`)?.querySelector('select')
  return select?.querySelector(`option[value="${value}"]`)?.textContent ?? null
}

describe('BindingModeEditor picker universe (u8pickuniv)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiClient.getRecordWithUI).mockImplementation(async (id: string) => {
      if (id === 'PLR-PICK-01') return { record: mockPlannedRun, uiSpec: null, schema: null } as RecordWithUIResponse
      if (id === 'LPR-PICK-01') return { record: mockLocalProtocol, uiSpec: null, schema: null } as RecordWithUIResponse
      if (id === 'PRT-PICK-UNIV') return { record: mockUniversalProtocol, uiSpec: null, schema: null } as RecordWithUIResponse
      throw new Error(`record not found: ${id}`)
    })
    // Lane 2 reality: the seam kinds serve the universe; every other kind
    // (the instance kinds included) serves nothing.
    vi.mocked(apiClient.listRecordsByKind).mockImplementation(async (kind: string) => {
      if (kind === 'labware') return { records: labwareUniverse, total: 2 }
      if (kind === 'material') return { records: materialUniverse, total: 2 }
      return { records: [], total: 0 }
    })
  })

  it('labware-role pickers offer seam-universe `labware` records (label + recordId); instance kinds never fetched', async () => {
    render(<Wrapper><BindingModeEditor plannedRunId="PLR-PICK-01" /></Wrapper>)
    await waitFor(() => expect(optionsFor('plate').length).toBeGreaterThan(0), { timeout: 3000 })
    expect(optionsFor('plate')).toEqual(expect.arrayContaining(['LW-96W', 'LW-RESV']))
    expect(optionsFor('reservoir')).toEqual(expect.arrayContaining(['LW-96W', 'LW-RESV']))
    expect(optionText('plate', 'LW-96W')).toContain('96-Well Plate')
    expect(optionText('plate', 'LW-96W')).toContain('LW-96W')
    expect(apiClient.listRecordsByKind).not.toHaveBeenCalledWith('labware-instance', 500)
    expect(apiClient.listRecordsByKind).not.toHaveBeenCalledWith('material-instance', 500)
  })

  it('material-role pickers offer seam-universe `material` records (label + recordId)', async () => {
    render(<Wrapper><BindingModeEditor plannedRunId="PLR-PICK-01" /></Wrapper>)
    await waitFor(() => expect(optionsFor('wash_buffer').length).toBeGreaterThan(0), { timeout: 3000 })
    expect(optionsFor('wash_buffer')).toEqual(expect.arrayContaining(['MAT-WASH', 'MAT-DYE']))
    expect(optionsFor('dye')).toEqual(expect.arrayContaining(['MAT-WASH', 'MAT-DYE']))
    expect(optionText('wash_buffer', 'MAT-WASH')).toContain('Wash Buffer')
  })
})
