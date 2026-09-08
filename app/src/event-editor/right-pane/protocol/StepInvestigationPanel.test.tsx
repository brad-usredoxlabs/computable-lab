/**
 * StepInvestigationPanel tests.
 *
 * The panel is the run-editor surface for a single protocol STEP = CONCEPT
 * and its sub-graph = REALIZATION. Verifies:
 *  - it shows the concept (STEP N: {label}) prominently
 *  - three realization actions: Draft with AI, Edit by hand, Revise(+Accept/Discard)
 *  - inline chat (not a hop to the AI tab): "Draft with AI" reveals a ChatInput
 *    and sending composes an instruction containing the concept
 *  - Revise (feedback loop) appends Correction: to the re-prompt
 *  - the file's exports/imports still compile
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { defaultWorkspaceState } from '../../workspace/types'
import { StepInvestigationPanel } from './StepInvestigationPanel'

// --- Static mocks for heavy machinery the panel composes. -------------------

const mocks = vi.hoisted(() => ({
  commitPreview: vi.fn(),
  clearPreview: vi.fn(),
  send: vi.fn(),
  useChatThread: vi.fn(),
  setFocusStepId: vi.fn(),
  commitStepRef: vi.fn(),
}))

vi.mock('../../workspace/WorkspaceContext', () => ({
  useWorkspace: () => ({ state: defaultWorkspaceState('STU-000001') }),
}))

vi.mock('../../EventEditorContext', () => ({
  useOptionalEventEditor: () => ({
    state: {
      platforms: [],
      platformId: 'p1',
      variantId: 'v1',
      placements: [],
      focusPlacementId: null,
      runId: 'RUN-000001',
      labwares: {},
      events: [],
      vocabPackId: 'pack',
      selection: null,
      eventGraphId: 'EVG-000002',
      preview: {
        previewEvents: [{ eventId: 'N1', verb: 'transfer' }],
        previewPlacements: [],
        previewLabwares: {},
      },
    },
    actions: {
      commitPreview: mocks.commitPreview,
      clearPreview: mocks.clearPreview,
      setPreview: vi.fn(),
    },
  }),
}))

vi.mock('../ai/useChatThread', () => ({
  useChatThread: (config: { context?: unknown }) => {
    mocks.useChatThread(config)
    return { isStreaming: false, send: mocks.send, stop: vi.fn() }
  },
}))

vi.mock('../ai/ChatInput', () => ({
  ChatInput: (props: { onSend: (text: string) => void }) => (
    <button type="button" data-testid="chat-send-mock" onClick={() => props.onSend('use the QuantStudio 5')}>
      send
    </button>
  ),
}))

vi.mock('../../../shared/lib/platformRegistry', () => ({
  getPlatformManifest: () => ({ slots: [], surface: true, sideLawn: false }),
  getVariantManifest: () => ({ slots: [], surface: true, sideLawn: false }),
}))

vi.mock('../../../shared/vocab/registry', () => ({ getVerbsForDisplay: () => [] }))

vi.mock('../../../graph/lib/acceptedEventGraphProjection', () => ({
  buildAcceptedEventGraphProjection: () => ({}),
}))

vi.mock('../../../shared/api/client', () => ({ apiClient: { patchStepSubgraph: vi.fn() } }))

function renderPanel(props: Partial<Parameters<typeof StepInvestigationPanel>[0]> = {}) {
  return render(
    <StepInvestigationPanel
      runId="RUN-000001"
      step={{ stepId: 'S2', label: 'Wash the media off the cells', ordinal: 2, description: 'Remove media, dispense PBS, shake' }}
      stepText="Wash the media off the cells"
      onFocusStep={mocks.setFocusStepId}
      {...props}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.send.mockReset()
  mocks.setFocusStepId.mockReset()
})

afterEach(() => cleanup())

describe('StepInvestigationPanel concept header', () => {
  it('shows the CONCEPT prominently (STEP N: {label})', () => {
    renderPanel()
    expect(screen.getByTestId('step-investigate-concept').textContent).toContain('STEP 2')
    expect(screen.getByTestId('step-investigate-concept').textContent).toContain('Wash the media off the cells')
  })
})

describe('StepInvestigationPanel realization actions', () => {
  it('offers Draft with AI and Edit by hand', () => {
    renderPanel()
    expect(screen.getByTestId('step-investigate-draft-ai')).not.toBeNull()
    expect(screen.getByTestId('step-investigate-edit-hand')).not.toBeNull()
  })

  it('"Draft with AI" reveals an inline ChatInput and sends a composed instruction', () => {
    renderPanel()
    // chat not yet revealed (idle mode)
    expect(screen.queryByTestId('chat-send-mock')).toBeNull()
    fireEvent.click(screen.getByTestId('step-investigate-draft-ai'))
    // inline composer appears (NOT a hop to the AI tab)
    expect(screen.getByTestId('chat-send-mock')).not.toBeNull()
    fireEvent.click(screen.getByTestId('chat-send-mock'))
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect(mocks.send.mock.calls[0]![0]).toContain('Wash the media off the cells')
  })

  it('"Edit by hand" enters manual-edit mode', () => {
    renderPanel()
    expect(screen.queryByTestId('step-investigate-manual')).toBeNull()
    fireEvent.click(screen.getByTestId('step-investigate-edit-hand'))
    expect(screen.queryByTestId('step-investigate-manual')).not.toBeNull()
  })
})

describe('StepInvestigationPanel revise (feedback loop)', () => {
  it('shows Revise input + Accept/Discard when previewActive', () => {
    renderPanel()
    expect(screen.getByTestId('step-investigate-revise-input')).not.toBeNull()
    expect(screen.getByTestId('step-investigate-accept')).not.toBeNull()
    expect(screen.getByTestId('step-investigate-discard')).not.toBeNull()
  })

  it('Revise re-prompts with Correction: appended', () => {
    renderPanel()
    // reveal inline chat, then send an instruction so the base is set
    fireEvent.click(screen.getByTestId('step-investigate-draft-ai'))
    fireEvent.click(screen.getByTestId('chat-send-mock'))
    const input = screen.getByTestId('step-investigate-revise-input')
    fireEvent.change(input, { target: { value: 'use a deepwell plate, not the 96-well' } })
    fireEvent.click(screen.getByTestId('step-investigate-revise-btn'))
    expect(mocks.send).toHaveBeenCalledTimes(2)
    const revised = mocks.send.mock.calls[1]![0]
    expect(revised).toContain('Correction:')
    expect(revised).toContain('deepwell')
  })

  it('Accept commits the preview only after durable save success; Discard clears it', async () => {
    let resolveSave: (() => void) | undefined
    const save = vi.fn(() => new Promise<void>((resolve) => {
      resolveSave = resolve
    }))
    renderPanel({ onSaveRealization: save })
    fireEvent.click(screen.getByTestId('step-investigate-accept'))
    // Durable accept: the preview is NOT flipped until the save resolves.
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(mocks.commitPreview).not.toHaveBeenCalled()
    resolveSave?.()
    await waitFor(() => expect(mocks.commitPreview).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByTestId('step-investigate-discard'))
    expect(mocks.clearPreview).toHaveBeenCalled()
  })

  it('keeps the draft and surfaces the gate error when the save is rejected (422)', async () => {
    renderPanel({
      onSaveRealization: vi.fn(() => Promise.reject(new Error('REALIZATION_NOT_ACCEPTED: schema failure; the draft is preserved.'))),
    })
    fireEvent.click(screen.getByTestId('step-investigate-accept'))
    // The preview was NOT committed (draft preserved), and the finding is surfaced.
    const errEl = await screen.findByTestId('step-investigate-accept-error')
    expect(mocks.commitPreview).not.toHaveBeenCalled()
    expect(errEl.textContent).toContain('Not accepted')
    expect(errEl.textContent).toContain('schema failure')
  })
})

describe('StepInvestigationPanel focus', () => {
  it('offers an investigate-on-deck toggle that focuses the step', () => {
    renderPanel()
    fireEvent.click(screen.getByTestId('step-investigate-focus-on'))
    expect(mocks.setFocusStepId).toHaveBeenCalledWith({ stepId: 'S2', label: 'Wash the media off the cells', ordinal: 2 })
  })
})

describe('StepInvestigationPanel reference-a-protocol', () => {
  it('commits a protocol reference as the step realization', () => {
    renderPanel({
      availableProtocolRefs: [{ id: 'PRT-cell-culture', title: 'Cell Culture' }, { id: 'PRT-counting', title: 'HepG2 Counting' }],
      onCommitStepRef: mocks.commitStepRef,
    })
    fireEvent.click(screen.getByTestId('step-investigate-ref-protocol'))
    // the picker surfaces the available protocols
    expect(screen.getByText('Cell Culture')).not.toBeNull()
    fireEvent.click(screen.getByText('Cell Culture'))
    expect(mocks.commitStepRef).toHaveBeenCalledWith({ kind: 'record', type: 'protocol', id: 'PRT-cell-culture' })
  })
})

describe('StepInvestigationPanel initialInstruction (per-step prompt Localize)', () => {
  it('auto-sends the caller-supplied instruction through the AI chat', () => {
    renderPanel({ initialInstruction: 'use a deepwell plate, not the 96-well' })
    expect(mocks.send).toHaveBeenCalledTimes(1)
    const composed = mocks.send.mock.calls[0]![0]
    // prompt + step text both reach the model
    expect(composed).toContain('use a deepwell plate, not the 96-well')
    expect(composed).toContain('Wash the media off the cells')
  })

  it('does not re-fire when re-rendered with the same instruction', () => {
    const utils = render(
      <StepInvestigationPanel
        runId="RUN-000001"
        step={{ stepId: 'S2', label: 'Wash the media off the cells', ordinal: 2, description: 'Remove media, dispense PBS, shake' }}
        stepText="Wash the media off the cells"
        onFocusStep={mocks.setFocusStepId}
        initialInstruction="use RPMI 1640"
      />,
    )
    utils.rerender(
      <StepInvestigationPanel
        runId="RUN-000001"
        step={{ stepId: 'S2', label: 'Wash the media off the cells', ordinal: 2, description: 'Remove media, dispense PBS, shake' }}
        stepText="Wash the media off the cells"
        onFocusStep={mocks.setFocusStepId}
        initialInstruction="use RPMI 1640"
      />,
    )
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })
})