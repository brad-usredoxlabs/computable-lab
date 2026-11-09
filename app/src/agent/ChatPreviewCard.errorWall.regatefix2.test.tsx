/**
 * L2-CHAT-1 regatefix2 — D1 (HIGH/blocker): the card's HONEST REFUSAL WALL.
 * When the chat-card Apply's adoption refuses (the shared core throws — the
 * gate's RunDeckLockConflictError), ChatPreviewCard must render a VISIBLE
 * role=alert wall naming the cause (chat.adoptionError) and keep the preview
 * actionable (retry / discard). Before this fix the throw escaped the hook
 * as an uncaught page error and the card rendered nothing — the gate's
 * "silent nothing".
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiPanelProvider, useRegisterAiChat } from '../shared/context/AiPanelContext'
import { ChatPreviewCard } from './ChatPreviewCard'
import type { UseAiChatReturn } from '../shared/hooks/useAiChat'

afterEach(cleanup)

function stubChat(overrides: Partial<UseAiChatReturn> = {}): UseAiChatReturn {
  const base = {
    messages: [],
    isStreaming: false,
    isAccepting: false,
    previewEvents: [],
    previewLabwareAdditions: [],
    previewEventStates: new Map(),
    executingApplianceJobIds: new Set<string>(),
    hasPreview: false,
    unresolvedRefs: [],
    honestWall: null,
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

function renderCard(chat: UseAiChatReturn) {
  return render(
    <AiPanelProvider>
      <CardHost chat={chat} />
    </AiPanelProvider>,
  )
}

function CardHost({ chat }: { chat: UseAiChatReturn }) {
  useRegisterAiChat(chat)
  return <ChatPreviewCard chat={chat} />
}

describe('ChatPreviewCard — regatefix2 D1: the adoption refusal wall', () => {
  it('an adoption refusal renders a visible honest wall naming the cause verbatim', () => {
    const chat = stubChat({
      hasPreview: true,
      previewEvents: [{ eventId: 'EVT-1', event_type: 'transfer' }] as never,
      previewLabwareAdditions: [{ recordId: 'REC-P1' }],
      adoptionError:
        'RunDeckLockConflictError: Run RUN-2026-09-19-run-vwr8 is locked to manual/manual_collapsed; explicit layout replacement is required before saving manual/manual_freeform.',
    })
    renderCard(chat)
    const wall = screen.getByTestId('chat-preview-error')
    expect(wall).toHaveAttribute('role', 'alert')
    expect(wall).toHaveTextContent('RunDeckLockConflictError')
    expect(wall).toHaveTextContent('locked to manual/manual_collapsed')
    // The cause line names what must happen (the lock's own message says it).
    expect(wall).toHaveTextContent('explicit layout replacement is required')
  })

  it('the refused preview stays ACTIONABLE — Apply re-enabled once accepting settles, discard offered', () => {
    const chat = stubChat({
      hasPreview: true,
      previewEvents: [{ eventId: 'EVT-1', event_type: 'transfer' }] as never,
      previewLabwareAdditions: [{ recordId: 'REC-P1' }],
      adoptionError: 'RunDeckLockConflictError: Run RUN-1 is locked to manual/manual_collapsed.',
    })
    renderCard(chat)
    const apply = screen.getByTestId('chat-preview-apply') as HTMLButtonElement
    expect(apply.disabled).toBe(false)
    expect(screen.getByTestId('chat-preview-discard')).toBeInTheDocument()
  })

  it('no wall when there is no refusal', () => {
    const chat = stubChat({
      hasPreview: true,
      previewEvents: [{ eventId: 'EVT-1', event_type: 'transfer' }] as never,
      previewLabwareAdditions: [],
    })
    renderCard(chat)
    expect(screen.queryByTestId('chat-preview-error')).toBeNull()
  })
})
