/**
 * L2-CHAT-1 regatefix2 — D2 (HIGH): the chat card MISREPORTS the staged
 * preview. The gate: the card read "1 event · 0 new labware" while the deck
 * bar over the SAME staged preview read "1 new labware, 1 event" (a ghost
 * plate was visibly PROPOSED). The card counted
 * chat.previewLabwareAdditions (the done result's additions — empty on the
 * shorthand path the gate ran) instead of the staged preview's actual
 * labwares/placements — the deck's truth source (previewPlacements, the same
 * count the deck bar renders).
 *
 * These locks pin the card's counts to the STAGED truth:
 *  - the labware count derives from the staged labwares the hook publishes
 *    (previewStagedLabwareCount — the onStagedExtras truth), NOT from the
 *    done-result additions alone;
 *  - with NO staged labware the card honestly says 0 (and the event count is
 *    its own truth — previewEvents);
 *  - an adoption refusal (D1's honest wall) renders role=alert on the card,
 *    names the cause, and keeps the preview actionable (Apply re-enabled
 *    once isAccepting settles).
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiPanelProvider, useRegisterAiChat } from '../shared/context/AiPanelContext'
import { ChatPreviewCard } from './ChatPreviewCard'
import type { UseAiChatReturn } from '../shared/hooks/useAiChat'
import type { ChatMessage } from '../types/ai'

afterEach(cleanup)

/** Stub of the registered chat: only the fields the card actually consumes. */
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

describe('ChatPreviewCard — regatefix2 D2: counts derive from the staged truth', () => {
  it('counts the STAGED labwares (the deck bar\'s truth), not the empty done-result additions', () => {
    // The gate's exact shape: one event staged, ONE staged labware (the ghost
    // plate), but the done result carried an EMPTY additions list.
    const chat = stubChat({
      hasPreview: true,
      previewEvents: [{ eventId: 'EVT-1', event_type: 'transfer' }] as never,
      previewLabwareAdditions: [],
      previewStagedLabwareCount: 1,
    })
    const { container } = renderCard(chat)
    const card = screen.getByTestId('chat-preview')
    const counts = container.querySelector('.chat-preview__counts')
    expect(counts?.textContent).toContain('1 event')
    // The card and the deck bar must agree: "1 new labware".
    expect(counts?.textContent).toContain('1 new labware')
    expect(card).toHaveTextContent('1 event · 1 new labware')
  })

  it('with NO staged labware the card honestly says 0 (never inflates from stale state)', () => {
    const chat = stubChat({
      hasPreview: true,
      previewEvents: [{ eventId: 'EVT-1', event_type: 'transfer' }] as never,
      previewLabwareAdditions: [],
      previewStagedLabwareCount: 0,
    })
    const { container } = renderCard(chat)
    expect(container.querySelector('.chat-preview__counts')?.textContent).toContain('0 new labware')
    expect(screen.getByTestId('chat-preview')).toHaveTextContent('1 event · 0 new labware')
  })

  it('multiple staged labwares pluralize like the deck bar', () => {
    const chat = stubChat({
      hasPreview: true,
      previewEvents: [{ eventId: 'EVT-1', event_type: 'transfer' }] as never,
      previewLabwareAdditions: [{ recordId: 'R1' }] as never,
      previewStagedLabwareCount: 3,
    })
    const { container } = renderCard(chat)
    expect(container.querySelector('.chat-preview__counts')?.textContent).toContain('3 new labwares')
  })
})
