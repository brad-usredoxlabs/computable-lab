/**
 * L2-P1-TAB2-TRANSCRIPT-1 / u1tab2render — a second tab that selects a listed
 * thread renders that thread's transcript (the GET's message set) or states,
 * in the pane, a named reason why the thread cannot be shown here — never a
 * blank pane that reads as an empty conversation.
 *
 * INSTRUMENT-FIRST (step 1): the REAL useAiChat + REAL aiThreadClient run
 * (the wire contract under test); only the fetch transport is faked. A fresh
 * "tab 2" (clean sessionStorage — a new mint) selects a listed thread id and
 * the pin asserts (a) the hydration GET carries x-cl-thread-id = the SELECTED
 * id (the client sends the picker's pick, not another thread's id) and (b)
 * the pane renders exactly what the GET resolved (count asserted against the
 * FIXTURE, never a literal). Step 4 pins: nothing on select appends, POSTs or
 * mints a record — the append spy stays untouched and the map holds the
 * selected id (the selection write, not a fresh mint).
 *
 * NAMED-REASON (step 3): a selection whose hydration resolves to ZERO messages
 * renders the visible named state (thread id + scope + the read attempted) in
 * the transcript region, and it clears the moment a thread with messages is
 * selected. One predicate, fed by the hydration result — never re-derived
 * from the list's messageCount (a second empty-state authority).
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRegisterAiChat } from '../shared/context/AiPanelContext'
import { AiPanelProvider } from '../shared/context/AiPanelContext'
import { HarnessChatPane } from './HarnessChatPane'

// ChatLog's import graph reaches pdfjs-dist; mock it so jsdom doesn't crash
// on DOMMatrix (the established pattern — HarnessChatPane.threadPicker.test.tsx).
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

/** THE FIXTURE — the writing tab's thread content (count source: .length). */
const FIXTURE_TID = 'tid-deepwell'
const FIXTURE: string[] = [
  'Add a 96-well deepwell plate to the deck.',
  'The draft names "96-well deepwell plate" and the lab spine could not bind it (unknown-noun).',
  'Use Generic 96-Well Deep Well Plate (labware lbw-def-generic-96-well-deep-plate) for labware.',
  'The draft names "generic 96-well deep well plate" and the lab spine could not bind it (unknown-noun).',
  'Use lbw-def-generic-96-well-deep-plate for labware.',
  'The draft names "lbw-def-generic-96-well-deep-plate" and the lab spine could not bind it (unknown-noun).',
]

/** The fake server: thread GET/POST/List keyed by the x-cl-thread-id header. */
interface Captured { url: string; method: string; headers: Record<string, string>; body: string }
const capture: Captured[] = []
/** The GET's truth, keyed by the x-cl-thread-id header value (absent => []). */
let threadContents: Record<string, string[]> = {}
/** The LIST's truth (title + claimed count) — decoupled from the GET so the
 * named-reason arm can pin a listed id the read resolves empty for (the
 * R1-8 server-side shape); the pane must key off the GET, never this. */
let listedExtra: Record<string, { title: string; messageCount: number }> = {}

const EMPTY_THREAD = { endpoint: 'event-editor', userId: 'USR-TEST', messages: [], mentions: [], updatedAt: '1970-01-01T00:00:00.000Z' }

