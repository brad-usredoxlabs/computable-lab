import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProtocolSelector } from './ProtocolSelector'
import { apiClient, type ProtocolContextResponse } from '../../../shared/api/client'

vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    useProtocolInRun: vi.fn(),
    getRecord: vi.fn(),
  },
}))

const protocol = (id: string, title: string, kind = 'protocol', links?: Record<string, unknown>) => ({
  recordId: id,
  schemaId: `https://computable-lab.com/schema/computable-lab/${kind}.schema.yaml`,
  meta: { kind },
  // Approved so the selector's approved-only filter surfaces it.
  payload: { kind, title, state: 'approved', ...(links ? { links } : {}) },
})

function context(): ProtocolContextResponse {
  return {
    projectTemplates: [protocol('LPR-1', 'Rotenone Assay', 'local-protocol', { studyId: 'STU-1' })],
    experimentProtocols: [],
    runMethods: [],
    promotableRunMethods: [],
    // No links => shows in Lab Protocols group.
    availableProtocols: [protocol('PRT-ROS', 'ROS Standard', 'protocol')],
    ingestedPdfs: [],
  }
}

function renderSelector(opts: { alreadyAttached?: boolean; onCancel?: () => void } = {}) {
  const onAttached = vi.fn()
  const onCancel = opts.onCancel ?? vi.fn()
  const utils = render(
    <ProtocolSelector
      runId="RUN-1"
      studyId="STU-1"
      context={context()}
      onAttached={onAttached}
      alreadyAttached={opts.alreadyAttached ?? false}
      onCancel={onCancel}
    />,
  )
  return { onAttached, onCancel, ...utils }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiClient.useProtocolInRun).mockResolvedValue({
    success: true,
    plannedRunId: 'PLR-1',
    methodEventGraphId: 'EVG-1',
    runId: 'RUN-1',
  } as never)
  vi.mocked(apiClient.getRecord).mockResolvedValue({
    recordId: 'PRT-ROS',
    schemaId: 'protocol',
    meta: { kind: 'protocol' },
    payload: { kind: 'protocol', title: 'ROS Standard', humanStepsText: 'Full ROS protocol text.' },
  } as never)
  // Preview steps endpoint.
  global.fetch = vi.fn(async (_input: RequestInfo | URL) => ({
    ok: true,
    status: 200,
    json: async () => ({
      steps: [
        { ordinal: 1, label: 'Seed HepG2 cells' },
        { ordinal: 2, label: 'Add 10uM rotenone' },
      ],
    }),
  })) as unknown as typeof fetch
})

describe('ProtocolSelector', () => {
  it('previews a protocol (steps + full text) without attaching it', async () => {
    renderSelector()

    await screen.findByText('ROS Standard')

    fireEvent.click(screen.getByTestId('preview-PRT-ROS'))

    // Preview pane appears with steps and full text.
    const pane = await screen.findByTestId('protocol-preview')
    expect(pane).toHaveTextContent('Seed HepG2 cells')
    expect(pane).toHaveTextContent('Full ROS protocol text.')

    // Preview is not a commit.
    expect(apiClient.useProtocolInRun).not.toHaveBeenCalled()
  })

  it('attaches only when the explicit "Attach to run" button is clicked', async () => {
    renderSelector()

    await screen.findByText('ROS Standard')

    fireEvent.click(screen.getByTestId('attach-PRT-ROS'))

    await waitFor(() =>
      expect(apiClient.useProtocolInRun).toHaveBeenCalledWith(
        expect.objectContaining({ protocolId: 'PRT-ROS', runId: 'RUN-1', studyId: 'STU-1' }),
      ),
    )
    // Previewing is independent of attaching: a click on the row alone never attaches.
    expect(screen.queryByTestId('protocol-preview')).toBeNull()
  })

  it('passes replace:true when attaching from the "change protocol" (alreadyAttached) flow', async () => {
    renderSelector({ alreadyAttached: true })

    await screen.findByText('ROS Standard')

    fireEvent.click(screen.getByTestId('attach-PRT-ROS'))

    await waitFor(() =>
      expect(apiClient.useProtocolInRun).toHaveBeenCalledWith(
        expect.objectContaining({ protocolId: 'PRT-ROS', replace: true }),
      ),
    )
  })

  it('shows a Cancel button when switching, and it dismisses without attaching', async () => {
    const onCancel = vi.fn()
    renderSelector({ alreadyAttached: true, onCancel })

    fireEvent.click(screen.getByTestId('change-cancel'))

    expect(onCancel).toHaveBeenCalled()
    expect(apiClient.useProtocolInRun).not.toHaveBeenCalled()
  })

  it('renders the Ingested PDFs group from context.ingestedPdfs with an Open (not Attach) action', async () => {
    const base = context()
    const ctx = { ...base, ingestedPdfs: [protocol('VPDF-9', 'CellROX Manual', 'vendor-pdf')] }
    const onOpen = vi.fn()
    render(
      <ProtocolSelector
        runId="RUN-1"
        studyId="STU-1"
        context={ctx}
        onAttached={() => {}}
        onOpenIngestedPdf={onOpen}
      />,
    )

    await screen.findByText('CellROX Manual')
    expect(screen.getByText('Ingested PDFs')).toBeInTheDocument()
    expect(screen.getByTestId('open-pdf-VPDF-9')).toBeInTheDocument()
    // Vendor-pdfs must NOT offer "Attach to run".
    expect(screen.queryByTestId('attach-VPDF-9')).toBeNull()
    fireEvent.click(screen.getByTestId('open-pdf-VPDF-9'))
    expect(onOpen).toHaveBeenCalledWith('VPDF-9')
  })

  it('shows only approved protocols (draft extraction candidates are hidden)', async () => {
    const base = context()
    const draft = {
      recordId: 'PRT-DRAFT',
      schemaId: 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml',
      meta: { kind: 'protocol' },
      payload: { kind: 'protocol', title: 'Draft candidate', state: 'draft' },
    }
    const ctx = {
      ...base,
      projectTemplates: [],
      availableProtocols: [protocol('PRT-OK', 'Approved one', 'protocol'), draft],
    }
    render(
      <ProtocolSelector runId="RUN-1" studyId="STU-1" context={ctx} onAttached={() => {}} />,
    )

    await screen.findByText('Approved one')
    expect(screen.queryByText('Draft candidate')).toBeNull()
  })
})