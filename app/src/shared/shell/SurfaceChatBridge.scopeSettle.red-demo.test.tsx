/**
 * TEMPORARY RED / NON-VACUITY DEMONSTRATION (unit 3) — NOT the deliverable.
 * Deleted before any commit; useAiChat.ts is NEVER edited (forbidden).
 *
 * It vi.mocks the REAL useAiChat to STRIP the `scopeStatus` option — the
 * exact pre-unit-2 semantics (the gate never sees 'provisional'), so the
 * unit-2 provisional hold is gone — and renders the P6 door WITHOUT the
 * §3a hint (scopePending unset). Running the SAME fixed-behavior assertions
 * as SurfaceChatBridge.scopeSettle.test.tsx against that pre-fix tree must
 * FAIL — proving the pins are not vacuous (they genuinely observe the
 * unit-2 gate + the hint, and would break if either regressed).
 */
import { act, cleanup, render } from '@testing-library/react'
import { useEffect, useState, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiContext } from '../../types/aiContext'

// PRE-UNIT-2 SEMANTICS: strip the `scopeStatus` option so the real hook's
// provisional gates (useAiChat.ts:964 mint, :985 hydrate) never fire.
vi.mock('../hooks/useAiChat', async () => {
  const actual = await vi.importActual<typeof import('../hooks/useAiChat')>('../hooks/useAiChat')
  return {
    ...actual,
    useAiChat: (opts: Parameters<(typeof actual)['useAiChat']>[0]) => {
      const { scopeStatus: _strip, ...rest } = opts
      void _strip
      return actual.useAiChat(rest)
    },
  }
})
vi.mock('../../shared/api/aiClient', () => ({
  streamAssist: vi.fn().mockImplementation(async function* () {
    yield { type: 'done', result: { success: true, notes: [] } }
  }),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))
vi.mock('../../shared/api/client', () => ({
  apiClient: { getRecord: vi.fn(), getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }) },
}))
vi.mock('../../shared/ai/useWorkstateProposalFlow', () => ({
  useWorkstateProposalFlow: () => ({
    card: null, proposeWorkstate: vi.fn(), acceptWorkstate: vi.fn(), rejectWorkstate: vi.fn(), handleAgentAction: vi.fn(),
  }),
}))

const capture: Array<{ url: string; method: string; headers: Record<string, string> }> = []
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  const method = (init?.method ?? 'GET').toUpperCase()
  const headers = Object.fromEntries(Object.entries(init?.headers ?? {}).map(([k, v]) => [String(k), String(v)]))
  capture.push({ url, method, headers })
  const okJson = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
  if (url.includes('/api/ai/threads/')) {
    if (url.endsWith('/threads')) return okJson({ threads: [] })
    return okJson({ endpoint: 'browser', userId: 'USR-TEST', messages: [], mentions: [], updatedAt: '1970-01-01T00:00:00.000Z' })
  }
  return okJson({})
})
vi.stubGlobal('fetch', fetchMock)

import { AiPanelProvider, useAiPanel } from '../../shared/context/AiPanelContext'
import { usePublishSurfaceSlice, type DeckSliceBundle } from '../../shared/context/SurfaceSliceStore'
import { SurfaceChatBridge, DOOR_REQUIRED_RECHECK_DEADLINE_MS } from './SurfaceChatBridge'
import type { UseAiChatReturn } from '../hooks/useAiChat'

