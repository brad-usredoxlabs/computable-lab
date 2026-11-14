/**
 * L2-P1-TAB2-TRANSCRIPT-1 / u3selectid — a second tab's SELECTED thread id
 * rides the wire. The picker shows a TITLE; the wire takes an ID: the
 * hydration GET for a user selection must carry x-cl-thread-id = the
 * SELECTED listed id (and hydrate its N messages), never the tab's own
 * minted id (whose read the NO-FALLBACK server answers with a fresh EMPTY
 * thread the pane renders as blank — finding R1-8, recon shots 83/86:
 * picker value = listed id, msgs []).
 *
 * One file covers both halves of the unit:
 *  - WIRE (step 2): the client's single header site sends the explicit
 *    threadId when one rides the options (absent-not-undefined: the key is
 *    omitted, never undefined; the tab's mint stays the fallback for the
 *    tab's OWN thread).
 *  - TAB 2 (settled): a fresh tab (clean sessionStorage — its own mint;
 *    listed id ≠ mint) selects the listed thread; the hydration GET carries
 *    the listed id and the N messages hydrate (count against the FIXTURE,
 *    never 0); the map holds the proven read (AC4: a reload keeps it).
 *  - TRAP (step 3): a selection that lands while the scope is PROVISIONAL
 *    is NOT silently dropped (the pre-fix early `return` was the defect) —
 *    the settle re-run reads the HELD selection, so the re-hydration GET
 *    carries the SELECTED id and the N messages hydrate: never a silent
 *    blank pane, never the tab's own id.
 *
 * INSTRUMENT-FIRST: the REAL useAiChat + REAL aiThreadClient run (the wire
 * contract under test); only the fetch transport is faked, keyed by the
 * x-cl-thread-id header (the server's NO-FALLBACK shape: unknown/absent id
 * => a fresh empty thread, never a sibling).
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiPanelProvider, useRegisterAiChat } from '../context/AiPanelContext'
import { HarnessChatPane } from '../../agent/HarnessChatPane'
import { getThread, getThreadTabId } from '../api/aiThreadClient'
import { useAiChat } from './useAiChat'
import type { AiContext } from '../../types/aiContext'

// ChatLog's import graph reaches pdfjs-dist; mock it so jsdom doesn't crash
// on DOMMatrix (the established pattern — HarnessChatPane.threadPicker.test.tsx).
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 0, fingerprints: [''], getPage: () => Promise.resolve(null), destroy: () => undefined }), destroy: () => undefined })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class { render() { return Promise.resolve() } },
}))
vi.mock('../api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))
vi.mock('../api/client', () => ({
  apiClient: { getRecord: vi.fn(), getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }) },
}))
import { streamAssist } from '../api/aiClient'

const aiContext: AiContext = { surface: 'run-workspace', summary: 'test', surfaceContext: {} }
const FIXTURE_TID = 'tid-tab1-journey'
/** THE FIXTURE — tab 1's journey thread (count source: .length, N = 3). */
const FIXTURE: string[] = [
  'Add a 96-well deepwell plate to the deck.',
  'The draft names "96-well deepwell plate" and the lab spine could not bind it (unknown-noun).',
  'Use Generic 96-Well Deep Well Plate (labware lbw-def-generic-96-well-deep-plate) for labware.',
]
const EMPTY_THREAD = { endpoint: 'event-editor', userId: 'USR-TEST', messages: [], mentions: [], updatedAt: '1970-01-01T00:00:00.000Z' }

/** The fake server: THREAD GET keyed by the x-cl-thread-id header
 * (absent/unknown id => a fresh EMPTY thread, never a sibling — NO-FALLBACK).
 * LIST GETs (the picker; the server's LIST scope is the query param —
 * listThreads sends no scope header) always list the FIXTURE thread so the
 * picker shows the listed option. */
