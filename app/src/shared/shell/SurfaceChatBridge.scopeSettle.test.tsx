/**
 * L2-THREADSCOPE-FLIP-1 unit 3 — registrar-seam PIN MATRIX P2/P3/P5/P6 (spec §5).
 * Pins the ruling's C-2/C-3/C-4 where they are OBSERVABLE — at the bridge. The
 * REAL useSurfaceChat/useAiChat runs (the unit-2 gate under test); the wire is
 * captured by a header-keyed fetch router (the idiom of
 * DeckSurfaceChat.threadScope.test.tsx). P2/P3/P5 are RED pins: they FAIL on
 * the pre-unit-2 trunk (fc4acd17) — proven by the gate-stripped red-demo file —
 * and at the unit-1/2 HEAD they are GREEN regression guards for the gate.
 * P6 is a guard (the §3a hint): it passes by construction (the predicate is
 * unit-1's) and pins the zero-added-latency settle.
 */
import { act, cleanup, render } from '@testing-library/react'
import { useEffect, useState, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiContext } from '../../types/aiContext'

vi.mock('../../shared/api/aiClient', () => ({
  streamAssist: vi.fn(async function* () { yield { type: 'done', result: { success: true, notes: [] } } }),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))
vi.mock('../../shared/api/client', () => ({
  apiClient: { getRecord: vi.fn(), getPromptTemplate: vi.fn().mockResolvedValue({ error: 'nf' }) },
}))
vi.mock('../../shared/ai/useWorkstateProposalFlow', () => ({
  useWorkstateProposalFlow: () => ({ card: null, proposeWorkstate: vi.fn(), acceptWorkstate: vi.fn(), rejectWorkstate: vi.fn(), handleAgentAction: vi.fn() }),
}))

// Header-keyed capture router: thread GET/LIST answer EMPTY shapes; everything
// else (health, templates) is a no-op ok. The REAL aiThreadClient transport runs.
const cap: Array<{ u: string; m: string; h: Record<string, string> }> = []
vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = String(input)
  const m = (init?.method ?? 'GET').toUpperCase()
  const h = Object.fromEntries(Object.entries(init?.headers ?? {}).map(([k, v]) => [String(k), String(v)]))
  cap.push({ u, m, h })
  const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b })
  if (u.includes('/api/ai/threads/')) {
    if (u.endsWith('/threads')) return ok({ threads: [] })
    return ok({ endpoint: 'browser', userId: 'USR', messages: [], mentions: [], updatedAt: '1970-01-01T00:00:00.000Z' })
  }
  return ok({})
}))

import { AiPanelProvider, useAiPanel } from '../../shared/context/AiPanelContext'
import { usePublishSurfaceSlice, type DeckSliceBundle } from '../../shared/context/SurfaceSliceStore'
import { SurfaceChatBridge, DOOR_REQUIRED_RECHECK_DEADLINE_MS } from './SurfaceChatBridge'
import type { UseAiChatReturn } from '../hooks/useAiChat'

