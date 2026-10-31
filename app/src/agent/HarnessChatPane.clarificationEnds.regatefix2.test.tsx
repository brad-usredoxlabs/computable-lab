/**
 * L2-CHAT-1 regatefix2 — D3 (HIGH): a clarification turn NEVER completes in
 * the pane. The gate: 45s after Send the assistant bubble still reads
 * "Prompt received. Starting compiler pipeline...", Cancel is still up, Send
 * is still disabled — while the server finished in 4.3s and the hook's OWN
 * state (proven live via fiber inspection) had the turn completed
 * (isStreaming=false, the clarification rendered in chat.messages).
 *
 * Mechanism (first-hand): the pane (HarnessChatPane) consumes the registered
 * chat through AiPanelContext's chatRef + chatVersion, and useRegisterAiChat
 * bumps that version ONLY on mount/unmount. A turn's state changes
 * (streaming flip, message content, clarification) never re-register, so the
 * pane keeps reading the pre-turn snapshot until a HOST re-render recreates
 * the pane element (the ghost test's REACTIVITY NOTE documents the seam
 * weakness and works around it with a fresh-element reread).
 *
 * This lock: a REAL useAiChat turn that ends in a clarification (the gate's
 * exact terminal shape — done, success, events=0, a typed
 * clarificationRequest) must complete IN THE PANE with NO host re-render:
 * the placeholder text is replaced by the clarification, Cancel is gone, and
 * Send is re-enabled — asserted from the FIRST render's stable tree.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import { AiPanelProvider, useRegisterAiChat } from '../shared/context/AiPanelContext'
import { useAiChat } from '../shared/hooks/useAiChat'
import { streamAssist } from '../shared/api/aiClient'
import { HarnessChatPane } from './HarnessChatPane'
import type { AiContext } from '../types/aiContext'

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

vi.mock('../shared/api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))

vi.mock('../shared/api/aiThreadClient', () => ({
  getThread: vi.fn().mockRejectedValue(new Error('no thread')),
  appendThreadMessage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }),
  },
}))

// The workstate flow pulls OpenTabsProvider + navigation into the render
// (proven pattern: the ghost test) — out of scope for this lock.
vi.mock('../shared/ai/useWorkstateProposalFlow', () => ({
  useWorkstateProposalFlow: () => ({
    card: null,
    proposeWorkstate: vi.fn(),
    acceptWorkstate: vi.fn(),
    rejectWorkstate: vi.fn(),
    handleAgentAction: vi.fn(),
  }),
}))

// The gate's exact terminal frame: done, success, NO events, one typed
// clarificationRequest (unknown-noun answer; D4's re-ask path is out of
// scope — the shape is the real server frame from the SSE probe).
const CLARIFY_FRAMES = [
  { type: 'status', message: 'Received — preparing agent…' },
  {
    type: 'done',
    result: {
      success: true,
      events: [],
      clarificationRequests: [
        {
          id: 'unresolved-c-05c08a4866',
          kind: 'labware',
          prompt:
            'The draft names "plate P1" and the lab spine could not bind it (unknown-noun). Choose what it is, or create a local term.',
          origin: 'harness',
          entityType: 'labware',
          menuProvider: '/l',
          query: 'plate P1',
          options: [],
          allowCreateLocal: true,
        },
      ],
      notes: [],
    },
  },
]

const aiContext: AiContext = {
  surface: 'event-editor',
  summary: 'Deck EVG-a5-fixture-method — manual / manual_freeform',
  surfaceContext: {
    runId: 'RUN-2026-09-19-run-vwr8',
    eventGraphId: 'EVG-a5-fixture-method',
    platformId: 'manual',
    variantId: 'manual_freeform',
    placementCount: 1,
    eventCount: 0,
    labwares: [{ labwareId: 'L1', labwareType: 'plate', name: 'gate plate', rows: 8, columns: 12 }],
    eventSummary: 'No events yet.',
    availableVerbs: [],
    selection: null,
  },
  editorMode: 'deck',
}

/**
 * Mirror the PRODUCTION tree (DeckHostPage): the chat-owning surface
 * (DeckSurfaceChat) registers the chat and renders NOTHING; the pane
 * (HarnessChatPane, mounted by RightPane) is a SIBLING consumer — not a
 * child of the registrant. The registrant's own re-renders (the hook's
 * state changes) must NOT re-render the pane's subtree (a stable element
 * from the provider's children — the children-element bailout the ghost
 * test's REACTIVITY NOTE documents). A turn end that provides no host
 * re-render therefore leaves the pane stale unless the pane subscribes to
 * the registration itself.
 */
function renderClarificationTurn() {
  function DeckChat() {
    // Mirrors DeckSurfaceChat: own the hook, register it, render null.
    const chat = useAiChat({ aiContext })
    useRegisterAiChat(chat)
    return null
  }
  return render(
    <AiPanelProvider>
      <DeckChat />
      <HarnessChatPane />
    </AiPanelProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(streamAssist).mockImplementation(async function* () {
    for (const e of CLARIFY_FRAMES) yield e as never
  })
})

afterEach(cleanup)

describe('HarnessChatPane — regatefix2 D3: a clarification turn completes IN the pane', () => {
  it('the turn ends on the done frame without any host re-render: the clarification renders, Cancel is gone, Send re-enables', async () => {
    renderClarificationTurn()

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'add a new plate P1 and transfer A1->P1' } })
    const sendButton = () => screen.getByRole('button', { name: 'Send' })
    fireEvent.click(sendButton())

    // While streaming the placeholder is up and Cancel is offered.
    await waitFor(() => {
      expect(screen.getByText('Prompt received. Starting compiler pipeline...')).toBeInTheDocument()
    })
    expect(screen.getByTestId('interpreting-stop')).toBeInTheDocument()
    expect((sendButton() as HTMLButtonElement).disabled).toBe(true)

    // The done frame lands (~instant here; ~4.3s on the live server).
    // The pane must see the turn's END from its own stable element — NO
    // re-render call between here and the assertions below. (Before the
    // fix: the pane kept the pre-turn snapshot — Cancel still up, no
    // clarification card — until a page reload, 45s+ after the server
    // finished.)
    await waitFor(
      () => {
        expect(screen.queryByTestId('interpreting-stop')).toBeNull()
      },
      { timeout: 5000 },
    )
    // The clarification card rendered IN the pane (the gate's "the card
    // only appears after a page reload" — it must not need the reload).
    // The assistant bubble's accumulated status line is legitimate content
    // (buildAssistantContent keeps the status trail; the clarification
    // RENDERS as the card below it — the same shape a reload shows).
    expect(
      screen.getByTestId('chat-log-request-unresolved-c-05c08a4866'),
    ).toHaveTextContent('unknown-noun')
    // The turn is CLOSED: the composer's textarea was cleared by Send, so
    // typing re-enables it — impossible while isStreaming is still up
    // (Send is `disabled={isStreaming || !prompt.trim()}`). (The composer is
    // the LAST textbox: the clarification card's picker input sits inside
    // the message list above it.)
    const composer = screen.getAllByRole('textbox').pop() as HTMLTextAreaElement
    fireEvent.change(composer, { target: { value: 'it is the gate plate' } })
    expect((sendButton() as HTMLButtonElement).disabled).toBe(false)
  })
})
