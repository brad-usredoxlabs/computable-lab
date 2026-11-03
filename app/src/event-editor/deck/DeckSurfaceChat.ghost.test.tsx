/**
 * L2-CHAT-1 — RED-first: the /deck route's universal chat (the deck door +
 * HarnessChatPane) must own the GHOST MOUNT of event-bearing proposals:
 * retargeted from DeckSurfaceChat — assertions unchanged (CHATHOST-CONSOLIDATE-1 T-3)
 *
 *  - a done result carrying events + resolvedLabwares mounts DECK GHOSTS on
 *    the editor state (actions.setPreview — the same contract AiTabPanel's
 *    onDraftResult uses, AiTabPanel.tsx:608-669);
 *  - the pane's staged preview card (ChatPreviewCard) Apply commits the FULL
 *    staged preview through the shared deck adoption core (L2-CHAT-1 FIX3
 *    D1 — one adopter with the deck bar: the wired onPreviewAccept seam ->
 *    adoptStagedPreview -> commitPreview; the legacy per-event appendEvent
 *    arm is gone from this surface);
 *  - a REVISE turn (send while ghosts are mounted) REMOUNTS the ghosts with
 *    the new events and appends the revision trail (revisionHistory) to the
 *    mounted preview — AiTabPanel.ghostRemount.test.tsx's lock, through the
 *    universal path;
 *  - MOUNT CONSISTENCY: the pane renders the universal chat (harness-chat-pane
 *    + preview card) — the deck route never falls back to the legacy pane
 *    with an unwired event path.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventEditorPreview, EventEditorState } from '../EventEditorContext'
import { AiPanelProvider } from '../../shared/context/AiPanelContext'
import { streamAssist } from '../../shared/api/aiClient'
import { DeckChatSlice } from './DeckChatSlice'
import { SurfaceChatBridge } from '../../shared/shell/SurfaceChatBridge'
import { HarnessChatPane } from '../../agent/HarnessChatPane'

// LEG D step 5 (OQ-4 PORT): HarnessChatPane now mounts the attached-sources
// chrome (RunInEventEditorButton), whose usePdfViewer excerpt dep reaches
// pdfjs-dist — jsdom has no DOMMatrix, so mock it (the proven pattern this
// file already relied on transitively). Mock-only; no assertion changes.
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 0, fingerprints: [''], getPage: () => Promise.resolve(null), destroy: () => undefined }), destroy: () => undefined })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class { render() { return Promise.resolve() } },
}))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.mjs' }))

const mocks = vi.hoisted(() => ({
  setPreview: vi.fn((preview: unknown) => {
    // Mirror the real reducer: a set_preview dispatch replaces state.preview.
    mocks.state = { ...mocks.state, preview } as unknown as EventEditorState
  }),
  clearPreview: vi.fn(),
  appendEvent: vi.fn(),
  // Mirror the real commit_preview reducer (EventEditorContext.tsx:884-899):
  // labwares/equipments merged, placements appended, events appended,
  // eventGraphId/commit adopted, preview NULL (the one-adopter guard — a
  // second commit is a no-op).
  commitPreview: vi.fn(
    (previewEvents?: unknown, eventGraphId?: string, eventGraphCommit?: unknown) => {
      const s = mocks.state as {
        preview: {
          previewLabwares?: Record<string, unknown>
          previewEquipments?: Record<string, unknown>
          previewPlacements?: Array<{ placementId: string }>
          previewEvents?: unknown[]
        } | null
        labwares: Record<string, unknown>
        equipments: Record<string, unknown>
        placements: Array<{ placementId: string }>
        events: unknown[]
        eventGraphId?: string | null
        eventGraphSave?: unknown
      } | null
      if (!s || !s.preview) return
      s.labwares = { ...s.labwares, ...(s.preview.previewLabwares ?? {}) }
      s.equipments = { ...s.equipments, ...(s.preview.previewEquipments ?? {}) }
      s.placements = [
        ...s.placements,
        ...(s.preview.previewPlacements ?? []),
      ]
      s.events = [...s.events, ...((previewEvents as unknown[]) ?? s.preview.previewEvents ?? [])]
      if (eventGraphId) s.eventGraphId = eventGraphId
      if (eventGraphCommit) s.eventGraphSave = eventGraphCommit
      s.preview = null
      mocks.state = s as unknown as EventEditorState
    },
  ),
  state: null as unknown as EventEditorState,
}))

vi.mock('../EventEditorContext', () => ({
  useEventEditor: () => ({
    state: mocks.state,
    actions: {
      setPreview: mocks.setPreview,
      clearPreview: mocks.clearPreview,
      appendEvent: mocks.appendEvent,
      commitPreview: mocks.commitPreview,
    },
  }),
}))

// The shared adoption core's durable persist seam: the ghost lock asserts
// the COMMIT + state adoption, not the durable save — stub it so the Apply
// never writes through the live apiClient (saveEventGraph).
vi.mock('../eventGraphPersistence', () => ({
  persistAcceptedEventGraph: vi.fn(async (input: { eventGraphId?: string | null }) => ({
    eventGraphId: input.eventGraphId ?? 'EG-1',
    commit: { sha: 'sha-ghost', message: 'ghost test commit', timestamp: '2026-10-26T00:00:00Z' },
  })),
}))

vi.mock('../../shared/api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))

// Thread persistence: the deck door (the ONE registrar) registers the chat with endpoint
// 'event-editor' — the thread hydrate/append effects would hit the LIVE
// stack's /api/ai/threads. Stub them: the ghost lock asserts the mount path,
// not persistence, and this test must never write to a running thread.
vi.mock('../../shared/api/aiThreadClient', () => ({
  getThread: vi.fn().mockRejectedValue(new Error('no thread')),
  appendThreadMessage: vi.fn().mockResolvedValue(undefined),
  promoteThread: vi.fn().mockResolvedValue(undefined),
  // L2-THREAD-SCOPED-1 FIX2 D1: useAiChat statically imports listThreads
  // (the picker's seam), so a wholesale mock of this module must export it —
  // an unexported named import throws at the pane's mount. Empty list: the
  // ghost lock never exercises the picker.
  listThreads: vi.fn(async () => ({ threads: [] })),
}))

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }),
  },
}))

// The workstate proposal flow's executor tree pulls OpenTabsProvider +
// navigation into the render — out of scope for the ghost lock. Stub the
// flow: the ghost mount + apply path never touches workstate frames.
vi.mock('../../shared/ai/useWorkstateProposalFlow', () => ({
  useWorkstateProposalFlow: () => ({
    card: null,
    proposeWorkstate: vi.fn(),
    acceptWorkstate: vi.fn(),
    rejectWorkstate: vi.fn(),
    handleAgentAction: vi.fn(),
  }),
}))

vi.mock('../right-pane/ai/WorkstateProposalCard', () => ({
  WorkstateProposalCard: (props: { summary?: string }) => (
    <div data-testid="workstate-card">{props.summary}</div>
  ),
}))

afterEach(cleanup)

// The deck's platform: the same LOCKED single-SBS-plate shape the legacy
// resolved-ghosts lock uses (AiTabPanel.resolvedGhosts.test.tsx). Without a
// real platform/variant, buildPreviewFromDraft skips every proposed placement
// ("deck not loaded") and the resolved arm mounts nothing.
const singlePlateVariant = {
  id: 'manual_single_plate',
  title: 'Single SBS Plate',
  slots: [{ id: 'PLATE', kind: 'standard' as const, orientationMode: 'locked_landscape' as const, reachable: true }],
}
const singlePlatePlatform = {
  id: 'manual',
  label: 'Manual',
  allowedVocabIds: ['liquid-handling/v1'],
  defaultVariant: 'manual_single_plate',
  toolTypeIds: [],
  modules: [],
  variants: [singlePlateVariant],
} as const

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state = {
    platforms: [singlePlatePlatform],
    platformId: 'manual',
    variantId: 'manual_single_plate',
    labwares: {},
    equipments: {},
    placements: [],
    events: [],
    preview: null,
    runId: 'RUN-1',
    eventGraphId: 'EG-1',
    focusPlacementId: null,
    selection: null,
  } as unknown as EventEditorState
})

function frames(...events: Array<Record<string, unknown>>) {
  vi.mocked(streamAssist).mockImplementation(async function* () {
    for (const e of events) yield e as never
  })
}

/**
 * Render the deck chat + pane.
 *
 * REACTIVITY NOTE (seam design, not a defect of this item): the pane
 * (HarnessChatPane) re-reads the registered chat when its ELEMENT identity
 * changes — in production that piggybacks on the host page's re-renders
 * (AppShell recreates the rightPane element). A version bump alone re-renders
 * the provider, not the pane's subtree (children-element bailout). A fresh
 * element per re-read below supplies the same identity change the host page
 * causes, so the test asserts on the pane reading the FRESH registered chat.
 */
