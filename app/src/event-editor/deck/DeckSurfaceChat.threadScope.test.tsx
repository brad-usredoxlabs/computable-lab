/**
 * L2-THREAD-SCOPED-1 FIX RUN 1 — D1 seam test (adversarial-review defect 1,
 * acceptance (5) of the SUITEA-D3 deck-scope amendment).
 * retargeted from DeckSurfaceChat — assertions unchanged (CHATHOST-CONSOLIDATE-1 T-3)
 *
 * Cycle-1 verdict: `scope` existed as a useAiChat OPTION but NO production
 * caller passed it — every real request carried no scope, so one tab
 * navigating deck A -> deck B held ONE thread with both decks' turns (the
 * D3 leak). The fix wires the loaded `state.eventGraphId` as the chat scope
 * at the deck surfaces (the deck door + the run door — the ONE registrar).
 *
 * This test runs against the REAL deck door (DeckChatSlice + the ONE registrar) -> REAL useSurfaceChat ->
 * REAL useAiChat -> REAL aiThreadClient (NOT a hand-passed scope prop): a
 * fake fetch router answers thread traffic by REQUEST HEADERS only. Pins:
 *  - the hydration GET and the append POST for a loaded deck carry
 *    `x-cl-thread-scope` = the loaded eventGraphId (acceptance (5):
 *    get/append);
 *  - navigating to a second deck record (the editor state's eventGraphId
 *    changes) RE-KEYS: the second deck's own thread hydrates, deck A's
 *    messages are absent, and the per-(tab, scope) map holds DISTINCT ids
 *    (the D3 scenario at the wire seam).
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventEditorState } from '../EventEditorContext'
import { AiPanelProvider } from '../../shared/context/AiPanelContext'
import { DeckChatSlice } from './DeckChatSlice'
import { SurfaceChatBridge, DOOR_REQUIRED_RECHECK_DEADLINE_MS } from '../../shared/shell/SurfaceChatBridge'
import { HarnessChatPane } from '../../agent/HarnessChatPane'

const mocks = vi.hoisted(() => ({
  state: null as unknown as EventEditorState,
}))

vi.mock('../EventEditorContext', () => ({
  useEventEditor: () => ({
    state: mocks.state,
    actions: {
      setPreview: vi.fn(),
      clearPreview: vi.fn(),
      appendEvent: vi.fn(),
      commitPreview: vi.fn(),
    },
  }),
  useOptionalEventEditor: () => ({
    state: mocks.state,
    actions: {
      setPreview: vi.fn(),
      clearPreview: vi.fn(),
      appendEvent: vi.fn(),
      commitPreview: vi.fn(),
    },
  }),
}))

// ChatLog's import graph reaches pdfjs-dist; stub it (the established
// pattern — HarnessChatPane.threadPicker.test.tsx) so jsdom never touches
// DOMMatrix.
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 0, fingerprints: [''], getPage: () => Promise.resolve(null), destroy: () => undefined }), destroy: () => undefined })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class { render() { return Promise.resolve() } },
}))

vi.mock('../../shared/api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))
import { streamAssist } from '../../shared/api/aiClient'

// The record client + the proposal flow's executor tree are out of scope —
// the deck chat's thread transport (the seam under test) never touches them.
vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }),
  },
}))
vi.mock('../../shared/ai/useWorkstateProposalFlow', () => ({
  useWorkstateProposalFlow: () => ({
    card: null,
    proposeWorkstate: vi.fn(),
    acceptWorkstate: vi.fn(),
    rejectWorkstate: vi.fn(),
    handleAgentAction: vi.fn(),
  }),
}))

// --------------------------------------------------------------------------
// The fake thread server: threads keyed by the request's (scope, threadId)
// HEADERS — the wire contract under test. The REAL aiThreadClient composes
// those headers from the REAL per-(tab, scope) mint.
// --------------------------------------------------------------------------

interface CapturedCall {
  url: string
  method: string
  headers: Record<string, string>
  body: string
}
const capture: CapturedCall[] = []

interface FakeThread {
  endpoint: string
  userId: string
  messages: Array<{ role: string; content: string; createdAt: string }>
  mentions: []
  updatedAt: string
}
let serverThreads: Record<string, FakeThread> = {}
/** Deck scopes auto-seed one turn on FIRST SIGHT of (scope, mintedId). */
let autoSeedContents: Record<string, string> = {}

const keyOf = (scope: string | undefined, threadId: string) => `${scope ?? '_'}\u0000${threadId}`

