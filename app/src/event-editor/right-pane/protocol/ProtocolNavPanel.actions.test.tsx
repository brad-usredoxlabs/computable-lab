import { useEffect } from 'react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProtocolSelectionProvider, useProtocolSelection } from '../../protocol/ProtocolSelectionContext'
import { ProtocolNavPanel } from './ProtocolNavPanel'
import { apiClient } from '../../../shared/api/client'
import { __resetContentLockedStatesCache } from '../../../shared/records/contentLockedStatesCache'

vi.mock('../../../shared/api/client', () => ({ apiClient: { getRecord: vi.fn(), updateRecord: vi.fn(), getLifecycleContentLockedStates: vi.fn() } }))
vi.mock('./ProtocolIdentity', () => ({ ProtocolIdentity: () => <div>Zymo Opentrons</div> }))
vi.mock('./ProtocolStepEditModal', () => ({ ProtocolStepEditModal: ({ mode }: { mode: string }) => <div role="dialog">{mode}</div> }))
const steps = [
  { stepId: 's1', ordinal: 1, kind: 'other', label: 'Lyse', subGraphRef: { id: 'EVG-1' } },
  { stepId: 's2', ordinal: 2, kind: 'other', label: 'Wash', subGraphRef: { id: 'EVG-2' } },
]
const payload = { kind: 'protocol', state: 'draft', steps }
const record = { recordId: 'PRT-1', schemaId: 'protocol', meta: { contentSha: 'initial' }, payload }

function Seed() {
  const sel = useProtocolSelection()
  useEffect(() => {
    sel?.setProtocol({ recordId: 'PRT-1' })
    sel?.setSteps(steps)
    sel?.setFocusedStep(steps[0]!)
    sel?.setVisibleSteps(['s1', 's2'])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <output data-testid="visible-ids">{[...(sel?.visibleSteps ?? [])].join(',')}</output>
}
function mount() {
  // LEG D re-pin: the dead ChatContextHeader is dropped from this render.
  // FIX RUN 1 (advc D13): the AiPanelProvider that was added here under the
  // rationale "the pane calls useAiPanel(), which THROWS without an
  // AiPanelProvider" is REMOVED — that rationale was wrong twice over:
  // HarnessChatPane consumes the OPTIONAL seam (useOptionalAiPanel, which
  // returns null provider-free instead of throwing) and is not even mounted
  // in this suite's render tree (ProtocolNavPanel and its unmocked children
  // consume no AiPanelContext). Provider-free is the honest test posture
  // here; nothing in the tree needs one.
  render(<ProtocolSelectionProvider><Seed /><ProtocolNavPanel /></ProtocolSelectionProvider>)
}
beforeEach(() => {
  vi.clearAllMocks()
  __resetContentLockedStatesCache()
  vi.mocked(apiClient.getLifecycleContentLockedStates).mockResolvedValue([])
  vi.mocked(apiClient.getRecord).mockResolvedValue(structuredClone(record))
  vi.mocked(apiClient.updateRecord).mockImplementation(async (_id, updated) => ({
    record: { ...record, payload: updated, meta: { contentSha: 'after-delete' } },
  } as never))
})
afterEach(cleanup)

describe('step actions', () => {
  it.each(['before', 'after'] as const)('opens the add-%s editor with a labeled icon', mode => {
    mount()
    const button = screen.getByRole('button', { name: `Add step ${mode} step 1` })
    expect(button).toHaveAttribute('title', `Add step ${mode}`)
    fireEvent.click(button)
    expect(screen.getByRole('dialog')).toHaveTextContent(mode)
    expect(apiClient.updateRecord).not.toHaveBeenCalled()
  })

  it('deletes, clears the removed focus and preview, and can undo with a concurrency token', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Delete step 1' }))
    await waitFor(() => expect(screen.queryByTestId('protocol-nav-step-s1')).toBeNull())
    expect(screen.getByTestId('protocol-nav-step-s2')).toHaveTextContent('1')
    // LEG D re-pin: the dead ChatContextHeader no longer renders (dropped from
    // this render), so the cleared-focus assertion now names its ABSENCE — the
    // working focus lives in SurfaceFocusHeader (HarnessChatPane), which renders
    // nothing without a published ChatFocusContext either.
    expect(screen.queryByTestId('chat-context-header')).toBeNull()
    expect(screen.getByTestId('visible-ids')).toHaveTextContent('s2')
    expect(apiClient.updateRecord).toHaveBeenCalledWith('PRT-1', { ...payload, steps: [{ ...steps[1], ordinal: 1 }] }, { expectedSha: 'initial' })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await screen.findByTestId('protocol-nav-step-s1')
    expect(apiClient.updateRecord).toHaveBeenLastCalledWith('PRT-1', payload, { expectedSha: 'after-delete' })
  })

  it('keeps the step when saving the deletion fails', async () => {
    vi.mocked(apiClient.updateRecord).mockRejectedValue(new Error('Conflict: reload the protocol'))
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Delete step 1' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Conflict')
    expect(screen.getByTestId('protocol-nav-step-s1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })

  it('deletes a protocol with lifecycleId when the declared set is unlocked', async () => {
    const lifecyclePayload = { ...payload, lifecycleId: 'doc-lifecycle' }
    const lifecycleRecord = { ...record, payload: lifecyclePayload }
    vi.mocked(apiClient.getRecord).mockResolvedValue(structuredClone(lifecycleRecord))
    vi.mocked(apiClient.getLifecycleContentLockedStates).mockResolvedValue([])

    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Delete step 1' }))
    await waitFor(() => expect(screen.queryByTestId('protocol-nav-step-s1')).toBeNull())
    expect(apiClient.updateRecord).toHaveBeenCalled()
  })

  it('blocks step deletion when the protocol is content-locked', async () => {
    const lifecyclePayload = { ...payload, lifecycleId: 'doc-lifecycle', state: 'approved' }
    const lifecycleRecord = { ...record, payload: lifecyclePayload }
    vi.mocked(apiClient.getRecord).mockResolvedValue(structuredClone(lifecycleRecord))
    vi.mocked(apiClient.getLifecycleContentLockedStates).mockResolvedValue(['approved'])

    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Delete step 1' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('locked')
    expect(apiClient.updateRecord).not.toHaveBeenCalled()
  })
})