const TAB_ID_KEY = 'cl.ai-thread-tab-ids'
const readMap = (): Record<string, string> => JSON.parse(sessionStorage.getItem(TAB_ID_KEY) ?? '{}') as Record<string, string>
const threadIO = () => capture.filter((c) => c.url.includes('/api/ai/threads/'))
const threadGets = () => threadIO().filter((c) => c.method === 'GET' && !c.url.endsWith('/threads'))
const threadPosts = () => threadIO().filter((c) => c.method === 'POST')
async function flush(n = 4): Promise<void> {
  await act(async () => {})
  for (let i = 0; i < n; i++) await Promise.resolve()
  await act(async () => {})
}
function deckBundle(scope: string | undefined): DeckSliceBundle {
  return {
    endpoint: 'event-editor', surface: 'event-editor', summary: 'Deck EVG-1',
    ...(scope !== undefined ? { scope } : {}),
    contextPatch: { eventGraphId: 'EVG-1', placementCount: 0, eventCount: 1, events: [], labwares: [] },
    handlers: { onAcceptEvent: () => {} },
  }
}
const analysisBase: AiContext = { surface: 'analysis', summary: '', surfaceContext: {} }
function LateScopeDeckPublisher({ delayMs = 50 }: { delayMs?: number }) {
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { const t = window.setTimeout(() => setLoaded(true), delayMs); return () => window.clearTimeout(t) }, [])
  usePublishSurfaceSlice('deck', loaded ? deckBundle('EVG-1') : deckBundle(undefined))
  return null
}
function ScopelessDeckPublisher() { usePublishSurfaceSlice('deck', deckBundle(undefined)); return null }
const panelSink: { chat: UseAiChatReturn | null } = { chat: null }
function ChatProbeSink() { panelSink.chat = useAiPanel()?.chat ?? null; return null }
function Door(props: { host: string; base: { context: AiContext; scope?: string }; scopePending?: boolean; children?: ReactNode }) {
  return (
    <AiPanelProvider>
      <SurfaceChatBridge host={props.host} base={props.base} scopePending={props.scopePending} />
      {props.children}
      <ChatProbeSink />
    </AiPanelProvider>
  )
}

describe('RED (pre-unit-2, no hint) — the fixed-behavior pins FAIL', () => {
  afterEach(() => { cleanup(); capture.length = 0; sessionStorage.clear(); panelSink.chat = null; vi.useRealTimers() })

  // The assertions below are the DELIVERABLE's post-fix behaviour (same as
  // SurfaceChatBridge.scopeSettle.test.tsx). Against the gate-stripped
  // pre-unit-2 hook they MUST FAIL — that is the non-vacuity proof.
  it('P2 RED: cold-mount === live — late EVG scope => first IO carries it, ONE map key (MUST FAIL pre-unit-2)', async () => {
    vi.useFakeTimers()
    render(<Door host="event-editor" base={{ context: analysisBase }}><LateScopeDeckPublisher /></Door>)
    await flush()
    expect(threadIO()).toHaveLength(0)             // scope undecided => zero IO
    expect(readMap()).toEqual({})
    await act(async () => { vi.advanceTimersByTime(50) })
    await flush()
    const g = threadGets()
    expect(g).toHaveLength(1)
    expect(g[0]!.headers['x-cl-thread-scope']).toBe('EVG-1')
    expect(Object.keys(readMap())).toEqual(['EVG-1'])   // ONE key (no "" split)
  })

  it('P3 RED: bounded release — zero IO before the deadline, ONE settled-absent GET after (MUST FAIL pre-unit-2)', async () => {
    vi.useFakeTimers()
    render(<Door host="event-editor" base={{ context: analysisBase }}><ScopelessDeckPublisher /></Door>)
    await flush()
    expect(vi.getTimerCount()).toBeGreaterThan(0)  // the settle deadline IS armed
    expect(threadIO()).toHaveLength(0)             // and NOTHING before it
    expect(readMap()).toEqual({})
    await act(async () => { vi.advanceTimersByTime(DOOR_REQUIRED_RECHECK_DEADLINE_MS) })
    await flush()
    const g = threadGets()
    expect(g).toHaveLength(1)
    expect('x-cl-thread-scope' in g[0]!.headers).toBe(false)  // settled-absent
    expect(threadPosts()).toHaveLength(0)
    expect(Object.keys(readMap())).toEqual([''])
  })

  it('P5 RED: a provisional send writes nothing; on release the held turn POSTs under the settled scope (MUST FAIL pre-unit-2)', async () => {
    vi.useFakeTimers()
    render(<Door host="event-editor" base={{ context: analysisBase }}><LateScopeDeckPublisher /></Door>)
    await flush()
    expect(readMap()).toEqual({})
    expect(threadIO()).toHaveLength(0)
    await act(async () => { void panelSink.chat!.sendPrompt('hold me') })
    await flush()
    expect(threadPosts()).toHaveLength(0)          // NOTHING written under provisional
    await act(async () => { vi.advanceTimersByTime(50) })
    await flush()
    const g = threadGets()
    expect(g).toHaveLength(1)
    expect(g[0]!.headers['x-cl-thread-scope']).toBe('EVG-1')
    expect(Object.keys(readMap())).toEqual(['EVG-1'])
    const p = threadPosts()
    expect(p.length).toBeGreaterThanOrEqual(1)
    for (const x of p) expect(x.headers['x-cl-thread-scope']).toBe('EVG-1')  // no scope-less write
  })
})