interface Captured { url: string; method: string; headers: Record<string, string> }
const capture: Captured[] = []
let threadContents: Record<string, string[]> = {}
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  const method = (init?.method ?? 'GET').toUpperCase()
  const headers = Object.fromEntries(Object.entries(init?.headers ?? {}).map(([k, v]) => [String(k), String(v)]))
  capture.push({ url, method, headers })
  const okJson = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload })
  const isList = method === 'GET' && url.endsWith('/threads')
  const isThreadGet = method === 'GET' && !isList && url.includes('/api/ai/threads/')
  if (isThreadGet) {
    const contents = threadContents[headers['x-cl-thread-id'] ?? ''] ?? []
    return okJson({ ...EMPTY_THREAD, messages: contents.map((content, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content, createdAt: `2026-11-14T00:0${i}:00.000Z` })) })
  }
  if (isList) {
    return okJson({ threads: [{ threadId: FIXTURE_TID, title: FIXTURE[0], updatedAt: EMPTY_THREAD.updatedAt }] })
  }
  return okJson(EMPTY_THREAD)
})
vi.stubGlobal('fetch', fetchMock)
const threadGets = () => capture.filter((c) => c.method === 'GET' && c.url.includes('/api/ai/threads/') && !c.url.endsWith('/threads'))

/** A host owning a REAL useAiChat (the R1-8 surface: endpoint 'event-editor',
 * no scope) and registering it for the pane. `scopeStatus` can transition
 * provisional → settled on the SAME hook instance (the settle re-run). */
function Host({ chatRef, scopeStatus }: { chatRef: { current: ReturnType<typeof useAiChat> | null }; scopeStatus?: 'provisional' }) {
  const chat = useAiChat({ aiContext, endpoint: 'event-editor', ...(scopeStatus ? { scopeStatus } : {}) })
  chatRef.current = chat
  useRegisterAiChat(chat, null)
  return <HarnessChatPane />
}

/** A host owning a REAL useAiChat with NO pane — drives the hook's returned
 * switchThread directly. During a PROVISIONAL hold the pane's select is
 * DISABLED (activeId null) and listThreads returns [] (C-2), so the pane
 * cannot deliver a selection; the hook-level call is the honest unit test of
 * the hold contract (a silent early `return` would drop it). */
function HookHost({ chatRef, scopeStatus }: { chatRef: { current: ReturnType<typeof useAiChat> | null }; scopeStatus?: 'provisional' }) {
  const chat = useAiChat({ aiContext, endpoint: 'event-editor', ...(scopeStatus ? { scopeStatus } : {}) })
  chatRef.current = chat
  return null
}

const select = () => screen.getByTestId('thread-picker-select') as HTMLSelectElement
const logMessages = () => screen.getAllByRole('log').flatMap((l) => [...l.querySelectorAll<HTMLElement>('.chat-log-msg')])

afterEach(() => { cleanup() })
beforeEach(() => {
  sessionStorage.clear()
  capture.length = 0
  threadContents = {}
  vi.mocked(streamAssist).mockImplementation(async function* () {
    yield { type: 'done', result: { success: true, notes: [] } }
  } as never)
})

