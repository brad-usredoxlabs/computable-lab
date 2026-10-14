/**
 * HARNESS-SEQ-1 Phase 1 — the shared harness chat pane.
 *
 * The pane is a CONSUMER of the registration seam (useAiPanel().chat), never a
 * producer and never a second AiPanelProvider. `chat === null` is a first-class
 * state: an honest empty state, no placeholder messages, disabled composer.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiPanelProvider, useRegisterAiChat } from '../shared/context/AiPanelContext'
import type { UseAiChatReturn } from '../shared/hooks/useAiChat'
import type { ChatMessage } from '../types/ai'
import { ChatFocusProvider } from './ChatFocusContext'
import { HarnessChatPane } from './HarnessChatPane'

// ChatLog reuses the exported clarificationAnswerPrompt from AiTabPanel, whose
// import graph reaches pdfjs-dist; mock it so jsdom doesn't crash on DOMMatrix
// (same proven pattern as AiTabPanel.test.tsx).
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 0, fingerprints: [''], getPage: () => Promise.resolve(null), destroy: () => undefined }), destroy: () => undefined })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class { render() { return Promise.resolve() } },
}))

afterEach(cleanup)

const message = (id: string, role: ChatMessage['role'], content = id): ChatMessage => ({ id, role, content, timestamp: 0 })

/** A stub of the registered chat: only the fields the pane actually consumes. */
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
  }
  return { ...base, ...overrides } as UseAiChatReturn
}

/** Host that registers a chat into the nearest AiPanelProvider (the seam's producer). */
function Registrant({ chat, children }: { chat: UseAiChatReturn; children: React.ReactNode }) {
  useRegisterAiChat(chat)
  return <>{children}</>
}

describe('HarnessChatPane', () => {
  it('renders the registered chat under the nearest AiPanelProvider', () => {
    const chat = stubChat({ messages: [message('u1', 'user', 'Add a primer'), message('a1', 'assistant', 'Drafted a proposal')] })
    render(
      <AiPanelProvider>
        <Registrant chat={chat}>
          <HarnessChatPane />
        </Registrant>
      </AiPanelProvider>,
    )
    const pane = screen.getByTestId('harness-chat-pane')
    expect(pane).toBeInTheDocument()
    const log = screen.getByRole('log', { name: 'Conversation' })
    expect(log).toHaveTextContent('Add a primer')
    expect(log).toHaveTextContent('Drafted a proposal')
  })

  it('sends through the registered chat and clears the local composer', () => {
    const chat = stubChat()
    render(
      <AiPanelProvider>
        <Registrant chat={chat}>
          <HarnessChatPane />
        </Registrant>
      </AiPanelProvider>,
    )
    const composer = screen.getByLabelText('Message', { exact: true })
    expect(composer).not.toBeDisabled()
    fireEvent.change(composer, { target: { value: 'Save this sequence' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(chat.sendPrompt).toHaveBeenCalledWith('Save this sequence')
    expect(composer).toHaveValue('')
  })

  it('cancels the registered chat while it is streaming', () => {
    const chat = stubChat({ isStreaming: true })
    render(
      <AiPanelProvider>
        <Registrant chat={chat}>
          <HarnessChatPane />
        </Registrant>
      </AiPanelProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(chat.cancelStream).toHaveBeenCalled()
  })

  it('threads the host review handler with the originating user request', () => {
    const proposal = { operation: 'create_oligo', sequence: { residues: 'ATGCGT' } }
    const onReviewProposal = vi.fn()
    const chat = stubChat({
      messages: [
        message('u1', 'user', 'Add primer ATGCGCGTAGGTCTGATGCTAGT'),
        { ...message('a1', 'assistant'), sequenceProposal: proposal },
        message('u2', 'user', 'An unrelated follow-up'),
      ],
    })
    render(
      <AiPanelProvider>
        <Registrant chat={chat}>
          <HarnessChatPane onReviewProposal={onReviewProposal} />
        </Registrant>
      </AiPanelProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Review action' }))
    expect(onReviewProposal).toHaveBeenCalledWith(
      proposal,
      'Add primer ATGCGCGTAGGTCTGATGCTAGT',
    )
  })

  it('is honestly empty when no surface has registered a chat', () => {
    render(
      <AiPanelProvider>
        <HarnessChatPane />
      </AiPanelProvider>,
    )
    const pane = screen.getByTestId('harness-chat-pane')
    expect(pane).toBeInTheDocument()
    expect(pane).toHaveTextContent('No surface has registered a chat with this panel.')
    // Honest: no fake messages, no conversation log content, composer disabled.
    expect(screen.queryByText('Assistant')).toBeNull()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('does not send while honestly empty', () => {
    render(
      <AiPanelProvider>
        <HarnessChatPane />
      </AiPanelProvider>,
    )
    const composer = screen.getByLabelText('Message', { exact: true })
    expect(composer).toBeDisabled()
    fireEvent.change(composer, { target: { value: 'anything' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(screen.getByTestId('harness-chat-pane')).toHaveTextContent(
      'No surface has registered a chat with this panel.',
    )
  })

  it('drops the honest empty state the moment a chat registers', () => {
    const chat = stubChat({ messages: [message('u1', 'user', 'First real message')] })
    const view = render(
      <AiPanelProvider>
        <HarnessChatPane />
      </AiPanelProvider>,
    )
    expect(screen.getByTestId('harness-chat-pane')).toHaveTextContent(
      'No surface has registered a chat with this panel.',
    )
    view.rerender(
      <AiPanelProvider>
        <Registrant chat={chat}>
          <HarnessChatPane />
        </Registrant>
      </AiPanelProvider>,
    )
    expect(screen.getByTestId('harness-chat-pane')).not.toHaveTextContent(
      'No surface has registered a chat with this panel.',
    )
    expect(screen.getByRole('log', { name: 'Conversation' })).toHaveTextContent('First real message')
    fireEvent.change(screen.getByLabelText('Message', { exact: true }), { target: { value: 'ready' } })
    expect(screen.getByRole('button', { name: 'Send' })).not.toBeDisabled()
  })

  it('publishes the surface focus header slot', () => {
    const chat = stubChat()
    render(
      <AiPanelProvider>
        <Registrant chat={chat}>
          <ChatFocusProvider focus={{ surface: 'sequences', label: 'Sequences — Editor' }}>
            <HarnessChatPane />
          </ChatFocusProvider>
        </Registrant>
      </AiPanelProvider>,
    )
    expect(screen.getByTestId('surface-focus-header')).toHaveTextContent('Sequences — Editor')
  })
})
