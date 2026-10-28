/**
 * L2-SUITE-A-uifix3 [D6] RED (regate-5 gate defect 6, MINOR/DISCLOSURE) — the
 * incubate proposal card face shows the event's DECLARED detail fields (the
 * same data the mix card shows: "75 uL · 3 cycles" precedent), not kind only.
 *
 * Gate evidence (run-main 96-09-p8.png / 100-09-p8-after-accept.png): the
 * accepted incubate record carries `{"event_type":"incubate", details:
 * {duration:"overnight", temperature:37, labwareId:"lbw-seed-plate-96-flat"}}`
 * yet the card face reads only "incubate · 1 event · 0 new labwares".
 *
 * THE FIX (mirror the mix precedent): the detail line is a DATA-DRIVEN field
 * descriptor over the event's `details` (ChatPreviewCard.eventDetailLine — a
 * field descriptor, NOT a per-kind TS switch table: it reads whatever
 * displayable fields the record actually carries). The descriptor knew
 * volume/cycles (the mix shape); it now also reads `duration` (a plain string
 * — "overnight") and `temperature` (the two wire shapes the compile emits:
 * { value, unit } per IncubateDetails, and the plain number the committed
 * record carries — unit implied °C, the repo's one temperature convention:
 * the liquid-handling vocab's temperature_C "°C", EquipmentTile "55 °C",
 * events.ts eventLabel "at 37°C").
 *
 * RED pins: the REAL committed incubate record shape (duration "overnight" +
 * temperature 37) renders "overnight · 37 °C" on the card; the {value,unit}
 * temperature shape renders "37 C"; a detail-less event still renders no
 * detail line (no dead chrome).
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiPanelProvider, useRegisterAiChat } from '../shared/context/AiPanelContext'
import { ChatPreviewCard } from './ChatPreviewCard'
import type { UseAiChatReturn } from '../shared/hooks/useAiChat'
import type { ChatMessage } from '../types/ai'

afterEach(cleanup)

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

describe('ChatPreviewCard — L2-SUITE-A-uifix3 D6: the incubate detail fields are on the card face', () => {
  it('the REAL committed incubate record (duration "overnight" + temperature 37) shows "overnight · 37 °C" on the card (the gate P8 shape)', () => {
    // The gate's exact accepted record bytes (run-main 96-09): the card face
    // must carry the detail the record carries — not kind only.
    const chat = stubChat({
      hasPreview: true,
      previewEvents: [
        {
          eventId: 'EVT-incubate',
          event_type: 'incubate',
          details: { duration: 'overnight', temperature: 37, labwareId: 'lbw-seed-plate-96-flat' },
        },
      ] as never,
      previewLabwareAdditions: [],
      previewStagedLabwareCount: 0,
    })
    renderCard(chat)
    const card = screen.getByTestId('chat-preview')
    expect(card).toHaveTextContent('incubate')
    const detail = card.querySelector('.chat-preview__event-details')?.textContent
    expect(detail).toBe('overnight · 37 °C')
  })

  it('a { value, unit } temperature shape renders the unit the record carries (no fabricated unit)', () => {
    // IncubateDetails declares temperature as { value, unit }; the descriptor
    // must honor the record's unit verbatim (the same discipline as the
    // {value, unit} volume arm).
    const chat = stubChat({
      hasPreview: true,
      previewEvents: [
        {
          eventId: 'EVT-incubate2',
          event_type: 'incubate',
          details: { temperature: { value: 37, unit: 'C' }, labwareId: 'lbw-seed-plate-96-flat' },
        },
      ] as never,
      previewLabwareAdditions: [],
      previewStagedLabwareCount: 0,
    })
    renderCard(chat)
    const card = screen.getByTestId('chat-preview')
    expect(card.querySelector('.chat-preview__event-details')?.textContent).toBe('37 C')
  })

  it('an event with NO displayable detail still shows no detail line (no dead chrome — the mix-pin leg preserved)', () => {
    // The pre-fix leg pinned an incubate with temperature 37 to render no
    // detail line — that pin WAS the D6 defect (kind only). Post-fix the
    // temperature IS a displayable detail, so the no-detail arm is the
    // genuinely empty details (a dead empty line would be dead chrome).
    const chat = stubChat({
      hasPreview: true,
      previewEvents: [
        {
          eventId: 'EVT-incubate3',
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
})
