/**
 * L2-P1-THREAD-RESTORE-1 / u3reloadresume — the picker's reload-resume seam
 * (r11 gate defect 2). After a reload the picker claimed "No threads yet"
 * (threads === null collapses to []) and left the tab's persisted thread
 * (the threadTabIds sessionStorage map) reachable only by hand-picking.
 *
 * Pins: while the list is unresolved the placeholder says "Loading
 * threads…" (never "No threads yet"); once loaded, the persisted id that
 * names a fetched row with messageCount > 0 is activated through the
 * registered chat's OWN switchThread (one-shot — a post-switch list
 * re-fetch never re-fires it); a messageless row (a fresh thread) is never
 * auto-selected (its empty read is an honest blank conversation, not a
 * "could not read" named reason); a genuinely empty account still says
 * "No threads yet" once the load resolves.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseAiChatReturn } from '../shared/hooks/useAiChat'
import type { ChatMessage } from '../types/ai'
import type { ThreadSummary } from '../shared/api/aiThreadClient'
import { AiPanelProvider, useRegisterAiChat } from '../shared/context/AiPanelContext'
import { HarnessChatPane } from './HarnessChatPane'

// The established import-graph mocks (HarnessChatPane.threadPicker.test.tsx).
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
  apiClient: { getRecord: vi.fn(), getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }) },
}))

const TAB_ID_KEY = 'cl.ai-thread-tab-ids'

const IN_FLIGHT: ThreadSummary = { threadId: 'tid-x', title: 'In-flight draft', updatedAt: '2026-11-14T00:00:00.000Z', messageCount: 3 }
const EMPTY_ROW: ThreadSummary = { threadId: 'tid-y', title: 'Empty shell', updatedAt: '2026-11-10T00:00:00.000Z', messageCount: 0 }

/**
 * A registered thread-scoped chat STUB: the pane under test is the picker
 * seam, so the chat's thread fields are the test doubles (switchThread spy;
 * listThreads promise controllable per test) — no fake server, no hook.
 */
function stubChat(overrides: {
  threadId?: string
  listThreads?: () => Promise<ThreadSummary[]>
  switchThread?: (id: string) => void
}): UseAiChatReturn {
  // The picker's dead-chrome gate needs ALL THREE thread-scoped fields
  // (HarnessChatPane.tsx:94) — the default no-op switchThread keeps the
  // chrome up; tests that pin auto-select pass their own spy.
  const switchThread = overrides.switchThread ?? vi.fn()
  return {
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
    ...(overrides.threadId ? { threadId: overrides.threadId } : {}),
    ...(overrides.listThreads ? { listThreads: overrides.listThreads } : {}),
    switchThread,
    newThread: vi.fn(),
  } as unknown as UseAiChatReturn
}

function Registrant({ chat }: { chat: UseAiChatReturn }) {
  useRegisterAiChat(chat, null)
  return <HarnessChatPane />
}

const select = () => screen.getByTestId('thread-picker-select') as HTMLSelectElement
const placeholder = () => select().options[0]!.textContent ?? ''

afterEach(() => { cleanup() })
beforeEach(() => { sessionStorage.clear() })

describe('HarnessChatPane — picker reload-resume (L2-P1-THREAD-RESTORE-1 / u3reloadresume)', () => {
  it('says "Loading threads…" while the list is unresolved — never "No threads yet"', () => {
    // The list never resolves: the picker stays in its loading state.
    const chat = stubChat({ threadId: 'minted-id', listThreads: () => new Promise(() => {}) })
    render(
      <AiPanelProvider>
        <Registrant chat={chat} />
      </AiPanelProvider>,
    )
    expect(placeholder()).toBe('Loading threads…')
    expect(screen.queryByText('No threads yet')).toBeNull()
  })

  it('auto-selects the tab\u0027s persisted thread once the list loads (the registered switchThread, one-shot)', async () => {
    // The tab persisted tid-x (a switch made before the reload). The chat is
    // active on a DIFFERENT id — the picker must activate the persisted one.
    sessionStorage.setItem(TAB_ID_KEY, JSON.stringify({ '': 'tid-x' }))
    const switchThread = vi.fn()
    const chat = stubChat({ threadId: 'minted-id', listThreads: async () => [IN_FLIGHT, EMPTY_ROW], switchThread })
    render(
      <AiPanelProvider>
        <Registrant chat={chat} />
      </AiPanelProvider>,
    )
    await vi.waitFor(() => expect(switchThread).toHaveBeenCalledWith('tid-x'))
    // One-shot: the resume fires exactly once per mount.
    await new Promise((r) => setTimeout(r, 50))
    expect(switchThread).toHaveBeenCalledTimes(1)
  })

  it('does NOT auto-select a persisted row with no messages (a fresh thread stays an honest blank)', async () => {
    sessionStorage.setItem(TAB_ID_KEY, JSON.stringify({ '': 'tid-y' }))
    const switchThread = vi.fn()
    const chat = stubChat({ threadId: 'minted-id', listThreads: async () => [EMPTY_ROW], switchThread })
    render(
      <AiPanelProvider>
        <Registrant chat={chat} />
      </AiPanelProvider>,
    )
    // Wait until the list has landed (the row renders), then: no switch.
    await vi.waitFor(() => expect(screen.getByRole('option', { name: /empty shell/i })).toBeInTheDocument())
    expect(switchThread).not.toHaveBeenCalled()
  })

  it('a genuinely empty account: "Loading threads…" while fetching, then "No threads yet" once the load resolves', async () => {
    let resolveList: (rows: ThreadSummary[]) => void = () => {}
    const chat = stubChat({
      threadId: 'minted-id',
      listThreads: () => new Promise<ThreadSummary[]>((r) => { resolveList = r }),
    })
    render(
      <AiPanelProvider>
        <Registrant chat={chat} />
      </AiPanelProvider>,
    )
    expect(placeholder()).toBe('Loading threads…')
    await act(async () => { resolveList([]) })
    await vi.waitFor(() => expect(placeholder()).toBe('No threads yet'))
  })
})