function renderDeckChat() {
  const makeTree = () => (
    <AiPanelProvider>
      <DeckChatSlice />
      <SurfaceChatBridge host="event-editor" />
      <HarnessChatPane />
    </AiPanelProvider>
  )
  const utils = render(makeTree())
  return { ...utils, reread: () => utils.rerender(makeTree()) }
}

/**
 * Poll the pane's re-read until the staged preview card appears (the stream
 * finishes asynchronously; the pane reads the fresh chat on each re-read, the
 * same way the host page's re-render makes it read).
 */
async function awaitPreviewCard(deck: ReturnType<typeof renderDeckChat>, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    await act(async () => {
      deck.reread()
    })
    const card = screen.queryByTestId('chat-preview')
    if (card) return card
    if (Date.now() >= deadline) throw new Error('chat-preview card never appeared')
    await new Promise((r) => setTimeout(r, 50))
  }
}

async function sendThroughPane(text: string, deck: ReturnType<typeof renderDeckChat>) {
  await act(async () => {
    deck.reread() // the pane picks up the registered chat (composer enabled)
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: text } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  })
  return awaitPreviewCard(deck)
}

describe('deck door + HarnessChatPane — universal ghost mount (L2-CHAT-1; T-3 retarget)', () => {
  it('an event-bearing proposal mounts deck ghosts (setPreview) and the pane Apply applies them (appendEvent)', async () => {
    frames(
      { type: 'status', message: 'working' },
      {
        type: 'done',
        result: {
          success: true,
          events: [{ eventId: 'EVT-1', event_type: 'add_material', details: {} }],
          resolvedLabwares: [{ recordId: 'LBW-rec-1', title: 'Fen plate' }],
          notes: [],
        },
      },
    )
    const deck = renderDeckChat()

    // MOUNT CONSISTENCY: the deck route's right pane IS the universal chat.
    expect(screen.getByTestId('harness-chat-pane')).toBeInTheDocument()

    const card = await sendThroughPane('draft an add-material for A1', deck)
    // The universal pane stages the proposal (ChatPreviewCard).
    expect(card).toBeInTheDocument()

    // Deck ghosts mounted on the editor state (the universal ghost leg).
    const previewCalls = mocks.setPreview.mock.calls
    expect(previewCalls.length).toBeGreaterThanOrEqual(1)
    const first = previewCalls[0]![0] as EventEditorPreview
    expect(first.previewEvents).toEqual([
      expect.objectContaining({ eventId: 'EVT-1' }),
    ])
    // The resolved labware offer ghosted a placement (the resolved arm).
    expect(first.previewPlacements.length).toBeGreaterThanOrEqual(1)
    // First draft: no revision trail yet.
    expect(first.revisionHistory).toBeUndefined()
    expect(first.sourcePrompt).toBe('draft an add-material for A1')

    // The pane Apply actually APPLIES — L2-CHAT-1 FIX3 D1: it commits the
    // FULL staged preview through the shared adoption core (onPreviewAccept
    // -> adoptStagedPreview -> commitPreview), NOT the legacy per-event
    // appendEvent arm (this surface no longer holds one).
    fireEvent.click(screen.getByTestId('chat-preview-apply'))
    await waitFor(() => expect(mocks.commitPreview).toHaveBeenCalledTimes(1))
    const s = mocks.state as {
      events: Array<{ eventId: string }>
      placements: Array<{ placementId: string }>
      preview: unknown
    }
    // Exactly ONE transfer event landed — the commit's own event list
    // (the ghost preview's events), adopted once.
    expect(s.events).toEqual([expect.objectContaining({ eventId: 'EVT-1' })])
    // The ghost's placement committed WITH the event (one adopter, full
    // preview — no silently dropped channels).
    expect(s.placements.length).toBeGreaterThanOrEqual(1)
    // The ghost is UNMOUNTED by the commit (commit_preview nulls the
    // preview) — one adopter stays one.
    expect(s.preview).toBeNull()
    // The legacy per-event arm is gone from this surface.
    expect(mocks.appendEvent).not.toHaveBeenCalled()
  })

  it('a revise turn REMOUNTS the ghosts with the new events and appends the revision trail', async () => {
    frames(
      { type: 'status', message: 'working' },
      {
        type: 'done',
        result: {
          success: true,
          events: [{ eventId: 'EVT-1', event_type: 'add_material', details: {} }],
          notes: [],
        },
      },
    )
    const deck = renderDeckChat()
    await sendThroughPane('first draft: add material', deck)
    const first = mocks.setPreview.mock.calls[0]![0] as EventEditorPreview
    expect(first.previewEvents).toEqual([expect.objectContaining({ eventId: 'EVT-1' })])

    // The revise turn: the pane stays mounted, the ghost preview remounts.
    frames(
      { type: 'status', message: 'revising' },
      {
        type: 'done',
        result: {
          success: true,
          events: [{ eventId: 'EVT-2', event_type: 'read', details: {} }],
          notes: [],
        },
      },
    )
    await sendThroughPane('actually read A1 instead', deck)
    // The revise turn's card is staged (one event).
    await waitFor(() => {
      const card = screen.getByTestId('chat-preview')
      expect(card.textContent).toContain('1')
    })

    const calls = mocks.setPreview.mock.calls
    expect(calls.length).toBeGreaterThanOrEqual(2)
    const second = calls[calls.length - 1]![0] as EventEditorPreview
    expect(second.previewEvents).toEqual([
      expect.objectContaining({ eventId: 'EVT-2' }),
    ])
    expect(second.revisionHistory).toHaveLength(1)
    // Legacy contract (AiTabPanel.ghostRemount §4B.5): the entry is the
    // prompt that was JUST drafted (the one now mounted), appended when the
    // PREVIOUS preview is replaced.
    expect(second.revisionHistory![0].prompt).toBe('actually read A1 instead')
    expect(typeof second.revisionHistory![0].createdAt).toBe('string')
  })
})
