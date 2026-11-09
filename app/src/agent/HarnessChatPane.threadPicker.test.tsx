/**
 * L2-THREAD-SCOPED-1 — Leg C: the pane's THREAD PICKER (HarnessChatPane).
 *
 * The pane hosts the picker next to the SurfaceFocusHeader (spec §4.7): a
 * thread-list control (select) + a "New thread" button. The pane stays a PURE
 * CONSUMER — the picker rides the registered chat's own (endpoint, scope)
 * (the hook's listThreads/switchThread/newThread closures); the pane never
 * re-derives thread identity.
 *
 * The REAL useAiChat + REAL aiThreadClient run (the wire contract under test);
 * only the model stream (aiClient) and the record client are mocked. Pins:
 *  - the picker renders on a thread-scoped chat, fed by
 *    GET /api/ai/threads/:endpoint/threads (rows = title + updatedAt; the
 *    list request carries the tab's x-cl-thread-id header);
 *  - SWITCHING threads: the pick is written into sessionStorage
 *    (`cl.ai-thread-tab-ids`), the chat re-keys, the chosen thread
 *    REHYDRATES — and bait #11 at the pane seam: the refs were reset, so
 *    the old thread's messages are NOT re-posted under the new thread's
 *    header (a stale persistedIdsRef would POST 'Old thread turn' with
 *    x-cl-thread-id: tid-b right after the switch);
 *  - "New thread": mints a FRESH id into the current scope's map entry
 *    (distinct from the active id) and re-keys;
 *  - DEAD-CHROME RULE: a registered chat WITHOUT an endpoint carries no
 *    thread-scoped fields => NO picker chrome at all (a picker with no
 *    threads behind it is a defect).
 *
 * The MINT-ONCE pin (two getThread round-trips in one tab => ONE id, bait
 * #7) is pinned by Leg B's useAiChat.threadScoped.test.ts (hook + client
 * level, where mint-once lives); this file pins the picker seam on top.
 */
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseAiChatReturn } from '../shared/hooks/useAiChat'
import type { ChatMessage } from '../types/ai'
import type { ThreadSummary } from '../shared/api/aiThreadClient'
import type { ApplianceEndpoint } from '../shared/api/aiThreadClient'
import { useRegisterAiChat } from '../shared/context/AiPanelContext'
import { AiPanelProvider } from '../shared/context/AiPanelContext'
import { HarnessChatPane } from './HarnessChatPane'

// ChatLog's import graph reaches pdfjs-dist; mock it so jsdom doesn't crash
// on DOMMatrix (the established pattern — HarnessChatPane.test.tsx).
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 0, fingerprints: [''], getPage: () => Promise.resolve(null), destroy: () => undefined }), destroy: () => undefined })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class { render() { return Promise.resolve() } },
}))
vi.mock('../shared/api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))
vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }),
  },
}))

import { streamAssist } from '../shared/api/aiClient'
import { useAiChat } from '../shared/hooks/useAiChat'
import type { AiContext } from '../types/aiContext'

const aiContext: AiContext = { surface: 'run-workspace', summary: 'test', surfaceContext: {} }

const TAB_ID_KEY = 'cl.ai-thread-tab-ids'

const readMap = (): Record<string, string> => JSON.parse(sessionStorage.getItem(TAB_ID_KEY) ?? '{}')

// ---------------------------------------------------------------------------
// The fake server: thread GET/POST/List keyed by (threadId header).
// ---------------------------------------------------------------------------

interface Captured {
  url: string
  method: string
  headers: Record<string, string>
  body: string
}
const capture: Captured[] = []
/** The thread content keyed by the x-cl-thread-id header value. */
let threadContents: Record<string, string[]> = {}

/**
 * The rows the LIST endpoint reports, derived from the LIVE thread store at
 * response time (the server computes each row from its thread files —
 * title = first user message, updatedAt desc). Deriving at response time
 * mirrors the real server and is immune to the hook's stable-closure
 * `listThreads` (the fake must see the data even when the caller's promise
 * resolved before the test set its fixtures).
 */
const listRowsFor = (): ThreadSummary[] =>
  Object.entries(threadContents)
    .filter(([, contents]) => contents.length > 0)
    .map(([tid, contents]) => ({
      threadId: tid,
      title: (contents[0] ?? '').slice(0, 60),
      updatedAt: '2026-10-28T00:00:09.000Z',
      messageCount: contents.length,
    }))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))