const map = () => JSON.parse(sessionStorage.getItem('cl.ai-thread-tab-ids') ?? '{}') as Record<string, string>
const io = () => cap.filter((c) => c.u.includes('/api/ai/threads/'))
const gets = () => io().filter((c) => c.m === 'GET' && !c.u.endsWith('/threads'))
const posts = () => io().filter((c) => c.m === 'POST')
async function flush() { await act(async () => {}); for (let i = 0; i < 4; i++) await Promise.resolve(); await act(async () => {}) }
function bundle(scope?: string): DeckSliceBundle {
  return { endpoint: 'event-editor', surface: 'event-editor', summary: 'Deck', ...(scope ? { scope } : {}), contextPatch: { eventGraphId: 'EVG-1', placementCount: 0, eventCount: 1, events: [], labwares: [] }, handlers: { onAcceptEvent: () => {} } }
}
const base: AiContext = { surface: 'analysis', summary: '', surfaceContext: {} }
// Routed-deck ordering (DeckChatSlice.tsx:151): the deck slice publishes
// scope-less, its scope VALUE a beat later.
function LateDeck({ d = 50 }: { d?: number }) {
  const [l, setL] = useState(false)
  useEffect(() => { const t = window.setTimeout(() => setL(true), d); return () => window.clearTimeout(t) }, [])
  usePublishSurfaceSlice('deck', l ? bundle('EVG-1') : bundle())
  return null
}
function NoScopeDeck() { usePublishSurfaceSlice('deck', bundle()); return null }
const sink: { chat: UseAiChatReturn | null } = { chat: null }
function Probe() { sink.chat = useAiPanel()?.chat ?? null; return null }
function Door({ host, base, scopePending, children }: { host: string; base: { context: AiContext; scope?: string }; scopePending?: boolean; children?: ReactNode }) {
  return <AiPanelProvider><SurfaceChatBridge host={host} base={base} scopePending={scopePending} />{children}<Probe /></AiPanelProvider>
}

