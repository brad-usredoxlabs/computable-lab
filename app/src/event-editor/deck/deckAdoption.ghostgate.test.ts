/**
 * L2-P1-LABWARE-INSTANCE-RECORD-1 u2ghostgate / u3ghostfix — the GHOST-LABWARE
 * gate.
 *
 * Gate r10 defect 4 (PROMPT1-GATE-20261115T044528Z): a placed labware with no
 * resolvable DEFINITION record id mints no instance (the named gap) but
 * deckAdoption persisted the WHOLE previewLabwares map — the accepted graph
 * carried a labware node with no labware-instance behind it (a "ghost labware").
 * Ruling LABWARE-INSTANCE-DEFINITION-IDENTITY-l2-20261113, labwareInstanceMint.ts:
 * "a visible gap, never a guess" — the gap must STOP the commit: the accept is
 * refused in the SAME shape as the unsigned-terms refusal ({ adopted: false,
 * blocked: n, reason: 'unplaceable-labware' }), the ghost stays mounted, and
 * ZERO records/graph writes occur.
 *
 * u3ghostfix D5: the fixtures use the PRODUCTION shape, not a fiction. The
 * producer keys a proposed labware by a random `lbw-proposed-*` id
 * (draftPreview.ts:219/437) and stores it with `proposedRecord: true`; the
 * creation carries only its NAME (no handle). Step 2 creates the definition and
 * stamps its record id onto the ghost by NAME (`sameEntity`), which is what the
 * pre-check must project — creation-key/deck-key equality never matches in
 * production. Both paths run the REAL materializer and the REAL mint, so a
 * regression to either rule fails here.
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
import { persistAcceptedEventGraph } from '../eventGraphPersistence'

const { callOrder, failingNames } = vi.hoisted(() => ({
  callOrder: [] as string[],
  failingNames: [] as string[],
}))

// The real materializer + real mint are exercised here (see the module mock
// below); only the network is stubbed. `failingNames` reproduces PROBE 2: the
// definition CREATE rejects, so the vessel never gets a recordId.
vi.mock('../../shared/api/client', () => ({
  apiClient: {
    searchRecords: vi.fn(async () => ({ results: [] })),
    createRecord: vi.fn(async (schemaId: string, payload: Record<string, unknown>) => {
      const isInstance = schemaId.includes('labware-instance')
      callOrder.push(isInstance ? 'instance' : 'definition')
      const name = typeof payload.name === 'string' ? payload.name : ''
      if (failingNames.includes(name)) throw new Error('network down')
      return { recordId: String(payload.recordId ?? payload.id ?? 'RECORDED') }
    }),
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
// The REAL records-first materializer (its name-based ghost stamp is half of
// the seam under test) plus an ordering marker — never a re-implementation.
vi.mock('./acceptedRecordCreations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./acceptedRecordCreations')>()
  return {
    ...actual,
    materializeAcceptedRecordCreations: vi.fn(async (...args: Parameters<typeof actual.materializeAcceptedRecordCreations>) => {
      callOrder.push('creations')
      return actual.materializeAcceptedRecordCreations(...args)
    }),
  }
})

const STATE = {
  eventGraphId: 'EG-1',
  runId: 'RUN-1',
  events: [] as PlateEvent[],
  labwares: {} as Record<string, Labware>,
  equipments: {} as Record<string, never>,
  placements: [] as EventEditorPlacement[],
}

/** A deck key as the PRODUCER mints it (draftPreview.ts:219). */
const proposedKey = (name: string): string => `lbw-proposed-mwhmtzke-${name.replace(/\s+/g, '')}`

/** The PRODUCTION ghost: keyed by the random deck id, named, `proposedRecord`. */
const proposedGhost = (name: string, recordId?: string): Labware => {
  const base: Record<string, unknown> = {
    labwareId: proposedKey(name),
    labwareType: 'plate',
    name,
    proposedRecord: true,
    addressing: 'coordinate',
    geometry: { maxVolume_uL: 200000, minVolume_uL: 0 },
  }
  if (recordId) base.recordId = recordId
  return base as unknown as Labware
}

const previewOf = (
  previewLabwares: Record<string, Labware>,
  recordCreations?: AiRecordCreation[],
) => ({
  previewEvents: [{ eventId: 'EVT-NEW' }] as PlateEvent[],
  previewLabwares,
  previewPlacements: [{ placementId: 'PL-1' }] as EventEditorPlacement[],
  ...(recordCreations ? { recordCreations } : {}),
})

/** PRODUCTION proposer shape: a labware creation with a NAME and NO handle. */
const PLATE_CREATION: AiRecordCreation = { kind: 'labware', name: '96-well plate' }

