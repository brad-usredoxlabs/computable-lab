/**
 * Tests for the BindingModeEditor compile integration:
 * - Debounced API call after binding edit
 * - Compile result with ready status shows green banner
 * - Blocked status shows red banner with error count
 * - Per-role diagnostic appears next to the right binding
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
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
    ] as PlatformManifest[],
    loading: false,
  }),
}))

// Mock DeckVisualizationPanel
vi.mock('../labware/DeckVisualizationPanel', () => ({
  DeckVisualizationPanel: () => <div data-testid="deck-visualization">Deck Visualization</div>,
}))

// Mock DeckPickerSelect
vi.mock('./DeckPickerSelect', () => ({
  DeckPickerSelect: () => <div data-testid="deck-picker">DeckPicker</div>,
}))

// Mock SampleBindingPanel
vi.mock('./SampleBindingPanel', () => ({
  SampleBindingPanel: () => <div data-testid="sample-binding">SampleBinding</div>,
}))

// Mock apiClient
vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    listRecordsByKind: vi.fn(),
    updatePlannedRunBindings: vi.fn(),
    compileRunPlan: vi.fn(),
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
    notes: JSON.stringify({ labContext: { plateCount: 1, sampleCount: 96 } }),
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

describe('BindingModeEditor compile integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cleanup()

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

    vi.mocked(apiClient.updatePlannedRunBindings).mockResolvedValue({ success: true })

    // Default: ready status
    vi.mocked(apiClient.compileRunPlan).mockResolvedValue({
      status: 'ready',
      diagnostics: [],
    })
  })

  it('edit triggers debounced API call — no call within 500ms', async () => {
    render(
      <Wrapper>
        <BindingModeEditor plannedRunId="PLR-000001" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText('Plan: Test Protocol Plan')).toBeInTheDocument()
    })

    // Find the select for the plate role
    const plateRows = screen.queryAllByText('plate')
    const plateRow = plateRows[0]?.closest('.role-binding-row')
    const plateSelect = plateRow?.querySelector('select')
    expect(plateSelect).toBeTruthy()

    if (plateSelect) {
      fireEvent.change(plateSelect, { target: { value: 'LWI-PLATE1' } })
    }

    // Wait 500ms — compile should NOT have been called yet
    await new Promise((r) => setTimeout(r, 500))

    expect(apiClient.compileRunPlan).not.toHaveBeenCalled()
  })

  it('edit triggers debounced API call — call after 1.5s', async () => {
    render(
      <Wrapper>
        <BindingModeEditor plannedRunId="PLR-000001" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText('Plan: Test Protocol Plan')).toBeInTheDocument()
    })

    const plateRows = screen.queryAllByText('plate')
    const plateRow = plateRows[0]?.closest('.role-binding-row')
    const plateSelect = plateRow?.querySelector('select')
    expect(plateSelect).toBeTruthy()

    if (plateSelect) {
      fireEvent.change(plateSelect, { target: { value: 'LWI-PLATE1' } })
    }

    // Wait 1.5s — should have called compile
    await new Promise((r) => setTimeout(r, 1500))

    expect(apiClient.compileRunPlan).toHaveBeenCalledWith('PLR-000001')
  })

  it('multiple edits within 1s collapse to one API call', async () => {
    render(
      <Wrapper>
        <BindingModeEditor plannedRunId="PLR-000001" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText('Plan: Test Protocol Plan')).toBeInTheDocument()
    })

    const plateRows = screen.queryAllByText('plate')
    const plateRow = plateRows[0]?.closest('.role-binding-row')
    const plateSelect = plateRow?.querySelector('select')
    expect(plateSelect).toBeTruthy()

    // First edit
    if (plateSelect) {
      fireEvent.change(plateSelect, { target: { value: 'LWI-PLATE1' } })
    }

    // Second edit within 500ms
    if (plateSelect) {
      fireEvent.change(plateSelect, { target: { value: 'LWI-RES1' } })
    }

    // Wait 1.5s — should only have one compile call (from the last edit)
    await new Promise((r) => setTimeout(r, 1500))

    expect(apiClient.compileRunPlan).toHaveBeenCalledTimes(1)
  })

  it('compile result with ready status shows green banner', async () => {
    vi.mocked(apiClient.compileRunPlan).mockResolvedValue({
      status: 'ready',
      diagnostics: [],
    })

    render(
      <Wrapper>
        <BindingModeEditor plannedRunId="PLR-000001" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText('Plan: Test Protocol Plan')).toBeInTheDocument()
    })

    const plateRows = screen.queryAllByText('plate')
    const plateRow = plateRows[0]?.closest('.role-binding-row')
    const plateSelect = plateRow?.querySelector('select')
    expect(plateSelect).toBeTruthy()

    if (plateSelect) {
      fireEvent.change(plateSelect, { target: { value: 'LWI-PLATE1' } })
    }

    await new Promise((r) => setTimeout(r, 1500))

    expect(screen.getByText('Plan ready')).toBeInTheDocument()
  })

  it('compile result with blocked status shows red banner with error count', async () => {
    vi.mocked(apiClient.compileRunPlan).mockResolvedValue({
      status: 'blocked',
      diagnostics: [
        {
          severity: 'error',
          code: 'capability_volume_out_of_range',
          message: 'Volume exceeds pipette max',
          pass_id: 'capability_check',
          details: { stepId: 'step-1' },
        },
        {
          severity: 'error',
          code: 'capability_labware_shape_mismatch',
          message: 'Labware incompatible',
          pass_id: 'capability_check',
          details: { stepId: 'step-2' },
        },
      ],
    })

    render(
      <Wrapper>
        <BindingModeEditor plannedRunId="PLR-000001" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText('Plan: Test Protocol Plan')).toBeInTheDocument()
    })

    const plateRows = screen.queryAllByText('plate')
    const plateRow = plateRows[0]?.closest('.role-binding-row')
    const plateSelect = plateRow?.querySelector('select')
    expect(plateSelect).toBeTruthy()

    if (plateSelect) {
      fireEvent.change(plateSelect, { target: { value: 'LWI-PLATE1' } })
    }

    await new Promise((r) => setTimeout(r, 1500))

    expect(screen.getByText('2 capability errors')).toBeInTheDocument()
  })

  it('per-role diagnostic appears next to the right binding', async () => {
    vi.mocked(apiClient.compileRunPlan).mockResolvedValue({
      status: 'blocked',
      diagnostics: [
        {
          severity: 'error',
          code: 'capability_volume_out_of_range',
          message: 'Volume exceeds pipette max',
          pass_id: 'capability_check',
          details: { stepId: 'step-1', roleId: 'plate' },
        },
      ],
    })

    render(
      <Wrapper>
        <BindingModeEditor plannedRunId="PLR-000001" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText('Plan: Test Protocol Plan')).toBeInTheDocument()
    })

    const plateRows = screen.queryAllByText('plate')
    const plateRow = plateRows[0]?.closest('.role-binding-row')
    const plateSelect = plateRow?.querySelector('select')
    expect(plateSelect).toBeTruthy()

    if (plateSelect) {
      fireEvent.change(plateSelect, { target: { value: 'LWI-PLATE1' } })
    }

    await new Promise((r) => setTimeout(r, 1500))

    // The plate role row should have the error badge
    const plateRowAfter = screen.getByTestId('role-binding-plate')
    expect(plateRowAfter).toBeInTheDocument()
    expect(plateRowAfter.querySelector('[title="Volume exceeds pipette max"]')).toBeInTheDocument()
  })
})