const EMPTY: FakeThread = {
  endpoint: 'event-editor',
  userId: 'USR-TEST',
  messages: [],
  mentions: [],
  updatedAt: '1970-01-01T00:00:00.000Z',
}

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  const method = (init?.method ?? 'GET').toUpperCase()
  const headers = Object.fromEntries(
    Object.entries(init?.headers ?? {}).map(([k, v]) => [String(k), String(v)]),
  )
  const body = typeof init?.body === 'string' ? init.body : ''
  capture.push({ url, method, headers, body })
  const okJson = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
  if (url.includes('/api/ai/threads/')) {
    const scope = headers['x-cl-thread-scope'] ?? undefined
    const id = headers['x-cl-thread-id'] ?? ''
    if (url.endsWith('/threads')) {
      // The picker's LIST route: rows derived from the live fake threads for
      // THIS scope (mirrors the server, which computes rows per scope).
      const threads = Object.entries(serverThreads)
        .filter(([k]) => k.startsWith(`${scope ?? '_'}\u0000`))
        .map(([k, t]) => ({
          threadId: k.split('\u0000')[1]!,
          title: (t.messages[0]?.content ?? '').slice(0, 60),
          updatedAt: t.updatedAt,
          messageCount: t.messages.length,
        }))
      return okJson({ threads })
    }
    if (url.endsWith('/promote')) {
      return okJson({ recordId: 'REC-promoted', promotedAt: '2026-10-29T00:00:00.000Z' })
    }
    if (method === 'GET') {
      if (scope && autoSeedContents[scope] && !serverThreads[keyOf(scope, id)]) {
        serverThreads[keyOf(scope, id)] = {
          ...EMPTY,
          messages: [{ role: 'user', content: autoSeedContents[scope], createdAt: '2026-10-29T00:00:00.000Z' }],
        }
      }
      return okJson(serverThreads[keyOf(scope, id)] ?? EMPTY)
    }
    if (method === 'POST') {
      // Append: persist the turn under (scope, id) so a later hydration sees it.
      const target = serverThreads[keyOf(scope, id)] ?? { ...EMPTY, messages: [] }
      try {
        const parsed = JSON.parse(body) as { message?: { role?: string; content?: string } }
        if (parsed.message?.content !== undefined) {
          target.messages = [
            ...target.messages,
            {
              role: parsed.message.role ?? 'user',
              content: parsed.message.content,
              createdAt: '2026-10-29T00:00:01.000Z',
            },
          ]
        }
      } catch {
        /* non-JSON body: nothing to persist */
      }
      serverThreads[keyOf(scope, id)] = target
    }
    return okJson({ ...EMPTY, updatedAt: new Date().toISOString() })
  }
  return okJson({})
})
vi.stubGlobal('fetch', fetchMock)

const threadCalls = () => capture.filter((c) => c.url.includes('/api/ai/threads/'))
const getThreadCalls = () => threadCalls().filter((c) => c.method === 'GET')
const appendCalls = () => threadCalls().filter((c) => c.method === 'POST')

const TAB_ID_KEY = 'cl.ai-thread-tab-ids'
const readMap = (): Record<string, string> => JSON.parse(sessionStorage.getItem(TAB_ID_KEY) ?? '{}')

const deckState = (eventGraphId: string): EventEditorState =>
  ({
    eventGraphId,
    runId: 'RUN-1',
    platformId: 'biomix-2',
    variantId: 'biomix-2/1',
    vocabPackId: 'liquid-handling/v1',
    platforms: [],
    placements: [],
    events: [],
    labwares: {},
    equipments: {},
    preview: null,
    selection: null,
    focusPlacementId: null,
  }) as unknown as EventEditorState

beforeEach(() => {
  sessionStorage.clear()
  capture.length = 0
  serverThreads = {}
  autoSeedContents = {}
  vi.mocked(streamAssist).mockImplementation(async function* () {
    yield { type: 'done', result: { success: true, notes: [] } }
  } as never)
})

afterEach(cleanup)

