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

vi.mock('../api/aiClient', () => ({ streamAssist: vi.fn(), getAiHealth: vi.fn().mockResolvedValue({ available: true }) }))
vi.mock('../api/client', () => ({
  apiClient: { getRecord: vi.fn(), getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }) },
}))

import { useAiChat } from './useAiChat'

const TAB_ID_KEY = 'cl.ai-thread-tab-ids'
const readMap = (): Record<string, string> =>
  JSON.parse(sessionStorage.getItem(TAB_ID_KEY) ?? '{}') as Record<string, string>
const capture: Array<{ url: string; method: string }> = []
vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  const method = (init?.method ?? 'GET').toUpperCase()
  capture.push({ url, method })
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
type GateProps = { aiContext: AiContext; endpoint: 'browser'; scopeStatus?: 'provisional' }
const gateProps = (): GateProps => ({
  aiContext,
  endpoint: 'browser',
  ...(statusRef.current ? { scopeStatus: statusRef.current } : {}),
})
const renderGate = () => renderHook(
  (p: GateProps) => useAiChat({ aiContext: p.aiContext, endpoint: p.endpoint, ...(p.scopeStatus ? { scopeStatus: p.scopeStatus } : {}) }),
  { initialProps: gateProps() },
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
})
