/**
 * L2-CHAT-1 FIX3 D3 + D4 — RED-first locks (cycle-3 residual contract):
 *
 *  D3 — the ghost mount's staged sourceSkips reach the WIRE: a revise turn
 *       (send while a preview is staged) carries
 *       draftRevision.currentPreviewDraft.sourceSkips back to the server —
 *       the same field the legacy pane's previewDraft builder sends
 *       (AiTabPanel.tsx onDraftResult). The server prompt JSON for the same
 *       conversation matches legacy for what this stack actually stages.
 *
 *  D4 — both dishonest channels, no dead panes:
 *    a) a labwareAdditions-only success (no events) is a REPORTED honest
 *       wall that NAMES the channel ("proposed N new labware, which this
 *       surface cannot mount without events") — the !hasLabware
 *       suppression is gone;
 *    b) result.clarificationRequests ride the assistant message (ChatLog's
 *       existing typed-clarification arm renders them) AND count as asked
 *       questions — the wall cannot claim "asked no questions".
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAiChat } from './useAiChat'
import type { AiContext } from '../../types/aiContext'
import { streamAssist } from '../api/aiClient'

vi.mock('../api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))

vi.mock('../api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }),
  },
}))

const aiContext: AiContext = {
  surface: 'run-workspace',
  summary: 'Run workspace: RUN-1',
  surfaceContext: { runId: 'RUN-1', eventGraphId: 'EG-1' },
}

function frames(...events: Array<Record<string, unknown>>) {
  vi.mocked(streamAssist).mockImplementation(async function* () {
    for (const e of events) yield e as never
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAiChat — L2-CHAT-1 FIX3 D3: staged sourceSkips ride draftRevision to the wire', () => {
  it('a revise turn on a draft with non-empty skips sends them (legacy previewDraft parity)', async () => {
    // The ghost mount stages the preview WITH its skips (useDeckGhostMount:
    // setPreview ... sourceSkips: skips). onProposalDrafted / onStagedExtras
    // mirror that mount; onStagedExtras reads the same object back.
    const staged: Record<string, unknown> = {
      previewEvents: [{ eventId: 'EVT-1', event_type: 'add_material', details: {} }],
      previewLabwares: {},
      previewPlacements: [],
      sourcePrompt: 'draft the lysis transfer',
      sourceSkips: ['well B2 is empty on the source plate'],
    }
    const { result } = renderHook(() =>
      useAiChat({
        aiContext,
        onProposalDrafted: () => {
          /* the ghost mount staged the preview; the extras reader reads it back */
        },
        onStagedExtras: () => ({
          previewLabwares: {},
          previewPlacements: [],
          sourceSkips: staged.sourceSkips as string[],
        }),
      }),
    )

    // Turn 1: draft the proposal (stages the skips on the mount).
    frames(
      { type: 'status', message: 'working' },
      {
        type: 'done',
        result: {
          success: true,
          events: [{ eventId: 'EVT-1', event_type: 'add_material', details: {} }],
          notes: [],
        },
      },
    )
    await act(async () => {
      result.current.sendPrompt('draft the lysis transfer')
    })
    await waitFor(() => expect(result.current.hasPreview).toBe(true))

    // Turn 2: a REVISE — the staged skips must reach the server request.
    frames(
      { type: 'status', message: 'revising' },
      {
        type: 'done',
        result: {
          success: true,
          events: [{ eventId: 'EVT-1', event_type: 'add_material', details: {} }],
          notes: [],
        },
      },
    )
    await act(async () => {
      result.current.sendPrompt('skip B2, it is empty')
    })
    await waitFor(() => expect(vi.mocked(streamAssist).mock.calls.length).toBe(2))

    const reviseContext = vi.mocked(streamAssist).mock.calls[1]![2] as Record<string, unknown>
    const draftRevision = reviseContext.draftRevision as {
      currentPreviewDraft: {
        events: Array<{ eventId: string }>
        sourcePrompt?: string
        sourceSkips?: string[]
        labwareRequirements?: unknown[]
      }
      revisionHistory: unknown[]
    }
    expect(draftRevision).toBeDefined()
    expect(draftRevision.currentPreviewDraft.events).toEqual([
      expect.objectContaining({ eventId: 'EVT-1' }),
    ])
    // THE D3 LOCK: the skips the ghost mount staged ride the draft back —
    // identical to the legacy pane's previewDraft.sourceSkips for this
    // conversation.
    expect(draftRevision.currentPreviewDraft.sourceSkips).toEqual([
      'well B2 is empty on the source plate',
    ])
    // Legacy parity for the fields this stack stages: the staged source
    // prompt + the (truthful, empty here) labwareRequirements.
    expect(draftRevision.currentPreviewDraft.sourcePrompt).toBe('draft the lysis transfer')
    expect(draftRevision.currentPreviewDraft.labwareRequirements).toEqual([])
  })

  it('a revise turn with NO staged skips sends none (no fabricated skips)', async () => {
    const { result } = renderHook(() =>
      useAiChat({
        aiContext,
        onStagedExtras: () => ({ previewLabwares: {}, previewPlacements: [] }),
      }),
    )
    frames(
      { type: 'status', message: 'working' },
      {
        type: 'done',
        result: {
          success: true,
          events: [{ eventId: 'EVT-1', event_type: 'add_material', details: {} }],
          notes: [],
        },
      },
    )
    await act(async () => {
      result.current.sendPrompt('draft a transfer')
    })
    await waitFor(() => expect(result.current.hasPreview).toBe(true))

    frames({ type: 'status', message: 'revising' })
    await act(async () => {
      result.current.sendPrompt('use C1 instead')
    })
    await waitFor(() => expect(vi.mocked(streamAssist).mock.calls.length).toBe(2))

    const reviseContext = vi.mocked(streamAssist).mock.calls[1]![2] as Record<string, unknown>
    const draftRevision = reviseContext.draftRevision as {
      currentPreviewDraft: { sourceSkips?: unknown }
    }
    expect(draftRevision.currentPreviewDraft.sourceSkips).toBeUndefined()
  })
})
