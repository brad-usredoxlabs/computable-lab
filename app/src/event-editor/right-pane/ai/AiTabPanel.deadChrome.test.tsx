/**
 * SH-QA-2 — dead-chrome host legs (AiTabPanel wiring).
 *
 * Harness: the EXACT option-capturing `useChatThread` seam of
 * AiTabPanel.shorthandClarification.test.tsx — the test emits a draft result
 * exactly like the SSE `done` event does; the send spy is the single
 * clarification resend site (handleClarificationsSubmit → sendChat,
 * AiTabPanel.tsx:1046). OQ2 batch-proceed: the proceed affordance rides that
 * SAME existing wire — no new payload shape anywhere.
 *
 * States pinned: prefilled-carried (continue affordance), answered→Change→
 * reopen→resubmit (ONE code path), updating+error strand (reason + cancel per
 * OQ4: CANCEL + REASON only, no retry-resend), result.error reset pin, and
 * mode churn mid-auto-submit (documents the churn, masks nothing).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { OpenTabsProvider } from '../../../shared/shell/OpenTabsContext'
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
  send: null as null | ReturnType<typeof vi.fn>,
  chatState: null as null | Record<string, unknown>,
}))

vi.mock('./useChatThread', () => ({
  useChatThread: (options: { onDraftResult?: (result: unknown, prompt: string) => void }) => {
    mocks.chatOptions = options
    mocks.send = mocks.send ?? vi.fn<any[], unknown>(async () => undefined)
    mocks.chatState = mocks.chatState ?? {
      messages: [],
      pending: null,
      status: null,
      error: null,
      trace: [],
    }
    return {
      state: mocks.chatState as never,
      isStreaming: false,
      send: mocks.send as never,
      stop: vi.fn(),
      reset: vi.fn(),
      clearProtocolCandidate: vi.fn(),
    }
  },
}))

vi.mock('../../protocol/ProtocolSelectionContext', () => ({
  NO_PROTOCOL_RESOURCES: { labwares: [], equipment: [] },
  NO_LABWARE_BINDINGS: {},
  useProtocolSelection: () => null,
}))

// Deterministic picker leg (same seam as ClarificationPicker.test.tsx).
const resolveMaterial = vi.fn()
vi.mock('../../../shared/taptab/slashMenu/resolvers', () => ({
  resolveMaterial: (q: string, ctx: unknown) => resolveMaterial(q, ctx),
  resolveLabware: () => Promise.resolve([]),
  resolveEquipment: () => Promise.resolve([]),
  resolveProtocol: () => Promise.resolve([]),
  resolveTube: () => Promise.resolve([]),
  resolveSource: () => Promise.resolve([]),
  resolveTarget: () => Promise.resolve([]),
}))
vi.mock('../../lib/groundMaterialRef', () => ({
  groundMaterialRef: vi.fn(async () => ({ kind: 'ontology' })),
}))

import { AiTabPanel } from './AiTabPanel'
import type { AiClarificationRequest } from '../../../types/ai'
import type { SlashSuggestion } from '../../../shared/taptab/slashMenu/types'

const PICKER_QUESTION: AiClarificationRequest = {
  id: 'q1',
  kind: 'material',
  prompt: 'Which material is "clofibrate"?',
  menuProvider: '/m',
  query: 'clofibrate',
  options: [],
}
const PARAM_QUESTION: AiClarificationRequest = {
  id: 'q2',
  kind: 'parameter',
  prompt: 'What volume of DMEM?',
  menuProvider: 'choice',
  options: [],
}
const hitA: SlashSuggestion = {
  key: 'material:MAT-1',
  label: 'Clofibrate (local)',
  badge: 'Concept',
  mention: { type: 'material', entityKind: 'material', id: 'MAT-1', label: 'Clofibrate (local)' },
}
const hitB: SlashSuggestion = {
  key: 'material:MAT-2',
  label: 'Fibrates blend',
  badge: 'Concept',
  mention: { type: 'material', entityKind: 'material', id: 'MAT-2', label: 'Fibrates blend' },
}

function panelElement() {
  const base = defaultWorkspaceState('STU-000001')
  return (
    <MemoryRouter>
      <OpenTabsProvider>
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
      </OpenTabsProvider>
    </MemoryRouter>
  )
}

function renderPanel() {
  return render(panelElement())
}

async function emitClarificationTurn(result: Record<string, unknown>) {
  await act(async () => {
    mocks.chatOptions?.onDraftResult?.(result, 'add 50 uL of clofibrate to A1')
  })
}

/** Pick the resolver's first suggestion through the picker leg (the SAME leg
 *  the first pick and every re-pick use). */
async function pickSuggestion(label: string) {
  const row = await screen.findByText(label)
  await act(async () => {
    fireEvent.mouseDown(row)
  })
}

