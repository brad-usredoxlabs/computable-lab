/**
 * L2-PROSE-SHORTHAND-SALVAGE-1 c1yamlui — browser gate
 * L2-prose-shorthand-browser-g1-l2t0800 D2 (surface half).
 *
 * The gate found the recovery marker (`data-recovered-from`) only on the
 * legacy MessageLog/ReviewAiPanel lineage. The DRAFTING surfaces mount
 * HarnessChatPane -> ChatLog over shared/hooks/useAiChat.ts, whose status
 * frame type dropped the server's `recoveredFrom`. These legs pin the
 * drafting lineage end to end:
 *   - the hook records the status frame's driver (relayed OPAQUELY as a
 *     string — no client-side driver union),
 *   - a clean turn leaves it null and renders NO attribute at all,
 *   - ChatLog renders the driver on its existing root <aside> and adds
 *     ZERO user-visible text,
 *   - the pane forwards the hook value (the mutation target),
 *   - the marker is one-turn: the next plain status frame clears it.
 */
import { cleanup, render, renderHook, act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiPanelProvider, useRegisterAiChat } from '../shared/context/AiPanelContext'
import { useAiChat, type UseAiChatReturn } from '../shared/hooks/useAiChat'
import { streamAssist } from '../shared/api/aiClient'
import type { AiContext } from '../types/aiContext'
import type { ChatMessage } from '../types/ai'
import { ChatLog } from './ChatLog'
import { HarnessChatPane } from './HarnessChatPane'

// ChatLog reuses the exported clarificationAnswerPrompt from AiTabPanel, whose
// import graph reaches pdfjs-dist; mock it so jsdom doesn't crash on DOMMatrix
// (same proven pattern as ChatLog.test.tsx / HarnessChatPane.test.tsx).
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 0, fingerprints: [''], getPage: () => Promise.resolve(null), destroy: () => undefined }), destroy: () => undefined })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class { render() { return Promise.resolve() } },
}))

vi.mock('../shared/api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))

vi.mock('../api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }),
  },
}))

afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
})

const aiContext: AiContext = {
  surface: 'ingestion',
  summary: 'Ingestion: vendor PDF',
  surfaceContext: { source: 'vendor-pdf' },
}

function frames(...events: Array<Record<string, unknown>>) {
  vi.mocked(streamAssist).mockImplementation(async function* () {
    for (const e of events) yield e as never
  })
}

/** Drive one send to settle and return the hook result. */
async function runTurn(...events: Array<Record<string, unknown>>) {
  frames(...events)
  const h = renderHook(() => useAiChat({ aiContext }))
  await act(async () => {
    h.result.current.sendPrompt('draft it')
  })
  await waitFor(() => expect(h.result.current.isStreaming).toBe(false), { timeout: 4000 })
  return h
}

const message = (id: string, role: ChatMessage['role'], content = id): ChatMessage => ({ id, role, content, timestamp: 0 })
const chatProps = {
  messages: [] as ChatMessage[],
  isStreaming: false,
  prompt: '',
  onPromptChange: vi.fn(),
  onSend: vi.fn(),
  onCancel: vi.fn(),
}

describe('drafting-surface recovery marker — hook (useAiChat)', () => {
  it('records the status frame recoveredFrom.driver, relayed opaquely', async () => {
    const h = await runTurn(
      { type: 'status', message: 'Draft recovered from the model text', recoveredFrom: { driver: 'yaml-shorthand' } },
      { type: 'done', result: { success: true, events: [], notes: [] } },
    )
    expect(h.result.current.statusRecoveredFrom).toEqual({ driver: 'yaml-shorthand' })
  })

  it('a status frame with no recoveredFrom leaves the marker null', async () => {
    const h = await runTurn(
      { type: 'status', message: 'Working on it' },
      { type: 'done', result: { success: true, events: [], notes: [] } },
    )
    expect(h.result.current.statusRecoveredFrom).toBeNull()
  })

  it('is one-turn: the next plain status frame clears the marker', async () => {
    const h = await runTurn(
      { type: 'status', message: 'Draft recovered from the model text', recoveredFrom: { driver: 'yaml-shorthand' } },
      { type: 'done', result: { success: true, events: [], notes: [] } },
    )
    expect(h.result.current.statusRecoveredFrom).toEqual({ driver: 'yaml-shorthand' })
    // A second turn whose status frames carry no recovery must not inherit it.
    frames(
      { type: 'status', message: 'Summarizing the draft' },
      { type: 'done', result: { success: true, events: [], notes: [] } },
    )
    await act(async () => {
      h.result.current.sendPrompt('again')
    })
    await waitFor(() => expect(h.result.current.isStreaming).toBe(false), { timeout: 4000 })
    expect(h.result.current.statusRecoveredFrom).toBeNull()
  })
})