describe('deck door — deck scope on the wire (FIX1 D1, acceptance (5); T-3 retarget)', () => {
  it('sends x-cl-thread-scope = loaded eventGraphId on get + append and RE-KEYS on deck navigation', async () => {
    autoSeedContents['EVG-seam-A'] = 'deck A turn'
    autoSeedContents['EVG-seam-B'] = 'deck B turn'
    mocks.state = deckState('EVG-seam-A')

    const view = render(
      <AiPanelProvider>
        <DeckChatSlice />
        <SurfaceChatBridge host="event-editor" />
        <HarnessChatPane />
      </AiPanelProvider>,
    )

    // Deck A loads: the hydration GET carries the deck's scope header and
    // deck A's thread hydrates.
    await waitFor(() =>
      expect(
        getThreadCalls().some((c) => c.headers['x-cl-thread-scope'] === 'EVG-seam-A'),
      ).toBe(true),
    )
    const idA = readMap()['EVG-seam-A']
    expect(idA).toBeTruthy()

    // ---- FIX2 D2: drive ONE real send through the pane's composer ----
    // Acceptance (5)'s append leg must be exercised, not asserted vacuously
    // (cycle-2 mutation control: deleting `threadOpts` from the hook's
    // appendThreadMessage call must turn THIS test red). The pane is rendered
    // beside the surface: the deck door registers the chat, HarnessChatPane
    // sends through it — the same send path the deck route uses.
    const textarea = screen.getByLabelText('Message') as HTMLTextAreaElement
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'seam append probe' } })
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    // The persist effect POSTs the user turn as soon as it lands in the
    // message list (before the stream resolves) — the loud arm: if no POST
    // ever happens, THIS assertion fails instead of the empty-loop passing.
    await waitFor(() => expect(appendCalls().length).toBeGreaterThan(0), { timeout: 4000 })

    // The append leg of acceptance (5), LOUD: at least one POST happened,
    // the deck scope rode it, and it is OUR prompt's POST (an unscoped
    // append — the mutation shape — fails the scope assertion below; a test
    // that produced no POST fails the count assertion above instead of
    // passing on an empty loop).
    const ourPosts = appendCalls().filter((c) => c.body.includes('seam append probe'))
    expect(ourPosts.length).toBeGreaterThanOrEqual(1)
    for (const c of appendCalls()) {
      expect(c.headers['x-cl-thread-scope'], `POST scope=${c.headers['x-cl-thread-scope']}`).toBe('EVG-seam-A')
    }
    const postsBeforeNav = appendCalls().length

    // Navigate to deck B (the same tab's editor state changes recordId —
    // the D3 scenario). The chat RE-KEYS: deck B's own thread hydrates and
    // deck A's message never appears.
    mocks.state = deckState('EVG-seam-B')
    view.rerender(
      <AiPanelProvider>
        <DeckChatSlice />
        <SurfaceChatBridge host="event-editor" />
        <HarnessChatPane />
      </AiPanelProvider>,
    )

    await waitFor(() =>
      expect(
        getThreadCalls().some(
          (c) => c.headers['x-cl-thread-scope'] === 'EVG-seam-B',
        ),
      ).toBe(true),
    )

    const idB = readMap()['EVG-seam-B']
    expect(idB).toBeTruthy()
    expect(idB).not.toBe(idA) // per-(tab, scope): distinct minted ids
    expect(readMap()['EVG-seam-A']).toBe(idA) // deck A's id intact for the return

    // Every thread call carried a deck scope, and NO call ever paired one
    // deck's scope with the OTHER deck's thread id (the D3 leak shape).
    const calls = threadCalls()
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) {
      expect(['EVG-seam-A', 'EVG-seam-B']).toContain(c.headers['x-cl-thread-scope'])
      const scope = c.headers['x-cl-thread-scope']
      const wrongId = scope === 'EVG-seam-A' ? idB : idA
      expect(c.headers['x-cl-thread-id'], `${c.method} scope=${scope}`).not.toBe(wrongId)
    }
    // Bait #11 at the scope axis: re-keying must NOT re-post deck A's turns
    // under deck B's header (a stale persistedIdsRef would). Assert on the
    // POSTs created BY THE NAVIGATION (non-vacuous: the count below is the
    // deck-A posts already made, so any NEW post is inspected).
    const navPosts = appendCalls().slice(postsBeforeNav)
    for (const c of navPosts) {
      expect(c.headers['x-cl-thread-scope']).toBe('EVG-seam-B')
      expect(c.body).not.toContain('seam append probe')
    }
  })

  it('an unsaved deck (no eventGraphId) sends NO scope header — the reserved "_" semantics (amendment edge (i))', async () => {
    // §P7 AMENDMENT (single-case exception, ruling ~/.hermes/cl/lanes/2/decisions/THREADSCOPE-P7-unsaveddeck-l2t0110-ruling.md):
    // the bare waitFor assumed a first-flush GET; per C-2/P3 an unsaved deck settles at the bounded deadline.
    // Timing premise corrected; the outcome assertions below are UNCHANGED and still pin the hold (mutant D).
    mocks.state = deckState('')
    // Force the "no record identity" shape the reducer holds pre-save.
    ;(mocks.state as unknown as { eventGraphId: string | null }).eventGraphId = null

    render(
      <AiPanelProvider>
        <DeckChatSlice />
        <SurfaceChatBridge host="event-editor" />
      </AiPanelProvider>,
    )

    // HOLD (C-2/P3): the unsaved deck settles at the bounded deadline, not on first flush.
    expect(getThreadCalls()).toHaveLength(0)
    await waitFor(() => expect(getThreadCalls().length).toBeGreaterThan(0), { timeout: DOOR_REQUIRED_RECHECK_DEADLINE_MS + 2000 })
    for (const c of threadCalls()) {
      expect(c.headers['x-cl-thread-scope']).toBeUndefined()
    }
    // The non-instance surface lands under the "" map key (reserved "_").
    expect(readMap()['']).toBeTruthy()
    expect(readMap()['EVG-seam-A']).toBeUndefined()
  }, DOOR_REQUIRED_RECHECK_DEADLINE_MS + 10000)
})
