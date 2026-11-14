/**
 * L2-P1-CREATE-RECORD-LANDS-1 [onevoice] — the RUN-SURFACE route pin.
 *
 * prompt-1 (gate PROMPT1-GATE-20261114T051016Z R1-13): the backend logs
 * `done create_record success=true records=labware`; the client used to print
 * TWO contradictory statements on one screen — the honest wall ("it delivered
 * only records to create … Nothing was proposed and nothing was applied.")
 * AND the bubble ("AI completed the task but did not propose any changes.").
 * The onevoice fix: the wall NAMES the records and stops denying them, and the
 * bubble is suppressed for the same turn (the two emptiness gates are now
 * mutually exclusive on a records-only success) — the wall is the ONE voice.
 *
 * Renders the RUN surface's shared chat exactly as RunWorkspacePage does
 * (ChatFocusProvider > DeckChatSlice + SurfaceChatBridge host="run-workspace"
 * + HarnessChatPane), stream mocked to a done carrying ONLY recordCreations,
 * and asserts on the DOM: the wall fired (NOT silently empty), it NAMES the
 * records, it does NOT say "Nothing was proposed", and no message contains
 * "did not propose any changes".
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The attached-sources chrome (RunInEventEditorButton) reaches pdfjs-dist;
// jsdom has no DOMMatrix. Proven mock (see DeckSurfaceChat.deckLayout.uifix1).
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => Promise.reject(new Error('no pdf in test'))),
  GlobalWorkerOptions: { workerSrc: '' },
  version: '0.0.0-test',
}))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.mjs' }))

// The run door's deck slice is PUBLISHED by DeckChatSlice (reads the mocked
// useEventEditor); the minimal state + isDeckSetupLocked match the focus
// test's proven run-host mock (it runs the same publisher without a full
// EventEditorProvider).
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
  // HarnessChatPane reads the deck's published selection through the OPTIONAL
  // seam (HarnessChatPane.tsx:289). Without a real EventEditorProvider the
  // minimal mock state is the honest value; the pane optional-chains it
  // (editor?.state.selection?.wells).
  useOptionalEventEditor: () => eventEditorContextValue,
  isDeckSetupLocked: (state: { placements?: unknown[]; events?: unknown[]; runDeck?: unknown }) =>
    state.runDeck !== null || (state.placements?.length ?? 0) > 0 || (state.events?.length ?? 0) > 0,
}))
vi.mock('../event-editor/eventGraphPersistence', () => ({
  persistAcceptedEventGraph: vi.fn(async (input: { eventGraphId?: string | null }) => ({
    eventGraphId: input.eventGraphId ?? 'EG-1',
    commit: { sha: 'sha-ghost', message: 'ghost test commit', timestamp: '2026-11-14T00:00:00Z' },
  })),
}))
vi.mock('../shared/api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))
vi.mock('../shared/api/aiThreadClient', () => ({
  getThread: vi.fn().mockRejectedValue(new Error('no thread')),
  appendThreadMessage: vi.fn().mockResolvedValue(undefined),
  promoteThread: vi.fn().mockResolvedValue(undefined),
  listThreads: vi.fn(async () => ({ threads: [] })),
}))
vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }),
  },
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
vi.mock('../event-editor/right-pane/ai/WorkstateProposalCard', () => ({
  WorkstateProposalCard: (props: { summary?: string }) => (
    <div data-testid="workstate-card">{props.summary}</div>
  ),
}))

import { AiPanelProvider } from '../shared/context/AiPanelContext'
import { streamAssist } from '../shared/api/aiClient'
import { ChatFocusProvider } from '../agent/ChatFocusContext'
import { ProtocolSelectionProvider } from '../event-editor/protocol/ProtocolSelectionContext'
import { DeckChatSlice } from '../event-editor/deck/DeckChatSlice'
import { SurfaceChatBridge } from '../shared/shell/SurfaceChatBridge'
import { HarnessChatPane } from '../agent/HarnessChatPane'
import type { AiContext } from '../types/aiContext'

const aiContext: AiContext = {
  surface: 'run-workspace',
  summary: 'Run workspace: RUN-1',
  surfaceContext: { runId: 'RUN-1', studyId: 'STU-1', mode: 'plan' },
  editorMode: 'plan',
}

afterEach(cleanup)

function renderRunChat() {
  const tree = (
    <MemoryRouter initialEntries={['/runs/RUN-1']}>
      <Routes>
        <Route
          path="/runs/:runId"
          element={
            <ProtocolSelectionProvider>
              <AiPanelProvider>
                <ChatFocusProvider>
                  <DeckChatSlice />
                  <SurfaceChatBridge host="run-workspace" base={{ context: aiContext }} />
                  <HarnessChatPane />
                </ChatFocusProvider>
              </AiPanelProvider>
            </ProtocolSelectionProvider>
          }
        />
      </Routes>
    </MemoryRouter>
  )
  const utils = render(tree)
  return { ...utils, reread: () => utils.rerender(tree) }
}

async function awaitTurnComplete(deck: ReturnType<typeof renderRunChat>, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    await act(async () => {
      deck.reread()
    })
    // The streaming stop button leaving means the stream ended; the wall
    // (the turn-complete marker for a no-proposal turn) is rendered once the
    // done frame is processed. Poll on both.
    const stopGone = !document.querySelector('[data-testid="interpreting-stop"]')
    const wallUp = document.querySelector('[data-testid="honest-wall"]') !== null
    if (stopGone && wallUp) return
    if (Date.now() >= deadline) throw new Error('turn never completed')
    await new Promise((r) => setTimeout(r, 50))
  }
}

describe('run surface — L2-P1-CREATE-RECORD-LANDS-1 onevoice (ONE statement on a records-only success)', () => {
  it('a recordCreations-only done shows the wall naming the records and NO "did not propose any changes" bubble', async () => {
    vi.mocked(streamAssist).mockImplementation(async function* () {
      yield { type: 'status', message: 'working' } as never
      yield {
        type: 'done',
        result: {
          success: true,
          notes: [],
          recordCreations: [{ kind: 'material', name: 'Lysis buffer', curie: 'cl:lysis-1' }],
        },
      } as never
    })

    const pane = renderRunChat()
    await act(async () => {
      pane.reread()
      const input = document.querySelector('.sequence-chat textarea') as HTMLTextAreaElement
      // React controlled textarea: the repo's pane tests drive it with
      // fireEvent.change (patches the native setter).
      fireEvent.change(input, { target: { value: 'Create a new lysis buffer record' } })
      const send = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Send')
      fireEvent.click(send!)
    })
    await awaitTurnComplete(pane)
    await act(async () => {
      pane.reread()
    })

    // THE one-voice contract on the rendered run surface:
    const wall = document.querySelector('[data-testid="honest-wall"]')?.textContent ?? ''
    // (1) the pane is NOT silently empty — the wall fired (anti-silence gate).
    expect(wall).not.toBe('')
    // (2) it NAMES the delivery: the records to create were delivered.
    expect(wall).toContain('records to create')
    // (3) it does NOT deny the delivery it just named.
    expect(wall).not.toContain('Nothing was proposed')
    // (4) the SECOND statement (the bubble) never appears in the same turn
    // as the wall — one voice, no contradiction on one screen.
    expect(document.body.textContent).not.toContain('AI completed the task but did not propose any changes.')
  })
})