describe('SurfaceChatBridge — scope-settle pin matrix (unit 3: P2/P3/P5/P6)', () => {
  afterEach(() => { cleanup(); cap.length = 0; sessionStorage.clear(); sink.chat = null; vi.useRealTimers() })

  it('P2 (C-3): cold-mount === live — the late EVG scope => first IO carries it, ONE map key; a cold remount reuses the same (scope, threadId)', async () => {
    vi.useFakeTimers()
    const mount = () => render(<Door host="event-editor" base={{ context: base }}><LateDeck /></Door>)
    const r1 = mount()
    await flush()
    expect(io()).toHaveLength(0)             // scope still undecided => zero IO
    expect(map()).toEqual({})
    await act(async () => { vi.advanceTimersByTime(50) }); await flush()  // scope arrives
    const g = gets(); expect(g).toHaveLength(1)
    expect(g[0]!.h['x-cl-thread-scope']).toBe('EVG-1')
    const m1 = map(); expect(Object.keys(m1)).toEqual(['EVG-1'])
    expect(g[0]!.h['x-cl-thread-id']).toBe(m1['EVG-1'])
    r1.unmount(); cap.length = 0            // cold remount, sessionStorage kept
    mount()
    await flush(); expect(io()).toHaveLength(0)
    await act(async () => { vi.advanceTimersByTime(50) }); await flush()
    const g2 = gets(); expect(g2).toHaveLength(1)
    expect(g2[0]!.h['x-cl-thread-scope']).toBe('EVG-1')
    expect(g2[0]!.h['x-cl-thread-id']).toBe(m1['EVG-1'])   // same (scope, threadId)
    expect(map()).toEqual({ 'EVG-1': m1['EVG-1'] })        // still one key
  })

  it('P3 (C-2 bounded): a deck slice that never carries a scope — zero IO before the deadline, ONE settled-absent GET + one map key after', async () => {
    vi.useFakeTimers()
    render(<Door host="event-editor" base={{ context: base }}><NoScopeDeck /></Door>)
    await flush()
    expect(vi.getTimerCount()).toBeGreaterThan(0)  // the settle deadline IS armed
    expect(io()).toHaveLength(0)                   // and NOTHING before it
    expect(map()).toEqual({})
    await act(async () => { vi.advanceTimersByTime(DOOR_REQUIRED_RECHECK_DEADLINE_MS) }); await flush()
    const g = gets(); expect(g).toHaveLength(1)
    expect('x-cl-thread-scope' in g[0]!.h).toBe(false)  // settled-absent
    expect(posts()).toHaveLength(0)
    expect(Object.keys(map())).toEqual([''])
  })

  it('P5 (C-4): a provisional send writes nothing; on release the held turn POSTs under the settled scope only', async () => {
    vi.useFakeTimers()
    render(<Door host="event-editor" base={{ context: base }}><LateDeck /></Door>)
    await flush()
    expect(map()).toEqual({}); expect(io()).toHaveLength(0)
    await act(async () => { void sink.chat!.sendPrompt('hold me') })
    await flush()
    expect(posts()).toHaveLength(0)               // NOTHING written under provisional
    // Picker methods during provisional hold — assert they write nothing
    await act(async () => { await sink.chat!.listThreads!() })
    await act(async () => { sink.chat!.newThread!() })
    await act(async () => { sink.chat!.switchThread!('switched-id') })
    await flush()
    expect(Object.keys(map())).toEqual([])         // no no-scope key minted by picker
    expect(io()).toHaveLength(0)                 // no thread call at all — the LIST GET included
    // Scope settles — the ONLY subsequent GET carries the settled scope
    await act(async () => { vi.advanceTimersByTime(50) }); await flush()  // scope arrives
    const g = gets(); expect(g).toHaveLength(1)
    expect(g[0]!.h['x-cl-thread-scope']).toBe('EVG-1')
    expect(Object.keys(map())).toEqual(['EVG-1'])
    const p = posts(); expect(p.length).toBeGreaterThanOrEqual(1)
    for (const x of p) expect(x.h['x-cl-thread-scope']).toBe('EVG-1')  // no scope-less write
  })

  it('P6 (guard, §3a hint): project-deck-tab with scopePending={false} settles on the first flush — GET with the base scope, one map key, NO settle timer armed (zero added latency)', async () => {
    vi.useFakeTimers()
    render(<Door host="project-deck-tab" base={{ context: base, scope: 'STU-x' }} scopePending={false} />)
    await flush()
    const g = gets(); expect(g).toHaveLength(1)
    expect(g[0]!.h['x-cl-thread-scope']).toBe('STU-x')
    expect(Object.keys(map())).toEqual(['STU-x'])
    expect(g[0]!.h['x-cl-thread-id']).toBe(map()['STU-x'])
    expect(vi.getTimerCount()).toBe(0)  // zero added latency: the deadline is never armed
  })

  it('P7 (C-2 two-window): each provisional window gets its own bounded release', async () => {
    vi.useFakeTimers()
    // ToggleableDeck starts scope-less, then gains scope on a flag, then loses it again.
    // The component stays mounted the whole time — two provisional windows on ONE door instance.
    const toggle = { scopeless: true }
    function ToggleableDeck() {
      usePublishSurfaceSlice('deck', toggle.scopeless ? bundle() : bundle('EVG-1'))
      return null
    }
    const { rerender } = render(<Door host="event-editor" base={{ context: base }}><ToggleableDeck /></Door>)
    // Window 1: scope-less — deadline is armed
    await flush()
    expect(io()).toHaveLength(0)
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    // Advance past deadline: settles absent
    await act(async () => { vi.advanceTimersByTime(DOOR_REQUIRED_RECHECK_DEADLINE_MS) })
    await flush()
    expect(gets()).toHaveLength(1)  // settled-absent GET from window-1 deadline
    // Scope arrives: settled scope
    toggle.scopeless = false
    rerender(<Door host="event-editor" base={{ context: base }}><ToggleableDeck /></Door>)
    await flush()
    // Window 2: scope leaves again — second provisional window
    cap.length = 0
    toggle.scopeless = true
    rerender(<Door host="event-editor" base={{ context: base }}><ToggleableDeck /></Door>)
    await flush()
    // Second window must NOT settle immediately — no IO before its deadline
    expect(io()).toHaveLength(0)
    expect(vi.getTimerCount()).toBeGreaterThan(0)  // a new timer IS armed for window 2
    // Only AFTER advancing the second deadline does IO fire
    await act(async () => { vi.advanceTimersByTime(DOOR_REQUIRED_RECHECK_DEADLINE_MS) })
    await flush()
    expect(gets()).toHaveLength(1)
  })
})
