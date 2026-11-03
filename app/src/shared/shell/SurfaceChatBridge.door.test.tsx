/**
 * CHATHOST-CONSOLIDATE-1 T-2 — the ONE registrar's loud door contract.
 *
 * RED-first (spec §8.2 T-2): mount the registrar (SurfaceChatBridge) with
 * host="run-workspace" and NO deck slice published -> it must THROW
 * ChatDoorMisconfiguredError whose message names `run-workspace` AND `deck`
 * (never a silent empty pane). Then publish the deck slice -> the registered
 * chat's AiContext carries the deck fields (parity with the retargeted
 * DeckSurfaceChat.test.tsx pins: labwares, events, selectedWells object form,
 * the deck fields).
 *
 * Written against the one registrar's CONTRACT; RED until the STEP-3 product
 * (SurfaceSliceStore + collectSurfaceContext + the registrar rewrite) lands.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiContext } from '../../types/aiContext'

// The AI seams (same idiom as the host-page pins + the focus pin).
vi.mock('../../shared/api/aiThreadClient', () => ({
  listThreads: vi.fn(async () => []),
  createThread: vi.fn(async () => ({ id: 't1' })),
  getThread: vi.fn().mockRejectedValue(new Error('no thread')),
  listMessages: vi.fn(async () => []),
  streamMessage: vi.fn(async function* () {}),
  cancelMessage: vi.fn(async () => {}),
  appendThreadMessage: vi.fn(async () => {}),
  deleteThread: vi.fn(async () => {}),
  renameThread: vi.fn(async () => {}),
  setThreadPinned: vi.fn(async () => {}),
}))
vi.mock('../../shared/api/aiClient', () => ({
  streamAssist: vi.fn(async function* () {}),
  getAiHealth: vi.fn(async () => ({ available: true })),
}))
vi.mock('../../shared/ai/useWorkstateProposalFlow', () => ({
  useWorkstateProposalFlow: () => ({
    card: null,
    proposeWorkstate: vi.fn(), acceptWorkstate: vi.fn(), rejectWorkstate: vi.fn(),
    handleAgentAction: vi.fn(),
  }),
}))
vi.mock('pdfjs-dist', () => {
  const fakeDoc = { promise: Promise.resolve({ numPages: 0, fingerprints: [''], getPage: () => Promise.resolve(null), destroy: () => undefined }), destroy: () => undefined }
  return { getDocument: vi.fn(() => fakeDoc), GlobalWorkerOptions: { workerSrc: '' }, TextLayer: class { render() { return Promise.resolve() } } }
})

// Capture the (aiContext, endpoint, scope, handlers) the registrar forwards to
// useSurfaceChat (the wire seam under test). A BARE mock (the T-2 contract is
// the forwarded options — the parity pin's idiom; the real useAiChat hydration
// is the host-page pins' concern, not this one's).
const surfaceChatCalls = vi.hoisted(
  () => [] as Array<{ aiContext: AiContext; endpoint?: string; scope?: string }>,
)
vi.mock('../../agent/useSurfaceChat', () => ({
  useSurfaceChat: vi.fn((opts: unknown) => {
    surfaceChatCalls.push(opts as { aiContext: AiContext; endpoint?: string; scope?: string })
    return { chat: {}, flow: {} }
  }),
}))

import { AiPanelProvider } from '../../shared/context/AiPanelContext'
import { usePublishSurfaceSlice, type DeckSliceBundle } from '../../shared/context/SurfaceSliceStore'
import { SurfaceChatBridge, ChatDoorMisconfiguredError } from './SurfaceChatBridge'

function baseRunContext(): AiContext {
  return {
    surface: 'run-workspace',
    summary: 'Run workspace: RUN-1',
    surfaceContext: { runId: 'RUN-1', studyId: 'STU-1', mode: 'plan' },
    editorMode: 'plan',
  }
}

// A deck-slice bundle with the deck PARITY fields (labwares/events/selectedWells/
// deck fields) — the same shape the retargeted DeckSurfaceChat.test.tsx pins.
function deckSliceFixture(): DeckSliceBundle {
  return {
    endpoint: 'event-editor',
    surface: 'event-editor',
    summary: 'Deck EG-1 — PF-1 / VAR-1',
    scope: 'EG-1',
    contextPatch: {
      eventGraphId: 'EG-1',
      runId: 'RUN-1',
      platformId: 'PF-1',
      variantId: 'VAR-1',
      vocabPackId: 'VP-1',
      placementCount: 0,
      eventCount: 1,
      events: [],
      labwares: [],
      selectedWells: { labwareId: 'LWI-1', wells: ['A1', 'A2'] },
    },
    handlers: { onAcceptEvent: () => {} },
  }
}

function DeckPublisher() {
  usePublishSurfaceSlice('deck', deckSliceFixture())
  return null
}

describe('SurfaceChatBridge — the ONE registrar door contract (T-2)', () => {
  afterEach(() => {
    cleanup()
    surfaceChatCalls.length = 0
    vi.restoreAllMocks()
  })

  it('throws ChatDoorMisconfiguredError naming the host AND the missing required slice (no deck slice published)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let thrown: unknown
    try {
      render(
        <AiPanelProvider>
          <SurfaceChatBridge host="run-workspace" base={{ context: baseRunContext() }} />
        </AiPanelProvider>,
      )
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(ChatDoorMisconfiguredError)
    const msg = String((thrown as Error).message)
    expect(msg).toContain('run-workspace')
    expect(msg).toContain('deck')
  })

  it('publishes the deck slice -> the forwarded AiContext carries the deck fields (parity)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <AiPanelProvider>
        <DeckPublisher />
        <SurfaceChatBridge host="run-workspace" base={{ context: baseRunContext() }} />
      </AiPanelProvider>,
    )
    expect(surfaceChatCalls.length).toBeGreaterThan(0)
    const opts = surfaceChatCalls[0]!
    const ctx = opts.aiContext.surfaceContext
    // The deck PARITY fields (the retargeted DeckSurfaceChat.test.tsx pin shape).
    expect(ctx.labwares).toEqual([])
    expect(Array.isArray(ctx.events)).toBe(true)
    expect(ctx.selectedWells).toEqual({ labwareId: 'LWI-1', wells: ['A1', 'A2'] })
    expect(ctx.eventGraphId).toBe('EG-1')
    // The run door keeps its own surface (the deck slice's surface wins only for
    // a generic `analysis` base — the project-deck-tab case).
    expect(opts.aiContext.surface).toBe('run-workspace')
    // The deck slice's endpoint + scope are forwarded (the deck thread store).
    expect(opts.endpoint).toBe('event-editor')
    expect(opts.scope).toBe('EG-1')
  })
})
