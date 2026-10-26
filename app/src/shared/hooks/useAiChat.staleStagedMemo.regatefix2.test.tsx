/**
 * L2-CHAT-1 regatefix2-fix1 — gate defect D4: `previewStagedLabwareCount`
 * recomputed only on [previewEvents, previewLabwareAdditions]. A STAGED
 * extras change that does not move those two arrays (an editor-preview
 * mutation without a new chat turn) left the memo STALE and, on the
 * shorthand path (the done result's additions are EMPTY), the count fell
 * back to 0 — the gate's original misreport ("1 event · 0 new labware"
 * while the deck bar read "1 new labware" for the same staged preview).
 *
 * The onStagedExtras seam is the SAME data the deck bar reads
 * (state.preview.previewLabwares via the DeckSurfaceChat closure), so the
 * card's count must track the seam even when no chat turn restaged the
 * events. This drives the real hook through that seam: the staged truth
 * changes AFTER the turn completes (no previewEvents /
 * previewLabwareAdditions movement) and the published count must follow.
 *
 * Pre-fix this is RED: the memo does not recompute, the count stays 1.
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

// The shorthand path: a done result that staged an EVENT but carried NO
// labwareAdditions (the gate's misreport source — the fallback truth is 0).
const SHORTHAND_FRAMES = [
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
]

function mountHook(staged: { previewLabwares: Record<string, unknown>; previewPlacements: unknown[] }) {
  return renderHook(() =>
    useAiChat({
      aiContext,
      onAcceptEvent: (event) => void event,
      onProposalDrafted: () => undefined,
      // The staged EXTRAS seam — the deck bar's truth source. Reads the
      // LIVE staged object (the editor's preview at read time), exactly
      // like the DeckSurfaceChat closure reads state.preview.
      onStagedExtras: () => staged,
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAiChat — regatefix2-fix1 D4: the count follows the staged truth without a new turn', () => {
  it('a staged-extras change after the turn (no previewEvents/additions movement) is reflected in the count', async () => {
    vi.mocked(streamAssist).mockImplementation(async function* () {
      for (const e of SHORTHAND_FRAMES) yield e as never
    })
    // The ghost mount staged ONE labware on the preview (the bar reads
    // "1 new labware") while the done result's additions are EMPTY (the
    // shorthand path).
    const staged: { previewLabwares: Record<string, unknown>; previewPlacements: unknown[] } = {
      previewLabwares: { P1: { labwareId: 'P1', recordId: 'REC-P1' } },
      previewPlacements: [{ placementId: 'PL-P1' }],
    }
    const { result, rerender } = mountHook(staged)
    await act(async () => {
      result.current.sendPrompt('transfer A1->P1')
    })
    await waitFor(() => expect(result.current.hasPreview).toBe(true))
    // The staged truth (one labware) beats the empty additions fallback.
    expect(result.current.previewStagedLabwareCount).toBe(1)

    // An editor-preview mutation stages a SECOND labware without any new
    // chat turn — previewEvents and previewLabwareAdditions do not move.
    // The deck bar now reads "2 new labware"; the card's count must track
    // the same truth.
    act(() => {
      staged.previewLabwares = {
        P1: { labwareId: 'P1', recordId: 'REC-P1' },
        P2: { labwareId: 'P2', recordId: 'REC-P2' },
      }
      staged.previewPlacements = [{ placementId: 'PL-P1' }, { placementId: 'PL-P2' }]
    })
    // The surface re-renders against the mutated staged truth (the bar
    // would re-read state.preview here). The hook's published count must
    // follow — pre-fix the memo stayed stale at 1 (stale-memo shape: on
    // the shorthand path that is the 0-misreport one step earlier).
    await act(async () => {
      rerender()
    })
    expect(result.current.previewStagedLabwareCount).toBe(2)
  })
})
