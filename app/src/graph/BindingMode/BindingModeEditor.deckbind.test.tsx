// g4bindfix2 RED pins (browser gate g4, D-4 + D-5):
//  A: a planned-run carrying BOTH a labware binding and a material binding must
//     hand DeckVisualizationPanel only labware roles — the panel's contract is
//     "placements are labware" and it derives bench entries from them.
//  B: role edits made inside ONE 500 ms save-debounce window must accumulate —
//     the flush must be a SINGLE updatePlannedRunBindings call carrying every
//     edited role, not only the last one.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { BindingModeEditor } from './BindingModeEditor'
import { apiClient } from '../../shared/api/client'
import { ApiError } from '../../shared/api/errors'
import type { RecordEnvelope } from '../../types/kernel'
import type { RecordWithUIResponse } from '../../types/uiSpec'
import type { PlatformManifest } from '../../types/platformRegistry'
import type { DeckPlacement } from '../labware/DeckVisualizationPanel'

// Capturing mock — the existing suite's no-arg mock is exactly why D-4 shipped:
// it can never see what the editor hands the deck.
let capturedDeckProps: { labwares?: unknown[]; placements?: DeckPlacement[] } | null = null

vi.mock('../labware/DeckVisualizationPanel', () => ({
  DeckVisualizationPanel: (props: { labwares?: unknown[]; placements?: DeckPlacement[] }) => {
    capturedDeckProps = props
    return <div data-testid="deck-visualization">Deck Visualization</div>
  },
}))

vi.mock('../../shared/hooks/usePlatformRegistry', () => ({
  usePlatformRegistry: () => ({
    platforms: [
      { id: 'manual', label: 'Manual', allowedVocabIds: [], defaultVariant: 'manual_collapsed', toolTypeIds: [], variants: [] },
      { id: 'opentrons_ot2', label: 'Opentrons OT-2', allowedVocabIds: [], defaultVariant: 'ot2_standard', toolTypeIds: [], variants: [] },
    ] as unknown as PlatformManifest[],
    loading: false,
  }),
}))

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    getRecordWithUI: vi.fn(),
    listRecordsByKind: vi.fn(),
    updatePlannedRunBindings: vi.fn(),
  },
}))

// Fixture mirroring the SHIPPED payload shape the loader reads:
//   bindings.labware[].labwareInstanceRef.id
//   bindings.materials[].materialRef.id
// (the served store today has only a labware-only plan, so the material leg
// must be built here, not borrowed)
const mockPlannedRun: RecordEnvelope = {
  recordId: 'PLR-000001',
  schemaId: 'planned-run',
  meta: { kind: 'planned-run' },
  payload: {
    kind: 'planned-run',
    state: 'draft',
    title: 'Bind Fix Plan',
    localProtocolRef: { kind: 'record', id: 'LPR-000001' },
    bindings: {
      labware: [{ roleId: 'plate', labwareInstanceRef: { kind: 'record', id: 'LWI-PLATE1', type: 'labware' } }],
      materials: [{ roleId: 'topping_medium', materialRef: { kind: 'record', id: 'MAT-TOP1', type: 'material' } }],
    },
  },
}

// SHIPPED shape: local protocol carries only inherits_from; roles come from the
// universal protocol (labware roles plate/reservoir, material role topping_medium)
const mockLocalProtocol: RecordEnvelope = {
  recordId: 'LPR-000001',
  schemaId: 'local-protocol',
  meta: { kind: 'local-protocol' },
  payload: {
    kind: 'local-protocol',
    inherits_from: { kind: 'record', id: 'PRT-UNIVERSAL' },
  },
}

const mockUniversalProtocol: RecordEnvelope = {
  recordId: 'PRT-UNIVERSAL',
  schemaId: 'protocol',
  meta: { kind: 'protocol' },
  payload: {
    kind: 'protocol',
    roles: {
      labwareRoles: [{ roleId: 'plate' }, { roleId: 'reservoir' }],
      materialRoles: [{ roleId: 'topping_medium' }],
    },
  },
}

const mockLabwareUniverse: RecordEnvelope[] = [
  { recordId: 'LWI-PLATE1', schemaId: 'labware', meta: { kind: 'labware' }, payload: { kind: 'labware', name: 'Source Plate 1', labwareType: 'plate_96' } },
  { recordId: 'LWI-RES1', schemaId: 'labware', meta: { kind: 'labware' }, payload: { kind: 'labware', name: 'Reservoir 1', labwareType: 'reservoir_12' } },
]

