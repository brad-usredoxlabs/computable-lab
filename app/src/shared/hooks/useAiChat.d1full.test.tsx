/**
 * L2-CHAT-1 FIX3 — D1 (HIGH): chat-card Apply must be a COMPLETE adopter.
 *
 * Cycle-3 ruling (L2CHAT1-cycle3-ruling-l2t0830): the universal chat's Apply
 * must commit the FULL staged preview — events + previewLabwares +
 * previewPlacements + recordCreations + ontologyBindings — with the same
 * materialize/persist ordering PreviewActionBar.handleAccept performs
 * (deckAdoption.adoptStagedPreview — records-first creations, ontology mint,
 * ref rewrite, persist, then the editor's commit; one adopter).
 *
 * Mechanism under test: useAiChat's accept seam (onPreviewAccept) delegates
 * to the shared deck adoption core instead of raw per-event append. This
 * test mirrors the REAL editor reducer's commit_preview semantics
 * (EventEditorContext.tsx commit_preview case: labwares merged, equipments
 * merged, placements appended, events appended, preview null) — the full
 * preview shape — so a half-apply (events only) fails these locks.
 *
 * RED (pre-fix): acceptPreview had no onPreviewAccept option; the adoption
 * never fired, so labwares/placements were dropped and the ontology gate +
 * honest summary did not exist.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAiChat } from './useAiChat'
import { streamAssist } from '../api/aiClient'
import {
  adoptStagedPreview,
  bindingNeedsDecision,
} from '../../event-editor/deck/deckAdoption'
import type { TermDecision } from '../../event-editor/deck/acceptedOntologyBindings'
import type { PlateEvent } from '../../types/events'
import type { AiContext } from '../../types/aiContext'

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

// The shared adoption core's network-bound collaborators are mocked so the
// hook test locks BEHAVIOR (gate -> commit -> clear; ordering is pinned in
// the core's own unit test, not here).
vi.mock('../../event-editor/deck/deckAdoption', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../event-editor/deck/deckAdoption')>()
  return {
    ...mod,
    adoptStagedPreview: vi.fn(),
  }
})

const aiContext: AiContext = {
  surface: 'run-workspace',
  summary: 'Run workspace: RUN-1',
  surfaceContext: { runId: 'RUN-1', eventGraphId: 'EG-1' },
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

// A faithful mirror of the REAL editor state for the FULL preview shape.
// commitPreview mirrors the commit_preview reducer (EventEditorContext.tsx)
// exactly: labwares merged, equipments merged, placements appended, events
// appended (the commit's list), eventGraphId/commit adopted, preview nulled —
// and a NO-OP when no preview is mounted (the one-adopter guard).
const editor = {
  events: [] as PlateEvent[],
  labwares: {} as Record<string, unknown>,
  equipments: {} as Record<string, unknown>,
  placements: [] as Array<{ placementId: string }>,
  preview: null as Record<string, unknown> | null,
  eventGraphId: 'EG-1',
  eventGraphSave: null as unknown,
  commitPreview(previewEvents?: PlateEvent[], eventGraphId?: string, commit?: unknown) {
    const preview = this.preview as {
      previewLabwares: Record<string, unknown>
      previewEquipments?: Record<string, unknown>
      previewPlacements: Array<{ placementId: string }>
      previewEvents: PlateEvent[]
    } | null
    if (!preview) return // no-op unless a preview is mounted
    this.labwares = { ...this.labwares, ...preview.previewLabwares }
    this.equipments = { ...this.equipments, ...(preview.previewEquipments ?? {}) }
    this.placements = [...this.placements, ...preview.previewPlacements]
    this.events = [...this.events, ...(previewEvents ?? preview.previewEvents)]
    if (eventGraphId) this.eventGraphId = eventGraphId
    if (commit) this.eventGraphSave = commit
    this.preview = null
  },
}

function mountHook(options?: Record<string, unknown>) {
  const decisions: Record<string, TermDecision> = {}
  return renderHook(() =>
    useAiChat({
      aiContext,
      onAcceptEvent: (event) => {
        editor.events = [...editor.events, event]
      },
      onProposalDrafted: (draft) => {
        editor.preview = {
          previewEvents: draft.events,
          previewLabwares: draft.labwareAdditions.length
            ? { P1: { labwareId: 'P1', recordId: 'REC-P1' } }
            : {},
          previewPlacements: draft.labwareAdditions.length ? [{ placementId: 'PL-P1' }] : [],
          ...(options?.ontologyBindings ? { ontologyBindings: options.ontologyBindings } : {}),
          ...(options?.recordCreations ? { recordCreations: options.recordCreations } : {}),
          sourcePrompt: draft.prompt,
        }
      },
      onPreviewDiscarded: () => {
        editor.preview = null
      },
      // The NEW accept seam (FIX3 D1): the chat Apply adopts the FULL
      // staged preview through the shared deck adoption core, fed by the
      // staged extras the ghost mount put on the editor's preview.
      onPreviewAccept: (preview) =>
        adoptStagedPreview(
          preview as never,
          {
            eventGraphId: editor.eventGraphId,
            runId: 'RUN-1',
            events: editor.events,
            labwares: editor.labwares as never,
            equipments: editor.equipments as never,
            placements: editor.placements as never,
          },
          {
            termDecisions: decisions,
            commit: (previewEvents, persisted) =>
              editor.commitPreview(previewEvents, persisted.eventGraphId, persisted.commit),
            onAdopted: () => {
              editor.preview = null
            },
          },
        ),
      onStagedExtras: () => {
        const p = editor.preview
        if (!p) return null
        return {
          previewLabwares: (p.previewLabwares ?? {}) as Record<string, unknown>,
          previewPlacements: (p.previewPlacements ?? []) as unknown[],
          ...(p.ontologyBindings ? { ontologyBindings: p.ontologyBindings as unknown[] } : {}),
          ...(p.recordCreations ? { recordCreations: p.recordCreations as unknown[] } : {}),
        }
      },
      ...options,
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  editor.events = []
  editor.labwares = {}
  editor.equipments = {}
  editor.placements = []
  editor.preview = null
  editor.eventGraphId = 'EG-1'
  editor.eventGraphSave = null
  vi.mocked(adoptStagedPreview).mockImplementation(async (preview, _state, ctx) => {
    // The REAL core's observable contract, mirrored so the hook's
    // DELEGATION is what the locks exercise (gate -> commit -> clear). The
    // core's own unit test pins the full materialize/persist ordering.
    const unsigned = ((preview.ontologyBindings ?? []) as Array<{
      curie: string
      minted?: boolean
      requiresReview?: boolean
      draftOnly?: boolean
    }>).filter((b) => bindingNeedsDecision(b) && !ctx.termDecisions[b.curie])
    if (unsigned.length > 0) return { adopted: false, blocked: unsigned.length }
    const acceptedEvents = (preview.previewEvents ?? []) as PlateEvent[]
    const persisted = {
      eventGraphId: 'EG-PERSISTED-1',
      commit: { sha: 'sha-1', message: 'mock commit', timestamp: '2026-10-26T00:00:00Z' },
    }
    ctx.commit(acceptedEvents, persisted)
    ctx.onAdopted?.(persisted)
    return {
      adopted: true,
      eventCount: acceptedEvents.length,
      placementCount: ((preview.previewPlacements ?? []) as Array<unknown>).length,
      labwareCount: Object.keys((preview.previewLabwares ?? {}) as Record<string, unknown>).length,
      persisted,
    }
  })
})

describe('useAiChat — FIX3 D1: one COMPLETE adopter (full preview shape)', () => {
  it('D1(i): staged P1 + placement + transfer -> chat Apply commits events + labware + placement, exactly once, preview cleared', async () => {
    frames(
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
    )
    const { result } = mountHook()

    await act(async () => {
      result.current.sendPrompt('transfer 50uL from L1:A1 into the new plate P1 at B1')
    })
    await waitFor(() => expect(result.current.hasPreview).toBe(true))
    expect(editor.preview).toBeTruthy()
    expect(editor.preview?.previewLabwares).toEqual({ P1: { labwareId: 'P1', recordId: 'REC-P1' } })
    expect(editor.preview?.previewPlacements).toEqual([{ placementId: 'PL-P1' }])

    // Apply via the chat card.
    await act(async () => {
      await result.current.acceptPreview()
    })

    // The FULL preview was committed through the shared adoption core:
    // events exactly once, labware P1 merged, placement P1 appended.
    await waitFor(() =>
      expect(editor.events.map((e) => e.eventId)).toEqual(['EVT-T1']),
    )
    expect(editor.labwares).toHaveProperty('P1')
    expect(editor.placements.map((p) => p.placementId)).toEqual(['PL-P1'])
    // The ghost is unmounted WITH the apply (the commit nulls the preview).
    expect(editor.preview).toBeNull()

    // The summary line counts what was ACTUALLY adopted — not "Accepted 1
    // event." while the labware/placement were silently dropped.
    const summary = result.current.messages
      .map((m) => m.content)
      .filter((c) => c.includes('Accepted'))
      .join('\n')
    expect(summary).toContain('1 event')
    expect(summary).toContain('1 placement')
    expect(summary).toContain('1 new labware')
  })

  it('D1(ii): unsigned ontology term -> chat Apply refuses visibly, preview NOT discarded', async () => {
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
    const { result } = mountHook({
      ontologyBindings: [
        { curie: 'CL:T-1', recordId: 'REC-T1', minted: true, via: 'name', label: 'Some Term' },
      ],
    })

    await act(async () => {
      result.current.sendPrompt('draft the transfer using that term')
    })
    await waitFor(() => expect(result.current.hasPreview).toBe(true))

    // Apply via the chat card — the ontology sign-off gate must NOT be
    // bypassable: refuse visibly, never silently materialize.
    await act(async () => {
      await result.current.acceptPreview()
    })

    // Nothing adopted: no events, no labware, no placement.
    expect(editor.events).toEqual([])
    expect(editor.labwares).toEqual({})
    expect(editor.placements).toEqual([])
    // The ghost stays mounted (the user signs off in the changes panel).
    expect(editor.preview).toBeTruthy()
    expect(result.current.hasPreview).toBe(true)
    // The refusal is VISIBLE in the conversation.
    const refusal = result.current.messages
      .map((m) => m.content)
      .find((c) => c.includes('ontology terms need sign-off'))
    expect(refusal).toContain('1 ontology terms need sign-off in the changes panel')
  })

  it('D1(iii): chat Apply then deck-bar commit -> the deck-bar commit is a no-op (one adopter stays one)', async () => {
    frames(
      { type: 'status', message: 'working' },
      {
        type: 'done',
        result: {
          success: true,
          events: [TRANSFER],
          labwareAdditions: [{ recordId: 'REC-P1', reason: 'destination' }],
          notes: [],
        },
      },
    )
    const { result } = mountHook()

    await act(async () => {
      result.current.sendPrompt('transfer 50uL into P1')
    })
    await waitFor(() => expect(result.current.hasPreview).toBe(true))

    await act(async () => {
      await result.current.acceptPreview()
    })
    await waitFor(() => expect(editor.events.map((e) => e.eventId)).toEqual(['EVT-T1']))
    expect(editor.preview).toBeNull()

    // The deck's PreviewActionBar Accept path runs next: commit_preview is a
    // no-op without a mounted preview (the commit_preview reducer) — the
    // same events must NOT land a second time.
    editor.commitPreview()
    expect(editor.events.map((e) => e.eventId)).toEqual(['EVT-T1'])
    expect(editor.placements.map((p) => p.placementId)).toEqual(['PL-P1'])
    expect(Object.keys(editor.labwares)).toEqual(['P1'])
  })
})
