/**
 * L2-THREAD-SCOPED-1 FIX RUN 1 — D1 seam test (adversarial-review defect 1,
 * acceptance (5) of the SUITEA-D3 deck-scope amendment).
 *
 * Cycle-1 verdict: `scope` existed as a useAiChat OPTION but NO production
 * caller passed it — every real request carried no scope, so one tab
 * navigating deck A -> deck B held ONE thread with both decks' turns (the
 * D3 leak). The fix wires the loaded `state.eventGraphId` as the chat scope
 * at the deck surfaces (DeckSurfaceChat + RunSurfaceChatBridge).
 *
 * This test runs against the REAL DeckSurfaceChat -> REAL useSurfaceChat ->
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
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventEditorState } from '../EventEditorContext'
import { AiPanelProvider } from '../../shared/context/AiPanelContext'
import { DeckSurfaceChat } from './DeckSurfaceChat'

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
  capture.push({ url, method, headers })
  const okJson = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
  if (url.includes('/api/ai/threads/')) {
    const scope = headers['x-cl-thread-scope'] ?? undefined
    const id = headers['x-cl-thread-id'] ?? ''
    if (method === 'GET') {
      if (scope && autoSeedContents[scope] && !serverThreads[keyOf(scope, id)]) {
        serverThreads[keyOf(scope, id)] = {
          ...EMPTY,
          messages: [{ role: 'user', content: autoSeedContents[scope], createdAt: '2026-10-29T00:00:00.000Z' }],
        }
      }
      return okJson(serverThreads[keyOf(scope, id)] ?? EMPTY)
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
})

afterEach(cleanup)

describe('DeckSurfaceChat — deck scope on the wire (FIX1 D1, acceptance (5))', () => {
  it('sends x-cl-thread-scope = loaded eventGraphId on get + append and RE-KEYS on deck navigation', async () => {
    autoSeedContents['EVG-seam-A'] = 'deck A turn'
    autoSeedContents['EVG-seam-B'] = 'deck B turn'
    mocks.state = deckState('EVG-seam-A')

    const view = render(
      <AiPanelProvider>
        <DeckSurfaceChat />
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

    // Navigate to deck B (the same tab's editor state changes recordId —
    // the D3 scenario). The chat RE-KEYS: deck B's own thread hydrates and
    // deck A's message never appears.
    mocks.state = deckState('EVG-seam-B')
    view.rerender(
      <AiPanelProvider>
        <DeckSurfaceChat />
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
    // The append leg of acceptance (5): any POST under way carries the
    // deck scope too (the transport attaches it to all four routes).
    for (const c of appendCalls()) {
      expect(['EVG-seam-A', 'EVG-seam-B']).toContain(c.headers['x-cl-thread-scope'])
    }
  })

  it('an unsaved deck (no eventGraphId) sends NO scope header — the reserved "_" semantics (amendment edge (i))', async () => {
    mocks.state = deckState('')
    // Force the "no record identity" shape the reducer holds pre-save.
    ;(mocks.state as unknown as { eventGraphId: string | null }).eventGraphId = null

    render(
      <AiPanelProvider>
        <DeckSurfaceChat />
      </AiPanelProvider>,
    )

    await waitFor(() => expect(getThreadCalls().length).toBeGreaterThan(0))
    for (const c of threadCalls()) {
      expect(c.headers['x-cl-thread-scope']).toBeUndefined()
    }
    // The non-instance surface lands under the "" map key (reserved "_").
    expect(readMap()['']).toBeTruthy()
    expect(readMap()['EVG-seam-A']).toBeUndefined()
  })
})