describe('u3selectid — a second tab selects a listed thread: the wire carries the SELECTED id', () => {
  it('WIRE (step 2): the explicit threadId rides x-cl-thread-id; absent => the tab mint (unchanged contract)', async () => {
    threadContents[FIXTURE_TID] = FIXTURE // the server's copy of the listed thread
    const minted = getThreadTabId(undefined) // the tab's own thread (the single mint site)
    expect(FIXTURE_TID).not.toBe(minted)
    const explicit = await getThread('event-editor', { threadId: FIXTURE_TID })
    const e = threadGets().at(-1)!
    expect(e.headers['x-cl-thread-id']).toBe(FIXTURE_TID) // the SELECTED id, not the mint
    expect(explicit.messages).toHaveLength(FIXTURE.length)
    // The tab's OWN thread: no explicit id => the mint rides (byte-unchanged).
    await getThread('event-editor')
    expect(threadGets().at(-1)!.headers['x-cl-thread-id']).toBe(minted)
  })

  it('TAB 2 (settled): selecting the listed thread makes the GET carry it and the N messages hydrate (not 0)', async () => {
    threadContents[FIXTURE_TID] = FIXTURE // tab 1's journey thread on the server
    const chatRef = { current: null as ReturnType<typeof useAiChat> | null }
    render(<AiPanelProvider><Host chatRef={chatRef} /></AiPanelProvider>)
    await waitFor(() => expect(select()).not.toBeDisabled())
    // FRESH TAB 2: a clean map minted its own id (the listed id differs from it).
    const minted = getThreadTabId(undefined)
    await waitFor(() => expect(threadGets().some((c) => c.headers['x-cl-thread-id'] === minted)).toBe(true))
    expect(FIXTURE_TID).not.toBe(minted)
    fireEvent.change(select(), { target: { value: FIXTURE_TID } })
    // (a) the hydration GET carries the SELECTED id (equality, not presence):
    await waitFor(() => {
      const sel = threadGets().find((c) => c.headers['x-cl-thread-id'] === FIXTURE_TID)
      expect(sel?.url).toBe('/api/ai/threads/event-editor')
    })
    // (b) the N messages hydrate (the fixture's count, never 0):
    await waitFor(() => expect(logMessages()).toHaveLength(FIXTURE.length))
    expect(select().value).toBe(FIXTURE_TID)
    // the read that PROVED the thread is what the tab keeps (AC4: reload):
    expect(JSON.parse(sessionStorage.getItem('cl.ai-thread-tab-ids') ?? '{}')['']).toBe(FIXTURE_TID)
  })

  it('TRAP (step 3): a selection on a PROVISIONAL scope is not silently dropped — the settle re-run reads it', async () => {
    threadContents[FIXTURE_TID] = FIXTURE
    const chatRef = { current: null as ReturnType<typeof useAiChat> | null }
    const Wrapper = ({ status }: { status?: 'provisional' }) => (
      <HookHost chatRef={chatRef} scopeStatus={status} />
    )
    // SAME hook instance across the settle (stable tree position): the held
    // selection must survive the provisional window. A fresh instance would
    // silently drop it — the pre-fix defect's exact shape (the early
    // `return` in switchThread).
    const r = render(<Wrapper status="provisional" />)
    const minted = getThreadTabId(undefined) // what a (wrong) settle-mint read would carry
    expect(FIXTURE_TID).not.toBe(minted)
    // The scope is PROVISIONAL: the pane's select would be disabled and
    // listThreads returns [] (C-2), so the user's selection is delivered
    // to the hook's returned switchThread DIRECTLY (the unit under test).
    // (chatRef is set during render — synchronous; no waitFor needed.)
    const switchThread = chatRef.current!.switchThread!
    act(() => { switchThread(FIXTURE_TID) })
    // The selection is HELD, not dropped: no read has ridden the tab's own
    // mint (the silent-drop / wrong-thread shape) while the scope holds.
    expect(threadGets().some((c) => c.headers['x-cl-thread-id'] === minted)).toBe(false)
    // The scope SETTLES → the settle re-run reads the HELD selection: the
    // re-hydration GET carries the SELECTED id (not the mint) and the N
    // messages hydrate: never a silent blank pane, never the tab's own id.
    r.rerender(<Wrapper />)
    await waitFor(() => {
      const sel = threadGets().find((c) => c.headers['x-cl-thread-id'] === FIXTURE_TID)
      expect(sel?.url).toBe('/api/ai/threads/event-editor')
    })
    await waitFor(() => {
      const msgs = chatRef.current!.messages
      expect(Array.isArray(msgs) ? msgs.length : -1).toBe(FIXTURE.length)
    })
    // The read that PROVED the thread is what the tab keeps (AC4: reload).
    expect(JSON.parse(sessionStorage.getItem('cl.ai-thread-tab-ids') ?? '{}')['']).toBe(FIXTURE_TID)
  })
})
