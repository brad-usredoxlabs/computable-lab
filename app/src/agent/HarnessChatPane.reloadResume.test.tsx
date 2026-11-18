/**
 * L2-P1-THREAD-RESTORE-1 / u3reloadresume — the picker's reload-resume seam
 * (r11 gate defect 2). "Loading threads…" while loading; the persisted tab id
 * (threadTabIds) naming a fetched row with messageCount>0 auto-selects via the
 * registered switchThread (one-shot); messageless rows never; empty → "No threads yet".
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseAiChatReturn } from '../shared/hooks/useAiChat'
import type { ThreadSummary } from '../shared/api/aiThreadClient'
import { AiPanelProvider, useRegisterAiChat } from '../shared/context/AiPanelContext'
import { HarnessChatPane } from './HarnessChatPane'

// Established import-graph mocks (HarnessChatPane.threadPicker.test.tsx).
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 0, fingerprints: [''], getPage: () => Promise.resolve(null), destroy: () => undefined }), destroy: () => undefined })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class { render() { return Promise.resolve() } },
}))
vi.mock('../shared/api/aiClient', () => ({ streamAssist: vi.fn(), getAiHealth: vi.fn().mockResolvedValue({ available: true }) }))
vi.mock('../shared/api/client', () => ({ apiClient: { getRecord: vi.fn(), getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }) } }))

const IN_FLIGHT: ThreadSummary = { threadId: 'tid-x', title: 'In-flight draft', updatedAt: '2026-11-14T00:00:00.000Z', messageCount: 3 }
const EMPTY_ROW: ThreadSummary = { threadId: 'tid-y', title: 'Empty shell', updatedAt: '2026-11-10T00:00:00.000Z', messageCount: 0 }
function stubChat(overrides: { threadId?: string; listThreads?: () => Promise<ThreadSummary[]>; switchThread?: (id: string) => void }): UseAiChatReturn {
  const noop = vi.fn()
  return {
    messages: [], isStreaming: false, isAccepting: false, previewEvents: [], previewLabwareAdditions: [],
    previewEventStates: new Map(), executingApplianceJobIds: new Set<string>(), hasPreview: false, unresolvedRefs: [],
    inputText: '', sendPrompt: noop, cancelStream: noop, acceptPreview: noop, acceptPreviewWithResolutions: noop, rejectPreview: noop,
    setPreviewEventState: noop, setPreviewEvents: noop, commitAcceptedPreviewEvents: vi.fn(async () => {}), clearHistory: noop,
    applyToGraph: noop, executeInstrumentApplianceJob: vi.fn(async () => {}), aiAvailable: true, recheckHealth: noop,
    thinkingMode: false, setThinkingMode: noop,
    ...(overrides.threadId ? { threadId: overrides.threadId } : {}),
    ...(overrides.listThreads ? { listThreads: overrides.listThreads } : {}),
    switchThread: overrides.switchThread ?? noop,
    newThread: noop,
  } as unknown as UseAiChatReturn
}

function Registrant({ chat }: { chat: UseAiChatReturn }) {
  useRegisterAiChat(chat, null)
  return <HarnessChatPane />
}

const placeholder = () => (screen.getByTestId('thread-picker-select') as HTMLSelectElement).options[0]!.textContent ?? ''

afterEach(() => { cleanup() })
beforeEach(() => { sessionStorage.clear() })

describe('HarnessChatPane — picker reload-resume (u3reloadresume)', () => {
  it('says "Loading threads…" while the list is unresolved — never "No threads yet"', async () => {
    sessionStorage.setItem('cl.ai-thread-tab-ids', JSON.stringify({ '': 'tid-x' }))
    const switchThread = vi.fn()
    const chat = stubChat({ threadId: 'minted-id', listThreads: () => new Promise(() => {}), switchThread })
    render(<AiPanelProvider><Registrant chat={chat} /></AiPanelProvider>)
    expect(placeholder()).toBe('Loading threads…')
    expect(screen.queryByText('No threads yet')).toBeNull()
    await new Promise((r) => setTimeout(r, 50))
    expect(switchThread).not.toHaveBeenCalled()
  })

  it('auto-selects the persisted thread once the list loads (one-shot, the registered switchThread)', async () => {
    sessionStorage.setItem('cl.ai-thread-tab-ids', JSON.stringify({ '': 'tid-x' }))
    const switchThread = vi.fn()
    const chat = stubChat({ threadId: 'minted-id', listThreads: async () => [IN_FLIGHT, EMPTY_ROW], switchThread })
    render(<AiPanelProvider><Registrant chat={chat} /></AiPanelProvider>)
    await vi.waitFor(() => expect(switchThread).toHaveBeenCalledWith('tid-x'))
    await new Promise((r) => setTimeout(r, 50))
    expect(switchThread).toHaveBeenCalledTimes(1)
  })

  it('does NOT auto-select a persisted row with no messages (honest blank)', async () => {
    sessionStorage.setItem('cl.ai-thread-tab-ids', JSON.stringify({ '': 'tid-y' }))
    const switchThread = vi.fn()
    const chat = stubChat({ threadId: 'minted-id', listThreads: async () => [EMPTY_ROW], switchThread })
    render(<AiPanelProvider><Registrant chat={chat} /></AiPanelProvider>)
    await act(async () => {})
    await vi.waitFor(() => expect(screen.getByRole('option', { name: /empty shell/i })).toBeInTheDocument())
    expect(switchThread).not.toHaveBeenCalled()
  })

  it('an empty account: "Loading threads…" while fetching, then "No threads yet" after the load resolves', async () => {
    let resolveList: (rows: ThreadSummary[]) => void = () => {}
    const chat = stubChat({ threadId: 'minted-id', listThreads: () => new Promise<ThreadSummary[]>((r) => { resolveList = r }) })
    render(<AiPanelProvider><Registrant chat={chat} /></AiPanelProvider>)
    expect(placeholder()).toBe('Loading threads…')
    await act(async () => { resolveList([]) })
    await vi.waitFor(() => expect(placeholder()).toBe('No threads yet'))
  })
})
