/**
 * PROTO-AI-9 — protocol_edit Accept/Reject wiring in AiTabPanel.
 *
 * A `protocol_edit` emission (PROTO-AI-7) must:
 *  1. branch in onDraftResult INDEPENDENT of the event-graph path — the
 *     proposal lands in the SAME ChangesPanel review surface (D1: no new rail),
 *     the sidebar leaves 'interpreting' the moment the proposal is shown;
 *  2. Accept → EXACTLY ONE applier call (PROTO-AI-8), then the sidebar resets
 *     so the chat input returns (never a replayable proposal);
 *  3. stale-sha conflict → the D4 message verbatim, sidebar stays in review;
 *  4. Reject → the applier is NEVER called (zero mutation);
 *  5. swapping the attached protocol invalidates an open proposal.
 *
 * useChatThread is mocked with an option-capturing seam so the test can emit
 * a draft result exactly like the SSE `done` event does; the applier module is
 * mocked to count calls — its own behaviour is pinned in protocolEditOps.test.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { WorkspaceProvider } from '../../workspace/WorkspaceContext'
import { defaultWorkspaceState } from '../../workspace/types'

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 0,
      fingerprints: [''],
      getPage: () => Promise.resolve(null),
      destroy: () => undefined,
    }),
    destroy: () => undefined,
  })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class {
    render() {
      return Promise.resolve()
    }
  },
}))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.mjs' }))

const mocks = vi.hoisted(() => ({
  chatOptions: null as null | { onDraftResult?: (result: unknown, prompt: string) => void },
  applyProtocolEdit: vi.fn(),
  protocolIdentity: { current: null as null | { recordId: string; title?: string; sha?: string } },
}))

vi.mock('./useChatThread', () => ({
  useChatThread: (options: { onDraftResult?: (result: unknown, prompt: string) => void }) => {
    mocks.chatOptions = options
    return {
      state: { messages: [], pending: null, status: null, error: null },
      isStreaming: false,
      send: vi.fn(async () => undefined),
      stop: vi.fn(),
      reset: vi.fn(),
      clearProtocolCandidate: vi.fn(),
    }
  },
}))

vi.mock('../protocol/protocolEditOps', () => ({
  STALE_PROTOCOL_WRITE_MESSAGE: 'Someone changed this protocol - reload and try again.',
  applyProtocolEdit: mocks.applyProtocolEdit,
}))

vi.mock('../../protocol/ProtocolSelectionContext', () => ({
  NO_PROTOCOL_RESOURCES: { labwares: [], equipment: [] },
  NO_LABWARE_BINDINGS: {},
  useProtocolSelection: () => ({
    protocol: mocks.protocolIdentity.current,
    steps: [
      { stepId: 'step-seed', label: 'Seed cells', ordinal: 1, kind: 'add_material', description: 'Seed 10k cells per well' },
      { stepId: 'step-read', label: 'Read plate', ordinal: 2, kind: 'read', description: 'Read fluorescence' },
    ],
    resources: {
      labwares: [{ roleId: 'labware_plate', description: 'Culture plate', expectedLabwareKinds: ['lab-plate-96'] }],
      equipment: [],
    },
  }),
}))

import { AiTabPanel } from './AiTabPanel'

const STALE = 'Someone changed this protocol - reload and try again.'

const ops = [
  { op: 'step_insert', afterStepId: 'step-read', label: 'Wash', kind: 'wash', description: 'Wash twice with PBS' },
  { op: 'step_delete', stepId: 'step-seed' },
]

function renderPanel() {
  const base = defaultWorkspaceState('STU-000001')
  return render(
    <MemoryRouter>
      <WorkspaceProvider
        studyId="STU-000001"
        saveDebounceMs={0}
        loadFn={async () => ({
          state: {
            ...base,
            tabs: [{ id: 't1', kind: 'deck' as const, eventGraphId: 'EVG-1', title: 'Deck' }],
            activeTabId: 't1',
          } as ReturnType<typeof defaultWorkspaceState>,
        })}
        saveFn={async (_id, s) => ({ state: s })}
      >
        <AiTabPanel />
      </WorkspaceProvider>
    </MemoryRouter>,
  )
}

async function emitProtocolEdit() {
  await act(async () => {
    mocks.chatOptions?.onDraftResult?.({ protocolEdit: { ops } }, 'add a wash step and delete seed')
  })
}

beforeEach(() => {
  cleanup()
  mocks.chatOptions = null
  mocks.applyProtocolEdit.mockReset()
  mocks.protocolIdentity.current = { recordId: 'PROT-ATT', title: 'Attached assay', sha: 'sha-1' }
})

describe('AiTabPanel protocol_edit wiring', () => {
  it('branches a protocol_edit emission into ChangesPanel review, never stuck interpreting', async () => {
    renderPanel()
    await screen.findByTestId('ai-tab-system-prompt')
    await emitProtocolEdit()

    // The proposal renders in the existing review surface, not a new rail.
    expect(await screen.findByTestId('changes-panel')).toBeTruthy()
    expect(screen.getAllByTestId('protocol-edit-row')).toHaveLength(2)
    expect(screen.getByTestId('protocol-diff-target').textContent).toContain('Attached assay')
    // The sidebar LEFT 'interpreting' the moment the proposal appeared.
    expect(screen.queryByText('Interpreting…')).toBeNull()
    expect(screen.getByTestId('ai-tab-system-prompt').textContent).toBe('Review changes')
    // The chat input is back while the proposal is under review.
    expect(screen.getByTestId('chat-input')).toBeTruthy()
  })

  it('Accept calls the applier EXACTLY ONCE with the target record + ops, then resets the sidebar', async () => {
    mocks.applyProtocolEdit.mockResolvedValue({ wrote: true, payload: {} })
    renderPanel()
    await screen.findByTestId('ai-tab-system-prompt')
    await emitProtocolEdit()
    const btn = await screen.findByTestId('changes-apply')
    expect(btn.textContent).toBe('Accept')

    // A double click must not replay: the button disables while applying.
    fireEvent.click(btn)
    fireEvent.click(screen.getByTestId('changes-apply'))
    await waitFor(() => {
      expect(mocks.applyProtocolEdit).toHaveBeenCalledTimes(1)
    })
    expect(mocks.applyProtocolEdit).toHaveBeenCalledWith('PROT-ATT', ops)
    // After a successful apply the proposal is gone (sidebar reset) and the
    // input is ready again — a duplicate Accept has nothing left to click.
    await waitFor(() => {
      expect(screen.queryByTestId('changes-panel')).toBeNull()
    })
    expect(screen.getByTestId('chat-input')).toBeTruthy()
  })

  it('a stale-sha conflict surfaces the D4 message verbatim and keeps the proposal open', async () => {
    mocks.applyProtocolEdit.mockRejectedValue(new Error(STALE))
    renderPanel()
    await screen.findByTestId('ai-tab-system-prompt')
    await act(async () => {
      mocks.chatOptions?.onDraftResult?.({ protocolEdit: { ops, protocolId: 'PROT-OVERRIDE' } }, 'edit other')
    })
    fireEvent.click(await screen.findByTestId('changes-apply'))
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(STALE)
    })
    // Truthful conflict state: review surface remains, sidebar never stuck.
    expect(screen.getByTestId('changes-panel')).toBeTruthy()
    expect(screen.getByTestId('ai-tab-system-prompt').textContent).toBe('Review changes')
    // The explicit protocolId override in the envelope wins over the attached scope.
    expect(mocks.applyProtocolEdit).toHaveBeenCalledWith('PROT-OVERRIDE', ops)
  })

  it('honours an explicit protocolId override on the envelope', async () => {
    mocks.applyProtocolEdit.mockResolvedValue({ wrote: true, payload: {} })
    renderPanel()
    await screen.findByTestId('ai-tab-system-prompt')
    await act(async () => {
      mocks.chatOptions?.onDraftResult?.({ protocolEdit: { ops, protocolId: 'PROT-OVERRIDE' } }, 'edit other')
    })
    fireEvent.click(await screen.findByTestId('changes-apply'))
    await waitFor(() => {
      expect(mocks.applyProtocolEdit).toHaveBeenCalledWith('PROT-OVERRIDE', ops)
    })
  })

  it('Reject never calls the applier and returns the input', async () => {
    renderPanel()
    await screen.findByTestId('ai-tab-system-prompt')
    await emitProtocolEdit()
    fireEvent.click(await screen.findByText('Reject'))
    expect(mocks.applyProtocolEdit).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.queryByTestId('changes-panel')).toBeNull()
    })
    expect(screen.getByTestId('chat-input')).toBeTruthy()
  })

  it('swapping the attached protocol invalidates an open proposal', async () => {
    const { rerender } = renderPanel()
    await screen.findByTestId('ai-tab-system-prompt')
    await emitProtocolEdit()
    expect(await screen.findByTestId('changes-panel')).toBeTruthy()

    // The rail attaches a DIFFERENT protocol under an open proposal.
    mocks.protocolIdentity.current = { recordId: 'PROT-OTHER', title: 'Other assay', sha: 'sha-2' }
    rerender(
      <MemoryRouter>
        <WorkspaceProvider
          studyId="STU-000001"
          saveDebounceMs={0}
          loadFn={async () => ({ state: defaultWorkspaceState('STU-000001') })}
          saveFn={async (_id, s) => ({ state: s })}
        >
          <AiTabPanel />
        </WorkspaceProvider>
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.queryByTestId('changes-panel')).toBeNull()
    })
    expect(mocks.applyProtocolEdit).not.toHaveBeenCalled()
    expect(screen.getByTestId('chat-input')).toBeTruthy()
  })

  it('a successful protocol accept dispatches cl:records-changed so the rail refills (D2)', async () => {
    // Mirrors the human protocol-write convention: ProtocolStepEditModal.tsx:99
    // fires window 'cl:records-changed' after a successful updateRecord, which
    // RunProtocolStepsLoader listens for to refill the rail (labware badge).
    mocks.applyProtocolEdit.mockResolvedValue({ wrote: true, payload: {} })
    const listener = vi.fn()
    window.addEventListener('cl:records-changed', listener)
    try {
      renderPanel()
      await screen.findByTestId('ai-tab-system-prompt')
      await emitProtocolEdit()
      fireEvent.click(await screen.findByTestId('changes-apply'))
      await waitFor(() => {
        expect(mocks.applyProtocolEdit).toHaveBeenCalledTimes(1)
      })
      await waitFor(() => {
        expect(listener).toHaveBeenCalledTimes(1)
      })
    } finally {
      window.removeEventListener('cl:records-changed', listener)
    }
  })

  it('a failed (stale-sha) protocol accept dispatches NOTHING (D4: nothing was written)', async () => {
    mocks.applyProtocolEdit.mockRejectedValue(new Error(STALE))
    const listener = vi.fn()
    window.addEventListener('cl:records-changed', listener)
    try {
      renderPanel()
      await screen.findByTestId('ai-tab-system-prompt')
      await emitProtocolEdit()
      fireEvent.click(await screen.findByTestId('changes-apply'))
      await waitFor(() => {
        expect(screen.getByRole('alert').textContent).toBe(STALE)
      })
      expect(mocks.applyProtocolEdit).toHaveBeenCalledTimes(1)
      expect(listener).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('cl:records-changed', listener)
    }
  })

  it('an event-graph draft is unaffected: no protocol rows, event rows render', async () => {
    renderPanel()
    await screen.findByTestId('ai-tab-system-prompt')
    await act(async () => {
      mocks.chatOptions?.onDraftResult?.(
        { events: [{ eventId: 'ev1', event_type: 'deposit_wells', details: { targetWells: ['A1'] } }], termManifest: [] },
        'dispense dmem',
      )
    })
    expect(await screen.findByTestId('changes-panel')).toBeTruthy()
    expect(screen.queryAllByTestId('protocol-edit-row')).toHaveLength(0)
    expect(screen.getByTestId('changes-apply').textContent).toBe('Apply to run')
  })
})
