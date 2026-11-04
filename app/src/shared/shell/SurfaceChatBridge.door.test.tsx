/**
 * CHATHOST-CONSOLIDATE-1 T-2 — the ONE registrar's loud door contract.
 *
 * RED-first (spec §8.2 T-2): mount the registrar (SurfaceChatBridge) with
 * host="run-workspace" and NO deck slice published -> it must THROW
 * ChatDoorMisconfiguredError whose message names `run-workspace` AND `deck`
 * (never a silent empty pane). Then publish the deck slice -> the registered
 * chat's AiContext carries the deck fields (parity with the retargeted deck
 * parity pins: labwares, events, `selectedWells` object form, the deck
 * fields).
 *
 * D1 (browser-gate fix run): the loud-fail is a BOUNDED RE-CHECK, not a
 * first-render throw. The deck slice is published by DeckChatSlice from inside
 * EventEditorProvider — a sibling that commits a beat AFTER the door's first
 * render (and StrictMode's double-mount / a keyed remount's clear-on-unmount
 * re-renders the door on a transiently empty slice ref — SurfaceSliceStore.tsx
 * documents that exact window). So the two legs are:
 *   (a) NEGATIVE — a required provider that is NEVER published still throws the
 *       named ChatDoorMisconfiguredError, but only after the bounded re-check
 *       deadline has elapsed (advance DOOR_REQUIRED_RECHECK_DEADLINE_MS with
 *       fake timers); the assertion is unchanged (names the host + the slice).
 *   (b) POSITIVE (the D1 ordering pin, RED on pre-fix code) — a door whose
 *       declared required provider publishes AFTER the first render (a later
 *       sibling whose render-phase write lands after the registrar's first
 *       render, mirroring the real ordering) renders with ZERO thrown
 *       ChatDoorMisconfiguredError during the initial render/publish window and
 *       recovers with the deck fields merged.
 *
 * Written against the one registrar's CONTRACT; RED until the STEP-3 product
 * (SurfaceSliceStore + collectSurfaceContext + the registrar rewrite) lands.
 */
import { act, cleanup, render } from '@testing-library/react'
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
import {
  SurfaceChatBridge,
  ChatDoorMisconfiguredError,
  DOOR_REQUIRED_RECHECK_DEADLINE_MS,
} from './SurfaceChatBridge'

function baseRunContext(): AiContext {
  return {
    surface: 'run-workspace',
    summary: 'Run workspace: RUN-1',
    surfaceContext: { runId: 'RUN-1', studyId: 'STU-1', mode: 'plan' },
    editorMode: 'plan',
  }
}

// A deck-slice bundle with the deck PARITY fields (labwares/events/selectedWells/
// deck fields) — the same shape the retargeted deck parity pins assert.
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

// A deck publisher that renders BEFORE the registrar in the tree — the
// well-ordered case (the ref is populated by the registrar's first render).
// Used by the parity leg.
function DeckPublisher() {
  usePublishSurfaceSlice('deck', deckSliceFixture())
  return null
}

describe('SurfaceChatBridge — the ONE registrar door contract (T-2)', () => {
  afterEach(() => {
    cleanup()
    surfaceChatCalls.length = 0
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('throws ChatDoorMisconfiguredError naming the host AND the missing required slice (no deck slice published)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers()
    let thrown: unknown
    try {
      render(
        <AiPanelProvider>
          <SurfaceChatBridge host="run-workspace" base={{ context: baseRunContext() }} />
        </AiPanelProvider>,
      )
      // D1: the loud-fail is a BOUNDED RE-CHECK, not a first-render throw — the
      // first render (deadline not yet met) must NOT throw. Flush the
      // registrar's effects so the deadline timer is scheduled...
      act(() => {})
      // ...then advance PAST the bounded window. The deadline state flip
      // schedules a re-render; wrapping the advance in act runs the timer and
      // flushes the re-render atomically. A required provider that is NEVER
      // published STILL throws loudly here (the unchanged contract).
      act(() => {
        vi.advanceTimersByTime(DOOR_REQUIRED_RECHECK_DEADLINE_MS)
      })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(ChatDoorMisconfiguredError)
    const msg = String((thrown as Error).message)
    expect(msg).toContain('run-workspace')
    expect(msg).toContain('deck')
  })

  it('D1 ordering: a required provider that publishes AFTER the first render throws ZERO ChatDoorMisconfiguredError in the initial window, then recovers with the deck fields', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers()
    // The REAL D1 ordering, modelled as a LATER sibling: React renders the
    // registrar first (its render reads the slice ref -> EMPTY, because the
    // deck publisher is still below it), then the deck publisher performs its
    // render-phase write. The effect-phase bump then re-renders the registrar
    // INSIDE the initial publish window with the populated ref — exactly the
    // ordering the gate's first render saw on /runs/<runId> and /deck/<id>.
    function LateDeckPublisher() {
      usePublishSurfaceSlice('deck', deckSliceFixture())
      return null
    }
    // A pre-fix render-body throw would escape render() here (the first render
    // reads an empty ref and the door declares `deck` required) — so reaching
    // this point un-thrown is itself the zero-throw pin.
    render(
      <AiPanelProvider>
        <SurfaceChatBridge host="run-workspace" base={{ context: baseRunContext() }} />
        <LateDeckPublisher />
      </AiPanelProvider>,
    )
    // The first render committed with the ref EMPTY (the publisher is a later
    // sibling — the real D1 ordering): the first forwarded context carries NO
    // deck fields (proves the late ordering, not a vacuous "deck present").
    expect(surfaceChatCalls.length).toBeGreaterThan(0)
    const first = surfaceChatCalls[0]!
    expect(first.aiContext.surfaceContext.eventGraphId).toBeUndefined()
    // Flush the publisher's effect-phase bump: the registrar re-renders inside
    // the initial publish window (deadline not yet met) and re-wires with the
    // deck fields merged (the recovered parity shape) — still ZERO thrown.
    act(() => {})
    const recovered = surfaceChatCalls[surfaceChatCalls.length - 1]!
    expect(recovered.aiContext.surfaceContext.eventGraphId).toBe('EG-1')
    expect(recovered.aiContext.surfaceContext.selectedWells).toEqual({ labwareId: 'LWI-1', wells: ['A1', 'A2'] })
    expect(recovered.endpoint).toBe('event-editor')
    expect(recovered.scope).toBe('EG-1')
    // Advance PAST the bounded re-check deadline: the required slice is now
    // published, so the re-check passes — still zero thrown errors (not an
    // indefinite wait, not a silent empty pane).
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(DOOR_REQUIRED_RECHECK_DEADLINE_MS)
      })
    }).not.toThrow()
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
    // The deck PARITY fields (the retargeted deck parity pin shape).
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
