/**
 * L2-THREAD-SCOPED-1 — client-side thread identity (RED-first).
 *
 * The hook drives a per-tab, per-scope thread: the id is minted ONCE per
 * (tab, scope) into sessionStorage (`cl.ai-thread-tab-ids`, a JSON map
 * { [scope or ""]: threadId }) — lazily inside the function, never at module
 * scope (SSR/jsdom-safe). Pins:
 *  - MINT-TWICE: two getThread round-trips in one tab => ONE id (bait #7);
 *  - a new tab (fresh sessionStorage) => a NEW id ("new tab = new empty
 *    thread" at the client seam);
 *  - reload KEEPS the tab's thread: an unmount + remount in the same tab
 *    reuses the stored id;
 *  - switchThread(id) resets messages/persistedIdsRef/hydratedRef so the new
 *    thread rehydrates (bait #11: without the reset the `prev.length > 0`
 *    guard keeps the OLD thread's messages and the refs stay stale);
 *  - the deck-scope option mints per (tab, scope): navigating to a second
 *    deck record (scope change) re-keys with a DISTINCT id and hydrates the
 *    second deck's thread without carrying the first's messages (acceptance 5).
 *
 * The REAL aiThreadClient runs (mint + transport under test); only the model
 * stream (aiClient) is mocked. Thread responses are plain objects — the
 * client reads only `res.ok` / `res.json()`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { AiContext } from '../../types/aiContext'

vi.mock('../api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))
vi.mock('../api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }),
  },
}))

import { streamAssist } from '../api/aiClient'
import { useAiChat } from './useAiChat'

const aiContext: AiContext = { surface: 'run-workspace', summary: 'test', surfaceContext: {} }

const TAB_ID_KEY = 'cl.ai-thread-tab-ids'

interface CapturedCall {
  url: string
  method: string
  headers: Record<string, string>
}

const capture: CapturedCall[] = []

interface FakeThread {
  endpoint: string
  userId: string
  messages: Array<{ role: string; content: string; createdAt: string }>
  mentions: []
  updatedAt: string
}

/** The threads the fake server returns, keyed `${scope}\u0000${threadId}`. */
let serverThreads: Record<string, FakeThread> = {}
/** Scopes the router auto-seeds on first sight (one turn each). */
let autoSeedContents: Record<string, string> = {}

const keyOf = (scope: string | undefined, threadId: string) => `${scope ?? '_'}\u0000${threadId}`

const seedThread = (scope: string | undefined, threadId: string, contents: string[]) => {
  serverThreads[keyOf(scope, threadId)] = {
    endpoint: 'browser',
    userId: 'USR-TEST',
    messages: contents.map((content, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content,
      createdAt: `2026-10-28T00:00:0${i}.000Z`,
    })),
    mentions: [],
    updatedAt: '2026-10-28T00:00:09.000Z',
  }
}

const EMPTY: FakeThread = {
  endpoint: 'browser',
  userId: 'USR-TEST',
  messages: [],
  mentions: [],
  updatedAt: '1970-01-01T00:00:00.000Z',
}

/**
 * Single global fetch router: thread GET/POST answered by headers (the wire
 * contract under test), everything else a no-op ok. Auto-seed scopes get one
 * turn seeded on first sight of (scope, mintedId) — the minted id is a
 * random UUID, so the seed must be reactive to the id the client actually
 * carries.
 */
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  const method = (init?.method ?? 'GET').toUpperCase()
  const headers = Object.fromEntries(Object.entries(init?.headers ?? {}).map(([k, v]) => [String(k), String(v)]))
  capture.push({ url, method, headers })
  const okJson = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
  if (url.includes('/api/ai/threads/')) {
    const scope = headers['x-cl-thread-scope'] ?? undefined
    const id = headers['x-cl-thread-id'] ?? ''
    if (method === 'GET') {
      if (scope && autoSeedContents[scope] && !serverThreads[keyOf(scope, id)]) {
        seedThread(scope, id, [autoSeedContents[scope]])
      }
      const thread = serverThreads[keyOf(scope, id)]
      return okJson(thread ?? EMPTY)
    }
    return okJson({ endpoint: 'browser', userId: 'USR-TEST', messages: [], mentions: [], updatedAt: new Date().toISOString() })
  }
  return okJson({})
})

vi.stubGlobal('fetch', fetchMock)

const threadCalls = () => capture.filter((c) => c.url.includes('/api/ai/threads/'))
const getThreadCalls = () => threadCalls().filter((c) => c.method === 'GET')
const appendCalls = () => threadCalls().filter((c) => c.method === 'POST')

beforeEach(() => {
  sessionStorage.clear()
  capture.length = 0
  serverThreads = {}
  autoSeedContents = {}
  vi.mocked(streamAssist).mockImplementation(async function* () {
    yield { type: 'done', result: { success: true, notes: [] } }
  } as never)
})

