/**
 * L2-CHAT-1 (universal chat revision loop) — UNIVERSAL PANE locks, mirroring
 * AiTabPanel.honestWall.test.tsx + AiTabPanel.interpretingEscape.test.tsx on
 * the pane the product actually mounts (HarnessChatPane):
 *
 *  - HONEST WALL RENDER: the REPORTED failure (a success that produced
 *    nothing) is visible in plain language in the universal pane — never a
 *    silently-empty plate beside a polished draft. Owned by its turn: a
 *    cleared wall unmounts the node.
 *  - STOP ESCAPE (interpreting window): while a turn is in flight the pane
 *    renders the escape — Stop aborts the stream (cancelStream) and the
 *    composer is the only exit; a staged preview is NOT discarded (Stop
 *    abandons the request, not the draft the deck mounted).
 *
 * Harness: the exact stub-chat + Registrant seam of
 * HarnessChatPane.test.tsx (the pane is a pure consumer of the registered
 * chat — no second AiPanelProvider).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiPanelProvider, useRegisterAiChat } from '../shared/context/AiPanelContext'
import type { UseAiChatReturn } from '../shared/hooks/useAiChat'
import { HarnessChatPane } from './HarnessChatPane'

// The pane's import graph (ChatPreviewCard → deck proposal flow) reaches
// pdfjs-dist; mock it so jsdom doesn't crash on DOMMatrix (same proven
// pattern as HarnessChatPane.test.tsx).
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 0, fingerprints: [''], getPage: () => Promise.resolve(null), destroy: () => undefined }), destroy: () => undefined })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class { render() { return Promise.resolve() } },
}))

afterEach(cleanup)

/** A stub of the registered chat: only the fields the pane actually consumes.
 *  One delivered turn's message: the pane's empty-state guard (no messages)
 *  would otherwise short-circuit before the wall/card can render. */
function stubChat(overrides: Partial<UseAiChatReturn> = {}): UseAiChatReturn {
  const base = {
    messages: [{ id: 'm1', role: 'user' as const, content: 'draft a read' }],
    isStreaming: false,
    isAccepting: false,
    previewEvents: [],
    previewLabwareAdditions: [],
    previewEventStates: new Map(),
    executingApplianceJobIds: new Set<string>(),
    hasPreview: false,
    unresolvedRefs: [],
    honestWall: null,
    inputText: '',
    sendPrompt: vi.fn(),
    cancelStream: vi.fn(),
    acceptPreview: vi.fn(),
    acceptPreviewWithResolutions: vi.fn(),
    rejectPreview: vi.fn(),
    setPreviewEventState: vi.fn(),
    setPreviewEvents: vi.fn(),
    commitAcceptedPreviewEvents: vi.fn(async () => {}),
    clearHistory: vi.fn(),
    applyToGraph: vi.fn(),
    executeInstrumentApplianceJob: vi.fn(async () => {}),
    aiAvailable: true,
    recheckHealth: vi.fn(),
    thinkingMode: false,
    setThinkingMode: vi.fn(),
  }
  return { ...base, ...overrides } as UseAiChatReturn
}

/** Host that registers a chat into the nearest AiPanelProvider (the seam's producer). */
function Registrant({ chat, children }: { chat: UseAiChatReturn; children: React.ReactNode }) {
  useRegisterAiChat(chat)
  return <>{children}</>
}

function renderPane(chat: UseAiChatReturn) {
  return render(
    <AiPanelProvider>
      <Registrant chat={chat}>
        <HarnessChatPane />
      </Registrant>
    </AiPanelProvider>,
  )
}

describe('HarnessChatPane — L2-CHAT-1 universal revision-loop legs', () => {
  it('HONEST WALL RENDER: the REPORTED failure is visible in plain language in the universal pane', () => {
    const chat = stubChat({
      honestWall: 'Draft produced no events and asked no questions. Nothing was proposed and nothing was applied.',
    })
    renderPane(chat)
    const wall = screen.getByTestId('honest-wall')
    expect(wall).toHaveTextContent('Draft produced no events')
    expect(wall).toHaveTextContent('Nothing was proposed and nothing was applied.')
    // L2-CHAT-1 FIX1 D5: the failure node is ASSERTIVE (role=alert) — parity
    // with the legacy ai-tab-honest-wall node (AiTabPanel.tsx:1437), which a
    // screen-reader must announce loudly for a REPORTED failure.
    expect(screen.getByRole('alert')).toBe(wall)
  })

  it('the wall is absent while the turn delivered something or is still in flight', () => {
    const view = renderPane(stubChat({ isStreaming: true }))
    expect(screen.queryByTestId('honest-wall')).toBeNull()
    // A delivered preview: no wall, the card is the surface.
    view.unmount()
    renderPane(
      stubChat({
        hasPreview: true,
        previewEvents: [{ eventId: 'EVT-1', event_type: 'add_material' }] as never,
      }),
    )
    expect(screen.queryByTestId('honest-wall')).toBeNull()
    expect(screen.getByTestId('chat-preview')).toBeInTheDocument()
  })

  it('STOP ESCAPE (interpreting window): while a turn is in flight the pane renders the escape — Stop aborts the stream, and a staged preview is NOT discarded', () => {
    // Mid-turn posture: the stream is in flight AND a preview from the
    // PRIOR turn is still staged (the revise context the legacy lock pins).
    const chat = stubChat({
      isStreaming: true,
      hasPreview: true,
      previewEvents: [{ eventId: 'EVT-0', event_type: 'add_material' }] as never,
    })
    renderPane(chat)

    // The gate measured noStopObserved:true — the pane had NO control at all
    // while interpreting. The escape must exist.
    const stop = screen.getByTestId('interpreting-stop')
    expect(stop).toBeTruthy()

    fireEvent.click(stop)

    // The stream was aborted; the staged draft is NOT discarded (Stop
    // abandons the request, not the draft the deck mounted).
    expect(chat.cancelStream).toHaveBeenCalledTimes(1)
    expect(chat.rejectPreview).not.toHaveBeenCalled()
    expect(screen.getByTestId('chat-preview')).toBeInTheDocument()
  })

  it('no escape when nothing is in flight (the window is closed)', () => {
    renderPane(stubChat())
    expect(screen.queryByTestId('interpreting-stop')).toBeNull()
  })
})
