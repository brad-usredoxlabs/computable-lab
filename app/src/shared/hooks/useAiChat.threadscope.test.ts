/**
 * L2-THREADSCOPE-FLIP-1 unit 2 — the CONSUMER gate (RED-first).
 * While scopeStatus === 'provisional' the pane must NOT hydrate and must
 * NOT persist (C-2/C-4): the lazy-mint and hydration effects RETURN EARLY
 * (no mint/activation/GET); persistence is activation-keyed, so holding
 * activation holds persistence. On settle the normal re-key path hydrates
 * exactly ONCE (C-3); the single threadTabIds map is never minted early.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import type { AiContext } from '../../types/aiContext'
import * as threadTabIds from '../api/threadTabIds'
import { streamAssist } from '../api/aiClient'

vi.mock('../api/aiClient', () => ({ streamAssist: vi.fn(), getAiHealth: vi.fn().mockResolvedValue({ available: true }) }))
vi.mock('../api/client', () => ({
  apiClient: { getRecord: vi.fn(), getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }) },
}))

import { useAiChat } from './useAiChat'

const TAB_ID_KEY = 'cl.ai-thread-tab-ids'
const readMap = (): Record<string, string> =>
  JSON.parse(sessionStorage.getItem(TAB_ID_KEY) ?? '{}') as Record<string, string>
// Capture fetch calls with headers so we can verify the scope header
const capture: Array<{ url: string; method: string; headers?: Record<string, string> }> = []
vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  const method = (init?.method ?? 'GET').toUpperCase()
  const headers: Record<string, string> = {}
  if (init?.headers) {
    const h = init.headers as Record<string, string>
    for (const k of Object.keys(h)) headers[k] = h[k]
  }
  capture.push({ url, method, headers })
  const isThread = url.includes('/api/ai/threads/')
  return { ok: true, status: 200, json: async () => isThread
    ? { endpoint: 'browser', userId: 'USR-TEST', messages: [], mentions: [], updatedAt: '1970-01-01T00:00:00.000Z' }
    : {} }
}))
const getThreadCalls = () => capture.filter((c) => c.url.includes('/api/ai/threads/') && c.method === 'GET')
const appendCalls = () => capture.filter((c) => c.url.includes('/api/ai/threads/') && c.method === 'POST')

beforeEach(() => {
  sessionStorage.clear()
  capture.length = 0
  // Deterministic mint ids per scope bucket so the single map entry is nameable.
  vi.spyOn(threadTabIds, 'getThreadTabId').mockImplementation((scope?: string) => {
    const key = scope && scope.length > 0 ? scope : ''
    const map = readMap()
    if (map[key]) return map[key]
    const id = `tsfl1-id-${key || '_'}`
    map[key] = id
    sessionStorage.setItem(TAB_ID_KEY, JSON.stringify(map))
    return id
  })
})

const aiContext: AiContext = { surface: 'run-workspace', summary: 'test', surfaceContext: {} }
// The status the registrar currently reports; flipping it + rerender() is
// the settle / mid-session-widening flip under test.
const statusRef: { current?: 'provisional' } = {}
type GateProps = { aiContext: AiContext; endpoint: 'browser'; scopeStatus?: 'provisional'; scope?: string }
const gateProps = (overrides?: Partial<GateProps>): GateProps => ({
  aiContext,
  endpoint: 'browser',
  ...(statusRef.current ? { scopeStatus: statusRef.current } : {}),
  ...overrides,
})
const renderGate = (overrides?: Partial<GateProps>) => renderHook(
  (p: GateProps) => useAiChat({ aiContext: p.aiContext, endpoint: p.endpoint, ...(p.scopeStatus ? { scopeStatus: p.scopeStatus } : {}), ...(p.scope ? { scope: p.scope } : {}) }),
  { initialProps: gateProps(overrides) },
)

describe('useAiChat — provisional scopeStatus gate (unit 2)', () => {
  it('P-a: provisional (scope absent) => ZERO mint + ZERO thread GETs/POSTs; settle => ONE mint + ONE hydrate', async () => {
    statusRef.current = 'provisional'
    const { result, rerender } = renderGate()
    await act(async () => {})
    expect(result.current.threadId).toBeUndefined()
    expect(getThreadCalls()).toHaveLength(0)
    expect(appendCalls()).toHaveLength(0)
    expect(threadTabIds.getThreadTabId).toHaveBeenCalledTimes(0)
    expect(readMap()).toEqual({})
    // Settle: the normal re-key path resolves ONCE and hydrates ONCE; the
    // mint-once guarantee is pinned on the ONE map (exactly one entry).
    statusRef.current = undefined
    rerender(gateProps())
    await waitFor(() => expect(result.current.threadId).toBeDefined())
    expect(getThreadCalls()).toHaveLength(1)
    expect(appendCalls()).toHaveLength(0)
    const map = readMap()
    expect(Object.keys(map)).toEqual([''])
    expect(result.current.threadId).toBe(map['']!)
  })

  it('P-b: settled first render hydrates on the FIRST effect pass — zero added latency (timer count 0)', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderGate()
      await act(async () => {})
      expect(result.current.threadId).toBeDefined()
      expect(getThreadCalls()).toHaveLength(1)
      expect(vi.getTimerCount()).toBe(0)
      vi.advanceTimersByTime(10000)
      await act(async () => {})
      expect(getThreadCalls()).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('P-c: provisional -> settled flips hydrate EXACTLY once; mid-session provisional never clears the pane (C-4)', async () => {
    const { result, rerender } = renderGate()
    await waitFor(() => expect(result.current.threadId).toBeDefined())
    await act(async () => {})
    const settledId = result.current.threadId!
    expect(getThreadCalls()).toHaveLength(1)
    statusRef.current = 'provisional'
    rerender(gateProps())
    await act(async () => {})
    // The hold is an IO gate ONLY: the active thread is NOT cleared (no
    // re-hydration GET, no re-mint; the one map entry survives).
    expect(result.current.threadId).toBe(settledId)
    expect(getThreadCalls()).toHaveLength(1)
    expect(appendCalls()).toHaveLength(0)
    expect(Object.keys(readMap())).toEqual([''])
    // Settle again: NO second hydrate (C-3 — the same (scope, id) key never
    // re-hydrates on a settle flip).
    statusRef.current = undefined
    await act(async () => { rerender(gateProps()) })
    await act(async () => {})
    expect(getThreadCalls()).toHaveLength(1)
    expect(appendCalls()).toHaveLength(0)
    expect(result.current.threadId).toBe(settledId)
  })

  it('P-d: sync POSTs gated while provisional mid-session (§3b site 3 / C-4)', async () => {
    // streamAssist mock: yield a done event to complete the stream
    vi.mocked(streamAssist).mockImplementation(async function* (_prompt, _surface, _ctx) {
      yield { type: 'done', result: { success: true, events: [], notes: [] } }
    })

    statusRef.current = undefined
    const { result, rerender } = renderGate()
    await waitFor(() => expect(result.current.threadId).toBeDefined())
    await act(async () => {})
    expect(appendCalls()).toHaveLength(0)

    // First send (settled) — stream completes, user + assistant messages POST
    act(() => { result.current.sendPrompt('First message') })
    await waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 3000 })
    await act(async () => {})
    await waitFor(() => expect(appendCalls()).toHaveLength(2), { timeout: 3000 })
    const firstSendCount = appendCalls().length

    // Flip to provisional MID-SESSION — the active thread is kept (C-4)
    statusRef.current = 'provisional'
    rerender(gateProps())
    await act(async () => {})
    expect(result.current.threadId).toBeDefined()

    // Send while provisional — stream completes but sync effect must NOT POST
    act(() => { result.current.sendPrompt('Second message provisional') })
    await waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 3000 })
    await act(async () => {})
    expect(appendCalls()).toHaveLength(firstSendCount) // zero new POSTs while provisional

    // Settle — the second message must POST exactly once (user + assistant = 2 more)
    statusRef.current = undefined
    rerender(gateProps())
    await waitFor(() => expect(appendCalls()).toHaveLength(firstSendCount + 2), { timeout: 3000 })

    vi.mocked(streamAssist).mockClear()
  })

  /**
   * P-e (C-2 release, empty thread): a turn that COMPLETED during the hold
   * is persisted on release. This is the D1 defect: when the thread is empty
   * the hydration GET returns no messages so setMessages returns the same
   * prev reference → no re-render → the sync effect never re-runs. The
   * fix bumps a hydrationSeq state in .finally so the sync effect sees a
   * dep change and persists the in-memory held turn.
   * Scope assertion (D2): every released POST carries the settled scope header
   * x-cl-thread-scope: EVG-1, proving the pin distinguishes a scoped release
   * from an empty-scope POST.
   */
  it('P-e (C-2 release, empty thread): a turn that COMPLETED during the hold is persisted on release', async () => {
    // streamAssist: complete the stream IMMEDIATELY (before release)
    vi.mocked(streamAssist).mockImplementation(async function* (_prompt, _surface, _ctx) {
      yield { type: 'done', result: { success: true, events: [], notes: [] } }
    })

    const scope = 'EVG-1'
    // Start provisional — no mint, no hydration, no activation
    statusRef.current = 'provisional'
    const { result, rerender } = renderGate({ scope })
    await act(async () => {})
    expect(result.current.threadId).toBeUndefined()
    expect(getThreadCalls()).toHaveLength(0)

    // Send while provisional — the turn is held in memory
    act(() => { result.current.sendPrompt('Held message') })
    // Wait for the stream to COMPLETE — isStreaming goes false BEFORE release
    await waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 3000 })
    await act(async () => {})
    // Messages are in memory but nothing has POSTed
    expect(result.current.messages.length).toBeGreaterThanOrEqual(2)
    expect(appendCalls()).toHaveLength(0)

    // Release: flip to settled — the lazy-mint effect runs, hydration fires,
    // and the sync effect must persist the held turn
    statusRef.current = undefined
    rerender(gateProps({ scope }))

    // Wait for the thread to resolve and persistence to complete
    await waitFor(() => expect(result.current.threadId).toBeDefined(), { timeout: 3000 })
    // Wait for POSTs — the held turn (user + assistant = 2 messages) must persist
    await waitFor(() => expect(appendCalls()).toHaveLength(2), { timeout: 3000 })

    // Scope header assertion: every POST carries the settled scope header,
    // proving the release binds to the correct thread (D2 — the capture at
    // :26 is now exercised by a real assertion).
    const posts = appendCalls()
    expect(posts.length).toBe(2)
    posts.forEach((p) => {
      expect(p.headers?.['x-cl-thread-scope']).toBe(scope)
    })
    // persistedIdsRef guard (filter at :1124-1126, add at :1130) prevents
    // re-persisting the same messages if the effect re-runs.

    vi.mocked(streamAssist).mockClear()
  })
})
