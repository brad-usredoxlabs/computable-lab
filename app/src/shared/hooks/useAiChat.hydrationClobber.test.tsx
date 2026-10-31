/**
 * L2-CHAT-UI-1 LEG F — in-flight-turn guard vs mount-time scope-flip clobber
 * (RED-first, per ruling
 * `.hermes/cl/lanes/2/decisions/CHATUI1-THREADCLOBBER-triage-l2t0630-ruling.md` Q2.1/Q2.3).
 *
 * The defect (receipts OBS-1, c4-diag.json + c4-diag-deck.json): both surface
 * bridges spread `scope` asynchronously — mount begins with scope "" (the lazy
 * mint keys id A under ""), the send POSTs the user message into that thread,
 * the record load lands and the scope flips to the deck id, the lazy-mint
 * resolves a DIFFERENT id B (correct mint-once per (tab, scope)), and the
 * hydration re-key reset (useAiChat.ts:807-811) wipes the live turn: bubbles
 * 1/1 -> 0/0, and the POSTed question can never hydrate into thread B.
 *
 * The invariant (ruling Q2, binding): once a turn is in flight — a message is
 * `isStreaming`, or the user message has been minted/POSTed by send — no
 * effect run, hydration response, OR re-key of the (scope, threadId) pair may
 * remove or replace those messages; a MOUNT-TIME lazy scope resolution is NOT
 * a thread switch. User-initiated switch/New-thread keeps the existing wipe
 * semantics byte-for-byte (bait #11 preserved — negative pins below).
 *
 * Shape per Q2.1: mount scope undefined; send with a HELD mock stream (the
 * assistant stays `isStreaming`); THEN flip the scope prop to "evg-1" with
 * getThread returning an empty thread for the new key; assert both messages
 * SURVIVE and persistedIdsRef is not orphaned (the send-minted user message is
 * never re-POSTed under the new (scope, id) pair — its persisted id was kept).
 *
 * The REAL aiThreadClient + threadTabIds run (single-identity transport under
 * test); only the model stream (aiClient) is mocked. Same fake-server fetch
 * router shape as useAiChat.threadScoped.test.ts.
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
  body?: string
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

const keyOf = (scope: string | undefined, threadId: string) => `${scope ?? '_'}\u0000${threadId}`

const seedThread = (scope: string | undefined, threadId: string, contents: string[]) => {
  serverThreads[keyOf(scope, threadId)] = {
    endpoint: 'event-editor',
    userId: 'USR-TEST',
    messages: contents.map((content, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content,
      createdAt: `2026-10-31T00:00:0${i}.000Z`,
    })),
    mentions: [],
    updatedAt: '2026-10-31T00:00:09.000Z',
  }
}

const EMPTY: FakeThread = {
  endpoint: 'event-editor',
  userId: 'USR-TEST',
  messages: [],
  mentions: [],
  updatedAt: '1970-01-01T00:00:00.000Z',
}

/** Threads whose next GET the fake server holds open until `releaseGet` —
 *  lets a test observe the WIPE transition (old content gone) BEFORE the
 *  chosen thread's content arrives. */
const getHolds = new Map<string, { promise: Promise<void>; release: () => void }>()
function holdGetFor(threadId: string) {
  let release: () => void = () => {}
  const promise = new Promise<void>((r) => {
    release = r
  })
  getHolds.set(threadId, { promise, release })
}
const releaseGet = (threadId: string) => getHolds.get(threadId)?.release()

/** Single global fetch router (threadScoped.test.ts pattern): thread
 *  GET/POST answered by the wire headers — the exact transport the receipts
 *  show (send rides the OLD scope header, rehydrate rides the NEW). */
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  const method = (init?.method ?? 'GET').toUpperCase()
  const headers = Object.fromEntries(
    Object.entries(init?.headers ?? {}).map(([k, v]) => [String(k), String(v)]),
  )
  const body = typeof init?.body === 'string' ? init.body : undefined
  capture.push({ url, method, headers, ...(body ? { body } : {}) })
  const okJson = (b: unknown) => ({ ok: true, status: 200, json: async () => b })
  if (url.includes('/api/ai/threads/')) {
    const scope = headers['x-cl-thread-scope'] ?? undefined
    const id = headers['x-cl-thread-id'] ?? ''
    if (method === 'GET') {
      const hold = getHolds.get(id)
      if (hold) {
        // Await OUTSIDE the map: the entry is kept so releaseGet(id) still
        // finds the resolver, and the hold fires at most once per request.
        await hold.promise
      }
      const thread = serverThreads[keyOf(scope, id)]
      return okJson(thread ?? EMPTY)
    }
    // A POST APPENDS to the addressed (scope, id) thread — the fake server
    // behaves like the real one, so "where did the user message land" is
    // answerable from serverThreads at the end of each test.
    const key = keyOf(scope, id)
    const thread = serverThreads[key] ?? { ...EMPTY, messages: [] }
    if (body) {
      try {
        const parsed = JSON.parse(body) as { message?: { role?: string; content?: string } }
        if (parsed.message?.content) {
          thread.messages = [
            ...thread.messages,
            {
              role: parsed.message.role ?? 'user',
              content: parsed.message.content,
              createdAt: new Date().toISOString(),
            },
          ]
        }
      } catch {
        /* non-JSON body: ignore */
      }
    }
    serverThreads[key] = thread
    return okJson(thread)
  }
  return okJson({})
})

