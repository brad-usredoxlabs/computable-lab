import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { BindingModeEditor } from './BindingModeEditor'
import { apiClient } from '../../shared/api/client'
import type { RecordEnvelope } from '../../types/kernel'
import type { PlatformManifest } from '../../types/platformRegistry'

// Mock the platform registry hook
vi.mock('../../shared/hooks/usePlatformRegistry', () => ({
  usePlatformRegistry: () => ({
    platforms: [
      { id: 'manual', label: 'Manual', allowedVocabIds: [], defaultVariant: 'manual_collapsed', toolTypeIds: [], variants: [] },
      { id: 'integra_assist', label: 'Integra Assist Plus', allowedVocabIds: [], defaultVariant: 'assist_plus', toolTypeIds: [], variants: [] },
      { id: 'opentrons_ot2', label: 'Opentrons OT-2', allowedVocabIds: [], defaultVariant: 'ot2_standard', toolTypeIds: [], variants: [] },
      { id: 'opentrons_flex', label: 'Opentrons Flex', allowedVocabIds: [], defaultVariant: 'flex_standard', toolTypeIds: [], variants: [] },
    ] as PlatformManifest[],
    loading: false,
  }),
}))

// Mock DeckVisualizationPanel
vi.mock('../labware/DeckVisualizationPanel', () => ({
  DeckVisualizationPanel: () => <div data-testid="deck-visualization">Deck Visualization</div>,
}))

// Mock apiClient
vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    listRecordsByKind: vi.fn(),
    updatePlannedRunBindings: vi.fn(),
  },
}))

const mockPlannedRun: RecordEnvelope = {
  recordId: 'PLR-000001',
  kind: 'planned-run',
  payload: {
    kind: 'planned-run',
    state: 'draft',
    title: 'Test Protocol Plan',
    localProtocolRef: { kind: 'record', id: 'LPR-000001' },
    bindings: {
      labware: [],
      materials: [],
    },
  },
}

const mockLocalProtocol: RecordEnvelope = {
  recordId: 'LPR-000001',
  kind: 'local-protocol',
  payload: {
    kind: 'local-protocol',
    labwareRoles: [
      { roleId: 'plate', roleType: 'labware' },
      { roleId: 'reservoir', roleType: 'labware' },
    ],
    materialRoles: [
      { roleId: 'wash_buffer', roleType: 'material' },
    ],
  },
}

const mockLabwareInstances: RecordEnvelope[] = [
  {
    recordId: 'LWI-PLATE1',
    kind: 'labware-instance',
    payload: { kind: 'labware-instance', name: 'Source Plate 1' },
  },
  {
    recordId: 'LWI-RES1',
    kind: 'labware-instance',
    payload: { kind: 'labware-instance', name: 'Reservoir 1' },
  },
]

const mockMaterialInstances: RecordEnvelope[] = [
  {
    recordId: 'MAT-WASH1',
    kind: 'material-instance',
    payload: { kind: 'material-instance', name: 'Wash Buffer Batch 1' },
  },
]

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/runs/PLR-000001/editor']}>
      <Routes>
        <Route path="/runs/:runId/editor" element={children} />
      </Routes>
    </MemoryRouter>
  )
}

describe('BindingModeEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiClient.getRecord).mockReset()
    vi.mocked(apiClient.listRecordsByKind).mockReset()
    vi.mocked(apiClient.updatePlannedRunBindings).mockReset()

    vi.mocked(apiClient.getRecord).mockImplementation(async (id: string) => {
      if (id === 'PLR-000001') return mockPlannedRun
      if (id === 'LPR-000001') return mockLocalProtocol
      throw new Error('Not found')
    })

    vi.mocked(apiClient.listRecordsByKind).mockImplementation(async (kind: string) => {
      if (kind === 'labware-instance') return { records: mockLabwareInstances, total: 2 }
      if (kind === 'material-instance') return { records: mockMaterialInstances, total: 1 }
      return { records: [], total: 0 }
    })
  })

  it('renders deck picker', async () => {
    render(
      <Wrapper>
        <BindingModeEditor plannedRunId="PLR-000001" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText('Plan: Test Protocol Plan')).toBeInTheDocument()
    })

    // Deck picker should be present - look for the label text
    expect(screen.getByText('Deck')).toBeInTheDocument()
  })

  it('renders role list from a planned-run fixture', async () => {
    render(
      <Wrapper>
        <BindingModeEditor plannedRunId="PLR-000001" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText('Labware roles')).toBeInTheDocument()
      expect(screen.getByText('Material roles')).toBeInTheDocument()
    })

    // Assert all three role rows are present by checking their labels exist
    const plateRows = screen.queryAllByText('plate')
    expect(plateRows.length).toBeGreaterThan(0)
    const reservoirRows = screen.queryAllByText('reservoir')
    expect(reservoirRows.length).toBeGreaterThan(0)
    const washBufferRows = screen.queryAllByText('wash_buffer')
    expect(washBufferRows.length).toBeGreaterThan(0)
  })

  it('selecting a binding calls the API after debounce', async () => {
    vi.mocked(apiClient.updatePlannedRunBindings).mockResolvedValue({ success: true })

    render(
      <Wrapper>
        <BindingModeEditor plannedRunId="PLR-000001" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.queryAllByText('plate').length).toBeGreaterThan(0)
    })

    // Select a labware instance for the plate role - find the select near the plate label
    const plateRows = screen.queryAllByText('plate')
    const plateRow = plateRows[0]?.closest('.role-binding-row')
    expect(plateRow).toBeTruthy()
    const plateSelect = plateRow?.querySelector('select')
    expect(plateSelect).toBeTruthy()
    if (plateSelect) {
      fireEvent.change(plateSelect, { target: { value: 'LWI-PLATE1' } })
    }

    // Wait for debounce (500ms) + flush promises
    await vi.waitFor(
      () => {
        expect(apiClient.updatePlannedRunBindings).toHaveBeenCalledWith(
          'PLR-000001',
          expect.objectContaining({
            labware: expect.arrayContaining([
              expect.objectContaining({ roleId: 'plate', labwareInstanceRef: 'LWI-PLATE1' }),
            ]),
          }),
        )
      },
      { timeout: 1000 },
    )
  })
})