const listRowsFor = () => {
  const rows: Array<{ threadId: string; title: string; updatedAt: string; messageCount: number }> = []
  for (const [tid, contents] of Object.entries(threadContents)) {
    if (contents.length > 0) rows.push({ threadId: tid, title: (contents[0] ?? '').slice(0, 60), updatedAt: '2026-11-13T23:26:00.000Z', messageCount: contents.length })
  }
  for (const [tid, extra] of Object.entries(listedExtra)) rows.push({ threadId: tid, title: extra.title, updatedAt: '2026-11-13T23:25:00.000Z', messageCount: extra.messageCount })
  return rows
}

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  const method = (init?.method ?? 'GET').toUpperCase()
  const headers = Object.fromEntries(Object.entries(init?.headers ?? {}).map(([k, v]) => [String(k), String(v)]))
  const body = typeof init?.body === 'string' ? init.body : ''
  capture.push({ url, method, headers, body })
  const okJson = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload })
  if (url.includes('/api/ai/threads/')) {
    const id = headers['x-cl-thread-id'] ?? ''
    if (url.endsWith('/threads')) return okJson({ threads: listRowsFor() })
    if (method === 'GET') {
      const contents = threadContents[id] ?? []
      return okJson({ ...EMPTY_THREAD, messages: contents.map((content, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content, createdAt: `2026-11-13T23:2${i}:00.000Z` })), updatedAt: '2026-11-13T23:26:00.000Z' })
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

const getThreadCalls = () => capture.filter((c) => c.url.includes('/api/ai/threads/') && !c.url.endsWith('/threads') && c.method === 'GET')
const appendCalls = () => capture.filter((c) => c.url.includes('/api/ai/threads/') && !c.url.endsWith('/threads') && c.method === 'POST')

/** A host that owns a REAL useAiChat (endpoint 'event-editor', no scope — the
 * recon's (endpoint, scope) triple) and registers it into the nearest provider. */
function Host() {
  const chat = useAiChat({ aiContext, endpoint: 'event-editor' })
  useRegisterAiChat(chat, null)
  return <HarnessChatPane />
}

const select = () => screen.getByTestId('thread-picker-select') as HTMLSelectElement
const waitSelectEnabled = () => waitFor(() => expect(select()).not.toBeDisabled())
const logMessages = () => screen.getAllByRole('log').flatMap((l) => [...l.querySelectorAll<HTMLElement>('.chat-log-msg')])

afterEach(() => { cleanup() })
beforeEach(() => {
  sessionStorage.clear()
  capture.length = 0
  threadContents = {}
  listedExtra = {}
  vi.mocked(streamAssist).mockImplementation(async function* () {
    yield { type: 'done', result: { success: true, notes: [] } }
  } as never)
})

describe('HarnessChatPane — a second tab selects a listed thread (L2-P1-TAB2-TRANSCRIPT-1)', () => {
  it('INSTRUMENT (step 1): the hydration GET carries the selected id and the pane renders the GET message set', async () => {
    // THE WRITING TAB (tab 1): its journey thread lives on the server with
    // the FIXTURE content; it selects the listed thread and renders it.
    threadContents[FIXTURE_TID] = FIXTURE
    render(
      <AiPanelProvider>
        <Host />
      </AiPanelProvider>,
    )
    await waitSelectEnabled()
    await waitFor(() => expect(screen.getByRole('option', { name: /add a 96-well deepwell plate/i })).toBeInTheDocument())
    fireEvent.change(select(), { target: { value: FIXTURE_TID } })
    // (a) the hydration GET carries the SELECTED id — the map's id as the
    //     x-cl-thread-id header (the single header site the client owns), and
    //     against the selected thread's endpoint. Equality, not just presence.
    await waitFor(() => {
      const sel = getThreadCalls().find((c) => c.headers['x-cl-thread-id'] === FIXTURE_TID)
      expect(sel?.url).toBe('/api/ai/threads/event-editor')
    })
    // (b) the pane renders exactly what the GET resolved — the FIXTURE set
    //     (count against the fixture, never a literal), first row verbatim.
    await waitFor(() => expect(logMessages()).toHaveLength(FIXTURE.length))
    expect(logMessages()[0]!.textContent).toContain(FIXTURE[0]!)
    expect(select().value).toBe(FIXTURE_TID)
    // STEP 4: the select appended nothing (the append spy is untouched) and
    // mints no fresh id — the map holds the SELECTED id (the selection write).
    expect(appendCalls()).toHaveLength(0)
    expect(readMap()['']).toBe(FIXTURE_TID)
  })

  it('AC2: a reload of tab 2 keeps the selected thread selected and renders its messages', async () => {
    threadContents[FIXTURE_TID] = FIXTURE
    const first = render(
      <AiPanelProvider>
        <Host />
      </AiPanelProvider>,
    )
    await waitSelectEnabled()
    await waitFor(() => expect(screen.getByRole('option', { name: /add a 96-well deepwell plate/i })).toBeInTheDocument())
    fireEvent.change(select(), { target: { value: FIXTURE_TID } })
    await waitFor(() => expect(logMessages()).toHaveLength(FIXTURE.length))
    const mapsBefore = readMap()
    first.unmount()

    // THE RELOAD: a fresh mount, the SAME sessionStorage (the map persists —
    // the selection is the tab's thread; nothing re-mints over it).
    const second = render(
      <AiPanelProvider>
        <Host />
      </AiPanelProvider>,
    )
    await waitSelectEnabled()
    await waitFor(() => expect(select().value).toBe(FIXTURE_TID))
    // The re-hydration GET carries the kept selection; the pane re-renders
    // the GET message set (the same count the writing tab showed).
    await waitFor(() => expect(getThreadCalls().some((c) => c.headers['x-cl-thread-id'] === FIXTURE_TID)).toBe(true))
    await waitFor(() => expect(logMessages()).toHaveLength(FIXTURE.length))
    expect(readMap()).toEqual(mapsBefore)
    expect(appendCalls()).toHaveLength(0)
    second.unmount()
  })

  it('NAMED-REASON (step 3): a selection whose read resolves empty shows the named state, and it clears on a thread with messages', async () => {
    threadContents[FIXTURE_TID] = FIXTURE
    // Listed (the list claims 6) but the READ resolves empty — the R1-8
    // server-side shape: the pane must key off the GET, never the list.
    listedExtra['tid-vanished'] = { title: 'Add a 96-well deepwell plate to the deck.', messageCount: 6 }
    render(
      <AiPanelProvider>
        <Host />
      </AiPanelProvider>,
    )
    await waitSelectEnabled()
    // Two options share the deepwell title (the fixture + the vanished id) —
    // resolve by the option's value, not the name.
    const options = () => Array.from(select().options)
    await waitFor(() => expect(options().some((o) => o.value === 'tid-vanished')).toBe(true))

    // Select the vanished thread: the GET resolves ZERO messages. The pane
    // does NOT read as an empty conversation — the named-reason state
    // renders (thread id + scope + the read attempted), in the transcript
    // region, above the (empty) log.
    fireEvent.change(select(), { target: { value: 'tid-vanished' } })
    await waitFor(() => expect(select().value).toBe('tid-vanished'))
    const notice = await screen.findByTestId('thread-unreadable')
    expect(notice.textContent).toContain('tid-vanished')
    expect(notice.textContent).toContain('could not read')
    expect(logMessages()).toHaveLength(0)
    expect(appendCalls()).toHaveLength(0)

    // The reason CLEARS the moment a thread with messages is selected —
    // no flash-and-disappear (the picker's post-switch re-list does not
    // reset it; only the hydration result drives it).
    fireEvent.change(select(), { target: { value: FIXTURE_TID } })
    await waitFor(() => expect(screen.queryByTestId('thread-unreadable')).toBeNull())
    await waitFor(() => expect(logMessages()).toHaveLength(FIXTURE.length))
  })

  it('NAMED-REASON (step 3): a fresh mint keeps the honest blank new-conversation pane (no false reason)', async () => {
    threadContents[FIXTURE_TID] = FIXTURE
    render(
      <AiPanelProvider>
        <Host />
      </AiPanelProvider>,
    )
    await waitSelectEnabled()
    // The mount's own lazy-mint thread resolves empty — that is a NEW
    // conversation, not a read that came back empty: NO named-reason state.
    const minted = readMap()['']!
    await waitFor(() => expect(getThreadCalls().some((c) => c.headers['x-cl-thread-id'] === minted)).toBe(true))
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(screen.queryByTestId('thread-unreadable')).toBeNull()
    expect(screen.getByRole('log')).toBeInTheDocument()
  })
})