const ctx = () => ({
  termDecisions: {},
  commit: () => {
    callOrder.push('commit')
  },
})

beforeEach(() => {
  callOrder.length = 0
  failingNames.length = 0
  vi.mocked(persistAcceptedEventGraph).mockClear()
})

describe('u3ghostfix D1 — ONE resolution rule: the pre-check projects what step 2 stamps', () => {
  it('a proposed-creation vessel is placeable (deck key lbw-proposed-*, creation matched by NAME, no handle)', () => {
    const labwares = { [proposedKey('96-well plate')]: proposedGhost('96-well plate') }
    expect(findUnplaceableLabware(labwares, [PLATE_CREATION])).toEqual([])
  })

  it('names the key when nothing backs it: no creation, no vessel recordId, no record-shaped key', () => {
    const key = proposedKey('96-well plate')
    expect(findUnplaceableLabware({ [key]: proposedGhost('96-well plate') }, [])).toEqual([key])
  })

  it('a creation for a DIFFERENT name does not back the vessel', () => {
    const key = proposedKey('96-well plate')
    expect(
      findUnplaceableLabware({ [key]: proposedGhost('96-well plate') }, [
        { kind: 'labware', name: 'deepwell block' },
      ]),
    ).toEqual([key])
  })

  it('resolves on the other two arms too: the vessel recordId, and a record-id deck key', () => {
    const labwares = {
      [proposedKey('96-well plate')]: proposedGhost('96-well plate', 'LBW-SET'),
      'LW-1A2B3C4D': proposedGhost('LW-1A2B3C4D'),
    }
    expect(findUnplaceableLabware(labwares, [])).toEqual([])
  })
})

describe('u4seedref — a SEEDED vessel (a labware record the lab already owns) is placeable', () => {
  /** The PRODUCTION seeded vessel: labwareId === sourceRecordId, no recordId. */
  const seededGhost = (recordId: string, name: string): Labware =>
    ({
      labwareId: recordId,
      labwareType: 'plate',
      name,
      addressing: 'coordinate',
      geometry: { maxVolume_uL: 200000, minVolume_uL: 0 },
      sourceRecordId: recordId,
    }) as unknown as Labware

  it('findUnplaceableLabware is EMPTY for a seeded vessel with no creations', () => {
    expect(
      findUnplaceableLabware(
        { 'lbw-seed-plate-96-flat': seededGhost('lbw-seed-plate-96-flat', '96-Well Plate') },
        [],
      ),
    ).toEqual([])
  })

  it('the accept ADOPTS (no unplaceable-labware refusal) and mints one instance naming sourceRecordId', async () => {
    const key = 'lbw-seed-plate-96-flat'
    const result = await adoptStagedPreview(
      previewOf({ [key]: seededGhost(key, '96-Well Plate') }, []),
      STATE,
      ctx(),
    )
    expect(result.adopted).toBe(true)
    expect((result as { instanceIds?: string[] }).instanceIds).toHaveLength(1)
    // Frozen order: no definition create (nothing to materialize), one
    // instance minted for the seeded vessel, then the durable write.
    expect(callOrder).toEqual(['creations', 'instance', 'ontology-mint', 'rewrite', 'persist', 'commit'])
  })
})

