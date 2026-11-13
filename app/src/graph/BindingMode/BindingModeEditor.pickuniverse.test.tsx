import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { BindingModeEditor } from './BindingModeEditor'
import { apiClient } from '../../shared/api/client'
import type { RecordEnvelope } from '../../types/kernel'
import type { RecordWithUIResponse } from '../../types/uiSpec'

// L2-SUBPROTOCOL-EXPAND-1 u8pickuniv (G3-D1 picker half): the role pickers must
// be fed from the seam's candidate universe — records of kind `labware` /
// `material`, the kinds the proposals endpoint already names — NOT from the
// `labware-instance` / `material-instance` kinds that serve zero records.

vi.mock('../../shared/hooks/usePlatformRegistry', () => ({
  usePlatformRegistry: () => ({ platforms: [], loading: false }),
}))
vi.mock('../labware/DeckVisualizationPanel', () => ({ DeckVisualizationPanel: () => <div /> }))
vi.mock('./DeckPickerSelect', () => ({ DeckPickerSelect: () => <div /> }))
vi.mock('./SampleBindingPanel', () => ({ SampleBindingPanel: () => <div /> }))

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getRecordWithUI: vi.fn(),
    listRecordsByKind: vi.fn(),
    compileRunPlan: vi.fn(),
    updatePlannedRunBindings: vi.fn(),
  },
}))

const mockPlannedRun: RecordEnvelope = {
  recordId: 'PLR-PICK-01',
  schemaId: 'planned-run',
  meta: { kind: 'planned-run' },
  payload: {
    kind: 'planned-run',
    state: 'draft',
    title: 'Pick Universe Plan',
    localProtocolRef: { kind: 'record', id: 'LPR-PICK-01' },
    bindings: { labware: [], materials: [] },
  },
}

// Local protocol inherits a universal with 4 roles (2 labware, 2 material)
const mockLocalProtocol: RecordEnvelope = {
  recordId: 'LPR-PICK-01',
  schemaId: 'local-protocol',
  meta: { kind: 'local-protocol' },
  payload: {
    kind: 'local-protocol',
    inherits_from: { kind: 'record', id: 'PRT-PICK-UNIV' },
  },
}

const mockUniversalProtocol: RecordEnvelope = {
  recordId: 'PRT-PICK-UNIV',
  schemaId: 'protocol',
  meta: { kind: 'protocol' },
  payload: {
    kind: 'protocol',
    roles: {
      labwareRoles: [{ roleId: 'plate' }, { roleId: 'reservoir' }],
      materialRoles: [{ roleId: 'wash_buffer' }, { roleId: 'dye' }],
    },
  },
}

// Seam universe: real `labware` / `material` records (20 / 28 served on lane 2)
const mockLabwareUniverse: RecordEnvelope[] = [
  { recordId: 'LW-96W', schemaId: 'labware', meta: { kind: 'labware' }, payload: { kind: 'labware', name: '96-Well Plate' } },
  { recordId: 'LW-RESV', schemaId: 'labware', meta: { kind: 'labware' }, payload: { kind: 'labware', name: 'Reservoir' } },
]
const mockMaterialUniverse: RecordEnvelope[] = [
  { recordId: 'MAT-WASH', schemaId: 'material', meta: { kind: 'material' }, payload: { kind: 'material', name: 'Wash Buffer' } },
  { recordId: 'MAT-DYE', schemaId: 'material', meta: { kind: 'material' }, payload: { kind: 'material', name: 'Dye' } },
]

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/runs/PLR-PICK-01/bindings']}>
      <Routes>
        <Route path="/runs/:runId/bindings" element={children} />
      </Routes>
    </MemoryRouter>
  )
}

function selectFor(roleId: string): HTMLSelectElement | null {
  const row = screen.queryByTestId(`role-binding-${roleId}`)
  return row?.querySelector('select') ?? null
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
    // Lane 2 reality: the seam kinds serve the universe; every other kind (the
    // instance kinds included) serves nothing.
    vi.mocked(apiClient.listRecordsByKind).mockImplementation(async (kind: string) => {
      if (kind === 'labware') return { records: mockLabwareUniverse, total: 2 }
      if (kind === 'material') return { records: mockMaterialUniverse, total: 2 }
      return { records: [], total: 0 }
    })
  })

  it('lists seam-universe records (kind `labware`) with label + recordId in a labware-role picker', async () => {
    render(
      <Wrapper>
        <BindingModeEditor plannedRunId="PLR-PICK-01" />
      </Wrapper>,
    )

    await waitFor(() => expect(selectFor('plate')).toBeTruthy(), { timeout: 3000 })
    const select = selectFor('plate')!
    const values = Array.from(select.querySelectorAll('option')).map((o) => o.value).filter(Boolean)
    expect(values).toEqual(expect.arrayContaining(['LW-96W', 'LW-RESV']))
    const opt = select.querySelector('option[value="LW-96W"]')
    expect(opt?.textContent).toContain('96-Well Plate')
    expect(opt?.textContent).toContain('LW-96W')
    // No picker may be fed by the empty instance kinds
    expect(apiClient.listRecordsByKind).not.toHaveBeenCalledWith('labware-instance', 500)
    expect(apiClient.listRecordsByKind).not.toHaveBeenCalledWith('material-instance', 500)
  })

  it('lists seam-universe records (kind `material`) in a material-role picker', async () => {
    render(
      <Wrapper>
        <BindingModeEditor plannedRunId="PLR-PICK-01" />
      </Wrapper>,
    )

    await waitFor(() => expect(selectFor('wash_buffer')).toBeTruthy(), { timeout: 3000 })
    const select = selectFor('wash_buffer')!
    const values = Array.from(select.querySelectorAll('option')).map((o) => o.value).filter(Boolean)
    expect(values).toEqual(expect.arrayContaining(['MAT-WASH', 'MAT-DYE']))
    expect(select.querySelector('option[value="MAT-WASH"]')?.textContent).toContain('Wash Buffer')
  })
})
