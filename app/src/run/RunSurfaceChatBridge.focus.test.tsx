/**
 * LEG E / E-α — run working-focus publish (deck precedent
 * the retired deck bridge (deck focus block): the run workspace must publish the
 * ChatFocusContext the universal pane's SurfaceFocusHeader renders, so the
 * /runs/:runId chat keeps its "what are we looking at" header after LEG D
 * deleted the legacy ChatContextHeader (the run surface regressed to NO
 * header — the pane's SurfaceFocusHeader renders null without a publish).
 * retargeted from RunSurfaceChatBridge — assertions unchanged (CHATHOST-CONSOLIDATE-1 T-3)
 *
 * The publisher is the ONE registrar (host="run-workspace"; the deck slice is
 * mounted INSIDE the page's ProtocolSelectionProvider + EventEditorProvider).
 * The focused-step truth is ProtocolSelectionContext.focusedStep — the SAME
 * truth the deleted ChatContextHeader read (ChatContextHeader.tsx:22-23 at
 * 78b6ccdc). This spec renders the REAL bridge inside the REAL providers
 * (ProtocolSelectionProvider + ChatFocusProvider) with the app API layer
 * stubbed, and reads what the pane's header would render through
 * useChatFocus — the exact consumer contract (SurfaceFocusHeader.tsx:15).
 *
 * The step focus is driven the way the run nav rail drives it
 * (ProtocolNavPanel.handleStepClick -> sel.setFocusedStep(step)) — a direct
 * setFocusedStep call inside act(), not a render-phase update.
 *
 * exactOptionalPropertyTypes: when no step is focused the publish carries NO
 * `detail` key (absent, never `undefined`) — the conditional-spread discipline
 * the deck precedent and HarnessChatPane's chain spreads use.
 */
import { cleanup, render, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(async () => ({ payload: { studyId: 'STU-1', methodEventGraphId: 'EG-1', title: 'Run' } })),
    workspace: { get: vi.fn(async () => null) },
    ai: { health: vi.fn(async () => ({ ok: false })) },
    getSurfaces: vi.fn(async () => []),
    getProtocolContext: vi.fn(async () => null),
  },
  api: {
    workspace: { get: vi.fn(async () => null) },
    ai: { health: vi.fn(async () => ({ ok: false })) },
  },
  ApiError: class extends Error {},
}))
vi.mock('../shared/api/aiThreadClient', () => ({
  listThreads: vi.fn(async () => []),
  createThread: vi.fn(async () => ({ id: 't1' })),
  // REJECT (not resolve(null)): a resolved null makes useAiChat's hydrate
  // effect fail the turn — the passing deck-door ghost pin + run-page
  // surface lock use the same rejection posture.
  getThread: vi.fn().mockRejectedValue(new Error('no thread')),
  listMessages: vi.fn(async () => []),
  streamMessage: vi.fn(async function* () {}),
  cancelMessage: vi.fn(async () => {}),
  appendThreadMessage: vi.fn(async () => {}),
  deleteThread: vi.fn(async () => {}),
  renameThread: vi.fn(async () => {}),
  setThreadPinned: vi.fn(async () => {}),
}))
vi.mock('../shared/api/aiClient', () => ({
  streamAssist: vi.fn(async function* () {
    yield { type: 'status', message: 'working' }
    yield { type: 'done', result: { success: true, events: [], notes: [] } }
  }),
  getAiHealth: vi.fn(async () => ({ available: true })),
}))
vi.mock('../shared/ai/useWorkstateProposalFlow', () => ({
  useWorkstateProposalFlow: () => ({
    card: null,
    proposeWorkstate: vi.fn(),
    acceptWorkstate: vi.fn(),
    rejectWorkstate: vi.fn(),
    handleAgentAction: vi.fn(),
  }),
}))
vi.mock('pdfjs-dist', () => {
  const fakeDoc = { promise: Promise.resolve({ numPages: 0, fingerprints: [''], getPage: () => Promise.resolve(null), destroy: () => undefined }), destroy: () => undefined }
  return {
    getDocument: vi.fn(() => fakeDoc),
    GlobalWorkerOptions: { workerSrc: '' },
    TextLayer: class {
      render() {
        return Promise.resolve()
      }
    },
  }
})
// The editor: the ghost seam + adoption consume these; the focus publisher
// does not, but the bridge's useSurfaceChat registration resolves the same
// state. A minimal, stable stub (no placements/events => the deck is
// unlocked, matching the three-pane fixture's fresh-run posture).
const eventEditorContextValue = {
  state: {
    eventGraphId: 'EG-1',
    runId: 'RUN-1',
    platformId: 'PF-1',
    variantId: 'VAR-1',
    vocabPackId: 'VP-1',
    platforms: [],
    selection: null,
    placements: [],
    events: [],
    preview: null,
  },
  actions: {
    appendEvent: vi.fn(),
    setPreview: vi.fn(),
    clearPreview: vi.fn(),
    commitPreview: vi.fn(),
    setReviewState: vi.fn(),
  },
}
vi.mock('../event-editor/EventEditorContext', () => ({
  useEventEditor: () => eventEditorContextValue,
  isDeckSetupLocked: (state: { placements?: unknown[]; events?: unknown[]; runDeck?: unknown }) =>
    state.runDeck !== null || (state.placements?.length ?? 0) > 0 || (state.events?.length ?? 0) > 0,
}))

