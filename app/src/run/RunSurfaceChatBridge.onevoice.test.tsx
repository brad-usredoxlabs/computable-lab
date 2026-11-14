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
 * (ChatFocusProvider > DeckChatSlice + the deck bar PreviewActionBar +
 * SurfaceChatBridge host="run-workspace" + HarnessChatPane), stream mocked
 * to a done carrying ONLY recordCreations. The u1recordsdraft seam staged
 * that preview (useDeckGhostMount keeps a records-only draft alive), so the
 * run surface's ONE delivery statement is the staged deck preview; the
 * honest wall is the fallback ONLY when nothing was staged. The pin:
 * exactly ONE marker (preview bar OR wall — never both, never neither), it
 * NAMES the material, and no message contains "did not propose any changes".
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
// EventEditorProvider). The state carries the fields the REAL ghost-mount
// closure reads (useDeckGhostMount passes state.labwares verbatim to
// buildPreviewFromDraft — the u1recordsdraft proven mock shape), and
// `setPreview` mutates the SAME state object: the mock editor is static (no
// reducer), so the live value is what the real deck bar (PreviewActionBar)
// reads on the poll loop's rerender — the real marker, not a spy assertion.
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
    labwares: {},
    equipments: {},
    focusPlacementId: null,
    preview: null as EventEditorPreview | null,
  },
  actions: {
    appendEvent: vi.fn(),
    setPreview: (preview: EventEditorPreview | null) => {
      eventEditorContextValue.state.preview = preview
    },
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
import { PreviewActionBar } from '../event-editor/deck/PreviewActionBar'
import { SurfaceChatBridge } from '../shared/shell/SurfaceChatBridge'
import { HarnessChatPane } from '../agent/HarnessChatPane'
import type { AiContext } from '../types/aiContext'
import type { EventEditorPreview } from '../event-editor/EventEditorContext'

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
                  <PreviewActionBar />
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

// The turn-complete marker is exactly ONE (the onevoice contract): the
// u1recordsdraft seam stages the deck preview (the deck bar renders it) —
// that IS the delivery statement; the honest wall is the fallback ONLY when
// nothing was staged. Neither marker means the turn never completed.
// PreviewActionBar.tsx:159: the real bar (class .preview-bar, the deck bar's
// own markup — no invented testid); useAiChat.ts:2190 renders the wall
// (data-testid="honest-wall") only on the nothing-staged fallback.
const PREVIEW_BAR_SELECTOR = '.preview-bar'
const HONEST_WALL_SELECTOR = '[data-testid="honest-wall"]'

function oneVoiceMarkers() {
  return {
    preview: document.querySelector(PREVIEW_BAR_SELECTOR),
    wall: document.querySelector(HONEST_WALL_SELECTOR),
  }
}

async function awaitTurnComplete(deck: ReturnType<typeof renderRunChat>, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    await act(async () => {
      deck.reread()
    })
    // The streaming stop button leaving means the stream ended; the
    // delivery marker (staged-preview deck bar OR the honest wall) renders
    // once the done frame is processed. Poll on both.
    const stopGone = !document.querySelector('[data-testid="interpreting-stop"]')
    const { preview, wall } = oneVoiceMarkers()
    if (stopGone && (preview !== null || wall !== null)) return
    if (Date.now() >= deadline) {
      throw new Error('turn never completed (neither the staged deck preview bar nor the honest wall rendered)')
    }
    await new Promise((r) => setTimeout(r, 50))
  }
}

describe('run surface — L2-P1-CREATE-RECORD-LANDS-1 onevoice (ONE statement on a records-only success)', () => {
  it('a recordCreations-only done stages the deck preview as the ONE delivery statement (NO "did not propose any changes" bubble; wall only when nothing staged)', async () => {
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

    // THE one-voice contract on the rendered run surface: the staged deck
    // preview (the deck bar) is the delivery statement; the honest wall is
    // the fallback ONLY when nothing was staged — exactly ONE marker on
    // screen. The bar's OWN summary names counts ("preview ready" for a
    // records-only preview), so the material is named where the run surface
    // names it: the deck bar's review modal (ProposedGraphModal's "New
    // records" section lists each creation's name) — open it like a user.
    const { preview, wall } = oneVoiceMarkers()
    // (1) NOT silently empty — exactly ONE delivery marker fired. A wall
    // BESIDE the staged preview would be the old two-voices contradiction.
    expect(preview !== null || wall !== null).toBe(true)
    expect(preview !== null && wall !== null).toBe(false)
    // (2) it NAMES the delivery: open the staged preview's review — the
    // record to create is listed by name (no invented marker: the modal's
    // proposed-record rows, ProposedGraphModal.tsx:311-328).
    if (preview !== null) {
      await act(async () => {
        fireEvent.click(
          Array.from(preview.querySelectorAll('button')).find(
            (b) => b.textContent?.trim() === 'View changes',
          )!,
        )
        pane.reread()
      })
      const review = document.querySelector('[data-testid="proposed-records-section"]')
      expect(review).not.toBeNull()
      expect(review?.textContent ?? '').toContain('Lysis buffer')
      const recordRow = document.querySelector('[data-testid="proposed-record-row"]')
      expect(recordRow?.textContent ?? '').toContain('Lysis buffer')
    }
    // (3) the wall (when it is the voice — the nothing-staged fallback)
    // does NOT deny the delivery it just named.
    if (wall !== null) {
      expect(wall.textContent).not.toContain('Nothing was proposed')
    }
    // (4) the SECOND statement (the bubble) never appears in the same turn
    // as the marker — one voice, no contradiction on one screen.
    expect(document.body.textContent).not.toContain('AI completed the task but did not propose any changes.')
  })
})
