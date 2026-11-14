/**
 * L2-P1-CREATE-RECORD-LANDS-1 u1recordsdraft — RED-first: a create_record turn
 * that carries ONLY recordCreations (zero events) must reach the deck's
 * proposal review surface as a staged preview, not dead-end in the events-only
 * emptiness guard.
 *
 * Scenario (gate PROMPT1-GATE-20261114T051016Z, finding R1-13): the server
 * reports `create_record success=true records=labware` (the done result carries
 * recordCreations — AgentOrchestrator.ts:3610), yet the deck shows the amber
 * wall "Draft produced no events — it delivered only records to create" beside
 * the contradictory bubble "AI completed the task but did not propose any
 * changes." The draft never reaches the surface because (1) the universal chat
 * hands a draft to onProposalDrafted ONLY on event-bearing turns, (2) the ghost
 * mount hard-codes recordCreations: [] (useDeckGhostMount.ts), and (3) it
 * early-returns when the preview has no placements/events.
 *
 * The fix is ONE data path (draft -> preview -> modal): carry
 * result.recordCreations verbatim onto the AiProposalDraft, pass it through
 * buildPreviewFromDraft (already forwarded there, draftPreview.ts:487), and
 * keep a creations-only draft alive past the empty-preview early return. The
 * modal (ProposedGraphModal.tsx:152) already lists preview.recordCreations —
 * no re-derivation, no second proposal channel.
 *
 * Governing: "Proposal != commitment." Nothing is written before an accept —
 * this unit only STAGES the preview; Accept is still the one write path.
 */
import { renderHook, waitFor } from '@testing-library/react'
import type { AiContext } from '../../types/aiContext'
import type { EventEditorState } from '../EventEditorContext'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAiChat } from '../../shared/hooks/useAiChat'
import { useDeckGhostMount } from './useDeckGhostMount'

vi.mock('../../shared/api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))

vi.mock('../../shared/api/aiThreadClient', () => ({
  getThread: vi.fn().mockRejectedValue(new Error('no thread')),
  appendThreadMessage: vi.fn().mockResolvedValue(undefined),
  promoteThread: vi.fn().mockResolvedValue(undefined),
  listThreads: vi.fn(async () => ({ threads: [] })),
}))

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }),
  },
}))

vi.mock('../../shared/ai/useWorkstateProposalFlow', () => ({
  useWorkstateProposalFlow: () => ({
    card: null,
    proposeWorkstate: vi.fn(),
    acceptWorkstate: vi.fn(),
    rejectWorkstate: vi.fn(),
    handleAgentAction: vi.fn(),
  }),
}))

// The prompt-1 plate (R1-13): a labware record that does not exist yet.
const A58941 = { kind: 'labware', name: 'Thermo A58941 96-well deepwell' }

const mockedEditorState = {
  platforms: [],
  platformId: 'manual',
  variantId: 'manual_single_plate',
  labwares: {},
  equipments: {},
  placements: [],
  events: [],
  preview: null,
  runId: 'RUN-1',
  eventGraphId: 'EG-1',
  focusPlacementId: null,
  selection: null,
} as unknown as EventEditorState

const setPreview = vi.fn()
const clearPreview = vi.fn()

vi.mock('../EventEditorContext', () => ({
  useEventEditor: () => ({
    state: mockedEditorState,
    actions: { setPreview, clearPreview },
  }),
}))

const aiContext: AiContext = {
  surface: 'event-editor',
  summary: 'Test summary',
  surfaceContext: {},
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useDeckGhostMount — a records-only draft stages the preview (RED at base: the early return drops it)', () => {
  it('onProposalDrafted with recordCreations and zero events calls setPreview and carries the name verbatim', () => {
    const { result } = renderHook(() => useDeckGhostMount())
    result.current.onProposalDrafted({
      events: [],
      labwareAdditions: [],
      recordCreations: [A58941],
      prompt: 'Create the 96-well deepwell plate we just received',
    } as never)
    // At base the early return (no placements, no events) makes the call never
    // happen: a records-only draft is dropped one line before it becomes visible.
    expect(setPreview).toHaveBeenCalledTimes(1)
    const staged = setPreview.mock.calls[0][0] as {
      recordCreations?: { name: string }[]
      previewEvents: unknown[]
      previewPlacements: unknown[]
      sourcePrompt: string
    }
    expect(staged.recordCreations?.[0]?.name).toBe(A58941.name)
    expect(staged.previewEvents).toHaveLength(0)
    expect(staged.previewPlacements).toHaveLength(0)
    expect(staged.sourcePrompt).toBe('Create the 96-well deepwell plate we just received')
  })
})

describe('useAiChat — a records-only done hands recordCreations to the draft and skips the empty-success wall/bubble', () => {
  it('done with recordCreations + zero events: the draft carries them verbatim; no wall, no bubble', async () => {
    const { streamAssist } = await import('../../shared/api/aiClient')
    const onProposalDrafted = vi.fn()
    // Same mocked-streamAssist idiom as useAiChat.recordDraft.empty.test.ts:
    // one done frame — success, ZERO events, recordCreations only.
    vi.mocked(streamAssist).mockImplementation(async function* () {
      yield {
        type: 'done',
        result: {
          success: true,
          events: [],
          notes: [],
          recordCreations: [A58941],
        },
      }
    })
    const { result } = renderHook(() =>
      useAiChat({
        aiContext,
        onAcceptEvent: vi.fn(),
        onAddLabwareFromRecord: vi.fn(),
        onProposalDrafted,
      }),
    )
    void result.current.sendPrompt('Create the A58941 deepwell')
    // (a) the draft reaches the deck surface carrying the creations VERBATIM.
    await waitFor(() => {
      expect(onProposalDrafted).toHaveBeenCalledTimes(1)
    })
    const draft = onProposalDrafted.mock.calls[0][0] as {
      events: unknown[]
      recordCreations?: { kind: string; name: string }[]
    }
    expect(draft.events).toEqual([])
    expect(draft.recordCreations?.[0]?.name).toBe(A58941.name)
    expect(draft.recordCreations?.[0]?.kind).toBe('labware')
    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false)
    })
    // (b) the events-only emptiness guard must NOT fire beside a staged
    // creations-only preview: no "Draft produced no events" wall ...
    expect(result.current.honestWall).toBeNull()
    // ... and no "did not propose any changes" bubble.
    expect(
      result.current.messages.some(
        (m) => m.role === 'system' && m.content === 'AI completed the task but did not propose any changes.',
      ),
    ).toBe(false)
  })
})