import { useChatFocus, ChatFocusProvider, type ChatFocus } from '../agent/ChatFocusContext'
import { ProtocolSelectionProvider, useProtocolSelection } from '../event-editor/protocol/ProtocolSelectionContext'
import { AiPanelProvider } from '../shared/context/AiPanelContext'
// CHATHOST-CONSOLIDATE-1 T-3 retarget: the run door's deck slice is PUBLISHED
// by DeckChatSlice (reads the mocked useEventEditor) and the ONE registrar
// (SurfaceChatBridge, host="run-workspace") collects it — the assertions
// (the published working focus) are unchanged.
import { DeckChatSlice } from '../event-editor/deck/DeckChatSlice'
import { SurfaceChatBridge } from '../shared/shell/SurfaceChatBridge'
import type { AiContext } from '../types/aiContext'

const aiContext: AiContext = {
  surface: 'run-workspace',
  summary: 'Run workspace: RUN-1',
  surfaceContext: { runId: 'RUN-1', studyId: 'STU-1', mode: 'plan' },
  editorMode: 'plan',
}

let focusSeen: ChatFocus | null | undefined
function FocusProbe() {
  focusSeen = useChatFocus()
  return null
}
let selectionRef: ReturnType<typeof useProtocolSelection> = null
function SelectionProbe() {
  selectionRef = useProtocolSelection()
  return null
}

function renderRunChat() {
  const tree = (
    <MemoryRouter initialEntries={['/runs/RUN-1']}>
      <Routes>
        <Route
          path="/runs/:runId"
          element={
            <ProtocolSelectionProvider>
              <SelectionProbe />
              <AiPanelProvider>
                <ChatFocusProvider>
                  <FocusProbe />
                  <DeckChatSlice />
                  <SurfaceChatBridge host="run-workspace" base={{ context: aiContext }} />
                </ChatFocusProvider>
              </AiPanelProvider>
            </ProtocolSelectionProvider>
          }
        />
      </Routes>
    </MemoryRouter>
  )
  render(tree)
}

afterEach(() => {
  cleanup()
  focusSeen = undefined
  selectionRef = null
})

/** Drive the focused-step truth exactly as the run nav rail does. */
function focusStep(step: { stepId: string; label: string; ordinal?: number } | null) {
  act(() => {
    selectionRef?.setFocusedStep(step)
  })
}

describe('run door — working-focus publish (E-α, deck precedent; T-3 retarget)', () => {
  it('publishes a working focus with NO step focused (label = the run, NO detail key)', async () => {
    renderRunChat()
    await vi.waitFor(() => expect(focusSeen).not.toBeNull())
    const focus = focusSeen!
    expect(focus.surface).toBe('run-workspace')
    expect(focus.label).toContain('RUN-1')
    // exactOptionalPropertyTypes: the detail key is ABSENT, not undefined.
    expect(focus).not.toHaveProperty('detail')
  })

  it('publishes the focused-step focus (detail = Step <ordinal>: <label>) when the rail focuses a step', async () => {
    renderRunChat()
    await vi.waitFor(() => expect(focusSeen).not.toBeNull())
    expect(focusSeen).not.toHaveProperty('detail')

    // The rail's real focus action: setFocusedStep (ProtocolSelectionContext).
    focusStep({ stepId: 'STEP-grow', label: 'Grow cells', ordinal: 2 })
    await vi.waitFor(() => expect(focusSeen?.detail).toBe('Step 2: Grow cells'))
    expect(focusSeen!.label).toContain('RUN-1')
  })

  it('keeps the run label when the step focus clears (detail key absent again)', async () => {
    renderRunChat()
    await vi.waitFor(() => expect(focusSeen).not.toBeNull())

    focusStep({ stepId: 'STEP-grow', label: 'Grow cells', ordinal: 2 })
    await vi.waitFor(() => expect(focusSeen?.detail).toBe('Step 2: Grow cells'))

    focusStep(null)
    await vi.waitFor(() => expect(focusSeen).not.toHaveProperty('detail'))
    expect(focusSeen!.label).toContain('RUN-1')
  })
})