describe('u5seedguard — a REQUIREMENT vessel (a class CURIE, not a record) is refused', () => {
  /** The PRODUCTION requirement vessel, EXACTLY the createLabwareFromRequirement
   *  shape (advc c3 defect 1): `sourceRecordId` is the CLASS CURIE — a drawing
   *  with no record behind it, never a seeded record. */
  const requirementVessel = (): Labware =>
    ({
      labwareId: 'req:CL:96_well_plate:mwxyz123',
      labwareType: 'plate',
      name: '96-well plate',
      proposedRecord: true,
      addressing: 'coordinate',
      geometry: { maxVolume_uL: 200000, minVolume_uL: 0 },
      sourceRecordId: 'CL:96_well_plate',
      requirementClassCurie: 'CL:96_well_plate',
    }) as unknown as Labware

  it('findUnplaceableLabware names the key: a class CURIE is not a definition record id', () => {
    expect(findUnplaceableLabware({ 'req:CL:96_well_plate:mwxyz123': requirementVessel() }, [])).toEqual([
      'req:CL:96_well_plate:mwxyz123',
    ])
  })

  it('the real accept REFUSES (unplaceable-labware) with ZERO createRecord calls', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await adoptStagedPreview(
      previewOf({ 'req:CL:96_well_plate:mwxyz123': requirementVessel() }, []),
      STATE,
      ctx(),
    )
    expect(result).toEqual({
      adopted: false,
      blocked: 1,
      reason: 'unplaceable-labware',
      unplaceable: ['req:CL:96_well_plate:mwxyz123'],
    })
    expect(callOrder).toEqual([]) // no definition create, no instance mint
    expect(persistAcceptedEventGraph).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('u3ghostfix — the ghost gate refuses, visibly, before any write', () => {
  it('refuses with the ghost-gate discriminant and names the deck key in the log', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const key = proposedKey('96-well plate')
    const result = await adoptStagedPreview(
      previewOf({ [key]: proposedGhost('96-well plate') }),
      STATE,
      ctx(),
    )
    expect(result).toEqual({
      adopted: false,
      blocked: 1,
      reason: 'unplaceable-labware',
      unplaceable: [key],
    })
    const named = warn.mock.calls.map((c) => String(c[0])).join('\n')
    expect(named).toContain(key)
    expect(named).toContain('without a resolvable labware definition record id')
    warn.mockRestore()
  })

  it('writes ZERO records and touches NOTHING (no creations, no mint, no persist, no commit)', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await adoptStagedPreview(
      previewOf({ [proposedKey('96-well plate')]: proposedGhost('96-well plate') }),
      STATE,
      ctx(),
    )
    expect(callOrder).toEqual([])
    expect(persistAcceptedEventGraph).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('the ghost stays mounted: a refused accept does NOT mutate the live state', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const before = Object.keys(STATE.labwares).length
    await adoptStagedPreview(
      previewOf({ [proposedKey('96-well plate')]: proposedGhost('96-well plate') }),
      STATE,
      ctx(),
    )
    expect(Object.keys(STATE.labwares).length).toBe(before)
    spy.mockRestore()
  })
})

describe('u3ghostfix D1 pin (a) — a proposed-creation accept still mints, as on trunk', () => {
  it('adopts, mints exactly ONE labware-instance, and persists the created recordId onto the vessel', async () => {
    const key = proposedKey('96-well plate')
    const result = await adoptStagedPreview(
      previewOf({ [key]: proposedGhost('96-well plate') }, [PLATE_CREATION]),
      STATE,
      ctx(),
    )
    expect(result.adopted).toBe(true)
    const ok = result as { adopted: true; labwareCount: number; instanceIds?: string[] }
    expect(ok.labwareCount).toBe(1)
    expect(ok.instanceIds).toHaveLength(1)
    expect(ok.instanceIds![0]).toMatch(/^LAB-INST-[0-9A-Fa-f]{8}$/)

    // The definition was created first, then exactly one instance, then the
    // durable write — the u1inst ordering is unchanged.
    expect(callOrder).toEqual(['creations', 'definition', 'instance', 'ontology-mint', 'rewrite', 'persist', 'commit'])

    // Identity is the record id: the persisted vessel names the definition.
    const persistedArgs = vi.mocked(persistAcceptedEventGraph).mock.calls[0][0] as {
      labwares: Record<string, { recordId?: string; proposedRecord?: boolean }>
    }
    expect(persistedArgs.labwares[key].recordId).toBe('LBW-96-WELL-PLATE')
    expect(persistedArgs.labwares[key].proposedRecord).toBeUndefined()
  })

  it('a vessel recordId alone is enough to accept (the instance names it)', async () => {
    const result = await adoptStagedPreview(
      previewOf({ [proposedKey('96-well plate')]: proposedGhost('96-well plate', 'LBW-SET') }),
      STATE,
      ctx(),
    )
    expect(result.adopted).toBe(true)
    expect((result as { instanceIds?: string[] }).instanceIds).toHaveLength(1)
  })
})

describe('u3ghostfix D2 pin (b) — a FAILED definition create refuses at step 2c, before persist', () => {
  it('minted.skipped gates step 5: no graph write, no ghost labware in the accepted graph', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    failingNames.push('96-well plate')
    const key = proposedKey('96-well plate')
    const result = await adoptStagedPreview(
      previewOf({ [key]: proposedGhost('96-well plate') }, [PLATE_CREATION]),
      STATE,
      ctx(),
    )
    expect(result).toEqual({
      adopted: false,
      blocked: 1,
      reason: 'unplaceable-labware',
      unplaceable: [key],
    })
    // The create was attempted and failed; the mint skipped the key; NOTHING
    // was persisted or committed, so no labware node with proposedRecord:true
    // can exist in the accepted graph.
    expect(callOrder).toEqual(['creations', 'definition'])
    expect(persistAcceptedEventGraph).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
