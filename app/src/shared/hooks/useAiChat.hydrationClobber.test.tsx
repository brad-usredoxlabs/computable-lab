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

/** Single global fetch router (threadScoped.test.ts pattern): thread
 *  GET/POST answered by the wire headers — the exact transport the receipts
 *  show (send rides the OLD scope key, rehydrate rides the NEW). */
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
    // assistant streaming (held).
    let settled: Promise<void> | undefined
    await act(async () => {
      settled = result.current.sendPrompt('what does step 1 do?')
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
      await settled
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false))
    // The turn's own rows SURVIVE the settle (the empty-done honest-wall
    // system row is pre-existing behavior — count is not the pin).
    const roles = result.current.messages.map((m) => m.role)
    expect(roles[0]).toBe('user')
    expect(roles[1]).toBe('assistant')
    expect(result.current.messages[0]!.content).toBe('what does step 1 do?')

    // persistedIdsRef is not orphaned: the send-minted user message was
    // POSTed exactly ONCE (its persisted id survived the guard) — it is NOT
    // re-posted under the new (scope "evg-1", id B) key.
    const userPosts = appendCalls().filter((c) =>
      (c.body ?? '').includes('what does step 1 do?'),
    )
    expect(userPosts).toHaveLength(1)
    expect(userPosts[0]!.headers['x-cl-thread-id']).toBe(idA)
  })

  it('NEGATIVE PIN (bait #11, byte-for-byte): user-initiated switchThread while IDLE still wipes + rehydrates', async () => {
    seedThread(undefined, 'tid-pin-1', ['pinned thread turn'])

    const { result } = renderHook(() => useAiChat({ aiContext, endpoint: 'event-editor' }))
    await waitFor(() => expect(getThreadCalls()).toHaveLength(1))

    await act(async () => {
      result.current.switchThread?.('tid-pin-1')
    })
    // The existing semantics: messages RESET (wipe) then the chosen thread
    // REHYDRATES — the stale `prev.length > 0` guard would otherwise keep the
    // old list. Pin: the pane shows EXACTLY the chosen thread's contents.
    await waitFor(() =>
      expect(result.current.messages.map((m) => m.content)).toEqual(['pinned thread turn']),
    )
    expect(result.current.threadId).toBe('tid-pin-1')
    expect(readMap()['']).toBe('tid-pin-1')
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
