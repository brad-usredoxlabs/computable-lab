/**
 * L2-P1-LABWARE-INSTANCE-RECORD-1 u2ghostgate — the GHOST-LABWARE gate
 * (RED-first: at RED time the refusal is not wired; adoptStagedPreview
 * persisted the ghost labware anyway).
 *
 * Gate r10 defect 4 (PROMPT1-GATE-20261115T044528Z): a placed labware with no
 * resolvable DEFINITION record id mints no instance (the named gap) but
 * deckAdoption persisted the WHOLE previewLabwares map — the accepted graph
 * carried a labware node with no labware-instance behind it (a "ghost labware";
 * the domain bait: paint-without-event / draft-as-committed).
 * Ruling LABWARE-INSTANCE-DEFINITION-IDENTITY-l2-20261113, labwareInstanceMint.ts:12:
 * "a visible gap, never a guess" — the gap must STOP the commit: the accept is
 * refused in the SAME shape as the unsigned-terms refusal ({ adopted: false,
 * blocked: n }), the ghost stays mounted, and ZERO records are written — the
 * pure pre-check runs BEFORE the records-first creations, before the ontology
 * mint, before the durable persist.
 *
 * Pure module: no DOM needed.
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { adoptStagedPreview, findUnplaceableLabware } from './deckAdoption'
import type { PlateEvent } from '../../types/events'
import type { Labware } from '../../types/labware'
import type { EventEditorPlacement } from '../types'
import type { AiRecordCreation } from '../../types/ai'

const { callOrder } = vi.hoisted(() => ({ callOrder: [] as string[] }))

// The real mint (not mocked here) falls back to apiClient.createRecord for a
// resolvable labware — stub it so a resolvable accept never touches the network.
vi.mock('../../shared/api/client', () => ({
  apiClient: {
    createRecord: vi.fn(async (_schemaId: string, _payload: Record<string, unknown>) => ({
      recordId: 'RECORDED',
    })),
  },
}))

vi.mock('../eventGraphPersistence', () => ({
  persistAcceptedEventGraph: vi.fn(async () => {
    callOrder.push('persist')
    return {
      eventGraphId: 'EG-PERSISTED-1',
      commit: { sha: 'sha-ghostgate', message: 'commit', timestamp: '2026-11-15T00:00:00Z' },
    }
  }),
}))
vi.mock('./acceptedOntologyBindings', () => ({
  materializeAcceptedOntologyBindings: vi.fn(async () => {
    callOrder.push('ontology-mint')
    return {}
  }),
  rewriteAcceptedOntologyRefs: vi.fn((events: unknown) => {
    callOrder.push('rewrite')
    return events
  }),
}))
vi.mock('./acceptedRecordCreations', () => ({
  materializeAcceptedRecordCreations: vi.fn(async (creations: unknown) => {
    callOrder.push('creations')
    // The records-first pass: each labware creation becomes a materialized
    // definition with a recordId (the real module's reuse/create shapes).
    const materialized = (creations as Array<{ kind: string; handle?: string; name: string }> ?? []).map(
      (c) => ({ key: c.handle ?? c.name, kind: c.kind, recordId: `LBW-${c.name.toUpperCase().replace(/\s+/g, '')}` }),
    )
    return { materialized, warnings: [] }
  }),
}))

const STATE = {
  eventGraphId: 'EG-1',
  runId: 'RUN-1',
  events: [] as PlateEvent[],
  labwares: {} as Record<string, Labware>,
  equipments: {} as Record<string, never>,
  placements: [] as EventEditorPlacement[],
}

const ghostLabware = (labwareId: string, recordId?: string): Labware => {
  const base: Record<string, unknown> = {
    labwareId,
    labwareType: 'plate',
    name: labwareId,
    addressing: 'coordinate',
    geometry: { maxVolume_uL: 200000, minVolume_uL: 0 },
  }
  if (recordId) base.recordId = recordId
  return base as unknown as Labware
}

/** A proposal with ONE placed labware whose definition resolves to NOTHING:
 *  no recordId on the vessel, a deck key that is not a record-id shape, and a
 *  record creation whose handle does NOT match the deck key. */
const GHOST_PREVIEW = {
  previewEvents: [{ eventId: 'EVT-NEW' }] as PlateEvent[],
  previewLabwares: { 'lbw-proposed-xyz': ghostLabware('lbw-proposed-xyz') },
  previewPlacements: [{ placementId: 'PL-1' }] as EventEditorPlacement[],
  recordCreations: [{ kind: 'labware', name: 'A plate', handle: 'some-other-handle' }] as AiRecordCreation[],
}

const resolvablePreview = (
  previewLabwares: Record<string, Labware>,
  recordCreations?: AiRecordCreation[],
) => ({
  previewEvents: [{ eventId: 'EVT-NEW' }] as PlateEvent[],
  previewLabwares,
  previewPlacements: [{ placementId: 'PL-1' }] as EventEditorPlacement[],
  ...(recordCreations ? { recordCreations } : {}),
})

