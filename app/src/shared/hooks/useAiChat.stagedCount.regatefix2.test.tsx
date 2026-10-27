/**
 * L2-CHAT-1 regatefix2 — D2 (HIGH): the chat card's LABWARE count must derive
 * from the STAGED preview's truth — the same data the deck bar reads
 * (state.preview.previewPlacements / previewLabwares via the onStagedExtras
 * seam) — not from `chat.previewLabwareAdditions` alone (the done result's
 * additions, which are EMPTY on the shorthand path the gate ran: card read
 * "1 event · 0 new labware" while the bar read "1 new labware, 1 event" for
 * the SAME staged preview).
 *
 * The hook publishes `previewStagedLabwareCount` — the count the card shows
 * — the number of staged previewLabwares ids (the staged-preview truth the
 * deck bar reads), falling back to the done-result additions count when the
 * deck staged no labware (no seam, or an event-only preview). These locks
 * pin the HOOK side of the count (the card's side is locked in
 * ChatPreviewCard.regatefix2.test.tsx).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAiChat } from './useAiChat'
import { streamAssist } from '../api/aiClient'
import type { PlateEvent } from '../../types/events'
import type { AiContext } from '../../types/aiContext'

vi.mock('../api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))

vi.mock('../api/aiThreadClient', () => ({
  getThread: vi.fn().mockRejectedValue(new Error('no thread')),
  appendThreadMessage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }),
  },
}))

const aiContext: AiContext = {
  surface: 'event-editor',
  summary: 'Deck EG-1 — manual / manual_freeform',
  surfaceContext: { runId: 'RUN-1', eventGraphId: 'EG-1' },
  editorMode: 'deck',
}

const TRANSFER: PlateEvent = {
  eventId: 'EVT-T1',
  event_type: 'transfer',
  details: {
    source_labwareId: 'L1',
    source_wells: ['A1'],
    dest_labwareId: 'P1',
    dest_wells: ['B1'],
    volume: { value: 50, unit: 'uL' },
  },
} as unknown as PlateEvent

function frames(...events: Array<Record<string, unknown>>) {
  vi.mocked(streamAssist).mockImplementation(async function* () {
    for (const e of events) yield e as never
  })
}

const DRAFT_FRAMES = [
  { type: 'status', message: 'working' },
  {
    type: 'done',
    result: {
      success: true,
      events: [TRANSFER],
      labwareAdditions: [{ recordId: 'REC-P1', reason: 'destination', deckSlot: 'slot-1' }],
      notes: [],
    },
  },
]

function mountHook(options?: {
  onStagedExtras?: () => Record<string, unknown> | null
}) {
  const stagedExtras = options?.onStagedExtras
  return renderHook(() =>
    useAiChat({
      aiContext,
      onAcceptEvent: (event) => void event,
      onProposalDrafted: () => undefined,
      // D2: the staged EXTRAS the ghost mount put on the editor's preview —
      // the deck bar's truth source for "N new labware".
      onStagedExtras:
        stagedExtras ??
        (() => ({
          previewLabwares: { P1: { labwareId: 'P1', recordId: 'REC-P1' } },
          previewPlacements: [{ placementId: 'PL-P1' }],
        })),
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAiChat — regatefix2 D2: the labware count is the STAGED truth', () => {
  it('previewStagedLabwareCount comes from the staged extras (deck truth), not the done-result additions', async () => {
    // The gate's shape: the done result carries the addition recordId, but
    // the deck's truth is the staged preview the ghost mount built.
    frames(...DRAFT_FRAMES)
    const { result } = mountHook()
    await act(async () => {
      result.current.sendPrompt('add a new plate P1 and transfer A1->P1')
    })
    await waitFor(() => expect(result.current.hasPreview).toBe(true))

    // The deck bar reads the staged placements; the count must match the
    // same truth (the gate saw "1 event · 0 new labware" vs the bar's
    // "1 new labware, 1 event" for the SAME staged preview).
    await waitFor(() => expect(result.current.previewStagedLabwareCount).toBe(1))
  })

  it('counts the staged labwares even when the done result carried NO additions', async () => {
    frames(
      { type: 'status', message: 'working' },
      {
        type: 'done',
        result: {
          success: true,
          events: [TRANSFER],
          labwareAdditions: [],
          notes: [],
        },
      },
    )
    const { result } = mountHook()
    await act(async () => {
      result.current.sendPrompt('add a new plate P1 and transfer A1->P1')
    })
    await waitFor(() => expect(result.current.hasPreview).toBe(true))
    // The additions list is EMPTY (the gate's misreport source) — but the
    // staged truth has one labware, and the count must show it.
    expect(result.current.previewLabwareAdditions.length).toBe(0)
    await waitFor(() => expect(result.current.previewStagedLabwareCount).toBe(1))
  })

  it('without the staged seam the count falls back to the done-result additions', async () => {
    frames(...DRAFT_FRAMES)
    const { result } = mountHook({ onStagedExtras: () => null })
    await act(async () => {
      result.current.sendPrompt('add a new plate P1 and transfer A1->P1')
    })
    await waitFor(() => expect(result.current.hasPreview).toBe(true))
    // DRAFT_FRAMES carries one labwareAddition — the fallback truth.
    expect(result.current.previewStagedLabwareCount).toBe(1)
  })

  it('with no additions and no staged labwares the count is honestly 0', async () => {
    frames(
      { type: 'status', message: 'working' },
      {
        type: 'done',
        result: {
          success: true,
          events: [TRANSFER],
          notes: [],
        },
      },
    )
    // No additions AND no staged labwares (the surface's seam stages an
    // event-only preview — nothing to place): the count must be 0, not a
    // fabricated fallback.
    const { result } = mountHook({ onStagedExtras: () => null })
    await act(async () => {
      result.current.sendPrompt('transfer 50uL from L1:A1 into P1:B1')
    })
    await waitFor(() => expect(result.current.hasPreview).toBe(true))
    expect(result.current.previewStagedLabwareCount).toBe(0)
  })
})
