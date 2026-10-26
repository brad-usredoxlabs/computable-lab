/**
 * L2-CHAT-1 — RED-first: the /deck route's universal chat (DeckSurfaceChat +
 * HarnessChatPane) must own the GHOST MOUNT of event-bearing proposals:
 *
 *  - a done result carrying events + resolvedLabwares mounts DECK GHOSTS on
 *    the editor state (actions.setPreview — the same contract AiTabPanel's
 *    onDraftResult uses, AiTabPanel.tsx:608-669) AND the pane's staged
 *    preview card (ChatPreviewCard) applies them (Apply -> appendEvent);
 *  - a REVISE turn (send while ghosts are mounted) REMOUNTS the ghosts with
 *    the new events and appends the revision trail (revisionHistory) to the
 *    mounted preview — AiTabPanel.ghostRemount.test.tsx's lock, through the
 *    universal path;
 *  - MOUNT CONSISTENCY: the pane renders the universal chat (harness-chat-pane
 *    + preview card) — the deck route never falls back to the legacy pane
 *    with an unwired event path.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventEditorPreview, EventEditorState } from '../EventEditorContext'
import type { PlateEvent } from '../../types/events'
import { AiPanelProvider } from '../../shared/context/AiPanelContext'
import { streamAssist } from '../../shared/api/aiClient'
import { DeckSurfaceChat } from './DeckSurfaceChat'
import { HarnessChatPane } from '../../agent/HarnessChatPane'

const mocks = vi.hoisted(() => ({
  setPreview: vi.fn(),
  clearPreview: vi.fn(),
  appendEvent: vi.fn(),
  commitPreview: vi.fn(),
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

vi.mock('../../shared/api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }),
  },
}))

// ChatLog imports the lane-2 answer helper from AiTabPanel, whose real import
// graph reaches pdfjs; stub the helper (the pane under test never needs the
// full legacy pane).
vi.mock('../right-pane/ai/AiTabPanel', () => ({
  clarificationAnswerPrompt: (answer: { optionId?: string }, request: { prompt: string }) =>
    `${request.prompt} — ${answer.optionId ?? 'answer'}`,
}))

vi.mock('../right-pane/ai/WorkstateProposalCard', () => ({
  WorkstateProposalCard: (props: { summary?: string }) => (
    <div data-testid="workstate-card">{props.summary}</div>
  ),
}))

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state = {
    platforms: [],
    platformId: 'platform-x',
    variantId: 'variant-x',
    labwares: {},
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

function renderDeckChat() {
  return render(
    <AiPanelProvider>
      <DeckSurfaceChat />
      <HarnessChatPane />
    </AiPanelProvider>,
  )
}

async function sendThroughPane(text: string) {
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
}

describe('DeckSurfaceChat + HarnessChatPane — universal ghost mount (L2-CHAT-1)', () => {
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
    renderDeckChat()

    // MOUNT CONSISTENCY: the deck route's right pane IS the universal chat.
    expect(screen.getByTestId('harness-chat-pane')).toBeInTheDocument()

    await sendThroughPane('draft an add-material for A1')
    // The universal pane stages the proposal (ChatPreviewCard).
    const card = await screen.findByTestId('chat-preview')
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

    // The pane Apply actually APPLIES (the wired accept handler).
    fireEvent.click(screen.getByTestId('chat-preview-apply'))
    await waitFor(() => expect(mocks.appendEvent).toHaveBeenCalledTimes(1))
    expect(mocks.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'EVT-1' }),
    )
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
    renderDeckChat()
    await sendThroughPane('first draft: add material')
    await screen.findByTestId('chat-preview')
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
    await sendThroughPane('actually read A1 instead')
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
    expect(second.revisionHistory![0].prompt).toBe('first draft: add material')
    expect(typeof second.revisionHistory![0].createdAt).toBe('string')
  })
})