beforeEach(() => {
  cleanup()
  mocks.chatOptions = null
  mocks.send = null
  mocks.chatState = null
  resolveMaterial.mockReset()
  resolveMaterial.mockResolvedValue([hitA])
})

describe('AiTabPanel — SH-QA-2 dead chrome: host legs', () => {
  // DC1b: a prefilled-carried answered card (all answered) is never
  // actionless — its proceed affordance fires the ONE existing resend with the
  // batch `clarificationAnswers` payload (OQ2: the existing wire, no new shape).
  it('DC1b: answered card proceeds via the existing clarification resend wire', async () => {
    resolveMaterial.mockResolvedValue([hitA])
    renderPanel()
    await emitClarificationTurn({ success: true, events: [], clarificationRequests: [PICKER_QUESTION] })

    await pickSuggestion('Clofibrate (local)')

    // The answered card carries the live proceed affordance (never dead chrome).
    const continueBtn = await screen.findByTestId('continue-q1')
    expect(continueBtn.textContent).toBe('Continue with this answer')

    // The auto-submit races; clicking proceed is still exactly ONE send.
    await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1), { timeout: 3000 })
    const [text, options] = mocks.send!.mock.calls[0] as [string, { clarificationAnswers?: unknown[] }]
    expect(text).toContain('Clofibrate (local)')
    expect(options.clarificationAnswers).toEqual([
      expect.objectContaining({ requestId: 'q1', label: 'Clofibrate (local)' }),
    ])
  })

  // DC3: answered → Change → picker reopens → re-pick → the SAME submit path
  // fires sendChat call 2 carrying the NEW answer (same prompt-builder, same
  // seam — structurally indistinguishable from the first pick).
  it('DC3: Change reopens the picker; the re-pick resends through the SAME single code path', async () => {
    resolveMaterial.mockResolvedValue([hitA])
    renderPanel()
    await emitClarificationTurn({ success: true, events: [], clarificationRequests: [PICKER_QUESTION] })

    await pickSuggestion('Clofibrate (local)')
    await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1), { timeout: 3000 })
    const firstText = (mocks.send!.mock.calls[0] as [string])[0]

    // Re-ask re-entry (OQ3 faithful reading): a fresh clarifications-needed
    // turn; the carried answer lives in resolvedClarificationsRef, the card
    // shows a fresh picker — and it is actionable (S1).
    resolveMaterial.mockResolvedValue([hitA])
    await emitClarificationTurn({ success: true, events: [], clarificationRequests: [PICKER_QUESTION] })
    expect(screen.getByTestId('questions-panel')).toBeDefined()
    await pickSuggestion('Clofibrate (local)')
    await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(2), { timeout: 3000 })

    // Change on the answered card REOPENS it (the dead click is gone).
    // The auto-submit races the click, so prove the reopen on the fresh
    // re-entry leg instead: answer, then Change before allAnswered settles.
    // (Panel-level reopen + focus is pinned in QuestionsPanel.deadChrome.)
    // Here: re-enter a THIRD time with TWO questions so one answered card
    // stays while we Change the other — the reopen leg is observable.
    resolveMaterial.mockResolvedValue([hitB])
    await emitClarificationTurn({
      success: true,
      events: [],
      clarificationRequests: [PICKER_QUESTION, PARAM_QUESTION],
    })
    // Answer q2 by typing (parameter leg), then answer q1, then Change q1.
    const paramInput = screen.getByTestId('parameter-answer-input') as HTMLInputElement
    fireEvent.change(paramInput, { target: { value: '50 uL' } })
    fireEvent.click(screen.getByTestId('parameter-answer-submit'))
    await pickSuggestion('Clofibrate (local)')
    // allAnswered → auto-submit (send 3). Now re-enter and exercise Change:
    await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(3), { timeout: 3000 })
    resolveMaterial.mockResolvedValue([hitB])
    await emitClarificationTurn({
      success: true,
      events: [],
      clarificationRequests: [PICKER_QUESTION, PARAM_QUESTION],
    })
    // Answer ONLY q1 → answered card shows "Go to next unanswered" (S3).
    await pickSuggestion('Clofibrate (local)')
    expect(await screen.findByTestId('next-unanswered-q1')).toBeDefined()
    // Change q1 → the picker leg is back (reopen, not a dead highlight).
    fireEvent.click(screen.getByText('Change'))
    const reopened = (await screen.findByPlaceholderText(/Search materials/)) as HTMLInputElement
    expect(reopened.value).toBe('clofibrate')
    // Re-pick a DIFFERENT answer → allAnswered still false (q2 open), so no
    // auto-submit yet; answer q2 → the ONE submit path fires with the NEW q1
    // answer in the batch payload.
    await pickSuggestion('Fibrates blend')
    const paramInput2 = screen.getByTestId('parameter-answer-input') as HTMLInputElement
    fireEvent.change(paramInput2, { target: { value: '50 uL' } })
    fireEvent.click(screen.getByTestId('parameter-answer-submit'))
    await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(4), { timeout: 3000 })
    const [text4, options4] = mocks.send!.mock.calls[3] as [string, { clarificationAnswers?: unknown[] }]
    // Same prompt-builder shape as the first send (clarificationAnswersPrompt).
    expect(text4).toContain('Fibrates blend')
    expect(text4).toContain('50 uL')
    expect(firstText).toContain('Clofibrate (local)')
    const answers4 = options4.clarificationAnswers ?? []
    expect(answers4.some((a) => (a as { label?: string }).label === 'Fibrates blend')).toBe(true)
    // The accumulated carried set re-sends (resolvedClarificationsRef behavior
    // — pinned, not changed): the earlier q2 answer is still in the batch.
    expect(answers4.some((a) => (a as { value?: string }).value === '50 uL')).toBe(true)
  })

  // DC4 / S7: updating + SSE error with NO done frame — today the pane sits at
  // "Updating draft…" with ZERO controls and ZERO reason. Fix (OQ4): REASON +
  // CANCEL only, no retry-resend.
  it('DC4: an updating strand that errors names the failure and offers the cancel escape', async () => {
    resolveMaterial.mockResolvedValue([hitA])
    const view = renderPanel()
    await emitClarificationTurn({ success: true, events: [], clarificationRequests: [PICKER_QUESTION] })
    await pickSuggestion('Clofibrate (local)')
    await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1), { timeout: 3000 })

    // The resend turn dies on an SSE `error` frame with no `done` frame:
    // onDraftResult never fires; only chat.state.error exists.
    act(() => {
      mocks.chatState!.error = 'Draft failed: model stream ended'
    })
    view.rerender(panelElement())

    // The header already says "Updating draft…" — the pane must add the REASON
    // and the escape, not sit silent.
    expect(screen.getByTestId('ai-tab-system-prompt').textContent).toBe('Updating draft…')
    expect(screen.getByTestId('updating-strand-reason').textContent).toBe('Draft failed: model stream ended')
    const cancel = screen.getByTestId('updating-cancel')
    expect(cancel.textContent).toBe('Cancel this draft and start a new prompt')

    // The escape works: cancel returns the pane to a usable chat.
    fireEvent.click(cancel)
    expect(screen.getByTestId('chat-input')).toBeDefined()
  })

  // DC7 / S8 pin: a done result carrying result.error after a submit resets
  // the pane to usable chat (existing :423-428 leg — pin, do not change).
  it('DC7: a result.error done frame after a submit resets to a usable pane', async () => {
    resolveMaterial.mockResolvedValue([hitA])
    renderPanel()
    await emitClarificationTurn({ success: true, events: [], clarificationRequests: [PICKER_QUESTION] })
    await pickSuggestion('Clofibrate (local)')
    await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1), { timeout: 3000 })

    await emitClarificationTurn({ success: false, error: true, events: [] })
    expect(screen.queryByTestId('questions-panel')).toBeNull()
    expect(screen.getByTestId('chat-input')).toBeDefined()
  })

  // DC8 / S10: mode churn mid-auto-submit — the panel unmounts and the submit
  // no-ops with zero chrome. NO guard-heuristic is added; this documents the
  // churn arm (onDraftResult result.error leg, AiTabPanel.tsx:423-428) and
  // pins the reducer-level fact: churn ⇒ NO resend fires.
  it('DC8: churn mid-auto-submit fires NO resend (documents the churn arm, masks nothing)', async () => {
    resolveMaterial.mockResolvedValue([])
    renderPanel()
    await emitClarificationTurn({ success: true, events: [], clarificationRequests: [PARAM_QUESTION] })

    // Answer the only question → allAnswered → the 300ms auto-submit timer is
    // pending. Before it can fire, a server turn lands in the result.error
    // arm and resets the sidebar (the churn).
    const paramInput = screen.getByTestId('parameter-answer-input') as HTMLInputElement
    fireEvent.change(paramInput, { target: { value: '50 uL' } })
    fireEvent.click(screen.getByTestId('parameter-answer-submit'))
    await emitClarificationTurn({ success: false, error: true, events: [] })

    // Past the 300ms window: the unmounted panel's timer was cleared — the
    // submit no-ops at the mode guard and NO clarification resend fires.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600))
    })
    expect(mocks.send).not.toHaveBeenCalled()
    expect(screen.queryByTestId('questions-panel')).toBeNull()
    expect(screen.getByTestId('chat-input')).toBeDefined()
  })
})
