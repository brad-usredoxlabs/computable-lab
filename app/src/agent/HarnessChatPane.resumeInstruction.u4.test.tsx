/**
 * L2-P1-RETURN-LEG-1 u4 (LEG C): after a cold reload (F5) that rehydrated a
 * settled deck-adopt transcript, ONE click puts the person's original sentence
 * back into the composer — nothing re-applied, deck unchanged.
 *
 * Journey operation: "After a cold reload (F5), … ONE click puts the person's
 * original sentence back into the composer". The pane derives the affordance
 * from the REHYDRATED transcript (chat.messages, the hook's single source —
 * not a new store): settled = the rehydrated thread is not streaming AND a
 * completed deck-adopt sits in the transcript (a system note that begins with
 * 'Accepted …'). In that state the pane shows ONE control, "Resume
 * instruction"; clicking it stages THE LAST user message verbatim into the
 * composer (setPrompt) — NOTHING auto-sent (sendPrompt is NOT fired by the
 * click; the person reviews and presses Send).
 *
 * RED (pre-fix): no resume control exists — queryByTestId is null.
 * GREEN (post-fix): control present only in the settled cold-reloaded state,
 * click -> composer text equals the last user message verbatim, sendPrompt
 * never fired, and the control is ABSENT while a turn is streaming.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseAiChatReturn } from '../shared/hooks/useAiChat'
import type { ThreadSummary } from '../shared/api/aiThreadClient'
import { AiPanelProvider, useRegisterAiChat } from '../shared/context/AiPanelContext'
import { HarnessChatPane } from './HarnessChatPane'

// Established import-graph mocks (HarnessChatPane.threadPicker.test.tsx).
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 0, fingerprints: [''], getPage: () => Promise.resolve(null), destroy: () => undefined }), destroy: () => undefined }),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class { render() { return Promise.resolve() } },
}))
vi.mock('../shared/api/aiClient', () => ({ streamAssist: vi.fn(), getAiHealth: vi.fn().mockResolvedValue({ available: true }) }))
vi.mock('../shared/api/client', () => ({ apiClient: { getRecord: vi.fn(), getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }) } }))

const ORIGINAL = 'Place a 96-well plate on the deck.'
const ADOPTED_NOTE = 'Accepted 1 event plus 1 new labware plus 1 placement commit b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const REHYDRATED = [
  { id: 'm1', role: 'user' as const, content: ORIGINAL, timestamp: 1 },
  { id: 'm2', role: 'assistant' as const, content: 'Placing the plate.', timestamp: 2 },
  { id: 'm3', role: 'system' as const, content: ADOPTED_NOTE, timestamp: 3 },
]

const SETTLED_ROW: ThreadSummary = { threadId: 'tid-x', title: 'Settled adopt', updatedAt: '2026-11-14T00:00:00.000Z', messageCount: 3 }

function stubChat(overrides?: { messages?: typeof REHYDRATED; isStreaming?: boolean; listThreads?: () => Promise<ThreadSummary[]>; switchThread?: (id: string) => void }): UseAiChatReturn {
  const sendPrompt = vi.fn()
  return {
    messages: overrides?.messages ?? [], isStreaming: overrides?.isStreaming ?? false, isAccepting: false, previewEvents: [], previewLabwareAdditions: [],
    previewEventStates: new Map(), executingApplianceJobIds: new Set<string>(), hasPreview: false, unresolvedRefs: [],
    inputText: '', sendPrompt, cancelStream: vi.fn(), acceptPreview: vi.fn(), acceptPreviewWithResolutions: vi.fn(), rejectPreview: vi.fn(),
    setPreviewEventState: vi.fn(), setPreviewEvents: vi.fn(), commitAcceptedPreviewEvents: vi.fn(async () => {}), clearHistory: vi.fn(),
    applyToGraph: vi.fn(), executeInstrumentApplianceJob: vi.fn(async () => {}), aiAvailable: true, recheckHealth: vi.fn(),
    thinkingMode: false, setThinkingMode: vi.fn(),
    ...(overrides ? { switchThread: overrides.switchThread ?? vi.fn() } : {}),
    ...(overrides?.listThreads ? { listThreads: overrides.listThreads } : {}),
    newThread: vi.fn(),
  } as unknown as UseAiChatReturn
}

function Registrant({ chat }: { chat: UseAiChatReturn }) {
  useRegisterAiChat(chat, null)
  return <HarnessChatPane />
}

function composer(): HTMLTextAreaElement {
  return screen.getByLabelText('Message') as HTMLTextAreaElement
}

afterEach(() => { cleanup() })
beforeEach(() => { sessionStorage.clear() })

describe('HarnessChatPane — one click resumes the original sentence after a cold reload (LEG C, u4)', () => {
  it('settled cold-reloaded state (rehydrated transcript with a completed deck-adopt): the control is present, and one click puts the LAST user message verbatim into the composer — nothing auto-sent', async () => {
    sessionStorage.setItem('cl.ai-thread-tab-ids', JSON.stringify({ '': 'tid-x' }))
    const chat = stubChat({ messages: REHYDRATED, listThreads: async () => [SETTLED_ROW] })
    render(<AiPanelProvider><Registrant chat={chat} /></AiPanelProvider>)

    // The settled cold-reloaded state: ONE control, "Resume instruction".
    const resume = await screen.findByTestId('resume-instruction')
    expect(screen.getAllByTestId('resume-instruction')).toHaveLength(1)

    const sendPrompt = vi.mocked(chat.sendPrompt)
    expect(composer().value).toBe('')

    // ONE click: the original sentence back into the composer — verbatim.
    await act(async () => { resume.click() })
    expect(composer().value).toBe(ORIGINAL)
    // NOTHING auto-sent — the click only stages the composer.
    expect(sendPrompt).not.toHaveBeenCalled()
    expect(composer().disabled).toBe(false)
  })

  it('does NOT offer the resume control while a turn is streaming (the reloaded state is not settled)', async () => {
    sessionStorage.setItem('cl.ai-thread-tab-ids', JSON.stringify({ '': 'tid-x' }))
    const chat = stubChat({ messages: REHYDRATED, isStreaming: true, listThreads: async () => [SETTLED_ROW] })
    render(<AiPanelProvider><Registrant chat={chat} /></AiPanelProvider>)
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(screen.queryByTestId('resume-instruction')).toBeNull()
  })
})
