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
import { useEffect, useState } from 'react'
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
  () => [] as Array<{ aiContext: AiContext; endpoint?: string; scope?: string; scopeStatus?: 'settled' | 'provisional' }>,
)
vi.mock('../../agent/useSurfaceChat', () => ({
  useSurfaceChat: vi.fn((opts: unknown) => {
    surfaceChatCalls.push(opts as { aiContext: AiContext; endpoint?: string; scope?: string; scopeStatus?: 'settled' | 'provisional' })
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

// A deck slice with NO scope key at all — the shipped shape for an unsaved deck
// (`scope?: string` is ABSENT when unsaved; key omission is required under
// exactOptionalPropertyTypes).
function scopelessDeckSliceFixture(): DeckSliceBundle {
  const rest = { ...deckSliceFixture() }
  delete rest.scope
  return rest
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

  // ---------------------------------------------------------------------------
  // L2-THREADSCOPE-FLIP-1 unit 1 — the scope SETTLE state as DATA (scopeStatus).
  // The bridge must distinguish "scope not yet decided" (provisional) from
  // "decided to be absent" (settled), keyed off the deck slice's SCOPE VALUE
  // (never the slice's presence) and bounded by DOOR_REQUIRED_RECHECK_DEADLINE_MS.
  // The existing three legs above are untouched.
  // ---------------------------------------------------------------------------

  it('scopeStatus P-a: a deck door whose slice is scope-less on the first flush is provisional; the scope value arriving settles it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers()
    // The routed-deck ordering (DeckChatSlice.tsx:151): the bundle is published
    // scope-less first (state.eventGraphId unresolved), then re-published WITH
    // the scope — the slice's PRESENCE is never the signal, its scope value is.
    // Encoded shape (documented default 'settled', spec §3a): the options carry
    // scopeStatus 'provisional' while the scope is undecided, NO key once
    // settled — the absence IS the settled default.
    function LateScopeDeckPublisher() {
      const [loaded, setLoaded] = useState(false)
      useEffect(() => {
        const t = window.setTimeout(() => setLoaded(true), 50)
        return () => window.clearTimeout(t)
      }, [])
      usePublishSurfaceSlice(
        'deck',
        loaded ? deckSliceFixture() : scopelessDeckSliceFixture(),
      )
      return null
    }
    render(
      <AiPanelProvider>
        <SurfaceChatBridge host="run-workspace" base={{ context: baseRunContext() }} />
        <LateScopeDeckPublisher />
      </AiPanelProvider>,
    )
    // First flush: the slice is published but scope-less (a LATER sibling's
    // render-phase write lands after the registrar's first render — the D1
    // ordering) => the scope is NOT YET DECIDED.
    const first = surfaceChatCalls[0]!
    expect(first.scopeStatus).toBe('provisional')
    expect(first.scope).toBeUndefined()
    // The settle EVENT: the slice's scope value arrives (a beat later) — the
    // status is data: settled (the scopeStatus key absent: the default), no timer.
    act(() => {
      vi.advanceTimersByTime(50)
    })
    const settled = surfaceChatCalls[surfaceChatCalls.length - 1]!
    expect(settled.scopeStatus).toBeUndefined()
    expect('scopeStatus' in settled).toBe(false)
    expect(settled.scope).toBe('EG-1')
  })

  it('scopeStatus P-b: a non-deck surface is settled on the FIRST flush with zero timer advancement (no global deadline)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers()
    // record-host declares NO providers (config/chat/chat-hosts.yaml); its base
    // scope is the page-local record id — decided at first flush. A GLOBAL
    // (provider-agnostic) deadline hook would arm a timer and hold this door
    // for DOOR_REQUIRED_RECHECK_DEADLINE_MS — the zero-advance assertion below
    // is the guard against that.
    const recordBase: AiContext = {
      surface: 'literature',
      summary: 'Record REC-1',
      surfaceContext: { recordId: 'REC-1', studyId: 'STU-9' },
    }
    render(
      <AiPanelProvider>
        <SurfaceChatBridge host="record-host" base={{ context: recordBase, scope: 'REC-1' }} />
      </AiPanelProvider>,
    )
    const first = surfaceChatCalls[0]!
    // Settled on the FIRST flush: no provisional marker (the documented
    // default 'settled'), with the page-local scope forwarded.
    expect(first.scopeStatus).toBeUndefined()
    expect('scopeStatus' in first).toBe(false)
    expect(first.scope).toBe('REC-1')
    // Zero timer advancement: the settle deadline must not have been armed for
    // a provider-less door (no added latency — the P4 no-regression shape).
    expect(vi.getTimerCount()).toBe(0)
  })

  it('scopeStatus P-c: no settle within the deadline resolves to a DECIDED settled-absent (never provisional forever)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers()
    // A scope-less deck slice that NEVER gains a scope (the run deck's bounded
    // release path, spec §3a): the door declares deck (required) so the window
    // is armed; the loud-fail throw is untouched (the slice IS published — only
    // its scope value is absent), so the status alone decides.
    function ScopelessDeckPublisher() {
      usePublishSurfaceSlice('deck', scopelessDeckSliceFixture())
      return null
    }
    render(
      <AiPanelProvider>
        <SurfaceChatBridge host="run-workspace" base={{ context: baseRunContext() }} />
        <ScopelessDeckPublisher />
      </AiPanelProvider>,
    )
    // Provisional while the window is open (the slice is published, its scope
    // value is not — presence is not the signal).
    expect(surfaceChatCalls[0]!.scopeStatus).toBe('provisional')
    // Bounded release: at the deadline the status resolves to a DECIDED value.
    // Exact resolved shape: settled-absent — NO scopeStatus key (the
    // documented default 'settled'), NO scope key (absent — the server's "_"
    // bucket), no throw.
    act(() => {
      vi.advanceTimersByTime(DOOR_REQUIRED_RECHECK_DEADLINE_MS)
    })
    const decided = surfaceChatCalls[surfaceChatCalls.length - 1]!
    expect(decided.scopeStatus).toBeUndefined()
    expect('scopeStatus' in decided).toBe(false)
    expect(decided.scope).toBeUndefined()
    expect('scope' in decided).toBe(false)
  })

  it('L2-CLARIFY-CARD-1 D2(b) cold-mount: deck door with scopePending=true holds provisional past the deadline (does not settle to absent)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers()
    // A scopeless deck slice — the host's scope has not resolved yet.
    function ScopelessDeckPublisher() {
      usePublishSurfaceSlice('deck', scopelessDeckSliceFixture())
      return null
    }
    render(
      <AiPanelProvider>
        <SurfaceChatBridge host="run-workspace" base={{ context: baseRunContext() }} scopePending={true} />
        <ScopelessDeckPublisher />
      </AiPanelProvider>,
    )
    // Before deadline: provisional (the slice is published scope-less)
    expect(surfaceChatCalls[0]!.scopeStatus).toBe('provisional')
    // After deadline: STILL provisional — the host explicitly says
    // scopePending=true, so the deadline does NOT settle to absent.
    // The IO gate stays held until the host reports no longer pending.
    act(() => {
      vi.advanceTimersByTime(DOOR_REQUIRED_RECHECK_DEADLINE_MS)
    })
    const afterDeadline = surfaceChatCalls[surfaceChatCalls.length - 1]!
    expect(afterDeadline.scopeStatus).toBe('provisional')
  })
})
