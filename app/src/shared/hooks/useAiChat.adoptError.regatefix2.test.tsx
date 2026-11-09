/**
 * L2-CHAT-1 regatefix2 — D1 (HIGH/blocker): a chat-card Apply that REFUSES
 * (the shared adoption core throws — e.g. RunDeckLockConflictError when the
 * deck route resolved off the run's methodDeckLock) must surface as a VISIBLE
 * honest refusal on the card. Before this fix useAiChat.acceptPreview had no
 * catch around the onPreviewAccept seam: the throw escaped as an uncaught
 * page error, the staged preview + ghost + deck bar stayed mounted, and the
 * pane showed NOTHING (the gate's "silent nothing" defect).
 *
 * These locks pin the refusal contract:
 *  - the hook CATCHES the adoption throw (no uncaught rejection);
 *  - the preview STAYS staged (nothing half-applied, retry stays possible);
 *  - the refusal is NAMED: a system message in the conversation + a
 *    hook-owned `adoptionError` (consumed by ChatPreviewCard's honest wall)
 *    carrying the error's cause verbatim;
 *  - a SUCCESSFUL adoption clears any prior refusal (no stale wall).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAiChat } from './useAiChat'
import { streamAssist } from '../api/aiClient'
import { RunDeckLockConflictError } from '../../event-editor/eventGraphPersistence'
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
  surfaceContext: { runId: 'RUN-LOCK-1', eventGraphId: 'EG-1' },
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

const CLARIFY_FRAMES = [
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

/** The REAL conflict the gate hit: the deck route off the run's lock. */
const LOCK_CONFLICT = new RunDeckLockConflictError(
  'Run RUN-2026-09-19-run-vwr8 is locked to manual/manual_collapsed; explicit layout replacement is required before saving manual/manual_freeform.',
)

function mountHook(options?: {
  onPreviewAccept?: () => Promise<{ adopted: boolean; blocked?: number }>
  onStagedExtras?: () => Record<string, unknown> | null
}) {
  const stagedExtras = options?.onStagedExtras
  return renderHook(() =>
    useAiChat({
      aiContext,
      onAcceptEvent: (event) => void event,
      onProposalDrafted: () => undefined,
      // D1: the full-adopter seam — the deck surface's onPreviewAccept.
      onPreviewAccept:
        options?.onPreviewAccept ??
        (async () => {
          throw LOCK_CONFLICT
        }),
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

describe('useAiChat — regatefix2 D1: an adoption REFUSAL is surfaced, never swallowed', () => {
  it('a throwing adoption seam (deck lock conflict) does NOT escape: the preview stays staged and the refusal is NAMED', async () => {
    frames(...CLARIFY_FRAMES)
    const { result } = mountHook()

    await act(async () => {
      result.current.sendPrompt('add a new plate P1 and transfer A1->P1')
    })
    await waitFor(() => expect(result.current.hasPreview).toBe(true))

    await act(async () => {
      await result.current.acceptPreview()
    })

    // Nothing half-applied: the staged preview survives (the card + ghost
    // stay mounted, retry is possible) — a silent drop is the defect.
    await waitFor(() => expect(result.current.isAccepting).toBe(false))
    expect(result.current.hasPreview).toBe(true)

    // The refusal is NAMED — cause verbatim, on the hook-owned wall the
    // card renders, AND as a system line in the conversation.
    await waitFor(() => expect(result.current.adoptionError).toBeTruthy())
    expect(result.current.adoptionError).toContain('RunDeckLockConflictError')
    expect(result.current.adoptionError).toContain('locked to manual/manual_collapsed')
    const systemLines = result.current.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n')
    expect(systemLines).toContain('manual_collapsed')
    expect(systemLines).toContain('Nothing was written')
  })

  it('a successful adoption CLEARS a prior refusal (no stale wall) — same hook, retry after replacement', async () => {
    // The seam refuses on the FIRST apply (the lock conflict) and succeeds
    // on the retry (the explicit replacement landed) — the same hook
    // instance, so the clear is asserted where the wall was set.
    frames(...CLARIFY_FRAMES)
    let attempts = 0
    const { result } = mountHook({
      onPreviewAccept: async () => {
        attempts += 1
        if (attempts === 1) throw LOCK_CONFLICT
        return { adopted: true, eventCount: 1, placementCount: 1, labwareCount: 1 }
      },
    })
    await act(async () => {
      result.current.sendPrompt('add a new plate P1 and transfer A1->P1')
    })
    await waitFor(() => expect(result.current.hasPreview).toBe(true))
    await act(async () => {
      await result.current.acceptPreview()
    })
    await waitFor(() => expect(result.current.adoptionError).toBeTruthy())
    expect(result.current.hasPreview).toBe(true) // the refused preview stays

    // Retry (the deck route now resolves the locked deck — D1a): the
    // successful adopt clears the staged state AND the refusal wall.
    frames(...CLARIFY_FRAMES)
    await act(async () => {
      result.current.sendPrompt('retry after replacement')
    })
    await waitFor(() => expect(result.current.hasPreview).toBe(true))
    await act(async () => {
      await result.current.acceptPreview()
    })
    await waitFor(() => expect(result.current.hasPreview).toBe(false))
    expect(result.current.adoptionError).toBeNull()
  })
})