vi.stubGlobal('fetch', fetchMock)

const threadCalls = () => capture.filter((c) => c.url.includes('/api/ai/threads/'))
const getThreadCalls = () => threadCalls().filter((c) => c.method === 'GET')
const appendCalls = () => threadCalls().filter((c) => c.method === 'POST')

const readMap = (): Record<string, string> =>
  JSON.parse(sessionStorage.getItem(TAB_ID_KEY) ?? '{}')

/** A HELD stream: yields one status frame, then blocks until `release()` —
 *  the assistant stays `isStreaming` across the scope flip (the receipts'
 *  mid-stream t≈2.2s wipe window). The latch is a DEFERRED created up front:
 *  sendPrompt awaits a paint before pulling the stream, so release() may
 *  fire BEFORE the generator reaches its hold point (an inline
 *  new-Promise-captures-resolve would race into a never-resolving wait). */
function heldStream(): { release: () => void } {
  let resolveHold: () => void = () => {}
  const hold = new Promise<void>((resolve) => {
    resolveHold = resolve
  })
  vi.mocked(streamAssist).mockImplementation(async function* () {
    yield { type: 'status', message: 'Prompt received. Starting compiler pipeline...' } as never
    await hold
    yield { type: 'done', result: { success: true, notes: [] } } as never
  })
  return { release: () => resolveHold() }
}

beforeEach(() => {
  sessionStorage.clear()
  capture.length = 0
  serverThreads = {}
  getHolds.clear()
  vi.mocked(streamAssist).mockImplementation(async function* () {
    yield { type: 'done', result: { success: true, notes: [] } } as never
  })
})