const mockMaterialUniverse: RecordEnvelope[] = [
  { recordId: 'MAT-TOP1', schemaId: 'material', meta: { kind: 'material' }, payload: { kind: 'material', name: 'Topping Medium' } },
  { recordId: 'MAT-WASH1', schemaId: 'material', meta: { kind: 'material' }, payload: { kind: 'material', name: 'Wash Buffer Batch 1' } },
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

describe('BindingModeEditor deck bindings (g4bindfix2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedDeckProps = null
    vi.mocked(apiClient.getRecordWithUI).mockReset()
    vi.mocked(apiClient.listRecordsByKind).mockReset()
    vi.mocked(apiClient.updatePlannedRunBindings).mockReset()

    vi.mocked(apiClient.getRecordWithUI).mockImplementation(async (id: string) => {
      if (id === 'PLR-000001') return { record: mockPlannedRun, uiSpec: null, schema: null } as RecordWithUIResponse
      if (id === 'LPR-000001') return { record: mockLocalProtocol, uiSpec: null, schema: null } as RecordWithUIResponse
      if (id === 'PRT-UNIVERSAL') return { record: mockUniversalProtocol, uiSpec: null, schema: null } as RecordWithUIResponse
      throw new ApiError({ status: 404, code: 'NOT_FOUND', message: `record not found: ${id}` })
    })

    vi.mocked(apiClient.listRecordsByKind).mockImplementation(async (kind: string) => {
      if (kind === 'labware') return { records: mockLabwareUniverse, total: 2 }
      if (kind === 'material') return { records: mockMaterialUniverse, total: 2 }
      return { records: [], total: 0 }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('A: hands the deck panel only labware roles — a material binding never becomes a deck object', async () => {
    render(
      <Wrapper>
        <BindingModeEditor plannedRunId="PLR-000001" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('deck-visualization')).toBeInTheDocument()
      // Roles resolve from the universal protocol asynchronously; wait until
      // the panel has re-rendered with the resolved labware roles so the
      // captured props are the FINAL ones, not the pre-resolution render.
      expect(capturedDeckProps?.placements?.length ?? 0).toBeGreaterThan(0)
    }, { timeout: 3000 })

    const placements: DeckPlacement[] = (capturedDeckProps?.placements ?? []) as DeckPlacement[]
    const placementRoles = placements
      .filter((p) => typeof p.slotId === 'string' && p.slotId.startsWith('role:'))
      .map((p) => p.slotId.slice('role:'.length))
    expect(placementRoles).toEqual(['plate'])
    expect(placementRoles).not.toContain('topping_medium')

    const labwareIds = (capturedDeckProps?.labwares ?? [])
      .map((lw) => (lw as { labwareId?: string }).labwareId)
      .filter((x): x is string => typeof x === 'string')
    expect(labwareIds).not.toContain('MAT-TOP1')
    expect(labwareIds).toContain('LWI-PLATE1')
  })

  it('B: three role edits inside one debounce window accumulate into ONE save carrying every role', async () => {
    vi.mocked(apiClient.updatePlannedRunBindings).mockResolvedValue({ success: true })

    render(
      <Wrapper>
        <BindingModeEditor plannedRunId="PLR-000001" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('role-binding-plate')).toBeInTheDocument()
      expect(screen.getByTestId('role-binding-reservoir')).toBeInTheDocument()
      expect(screen.getByTestId('role-binding-topping_medium')).toBeInTheDocument()
    }, { timeout: 3000 })

    vi.useFakeTimers()

    const rowOf = (testId: string) => screen.getByTestId(testId).closest('.role-binding-row')
    const selects: Record<string, HTMLSelectElement> = {}
    for (const testId of ['role-binding-plate', 'role-binding-reservoir', 'role-binding-topping_medium']) {
      const row = rowOf(testId)
      const select = row?.querySelector('select')
      expect(select).toBeTruthy()
      selects[testId] = select as HTMLSelectElement
    }

    // Three edits, each < 500 ms apart — all inside ONE debounce window
    fireEvent.change(selects['role-binding-plate'], { target: { value: 'LWI-PLATE1' } })
    await vi.advanceTimersByTimeAsync(400)
    fireEvent.change(selects['role-binding-reservoir'], { target: { value: 'LWI-RES1' } })
    await vi.advanceTimersByTimeAsync(400)
    fireEvent.change(selects['role-binding-topping_medium'], { target: { value: 'MAT-WASH1' } })
    await vi.advanceTimersByTimeAsync(500)

    expect(apiClient.updatePlannedRunBindings).toHaveBeenCalledTimes(1)
    const [pid, sent] = vi.mocked(apiClient.updatePlannedRunBindings).mock.calls[0] as unknown as [
      string,
      { labware?: Array<{ roleId: string; labwareInstanceRef: string }>; materials?: Array<{ roleId: string; materialInstanceRef: string }> },
    ]
    expect(pid).toBe('PLR-000001')
    expect(sent.labware).toEqual(expect.arrayContaining([
      expect.objectContaining({ roleId: 'plate', labwareInstanceRef: 'LWI-PLATE1' }),
      expect.objectContaining({ roleId: 'reservoir', labwareInstanceRef: 'LWI-RES1' }),
    ]))
    expect(sent.materials).toEqual(expect.arrayContaining([
      expect.objectContaining({ roleId: 'topping_medium', materialInstanceRef: 'MAT-WASH1' }),
    ]))
  })
})