const EMPTY_THREAD = { endpoint: 'browser', userId: 'USR-TEST', messages: [], mentions: [], updatedAt: '1970-01-01T00:00:00.000Z' }

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  const method = (init?.method ?? 'GET').toUpperCase()
  const headers = Object.fromEntries(Object.entries(init?.headers ?? {}).map(([k, v]) => [String(k), String(v)]))
  const body = typeof init?.body === 'string' ? init.body : ''
  capture.push({ url, method, headers, body })
  const okJson = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload })
  if (url.includes('/api/ai/threads/')) {
    const id = headers['x-cl-thread-id'] ?? ''
    if (url.endsWith('/threads')) {
      return okJson({ threads: listRowsFor() })
    }
    if (method === 'GET') {
      const contents = threadContents[id] ?? []
      return okJson({
        ...EMPTY_THREAD,
        messages: contents.map((content, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content, createdAt: `2026-10-28T00:00:0${i}.000Z` })),
        updatedAt: '2026-10-28T00:00:09.000Z',
      })
    }
    if (method === 'POST') {
      const parsed = JSON.parse(body) as { message?: { content?: string } }
      const content = parsed.message?.content ?? ''
      if (!threadContents[id]) threadContents[id] = []
      threadContents[id].push(content)
      return okJson(EMPTY_THREAD)
    }
  }
  return okJson({})
})

vi.stubGlobal('fetch', fetchMock)

const listCalls = () => capture.filter((c) => c.url.endsWith('/threads'))
const threadCalls = () => capture.filter((c) => c.url.includes('/api/ai/threads/') && !c.url.endsWith('/threads'))
const getThreadCalls = () => threadCalls().filter((c) => c.method === 'GET')
const appendCalls = () => threadCalls().filter((c) => c.method === 'POST')

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  sessionStorage.clear()
  capture.length = 0
  threadContents = {}
  vi.mocked(streamAssist).mockImplementation(async function* () {
    yield { type: 'done', result: { success: true, notes: [] } }
  } as never)
})

/** A host that owns a REAL useAiChat and registers it into the nearest AiPanelProvider. */
function Host({ endpoint }: { endpoint?: ApplianceEndpoint }) {
  const chat = useAiChat({
    aiContext,
    ...(endpoint ? { endpoint } : {}),
  })
  useRegisterAiChat(chat, null)
  return <HarnessChatPane />
}

/** Same as Host but accepts scopeStatus to control the provisional gate. */
function HostWithScopeStatus({ endpoint, scopeStatus }: { endpoint?: ApplianceEndpoint; scopeStatus?: 'settled' | 'provisional' }) {
  const chat = useAiChat({
    aiContext,
    ...(endpoint ? { endpoint } : {}),
    ...(scopeStatus ? { scopeStatus } : {}),
  })
  useRegisterAiChat(chat, null)
  return <HarnessChatPane />
}

/** Registers a real chat but renders NOTHING — the pane must arrive via the provider. */
function RegistrarOnly({ scopeStatus }: { scopeStatus?: 'settled' | 'provisional' }) {
  const chat = useAiChat({ aiContext, endpoint: 'browser', ...(scopeStatus ? { scopeStatus } : {}) })
  useRegisterAiChat(chat, null)
  return null
}

/**
 * Registrar that holds scopeStatus in its own state — the parent (AiPanelProvider)
 * is NOT re-rendered when scopeStatus flips.
 */
function RegistrarWithScopeStatusState() {
  const [status, setStatus] = useState<'provisional' | 'settled'>('provisional')
  return (
    <>
      <RegistrarOnly scopeStatus={status} />
      <button data-testid="flip-settle" onClick={() => setStatus('settled')}>
        Flip to settled
      </button>
    </>
  )
}

const stubChat = (): UseAiChatReturn => ({
  messages: [] as ChatMessage[],
  isStreaming: false,
  isAccepting: false,
  previewEvents: [],
  previewLabwareAdditions: [],
  previewEventStates: new Map(),
  executingApplianceJobIds: new Set<string>(),
  hasPreview: false,
  unresolvedRefs: [],
  inputText: '',
  sendPrompt: vi.fn(),
  cancelStream: vi.fn(),
  acceptPreview: vi.fn(),
  acceptPreviewWithResolutions: vi.fn(),
  rejectPreview: vi.fn(),
  setPreviewEventState: vi.fn(),
  setPreviewEvents: vi.fn(),
  commitAcceptedPreviewEvents: vi.fn(async () => {}),
  clearHistory: vi.fn(),
  applyToGraph: vi.fn(),
  executeInstrumentApplianceJob: vi.fn(async () => {}),
  aiAvailable: true,
  recheckHealth: vi.fn(),
  thinkingMode: false,
  setThinkingMode: vi.fn(),
}) as unknown as UseAiChatReturn

