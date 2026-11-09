/**
 * L2-SUITE-A-uifix2 [B] RED — the proposal card does not show the mix
 * volume/cycles (re-gate DEFECT 2, MAJOR).
 *
 * Evidence (followup/shots/12-06-followup-p7-staged.png vs
 * 16-07-followup-p7-view-changes.png): the `ChatPreviewCard`
 * ([data-testid=chat-preview]) rendered ONLY "Proposed deck changes ·
 * 1 event · 0 new labwares · mix"; the mix's volume 75 / cycles 3 were
 * visible only inside the "View changes" raw-JSON modal. The spec's P7 arm
 * requires the numbers on the PROPOSAL CARD itself.
 *
 * The fix is declarative (a field descriptor table read off the event's
 * `details`), not a per-verb if-chain: mix carries `details.volume` (a plain
 * number, unit implied uL) + `details.cycles`; add_material carries
 * `details.volume` as { value, unit }. Both display, human-readable.
 * These locks pin:
 *  - a mix event shows "75 uL · 3 cycles" on the card (human-readable);
 *  - an add_material event shows "100 uL" (the {value,unit} volume shape);
 *  - an event with no displayable detail shows no detail line (no dead chrome).
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

describe('ChatPreviewCard — L2-SUITE-A-uifix2 B: the mix volume/cycles are human-readable on the card', () => {
  it('a mix event shows "75 uL · 3 cycles" on the proposal card (the spec P7 arm)', () => {
    // The gate's exact mix shape: details { volume: 75, cycles: 3,
    // labwareId } — the numbers exist in the record (View-changes modal),
    // they must be on the card.
    const chat = stubChat({
      hasPreview: true,
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
    renderCard(chat)
    const card = screen.getByTestId('chat-preview')
    // The mix row labels the verb AND carries the human-readable detail.
    expect(card).toHaveTextContent('mix')
    expect(card).toHaveTextContent('75 uL')
    expect(card).toHaveTextContent('3 cycles')
    // The detail rides on the mix event's row (a detail line under the verb).
    expect(card.querySelector('.chat-preview__event-details')?.textContent).toBe('75 uL · 3 cycles')
  })

  it('an add_material event shows its volume as { value, unit } → "100 uL"', () => {
    const chat = stubChat({
      hasPreview: true,
      previewEvents: [
        {
          eventId: 'EVT-add',
          event_type: 'add_material',
          details: { volume: { value: 100, unit: 'uL' }, wells: ['B1', 'B2'] },
        },
      ] as never,
      previewLabwareAdditions: [],
      previewStagedLabwareCount: 0,
    })
    renderCard(chat)
    const card = screen.getByTestId('chat-preview')
    expect(card).toHaveTextContent('add_material')
    // fix run 4 / D1 CONFORM (ruling l2t0937 Q3, shape (A) — COMPOSE): the
    // row fact carries well(s) + volume (`B1, B2 ← 100 uL`), so the residual
    // is empty — the ONE detail line IS the fact, exactly.
    expect(card.querySelector('.chat-preview__event-details')?.textContent).toBe('B1, B2 ← 100 uL')
  })

  it('an event with no displayable detail shows no detail line (no dead chrome)', () => {
    // L2-SUITE-A-uifix3 D6 re-pin: the pre-fix leg pinned an incubate with
    // `temperature: 37` to render NO detail line — that pin WAS the defect
    // (the card face showed kind only, the declared detail never reached it).
    // Post-fix a temperature IS a displayable detail; the no-detail arm is
    // now the genuinely empty details (a dead empty line would be dead chrome).
    const chat = stubChat({
      hasPreview: true,
      previewEvents: [
        {
          eventId: 'EVT-incubate',
          event_type: 'incubate',
          details: { labwareId: 'lbw-seed-plate-96-flat' },
        },
      ] as never,
      previewLabwareAdditions: [],
      previewStagedLabwareCount: 0,
    })
    renderCard(chat)
    const card = screen.getByTestId('chat-preview')
    expect(card.querySelector('.chat-preview__event-details')).toBeNull()
  })

  it('D6: the pre-fix pin (incubate temperature 37) now renders the detail — the declared field reached the card face', () => {
    // The exact pre-fix pin shape, re-pinned to the post-fix behavior: the
    // temperature the record carries is on the card (the unit implied °C per
    // the repo's temperature convention).
    const chat = stubChat({
      hasPreview: true,
      previewEvents: [
        {
          eventId: 'EVT-incubate',
          event_type: 'incubate',
          details: { temperature: 37, labwareId: 'lbw-seed-plate-96-flat' },
        },
      ] as never,
      previewLabwareAdditions: [],
      previewStagedLabwareCount: 0,
    })
    renderCard(chat)
    const card = screen.getByTestId('chat-preview')
    expect(card.querySelector('.chat-preview__event-details')?.textContent).toBe('37 °C')
  })
})
