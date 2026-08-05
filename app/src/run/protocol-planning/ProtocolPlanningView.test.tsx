import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { apiClient } from '../../shared/api/client'
import { ProtocolPlanningView } from './ProtocolPlanningView'

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    specializeProtocolForExperiment: vi.fn(),
    updateRecord: vi.fn(),
    listRecordsByKind: vi.fn(),
  },
}))

afterEach(() => {
  cleanup()
  vi.stubGlobal('fetch', undefined)
  vi.clearAllMocks()
})

function stubFetch(steps?: Array<Record<string, unknown>>, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      // The steps endpoint returns `{ steps }` (humanStepsText lives on the
      // protocol record, fetched separately via getRecord).
      json: () => Promise.resolve({ steps: ok ? (steps ?? []) : undefined }),
    }),
  )
}

function env(recordId: string, payload: Record<string, unknown>) {
  return { recordId, schemaId: 'x', meta: { kind: 'run' }, payload }
}

/** Mock a run linked to a protocol via plannedRunRef → protocolRef. */
function wireRunToProtocol(protocolId: string) {
  vi.mocked(apiClient.getRecord)
    .mockResolvedValueOnce(
      env('RUN-1', {
        kind: 'run',
        studyId: 'STU-1',
        experimentId: 'EXP-1',
        plannedRunRef: { kind: 'record', id: 'PLR-1', type: 'planned-run' },
      }) as never,
    )
    .mockResolvedValueOnce(
      env('PLR-1', {
        kind: 'planned-run',
        protocolRef: { kind: 'record', id: protocolId, type: 'protocol' },
      }) as never,
    )
    .mockResolvedValueOnce(
      env(protocolId, {
        kind: 'protocol',
        title: 'Protocol',
        humanStepsText: '1. Add sample.\n2. Seal plate.',
      }) as never,
    )
}

describe('ProtocolPlanningView', () => {
  it('shows the Protocol Planning header', () => {
    stubFetch([])
    vi.mocked(apiClient.getRecord).mockResolvedValue(env('RUN-1', { kind: 'run', studyId: 'STU-1' }) as never)
    render(<ProtocolPlanningView runId="RUN-1" />)
    expect(screen.getByTestId('protocol-planning-view')).toBeDefined()
    expect(screen.getByText('Protocol Planning')).toBeDefined()
  })

  it('renders a step chip per fetched protocol step', async () => {
    stubFetch([
      { stepId: 's1', ordinal: 1, label: 'Add cells', kind: 'add_material', description: 'Seed' },
      { stepId: 's2', ordinal: 2, label: 'Read', kind: 'read' },
    ])
    wireRunToProtocol('PRT-1')
    render(<ProtocolPlanningView runId="RUN-1" />)
    expect(await screen.findByText('Add cells')).toBeDefined()
    expect(screen.getByText('Read')).toBeDefined()
  })

  it('falls back to a single non-deletable main step when the fetch fails', async () => {
    stubFetch([], false)
    vi.mocked(apiClient.getRecord).mockResolvedValue(env('RUN-1', { kind: 'run', studyId: 'STU-1' }) as never)
    render(<ProtocolPlanningView runId="RUN-1" />)
    await waitFor(() => expect(screen.queryByText('Loading steps…')).toBeNull())
    await screen.findByText('Main')
    expect(screen.getByText('locked')).toBeDefined()
  })

  it('shows the inventory panel', async () => {
    stubFetch([])
    vi.mocked(apiClient.getRecord).mockResolvedValue(env('RUN-1', { kind: 'run', studyId: 'STU-1' }) as never)
    vi.mocked(apiClient.listRecordsByKind)
      .mockResolvedValueOnce({ records: [], total: 0 } as never)
      .mockResolvedValueOnce({ records: [], total: 0 } as never)
    render(<ProtocolPlanningView runId="RUN-1" />)
    expect(await screen.findByTestId('lab-inventory-panel')).toBeDefined()
  })

  it('shows the step detail pane when a protocol has humanStepsText', async () => {
    stubFetch([
      { stepId: 's1', ordinal: 1, label: 'Add sample', kind: 'add_material' },
      { stepId: 's2', ordinal: 2, label: 'Seal plate', kind: 'other' },
    ])
    wireRunToProtocol('PRT-1')
    render(<ProtocolPlanningView runId="RUN-1" />)
    await screen.findByText('Add sample')
    // Click a step chip → StepDetailPane renders with the long-form text.
    fireEvent.click(screen.getByText('Add sample'))
    expect(await screen.findByTestId('step-detail-pane')).toBeDefined()
    expect(screen.getByText('Send selection to AI')).toBeDefined()
  })

  it('localizes the protocol when the run has studyId + protocol', async () => {
    stubFetch([{ stepId: 's1', ordinal: 1, label: 'Add', kind: 'add_material' }])
    wireRunToProtocol('PRT-1')
    vi.mocked(apiClient.specializeProtocolForExperiment).mockResolvedValue({
      success: true,
      record: env('LPR-abc', { kind: 'local-protocol', title: 'Local' }),
    } as never)

    render(<ProtocolPlanningView runId="RUN-1" />)
    await screen.findByText('Add')
    fireEvent.click(screen.getByText('Localize for this lab'))
    await screen.findByText('Created local protocol LPR-abc')
    expect(apiClient.specializeProtocolForExperiment).toHaveBeenCalledWith({
      protocolId: 'PRT-1',
      studyId: 'STU-1',
      experimentId: 'EXP-1',
      title: undefined,
    })
  })
})