describe('useAiChat — LEG F in-flight-turn guard (mount-time scope flip must not clobber a live turn)', () => {
  it('Q2.1 RED: mount-time scope flip ("" -> "evg-1") during a streaming turn does NOT wipe the turn and does not orphan persistedIdsRef', async () => {
    const { release } = heldStream()

    const { result, rerender } = renderHook(
      ({ scope }: { scope?: string }) =>
        useAiChat({
          aiContext,
          endpoint: 'event-editor',
          ...(scope !== undefined ? { scope } : {}),
        }),
      { initialProps: {} as { scope?: string } },
    )

    // Mount: scope undefined -> the "" key (the receipts' first GET wave).
    await waitFor(() => expect(getThreadCalls()).toHaveLength(1))
    const idA = readMap()['']
    expect(idA).toBeTruthy()

    // Send: user message minted + POSTed into the (scope "", id A) thread,
    // assistant streaming (held). (sendPrompt is declared void-returning at
    // the public seam — settle is observed via isStreaming, not a promise.)
    await act(async () => {
      void result.current.sendPrompt('what does step 1 do?')
    })
    await waitFor(() => expect(appendCalls().length).toBeGreaterThanOrEqual(1))
    expect(result.current.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(result.current.messages[1]!.isStreaming).toBe(true)
    const userAppend = appendCalls().find((c) =>
      (c.body ?? '').includes('what does step 1 do?'),
    )
    expect(userAppend, 'the send POSTed the user message').toBeTruthy()
    expect(userAppend!.headers['x-cl-thread-id']).toBe(idA)

    // THE FLIP: the record load lands; scope "" -> "evg-1" (mount-time lazy
    // resolution, never user-initiated). getThread("evg-1", id B) is EMPTY.
    rerender({ scope: 'evg-1' })
    await waitFor(() => expect(getThreadCalls().length).toBeGreaterThanOrEqual(2))
    const idB = readMap()['evg-1']
    expect(idB).toBeTruthy()
    expect(idB).not.toBe(idA) // per-(tab, scope) mint: distinct ids

    // INVARIANT: the live turn SURVIVES the re-key.
    expect(result.current.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(result.current.messages[0]!.content).toBe('what does step 1 do?')
    expect(result.current.messages[1]!.isStreaming).toBe(true)

    // Release the stream: the turn settles normally on the surviving list.
    release()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false))
    // The turn's own rows SURVIVE the settle (the empty-done honest-wall
    // system row is pre-existing behavior — count is not the pin).
    const roles = result.current.messages.map((m) => m.role)
    expect(roles[0]).toBe('user')
    expect(roles[1]).toBe('assistant')
    expect(result.current.messages[0]!.content).toBe('what does step 1 do?')

    // D1/D3 pin (fix run 1, advc l2t1030): the FULL turn's persistence
    // destination stays on the PRE-FLIP key — BOTH roles, not just the user
    // half. The reviewer's probe shape: the user POST rode (scope undefined,
    // id A) and the ASSISTANT must POST to the SAME server-thread key, never
    // 'evg-1<idB>'. A surviving turn rebound to the new pair is a cross-scope
    // write (bait #11 at the scope axis, threadScoped.test.ts:322-327; the
    // re-key block's own recorded invariant, useAiChat.ts:731-735): the old
    // thread would hold an unanswered question and the new thread an orphan
    // assistant placeholder. persistedIdsRef is not orphaned EITHER WAY, so a
    // user-post count cannot certify it — assert the destinations.
    const userPosts = appendCalls().filter((c) =>
      (c.body ?? '').includes('what does step 1 do?'),
    )
    expect(userPosts, 'user message POSTed exactly once').toHaveLength(1)
    expect(userPosts[0]!.headers['x-cl-thread-id']).toBe(idA)
    const assistantPosts = appendCalls().filter((c) =>
      (c.body ?? '').includes('"role":"assistant"'),
    )
    expect(assistantPosts, 'assistant reply POSTed exactly once').toHaveLength(1)
    expect(assistantPosts[0]!.headers['x-cl-thread-id'], 'assistant POST rides the MINTED thread id A').toBe(idA)
    expect(assistantPosts[0]!.headers['x-cl-thread-scope'], 'assistant POST rides the pre-flip scope (none)').toBeUndefined()
    // Server-side truth (the fake router appends like the real one): thread A
    // holds the WHOLE turn; thread B received nothing from it.
    const threadA = serverThreads[keyOf(undefined, idA)]
    expect(threadA?.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    const threadB = serverThreads[keyOf('evg-1', idB)]
    expect(threadB?.messages ?? []).toHaveLength(0)
  })

  it('NEGATIVE PIN (bait #11): user-initiated switchThread while IDLE is a REAL WIPE TRANSITION — the settled turn is GONE while the chosen thread is still loading, then the chosen thread rehydrates', async () => {
    seedThread(undefined, 'tid-pin-1', ['pinned thread turn'])

    const { result } = renderHook(() => useAiChat({ aiContext, endpoint: 'event-editor' }))
    await waitFor(() => expect(getThreadCalls()).toHaveLength(1))

    // D2 (advc l2t1030): the OLD pin mounted with an EMPTY list — it could
    // never observe a wipe (tautology; mutation control proved it). Seed a
    // SETTLED turn on the CURRENT thread first — content that must be lost.
    await act(async () => {
      await result.current.sendPrompt('settled turn content')
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false))
    expect(result.current.messages.some((m) => m.content === 'settled turn content')).toBe(true)

    // Hold the chosen thread's GET so the WIPE is observable BEFORE its
    // content can arrive — an actual wipe transition, not just rehydration.
    holdGetFor('tid-pin-1')
    await act(async () => {
      result.current.switchThread?.('tid-pin-1')
    })
    // The old content is GONE while thread B is still in flight: no carry,
    // and the chosen thread's content has not appeared either.
    expect(result.current.messages).toHaveLength(0)

    releaseGet('tid-pin-1')
    // The existing semantics complete: the chosen thread REHYDRATES.
    await waitFor(() =>
      expect(result.current.messages.map((m) => m.content)).toEqual(['pinned thread turn']),
    )
    expect(result.current.threadId).toBe('tid-pin-1')
    expect(readMap()['']).toBe('tid-pin-1')
  })

  it('NEGATIVE PIN (bait #11, DIRECT-CLEAR — mutation-discriminating): re-picking the CURRENT thread while IDLE still wipes via resetChatState itself', async () => {
    // This is the pin that pins the `setMessages([])` INSIDE resetChatState:
    // the switch above ALSO trips the effect re-key reset (two wipers), so a
    // mutation removing only the direct clear survives it. Re-picking the
    // CURRENT thread id changes no (scope, id) PRIMITIVE — the hydration
    // effect does NOT re-run, the effect reset never fires — the ONLY wiper
    // is resetChatState. Mutation control (advc D2): delete `setMessages([])`
    // from resetChatState and THIS pin REDS.
    const { result } = renderHook(() => useAiChat({ aiContext, endpoint: 'event-editor' }))
    await waitFor(() => expect(getThreadCalls()).toHaveLength(1))

    await act(async () => {
      await result.current.sendPrompt('settled turn content')
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false))
    expect(result.current.messages.length).toBeGreaterThanOrEqual(2)

    const currentId = result.current.threadId
    expect(currentId).toBeTruthy()
    await act(async () => {
      result.current.switchThread?.(currentId!)
    })
    // Pre-fix and post-fix byte-for-byte: a user-initiated pick wipes the
    // chat through resetChatState even for a no-re-key re-pick.
    expect(result.current.messages).toHaveLength(0)
    expect(result.current.threadId).toBe(currentId)
  })

  it('NEGATIVE PIN (D4, advc l2t1030): a rejection between the in-flight flag and the stream settles the turn and does NOT leak the guard', async () => {
    // D4: `turnInFlightRef = true` used to sit OUTSIDE the try/finally that
    // clears it — waitForNextPaint and the context builders ran between. A
    // rejection there left the flag TRUE forever, permanently suppressing
    // every re-key reset (the overguard). The fake: make waitForNextPaint's
    // requestAnimationFrame throw synchronously (its Promise constructor
    // rejects -> the await inside the now-widened try throws -> the catch
    // renders the error and the finally clears the flag).
    const rafOriginal = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = (() => {
      throw new Error('paint fail (D4 probe)')
    }) as typeof requestAnimationFrame
    try {
      const { result, rerender } = renderHook(
        ({ scope }: { scope?: string }) =>
          useAiChat({
            aiContext,
            endpoint: 'event-editor',
            ...(scope !== undefined ? { scope } : {}),
          }),
        { initialProps: {} as { scope?: string } },
      )
      await waitFor(() => expect(getThreadCalls()).toHaveLength(1))

      await act(async () => {
        // sendPrompt is void-returning at the public seam (same convention
        // as the Q2.1 test); an escaped rejection surfaces as unhandled.
        void result.current.sendPrompt('will fail before the stream')
      })
      // The turn SETTLED with an honest error row — the flag did not leak.
      await waitFor(() => expect(result.current.isStreaming).toBe(false))
      expect(
        result.current.messages.some((m) => m.content.includes('paint fail (D4 probe)')),
        'the rejection surfaced as the honest error message'
      ).toBe(true)

      // The guard is NOT stuck: a later re-key while IDLE performs its full
      // pre-fix reset (wipe + rehydrate). At the leaky tip the suppressed
      // reset left the errored rows carried under the new key instead.
      // Pre-write B's minted id into the tab map (mint-once honors it) and
      // seed its content BEFORE the flip — the hydration GET rides the
      // flip's effect run.
      sessionStorage.setItem(TAB_ID_KEY, JSON.stringify({ ...readMap(), 'evg-1': 'B-fixed-id' }))
      seedThread('evg-1', 'B-fixed-id', ['fresh thread B'])
      rerender({ scope: 'evg-1' })
      expect(readMap()['evg-1']).toBe('B-fixed-id')
      // With the flag correctly cleared, the re-key wiped the errored turn;
      // a leaked flag would have carried the old rows (prev.length > 0 kept
      // them) and thread B's fresh content could never appear.
      await waitFor(() =>
        expect(result.current.messages.map((m) => m.content)).toContain('fresh thread B'),
      )
    } finally {
      globalThis.requestAnimationFrame = rafOriginal
    }
  })

  it('NEGATIVE PIN (bait #11, byte-for-byte): newThread while IDLE after a settled turn still wipes', async () => {
    const { result } = renderHook(() => useAiChat({ aiContext, endpoint: 'event-editor' }))
    await waitFor(() => expect(getThreadCalls()).toHaveLength(1))

    await act(async () => {
      await result.current.sendPrompt('settled turn content')
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false))
    // The settled turn's own rows (user + assistant; the empty-done turn may
    // also carry its honest system row — count is not the pin).
    expect(result.current.messages.length).toBeGreaterThanOrEqual(2)

    const beforeId = result.current.threadId
    await act(async () => {
      result.current.newThread?.()
    })
    // Existing semantics: New thread wipes the settled chat (the previous
    // turn lives on server-side under its thread; the picker can return).
    expect(result.current.messages).toHaveLength(0)
    expect(result.current.threadId).toBeTruthy()
    expect(result.current.threadId).not.toBe(beforeId)
  })
})