beforeEach(() => {
  callOrder.length = 0
})

describe('u2ghostgate — a placed labware with no resolvable definition record id REFUSES the accept', () => {
  it('findUnplaceableLabware (exported by the shared adoption core) names the unresolvable deck key', () => {
    const labwares = {
      'lbw-proposed-xyz': ghostLabware('lbw-proposed-xyz'),
      'LBW-ONVESSEL': ghostLabware('LBW-ONVESSEL', 'LBW-ONVESSEL'),
    }
    expect(findUnplaceableLabware(labwares, [])).toEqual(['lbw-proposed-xyz'])
  })

  it('findUnplaceableLabware resolves exactly like the mint: creation, vessel recordId, or record-id deck key', () => {
    const labwares = {
      P1: ghostLabware('P1'), // a records-first creation resolves it
      'LW-1A2B3C4D': ghostLabware('LW-1A2B3C4D'), // the deck key IS a record id
      P3: ghostLabware('P3', 'LBW-SET'), // the vessel carries the definition id
    }
    expect(findUnplaceableLabware(labwares, [{ kind: 'labware', name: 'P1', handle: 'P1' }])).toEqual([])
  })

  it('refuses the WHOLE accept when one placed labware cannot resolve a definition id — same shape as the unsigned-terms refusal', async () => {
    const result = await adoptStagedPreview(GHOST_PREVIEW, STATE, {
      termDecisions: {},
      commit: () => {
        callOrder.push('commit')
      },
    })
    expect(result).toEqual({ adopted: false, blocked: 1 })
  })

  it('a refused accept writes ZERO records and NOTHING else: no creations, no ontology mint, no persist, no commit', async () => {
    await adoptStagedPreview(GHOST_PREVIEW, STATE, {
      termDecisions: {},
      commit: () => {
        callOrder.push('commit')
      },
    })
    // The pre-check ran BEFORE the records-first pass: even the RESOLVABLE
    // labware's definition creation was never created.
    expect(callOrder).toEqual([])
  })

  it('the refusal precedes ANY durable write: with an unresolvable labware, persist and commit never run', async () => {
    await adoptStagedPreview({ ...GHOST_PREVIEW, recordCreations: undefined }, STATE, {
      termDecisions: {},
      commit: () => {
        callOrder.push('commit')
      },
    })
    expect(callOrder).toEqual([])
    const { persistAcceptedEventGraph } = await import('../eventGraphPersistence')
    expect(persistAcceptedEventGraph).not.toHaveBeenCalled()
  })

  it('the ghost stays mounted: a refused accept does NOT mutate the live state labwares', async () => {
    const before = Object.keys(STATE.labwares).length
    await adoptStagedPreview(GHOST_PREVIEW, STATE, {
      termDecisions: {},
      commit: () => {
        callOrder.push('commit')
      },
    })
    expect(Object.keys(STATE.labwares).length).toBe(before)
  })

  it('resolvable proposals accept EXACTLY as before (u1inst lock): the instance mints, the counts and the order are unchanged', async () => {
    const result = await adoptStagedPreview(
      resolvablePreview({ P1: ghostLabware('P1') }, [{ kind: 'labware', name: 'a plate', handle: 'P1' }]),
      STATE,
      {
        termDecisions: {},
        commit: () => {
          callOrder.push('commit')
        },
      },
    )
    expect(result.adopted).toBe(true)
    const ok = result as { adopted: true; labwareCount: number; instanceIds?: string[] }
    expect(ok.labwareCount).toBe(1)
    // One labware-instance minted for the placed labware (u1inst).
    expect(ok.instanceIds).toHaveLength(1)
    expect(ok.instanceIds![0]).toMatch(/^LAB-INST-[0-9A-Fa-f]{8}$/)
    expect(callOrder).toEqual(['creations', 'ontology-mint', 'rewrite', 'persist', 'commit'])
  })

  it('a vessel recordId alone is enough to accept (no ghost: the instance names it)', async () => {
    const result = await adoptStagedPreview(
      resolvablePreview({ P1: ghostLabware('P1', 'LBW-SET') }),
      STATE,
      {
        termDecisions: {},
        commit: () => {
          callOrder.push('commit')
        },
      },
    )
    expect(result.adopted).toBe(true)
    const ok = result as { adopted: true; instanceIds?: string[] }
    expect(ok.instanceIds).toHaveLength(1)
  })

  it('the visible refusal: the gate names the gap in its warning (visible gap, never a guess)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await adoptStagedPreview(GHOST_PREVIEW, STATE, {
      termDecisions: {},
      commit: () => {
        callOrder.push('commit')
      },
    })
    const named = warn.mock.calls.map((c) => String(c[0])).join('\n')
    expect(named).toContain('lbw-proposed-xyz')
    expect(named).toContain('without a resolvable labware definition record id')
    warn.mockRestore()
  })
})