const readMap = (): Record<string, string> => JSON.parse(sessionStorage.getItem(TAB_ID_KEY) ?? '{}')

describe('useAiChat — per-tab thread identity (L2-THREAD-SCOPED-1)', () => {
  it('MINT-TWICE: two getThread round-trips in one tab reuse ONE minted id', async () => {
    const { result } = renderHook(() => useAiChat({ aiContext, endpoint: 'browser' }))
    await waitFor(() => expect(getThreadCalls()).toHaveLength(1))

    // A send: the sync effect appends the user + assistant messages — every
    // thread call must carry the SAME id as the hydration GET.
    await act(async () => {
      result.current.sendPrompt('hello')
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 4000 })
    await waitFor(() => expect(appendCalls().length).toBeGreaterThanOrEqual(1))

    const ids = new Set(threadCalls().map((c) => c.headers['x-cl-thread-id']))
    expect(ids.size).toBe(1)
    const id = [...ids][0]!
    expect(id).toBeTruthy()
    // Stored once in the per-(tab, scope) map (non-deck surface => "" key).
    expect(readMap()['']).toBe(id)
    // A non-instance surface sends NO x-cl-thread-scope header at all.
    for (const call of threadCalls()) {
      expect(call.headers['x-cl-thread-scope']).toBeUndefined()
    }
  })

  it('a fresh tab mints a NEW id; reload (same tab) KEEPS the stored id', async () => {
    const first = renderHook(() => useAiChat({ aiContext, endpoint: 'browser' }))
    await waitFor(() => expect(getThreadCalls()).toHaveLength(1))
    const firstId = readMap()['']!
    await first.unmount()

    // Same tab, later mount (the RELOAD case): the stored id is REUSED.
    const second = renderHook(() => useAiChat({ aiContext, endpoint: 'browser' }))
    await waitFor(() => expect(getThreadCalls()).toHaveLength(2))
    expect(readMap()['']).toBe(firstId)
    expect(getThreadCalls()[1]!.headers['x-cl-thread-id']).toBe(firstId)
    await second.unmount()

    // A genuinely NEW tab: sessionStorage is empty again => a new mint.
    sessionStorage.clear()
    const third = renderHook(() => useAiChat({ aiContext, endpoint: 'browser' }))
    await waitFor(() => expect(getThreadCalls()).toHaveLength(3))
    const thirdId = readMap()['']!
    expect(thirdId).toBeTruthy()
    expect(thirdId).not.toBe(firstId)
    await third.unmount()
  })

  it('switchThread(id) rehydrates the chosen thread and resets messages + refs (bait #11)', async () => {
    seedThread(undefined, 'tid-1', ['old thread turn'])
    seedThread(undefined, 'tid-2', ['new thread turn'])

    const { result } = renderHook(() => useAiChat({ aiContext, endpoint: 'browser' }))
    const initialId = readMap()['']!
    await waitFor(() => expect(getThreadCalls()).toHaveLength(1))

    // Switch to tid-1: its content hydrates; the refs were reset so this is a
    // real re-hydration (not the stale `prev.length > 0` guard).
    await act(async () => {
      result.current.switchThread?.('tid-1')
    })
    await waitFor(() =>
      expect(result.current.messages.map((m) => m.content)).toEqual(['old thread turn']),
    )
    expect(result.current.threadId).toBe('tid-1')
    expect(readMap()['']).toBe('tid-1')

    // Switch to tid-2: the NEW thread's content hydrates and the OLD
    // thread's message is NOT re-posted under tid-2's header (persistedIdsRef
    // reset: a stale ref would re-post 'old thread turn' with
    // x-cl-thread-id: tid-2).
    const appendsBefore = appendCalls().length
    await act(async () => {
      result.current.switchThread?.('tid-2')
    })
    await waitFor(() =>
      expect(result.current.messages.map((m) => m.content)).toEqual(['new thread turn']),
    )
    expect(result.current.threadId).toBe('tid-2')
    const stalePosts = appendCalls()
      .slice(appendsBefore)
      .filter((c) => c.headers['x-cl-thread-id'] === 'tid-2')
    expect(stalePosts.some((c) => JSON.stringify(c).includes('old thread turn'))).toBe(false)
    // The switch GETs carried the chosen ids.
    const getIds = getThreadCalls().map((c) => c.headers['x-cl-thread-id'])
    expect(getIds).toContain('tid-1')
    expect(getIds).toContain('tid-2')
    expect(initialId).toBeTruthy()
    expect(initialId).not.toBe('tid-1')
  })

  it('newThread() mints a fresh id into the current scope map entry', async () => {
    const { result } = renderHook(() => useAiChat({ aiContext, endpoint: 'browser' }))
    const initialId = readMap()['']!
    await act(async () => {
      result.current.newThread?.()
    })
    const newId = readMap()['']!
    expect(newId).toBeTruthy()
    expect(newId).not.toBe(initialId)
    expect(result.current.threadId).toBe(newId)
  })

  it('D3 (no-sessionStorage divergence): hydration id and wire header id AGREE without sessionStorage', async () => {
    // The cycle-1 fork minted per-CALL ephemeral ids in a no-storage
    // context: the hook's resolved id and the transport's header id never
    // agreed. With the single mint module (an in-memory fallback map), the
    // SAME id rides every call even with storage unavailable.
    const savedStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
    // @ts-expect-error deliberate: simulate a non-browser context
    delete globalThis.sessionStorage
    try {
      const { result } = renderHook(() => useAiChat({ aiContext, endpoint: 'browser' }))
      await waitFor(() => expect(getThreadCalls()).toHaveLength(1))
      await act(async () => {
        result.current.sendPrompt('no-storage turn')
      })
      await waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 4000 })
      await waitFor(() => expect(appendCalls().length).toBeGreaterThanOrEqual(1))
      const ids = new Set(threadCalls().map((c) => c.headers['x-cl-thread-id']))
      expect(ids.size).toBe(1) // hydrated GET + every append: ONE id
      expect([...ids][0]).toBeTruthy()
    } finally {
      if (savedStorage) Object.defineProperty(globalThis, 'sessionStorage', savedStorage)
    }
  })

  it('deck scope (acceptance 5): per-(tab, scope) ids, scope header on thread traffic, scope change re-keys without carrying the first deck messages', async () => {
    // The minted id is a random UUID, so the fake server seeds each deck's
    // thread on FIRST SIGHT of (scope, mintedId).
    autoSeedContents['EVG-a'] = 'deck A turn'
    autoSeedContents['EVG-b'] = 'deck B turn'

    const { result, rerender } = renderHook(
      ({ scope }: { scope: string }) => useAiChat({ aiContext, endpoint: 'event-editor', scope }),
      { initialProps: { scope: 'EVG-a' } },
    )
    await waitFor(() =>
      expect(result.current.messages.map((m) => m.content)).toEqual(['deck A turn']),
    )
    const idA = readMap()['EVG-a']!
    expect(idA).toBeTruthy()
    expect(result.current.threadId).toBe(idA)

    // FIX2 D2 (loud append arm): drive ONE real send on deck A so the POST
    // EXISTS, then pin its scope header. Cycle-2 mutation control: deleting
    // `threadOpts` from the hook's appendThreadMessage call turns this RED
    // (the previous version only sliced over a provably-empty array).
    await act(async () => {
      result.current.sendPrompt('deck A probe')
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 4000 })
    await waitFor(() => expect(appendCalls().length).toBeGreaterThan(0), { timeout: 4000 })
    for (const c of appendCalls()) {
      expect(c.headers['x-cl-thread-scope'], 'append scope').toBe('EVG-a')
    }

    // Navigate to deck B: the scope option changes => a DISTINCT per-scope id
    // is minted, the hydration re-keys, and deck B's thread hydrates WITHOUT
    // carrying deck A's messages.
    const appendsBefore = appendCalls().length
    expect(appendsBefore).toBeGreaterThan(0) // the slice below is non-empty-backed
    rerender({ scope: 'EVG-b' })
    await waitFor(() =>
      expect(result.current.messages.map((m) => m.content)).toEqual(['deck B turn']),
    )
    const idB = readMap()['EVG-b']!
    expect(idB).toBeTruthy()
    expect(idB).not.toBe(idA) // per-(tab, scope): distinct map entries
    expect(readMap()['EVG-a']).toBe(idA) // deck A's id preserved for the return
    expect(result.current.threadId).toBe(idB)

    // Scope header on the thread traffic: every event-editor thread call
    // carried the ACTIVE scope; no cross-scope (scope, id) pairing ever rode
    // the wire.
    const eeCalls = threadCalls().filter((c) => c.url.includes('/api/ai/threads/event-editor'))
    for (const c of eeCalls) {
      expect(['EVG-a', 'EVG-b']).toContain(c.headers['x-cl-thread-scope'])
    }
    const crossScopePosts = eeCalls.filter(
      (c) =>
        (c.headers['x-cl-thread-scope'] === 'EVG-b' && c.headers['x-cl-thread-id'] === idA) ||
        (c.headers['x-cl-thread-scope'] === 'EVG-a' && c.headers['x-cl-thread-id'] === idB),
    )
    expect(crossScopePosts).toEqual([])
    // No re-post of deck A's turn under deck B's key (bait #11 at the scope
    // axis): the switch effect's append (sync) traffic carries only deck B.
    const staleB = eeCalls
      .slice(appendsBefore)
      .filter((c) => c.headers['x-cl-thread-scope'] === 'EVG-b')
    expect(staleB.some((c) => JSON.stringify(c).includes('deck A turn'))).toBe(false)
  })
})
