/**
 * L2-CLARIFY-TARGET-1 (Change 5 / P7) — the pane-side row-fact wiring in
 * `ChatPreviewCard` (spec test 9, re-pin :450-453):
 *
 *  - four `add_material` events render four DISTINCT rows (the W13 finding:
 *    four identical `add_material / 100 uL` rows → four checkable facts);
 *  - the row button text === the bar's reject verb (`Discard` — the bar's own
 *    word at `chat-preview-discard`), `Restore` when dropped;
 *  - the row button's `aria-label` names the row's fact, so two
 *    identically-worded controls stay distinguishable;
 *  - the per-row toggle still calls `chat.setPreviewEventState` with the same
 *    `eventId` and NOTHING else (the D1 guardrail pin: the rows are the
 *    EXISTING proposed-changes list — no second approval surface, no new
 *    write path; the testid `chat-preview-toggle-<eventId>` is unchanged —
 *    pinned by `HarnessChatPane.test.tsx:177`);
 *  - a message with no material mention renders no `(…)` suffix anywhere
 *    (bait #9: the id comes from the transcript's mention token — absent
 *    mention ⇒ no id, never an invented one).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
    previewEventStates: new Map<string, 'pending' | 'rejected'>(),
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

/** The W13 shape (receipts tour3 MODAL FULL): well + material + volumeUl. */
function addMaterialEvent(eventId: string, well: string) {
  return {
    eventId,
    event_type: 'add_material',
    details: { well, material: 'DMEM', volumeUl: 100, volume: { value: 100, unit: 'uL' } },
  }
}

/** The answer sentence of the turn that produced the preview (the LAST user
    message) — it carries the material mention token the record ids come from. */
function answerMessage(content: string, id = 'u1'): ChatMessage {
  return { id, role: 'user', content, timestamp: 0 }
}

const ANSWER_WITH_MENTION = 'Use [[material:MAT-dmem-ykg0|DMEM]] for material.'
const ANSWER_WITHOUT_MENTION = 'Use DMEM for material.'

describe('P7: the four add_material rows become four DISTINCT checkable facts', () => {
  it('four rows, four distinct facts, each naming well + volume + material (+ the mention-token id)', () => {
    const chat = stubChat({
      hasPreview: true,
      messages: [answerMessage(ANSWER_WITH_MENTION)],
      previewEvents: [
        addMaterialEvent('EVT-1', 'A2'),
        addMaterialEvent('EVT-2', 'A3'),
        addMaterialEvent('EVT-3', 'B2'),
        addMaterialEvent('EVT-4', 'B3'),
      ] as never,
      previewLabwareAdditions: [],
      previewStagedLabwareCount: 0,
    })
    const { container } = renderCard(chat)
    const facts = Array.from(container.querySelectorAll('[data-testid="chat-preview-row-fact"]')).map(
      (el) => el.textContent,
    )
    // Four rows, four DISTINCT strings (the whole finding):
    expect(facts).toEqual([
      'A2 ← 100 uL DMEM (MAT-dmem-ykg0)',
      'A3 ← 100 uL DMEM (MAT-dmem-ykg0)',
      'B2 ← 100 uL DMEM (MAT-dmem-ykg0)',
      'B3 ← 100 uL DMEM (MAT-dmem-ykg0)',
    ])
    expect(new Set(facts).size).toBe(4)
    // The bar is untouched (ONE verb everywhere): the row button text IS the
    // bar's own reject verb, and the bar's Discard button still exists.
    const barDiscard = screen.getByTestId('chat-preview-discard') as HTMLButtonElement
    expect(barDiscard.textContent).toBe('Discard')
    const rowButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-testid^="chat-preview-toggle-"]'),
    )
    expect(rowButtons).toHaveLength(4)
    for (const button of rowButtons) {
      expect(button.textContent).toBe('Discard')
    }
    // The aria-label names the row's FACT (two identically-worded buttons
    // stay distinguishable):
    expect(rowButtons[0]?.getAttribute('aria-label')).toBe('Discard A2 ← 100 uL DMEM (MAT-dmem-ykg0)')
    expect(rowButtons[1]?.getAttribute('aria-label')).toBe('Discard A3 ← 100 uL DMEM (MAT-dmem-ykg0)')
  })

  it('a message with no material mention renders no (… ) suffix anywhere (bait #9: no invented id)', () => {
    const chat = stubChat({
      hasPreview: true,
      messages: [answerMessage(ANSWER_WITHOUT_MENTION)],
      previewEvents: [addMaterialEvent('EVT-1', 'A2'), addMaterialEvent('EVT-2', 'A3')] as never,
      previewLabwareAdditions: [],
      previewStagedLabwareCount: 0,
    })
    const { container } = renderCard(chat)
    const card = screen.getByTestId('chat-preview')
    // The facts render well + volume + material — and NO id:
    const facts = Array.from(container.querySelectorAll('[data-testid="chat-preview-row-fact"]')).map(
      (el) => el.textContent,
    )
    expect(facts).toEqual(['A2 ← 100 uL DMEM', 'A3 ← 100 uL DMEM'])
    expect(card.textContent).not.toContain('MAT-')
    // and the row-action aria-labels carry the fact without an id too:
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-testid^="chat-preview-toggle-"]'))
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Discard A2 ← 100 uL DMEM')
  })

  it('the row renders ONE detail line: fact + RESIDUAL descriptor, no double line (fix run 4 / D1 CONFORM, ruling Q3 shape (A))', () => {
    const chat = stubChat({
      hasPreview: true,
      messages: [answerMessage(ANSWER_WITH_MENTION)],
      previewEvents: [
        {
          eventId: 'EVT-mix',
          event_type: 'mix',
          details: { volume: 75, cycles: 3, labwareId: 'lbw-seed-plate-96-flat' },
        },
      ] as never,
      previewLabwareAdditions: [],
      previewStagedLabwareCount: 0,
    })
    const { container } = renderCard(chat)
    // The row-fact formatter reads the event's own volume field → a fact
    // EXISTS for this event. The row renders ONE detail line = the fact
    // (`75 uL`) followed by the RESIDUAL of `eventDetailLine` (the fields the
    // fact did NOT carry — `3 cycles`), joined with ` · `, rendered inside
    // the EXISTING `chat-preview__event-details` element, which KEEPS
    // `data-testid="chat-preview-row-fact"` (ruling Q3 shape (A) — COMPOSE,
    // NOT REPLACE):
    const factLine = container.querySelector('[data-testid="chat-preview-row-fact"]')
    expect(factLine?.textContent).toBe('75 uL · 3 cycles')
    expect(factLine).not.toBeNull()
    // ONE detail line per row: the no-fact fallback element
    // (`chat-preview-event-details`) is NOT a second line on this row — the
    // no-double-line guard survives:
    expect(container.querySelector('[data-testid="chat-preview-event-details"]')).toBeNull()
    // … and the composed line IS the existing event-details element (the
    // row's primary checkable identity):
    expect(factLine?.classList.contains('chat-preview__event-details')).toBe(true)
    // No field text TWICE on a row: the fact's volume renders exactly ONCE
    // (excluded from the residual), and `3 cycles` exactly once:
    expect(factLine?.textContent?.match(/75 uL/g)?.length).toBe(1)
    expect(factLine?.textContent?.match(/3 cycles/g)?.length).toBe(1)
    // And the record's number the fact does not carry (3 cycles) is on the
    // face — the trust regression the adversarial gate measured:
    expect(container.querySelector('[data-testid="chat-preview"]')?.textContent).toContain('3 cycles')
  })

  it('an event with no recognised field keeps its own detail line (no dead chrome)', () => {
    const chat = stubChat({
      hasPreview: true,
      messages: [answerMessage(ANSWER_WITH_MENTION)],
      previewEvents: [
        {
          eventId: 'EVT-dwell',
          event_type: 'dwell',
          details: { duration: '2 min', labwareId: 'lbw-seed-plate-96-flat' },
        },
      ] as never,
      previewLabwareAdditions: [],
      previewStagedLabwareCount: 0,
    })
    const { container } = renderCard(chat)
    // The row-fact formatter yields null (no well/volume/material field) →
    // the eventDetailLine doctrine stands:
    expect(container.querySelector('[data-testid="chat-preview-row-fact"]')).toBeNull()
    expect(container.querySelector('[data-testid="chat-preview-event-details"]')?.textContent).toBe(
      '2 min',
    )
  })
})