describe('drafting-surface recovery marker — ChatLog render (inspection surface only)', () => {
  it('puts data-recovered-from on the existing root element and adds ZERO visible text', () => {
    const without = render(<ChatLog {...chatProps} messages={[message('m1', 'assistant', 'Drafted 1 event')]} />)
    const textWithout = without.container.textContent
    without.unmount()

    const withMarker = render(
      <ChatLog
        {...chatProps}
        messages={[message('m1', 'assistant', 'Drafted 1 event')]}
        recoveredFrom={{ driver: 'yaml-shorthand' }}
      />,
    )
    const root = withMarker.container.firstElementChild
    expect(root?.getAttribute('data-recovered-from')).toBe('yaml-shorthand')
    expect(withMarker.container.textContent).toBe(textWithout)
  })

  it('renders NO attribute when the turn was not recovered (absent, not empty)', () => {
    const view = render(<ChatLog {...chatProps} messages={[message('m1', 'assistant', 'Drafted 1 event')]} />)
    const root = view.container.firstElementChild
    expect(root?.hasAttribute('data-recovered-from')).toBe(false)
  })
})

describe('drafting-surface recovery marker — HarnessChatPane wiring', () => {
  function stubChat(overrides: Partial<UseAiChatReturn> = {}): UseAiChatReturn {
    const base = {
      messages: [] as ChatMessage[],
      isStreaming: false,
      isAccepting: false,
      previewEvents: [],
      previewLabwareAdditions: [],
      previewEventStates: new Map(),
      executingApplianceJobIds: new Set<string>(),
      hasPreview: false,
      unresolvedRefs: [],
      honestWall: null,
      adoptionError: null,
      previewStagedLabwareCount: 0,
      inputText: '',
      sendPrompt: vi.fn(),
      cancelStream: vi.fn(),
      acceptPreview: vi.fn(),
      acceptPreviewWithResolutions: vi.fn(),
      rejectPreview: vi.fn(),
      setPreviewEventState: vi.fn(),
      setPreviewEvents: vi.fn(),
      commitAcceptedPreviewEvents: vi.fn(async () => {}),
      clearStagedPreviewForExternalCommit: vi.fn(),
      clearHistory: vi.fn(),
      applyToGraph: vi.fn(),
      executeInstrumentApplianceJob: vi.fn(async () => {}),
      aiAvailable: true,
      recheckHealth: vi.fn(),
      thinkingMode: false,
      setThinkingMode: vi.fn(),
    }
    return { ...base, ...overrides } as UseAiChatReturn
  }

  function Registrant({ chat, children }: { chat: UseAiChatReturn; children: React.ReactNode }) {
    useRegisterAiChat(chat)
    return <>{children}</>
  }

  it('forwards the hook driver onto the ChatLog root attribute', () => {
    const chat = stubChat({ statusRecoveredFrom: { driver: 'yaml-shorthand' } })
    const view = render(
      <AiPanelProvider>
        <Registrant chat={chat}>
          <HarnessChatPane />
        </Registrant>
      </AiPanelProvider>,
    )
    const aside = view.container.querySelector('aside.sequence-chat')
    expect(aside).not.toBeNull()
    expect(aside?.getAttribute('data-recovered-from')).toBe('yaml-shorthand')
  })

  it('forwards nothing for a clean turn (attribute absent)', () => {
    const chat = stubChat({ statusRecoveredFrom: null })
    const view = render(
      <AiPanelProvider>
        <Registrant chat={chat}>
          <HarnessChatPane />
        </Registrant>
      </AiPanelProvider>,
    )
    const aside = view.container.querySelector('aside.sequence-chat')
    expect(aside).not.toBeNull()
    expect(aside?.hasAttribute('data-recovered-from')).toBe(false)
  })
})
