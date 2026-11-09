/**
 * L2-CHAT-1 FIX3 — D1 (HIGH): the SHARED deck adoption core pins the
 * materialize/persist ORDER and the non-bypassable ontology sign-off gate.
 *
 * PreviewActionBar.handleAccept and the universal chat's onPreviewAccept seam
 * BOTH delegate to adoptStagedPreview, so the order is locked HERE in one
 * place: sign-off gate -> record creations (ADDs first) -> ontology mint ->
 * event ref rewrite -> durable persist -> editor commit. A regression that
 * reorders (e.g. commits before persisting, or skips the gate) fails these
 * locks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { adoptStagedPreview, bindingNeedsDecision } from './deckAdoption'
import type { PlateEvent } from '../../types/events'
import type { Labware } from '../../types/labware'
import type { EventEditorPlacement } from '../types'
import type { DraftOntologyBinding } from '../../types/ai'

const { callOrder } = vi.hoisted(() => ({ callOrder: [] as string[] }))

vi.mock('../eventGraphPersistence', () => ({
  persistAcceptedEventGraph: vi.fn(async () => {
    callOrder.push('persist')
    return {
      eventGraphId: 'EG-PERSISTED-1',
      commit: { sha: 'sha-1', message: 'commit', timestamp: '2026-10-26T00:00:00Z' },
    }
  }),
}))
vi.mock('./acceptedOntologyBindings', () => ({
  materializeAcceptedOntologyBindings: vi.fn(async () => {
    callOrder.push('mint')
    return { 'CL:T-1': 'MINTED-T1' }
  }),
  rewriteAcceptedOntologyRefs: vi.fn((events: unknown) => {
    callOrder.push('rewrite')
    return events
  }),
}))
vi.mock('./acceptedRecordCreations', () => ({
  materializeAcceptedRecordCreations: vi.fn(async () => {
    callOrder.push('creations')
    return { warnings: [] }
  }),
}))

const STATE = {
  eventGraphId: 'EG-1',
  runId: 'RUN-1',
  events: [{ eventId: 'EVT-EXISTING' }] as PlateEvent[],
  labwares: {} as Record<string, Labware>,
  equipments: {} as Record<string, never>,
  placements: [] as EventEditorPlacement[],
}

const PREVIEW = {
  previewEvents: [{ eventId: 'EVT-NEW' }] as PlateEvent[],
  previewLabwares: { P1: { labwareId: 'P1' } } as unknown as Record<string, Labware>,
  previewPlacements: [{ placementId: 'PL-1' }] as EventEditorPlacement[],
}

const UNSIGNED_TERM: DraftOntologyBinding = {
  curie: 'CL:T-1',
  recordId: 'REC-T1',
  via: 'name',
  label: 'Some Term',
  minted: true,
  requiresReview: true,
}

beforeEach(() => {
  callOrder.length = 0
})

describe('deckAdoption.adoptStagedPreview — shared adoption order + gate', () => {
  it('commits the FULL preview in the deck bar order: gate -> creations -> mint -> rewrite -> persist -> commit', async () => {
    let committed: { events?: unknown; persisted?: unknown } | null = null
    let adopted = false
    const result = await adoptStagedPreview(PREVIEW, STATE, {
      termDecisions: {},
      commit: (events, persisted) => {
        committed = { events, persisted }
        callOrder.push('commit')
      },
      onAdopted: () => {
        adopted = true
      },
    })
    expect(result.adopted).toBe(true)
    // The exact materialize/persist ordering (commit AFTER persist).
    expect(callOrder).toEqual(['creations', 'mint', 'rewrite', 'persist', 'commit'])
    expect(committed).toBeTruthy()
    expect(adopted).toBe(true)
    expect((result as { eventCount: number }).eventCount).toBe(1)
    expect((result as { placementCount: number }).placementCount).toBe(1)
    expect((result as { labwareCount: number }).labwareCount).toBe(1)
  })

  it('refuses visibly at the sign-off gate when a decisionNeeded term is unsigned (never materializes)', async () => {
    let commitCalls = 0
    const result = await adoptStagedPreview(
      { ...PREVIEW, ontologyBindings: [UNSIGNED_TERM] },
      STATE,
      {
        termDecisions: {},
        commit: () => {
          commitCalls++
        },
      },
    )
    expect(result).toEqual({ adopted: false, blocked: 1 })
    // NOTHING materialized — no creations, no mint, no persist, no commit.
    expect(callOrder).toEqual([])
    expect(commitCalls).toBe(0)
  })

  it('proceeds when every decisionNeeded term is signed off', async () => {
    const result = await adoptStagedPreview(
      { ...PREVIEW, ontologyBindings: [UNSIGNED_TERM] },
      STATE,
      {
        termDecisions: { 'CL:T-1': { status: 'approved' } },
        commit: () => {
          callOrder.push('commit')
        },
      },
    )
    expect(result.adopted).toBe(true)
    // The signed-off term mints (mint + rewrite ran, in order).
    expect(callOrder).toEqual(['creations', 'mint', 'rewrite', 'persist', 'commit'])
  })

  it('bindingNeedsDecision flags minted / requiresReview / draftOnly terms only', () => {
    expect(bindingNeedsDecision({ minted: true })).toBe(true)
    expect(bindingNeedsDecision({ requiresReview: true })).toBe(true)
    expect(bindingNeedsDecision({ draftOnly: true })).toBe(true)
    expect(bindingNeedsDecision({})).toBe(false)
  })
})