describe('HarnessChatPane — the thread picker (L2-THREAD-SCOPED-1 leg C)', () => {
  it('renders the picker next to the focus header on a thread-scoped chat, fed by the thread LIST', async () => {
    // One pre-existing thread with a user turn (the list row is derived from
    // it server-side: title = first user message).
    threadContents['tid-a'] = ['Old thread turn']
    render(
      <AiPanelProvider>
        <Host endpoint="browser" />
      </AiPanelProvider>,
    )

    // The picker chrome: the select + the New-thread button, in the pane
    // (next to the SurfaceFocusHeader, above the honest wall / ChatLog).
    const picker = screen.getByTestId('thread-picker')
    expect(picker).toBeInTheDocument()
    const select = screen.getByTestId('thread-picker-select') as HTMLSelectElement
    expect(select).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new thread/i })).toBeInTheDocument()

    // Fed by the LIST endpoint: the picker's load fired, and the request
    // carried the tab's identity header.
    await vi.waitFor(() => expect(listCalls()).toHaveLength(1))
    expect(listCalls()[0]!.headers['x-cl-thread-id']).toBeTruthy()

    // The listed row is rendered (title + updatedAt). The list response
    // lands asynchronously after the fetch FIRES — wait for the row.
    await vi.waitFor(() =>
      expect(screen.getByRole('option', { name: /old thread turn/i })).toBeInTheDocument(),
    )

    // After the hook's lazy mint resolves, the select selects the tab's
    // own thread (the active id, held open when not yet listed).
    await vi.waitFor(() => {
      expect(screen.getByTestId('thread-picker-select')).not.toBeDisabled()
    })
    const minted = readMap()['']
    expect(minted).toBeTruthy()
    expect((screen.getByTestId('thread-picker-select') as HTMLSelectElement).value).toBe(minted)
    // The pane's own chrome survived: the conversation log is still there.
    expect(screen.getByRole('log', { name: 'Conversation' })).toBeInTheDocument()
  })

  it('switching threads writes the pick into sessionStorage, re-keys, and does NOT re-post the old thread (bait #11)', async () => {
    threadContents['tid-a'] = ['Old thread turn']
    threadContents['tid-b'] = ['New thread turn']
    render(
      <AiPanelProvider>
        <Host endpoint="browser" />
      </AiPanelProvider>,
    )
    const select = () => screen.getByTestId('thread-picker-select') as HTMLSelectElement
    await vi.waitFor(() => {
      expect(select()).not.toBeDisabled()
    })
    const minted = readMap()['']!

    // Pick tid-a from the list (wait for the row to exist first — firing
    // change against an option-less select is a no-op).
    await vi.waitFor(() =>
      expect(screen.getByRole('option', { name: /old thread turn/i })).toBeInTheDocument(),
    )
    fireEvent.change(select(), { target: { value: 'tid-a' } })
    await vi.waitFor(() => expect(readMap()['']).toBe('tid-a'))
    expect(getThreadCalls().some((c) => c.headers['x-cl-thread-id'] === 'tid-a')).toBe(true)
    // The new thread REHYDRATES (fresh persisted ids — not the stale
    // `prev.length > 0` guard): the pane shows tid-a's content.
    await vi.waitFor(() => expect(screen.getByRole('log', { name: 'Conversation' })).toHaveTextContent('Old thread turn'))
    expect(select().value).toBe('tid-a')

    // Switch to tid-b: the refs were RESET, so 'Old thread turn' must NOT
    // be re-posted under tid-b's header — a stale persistedIdsRef would
    // do exactly that.
    const appendsBefore = appendCalls().length
    const listsBefore = listCalls().length
    fireEvent.change(select(), { target: { value: 'tid-b' } })
    await vi.waitFor(() => expect(readMap()['']).toBe('tid-b'))
    await vi.waitFor(() => expect(screen.getByRole('log', { name: 'Conversation' })).toHaveTextContent('New thread turn'))
    expect(select().value).toBe('tid-b')

    // Bait #11: no stale re-post of the old thread's content under the
    // new thread's id; and no unsynced re-append of ANY message right
    // after the switch (the sync effect found nothing unsynced).
    const stale = appendCalls().slice(appendsBefore).filter((c) => c.headers['x-cl-thread-id'] === 'tid-b')
    expect(stale.some((c) => c.body.includes('Old thread turn'))).toBe(false)
    expect(appendCalls().length).toBe(appendsBefore)
    // The picker re-fetched its list after the switch.
    await vi.waitFor(() => expect(listCalls()).toHaveLength(listsBefore + 1))
    // The minted original id was preserved (the map is the single source of
    // truth — the switch wrote into it, never minted).
    expect(minted).toBeTruthy()
    expect(minted).not.toBe('tid-a')
  })

  it('"New thread" mints a fresh id into the current scope and re-keys', async () => {
    render(
      <AiPanelProvider>
        <Host endpoint="browser" />
      </AiPanelProvider>,
    )
    const select = () => screen.getByTestId('thread-picker-select') as HTMLSelectElement
    await vi.waitFor(() => {
      expect(select()).not.toBeDisabled()
    })
    const minted = readMap()['']!

    fireEvent.click(screen.getByRole('button', { name: /new thread/i }))
    const fresh = readMap()['']!
    expect(fresh).toBeTruthy()
    expect(fresh).not.toBe(minted)
    // The re-key fired a fresh hydration GET for the new id (empty thread:
    // the pane stays honest — no phantom messages).
    await vi.waitFor(() => {
      expect(getThreadCalls().some((c) => c.headers['x-cl-thread-id'] === fresh)).toBe(true)
    })
    expect(screen.getByRole('log', { name: 'Conversation' })).toBeInTheDocument()
    expect(screen.queryByText('No surface has registered a chat with this panel.')).toBeNull()
  })

  it('renders NO picker chrome when the registered chat is not thread-scoped (dead-chrome rule)', () => {
    // An in-memory chat (no endpoint) carries NO thread-scoped fields —
    // the picker has no threads behind it, so it must not exist at all.
    const chat = stubChat()
    function Registrant() {
      useRegisterAiChat(chat, null)
      return <HarnessChatPane />
    }
    render(
      <AiPanelProvider>
        <Registrant />
      </AiPanelProvider>,
    )
    expect(screen.queryByTestId('thread-picker')).toBeNull()
    expect(screen.queryByRole('button', { name: /new thread/i })).toBeNull()
    // The pane itself still renders (its existing chrome is untouched).
    expect(screen.getByTestId('harness-chat-pane')).toBeInTheDocument()
  })

  it('re-fetches threads when scopeStatus flips from provisional to settled (L2-THREADPICKER-REFETCH-1)', async () => {
    // Pre-existing thread rows on the server.
    threadContents['tid-a'] = ['Existing thread turn']

    // Mount with scopeStatus='provisional' — the ref-guard blocks the fetch,
    // so the list should be empty.
    const { rerender } = render(
      <AiPanelProvider>
        <HostWithScopeStatus endpoint="browser" scopeStatus="provisional" />
      </AiPanelProvider>,
    )

    // Picker chrome renders but shows no threads (provisional guard).
    await vi.waitFor(() => {
      expect(screen.queryByTestId('thread-picker')).toBeInTheDocument()
    })
    // The ref-guard returns [] synchronously, so no GET /threads fires.
    expect(listCalls()).toHaveLength(0)

    // Flip to 'settled' — the identity of listThreadsForChat MUST change
    // (scopeStatus in deps), so the consumer's useEffect re-runs and fires
    // the fetch.
    rerender(
      <AiPanelProvider>
        <HostWithScopeStatus endpoint="browser" scopeStatus="settled" />
      </AiPanelProvider>,
    )

    // A SECOND fetch fires after the settle flip.
    await vi.waitFor(() => expect(listCalls()).toHaveLength(1))
    // The thread rows from the settled fetch are now rendered.
    await vi.waitFor(() =>
      expect(screen.getByRole('option', { name: /existing thread turn/i })).toBeInTheDocument(),
    )
  })

  it('sibling pane re-fetches threads when the settle flips provisional->settled (L2-THREADPICKER-REFETCH-1 D2)', async () => {
    threadContents['tid-a'] = ['Existing thread turn']

    // Sibling topology: RegistrarWithScopeStatusState + HarnessChatPane as
    // siblings under AiPanelProvider. The state lives INSIDE the registrar,
    // so AiPanelProvider does NOT re-render when scopeStatus flips — the
    // pane must re-render via the registration-store bump.
    render(
      <AiPanelProvider>
        <RegistrarWithScopeStatusState />
        <HarnessChatPane />
      </AiPanelProvider>,
    )

    // Picker renders in sibling topology but shows no threads (provisional guard).
    await vi.waitFor(() => {
      expect(screen.queryByTestId('thread-picker')).toBeInTheDocument()
    })
    // No list calls because the ref-guard blocks the fetch.
    expect(listCalls()).toHaveLength(0)

    // Flip scopeStatus to settled — only the registrar re-renders, the
    // provider does NOT. The pane must re-render via the registration-store
    // bump (paneRelevantSignature includes threadId).
    await act(async () => {
      fireEvent.click(screen.getByTestId('flip-settle'))
    })

    // A list call fires after the settle flip.
    await vi.waitFor(() => expect(listCalls()).toHaveLength(1))
    // The thread row is rendered.
    await vi.waitFor(() =>
      expect(screen.getByRole('option', { name: /existing thread turn/i })).toBeInTheDocument(),
    )
    // Stability window (advc D3): no additional fetches after 500 ms.
    await new Promise((r) => setTimeout(r, 500))
    expect(listCalls()).toHaveLength(1)
  })
})