describe('D1 guardrail: the row toggle is still ONLY setPreviewEventState(eventId, …)', () => {
  it('pending → rejected (Discard), rejected → pending (Restore); no other callback fires', () => {
    const setPreviewEventState = vi.fn()
    const chat = stubChat({
      hasPreview: true,
      messages: [answerMessage(ANSWER_WITH_MENTION)],
      previewEvents: [addMaterialEvent('EVT-1', 'A2'), addMaterialEvent('EVT-2', 'A3')] as never,
      previewEventStates: new Map<string, 'pending' | 'rejected'>([['EVT-2', 'rejected']]),
      previewLabwareAdditions: [],
      previewStagedLabwareCount: 0,
      acceptPreview: vi.fn(),
      rejectPreview: vi.fn(),
      setPreviewEventState,
    })
    const { container } = renderCard(chat)
    const discardToggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="chat-preview-toggle-EVT-1"]',
    )!
    const restoreToggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="chat-preview-toggle-EVT-2"]',
    )!
    // The dropped row's button reads Restore (the pending one reads the bar's
    // verb Discard):
    expect(discardToggle.textContent).toBe('Discard')
    expect(restoreToggle.textContent).toBe('Restore')
    expect(discardToggle.getAttribute('aria-pressed')).toBe('false')
    expect(restoreToggle.getAttribute('aria-pressed')).toBe('true')

    // THE D1 PIN: the toggle's click path is exactly the existing seam —
    fireEvent.click(discardToggle)
    expect(setPreviewEventState).toHaveBeenCalledTimes(1)
    expect(setPreviewEventState).toHaveBeenCalledWith('EVT-1', 'rejected')
    fireEvent.click(restoreToggle)
    expect(setPreviewEventState).toHaveBeenCalledTimes(2)
    expect(setPreviewEventState).toHaveBeenLastCalledWith('EVT-2', 'pending')
    // … and NOTHING else was called by the row (no new write path):
    expect((chat.acceptPreview as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
    expect((chat.rejectPreview as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
    expect(setPreviewEventState.mock.calls).toEqual([
      ['EVT-1', 'rejected'],
      ['EVT-2', 'pending'],
    ])
  })
})
