import { useEffect } from 'react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProtocolSelectionProvider, useProtocolSelection } from '../../protocol/ProtocolSelectionContext'
import { ProtocolNavPanel } from './ProtocolNavPanel'
import { ChatContextHeader } from '../ai/ChatContextHeader'
import { apiClient } from '../../../shared/api/client'

vi.mock('../../../shared/api/client', () => ({ apiClient: { getRecord: vi.fn(), updateRecord: vi.fn() } }))
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
  render(<ProtocolSelectionProvider><Seed /><ProtocolNavPanel /><ChatContextHeader /></ProtocolSelectionProvider>)
}
beforeEach(() => {
  vi.clearAllMocks()
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
    expect(screen.getByTestId('chat-context-header')).toHaveTextContent('No step focused')
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
})
