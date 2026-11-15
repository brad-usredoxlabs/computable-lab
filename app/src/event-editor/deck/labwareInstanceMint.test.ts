/**
 * L2-P1-LABWARE-INSTANCE-RECORD-1 u1inst (RED-first, module absent at RED time).
 *
 * Gate r10 defect 2 (PROMPT1-GATE-20261115T044528Z): after an AI-chat place the
 * labware-instance record count goes 6 -> 6 — nothing is minted. The graph's
 * labwareId IS the definition id (definition-as-instance bait). The ruling
 * (LABWARE-INSTANCE-DEFINITION-IDENTITY-l2-20261113): "Identity is the record
 * id ... An instance that cannot name its definition by record id is not a
 * valid instance." This module mints ONE labware-instance per placed labware
 * whose labwareId is the resolved DEFINITION record id — before the graph is
 * durably persisted (the deckAdoption call site runs it after records-first
 * creations, before persistAcceptedEventGraph).
 *
 * Pure-logic module: no DOM needed.
 */
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { mintPlacedLabwareInstances } from './labwareInstanceMint'
import type { Labware } from '../../types/labware'

const INSTANCE_SCHEMA =
  'https://computable-lab.com/schema/computable-lab/labware-instance.schema.yaml'

const mkLabware = (deckKey: string, extra: Partial<Labware> = {}): Labware =>
  ({
    labwareId: deckKey,
    labwareType: 'plate',
    name: deckKey,
    addressing: 'coordinate',
    geometry: { maxVolume_uL: 200000, minVolume_uL: 0 },
    ...extra,
  }) as Labware

const created = (key: string, recordId: string) => ({ key, kind: 'labware' as const, recordId })
const reused = (key: string, existingRecordId: string) => ({
  key,
  kind: 'labware' as const,
  recordId: existingRecordId,
  existingRecordId,
})

describe('mintPlacedLabwareInstances — one instance per placed labware, definition identity by record id', () => {
  it('a) newly created definition -> createRecord ONCE, kind labware-instance, labwareId === the definition recordId', async () => {
    const createRecord = vi.fn(async (_schemaId: string, _payload: Record<string, unknown>) => undefined)
    const res = await mintPlacedLabwareInstances({
      previewLabwares: { P1: mkLabware('P1') },
      materialized: [created('P1', 'LBW-96WELL')],
      createRecord,
    })
    expect(createRecord).toHaveBeenCalledTimes(1)
    expect(createRecord).toHaveBeenCalledWith(
      INSTANCE_SCHEMA,
      expect.objectContaining({ kind: 'labware-instance', labwareId: 'LBW-96WELL' }),
    )
    const payload = createRecord.mock.calls[0][1] as { recordId: string; kind: string; labwareId: string }
    expect(payload.kind).toBe('labware-instance')
    expect(payload.recordId).toMatch(/^LAB-INST-[0-9A-Fa-f]{8}$/)
    expect(res.instanceIds).toEqual([payload.recordId])
    expect(res.warnings).toEqual([])
  })

  it('b) reused existing definition (materialized with existingRecordId) -> the instance references the EXISTING recordId, exactly one instance', async () => {
    const createRecord = vi.fn(async (_schemaId: string, _payload: Record<string, unknown>) => undefined)
    const res = await mintPlacedLabwareInstances({
      previewLabwares: { P1: mkLabware('P1') },
      materialized: [reused('P1', 'LBW-EXISTING')],
      createRecord,
    })
    expect(createRecord).toHaveBeenCalledTimes(1)
    const payload = createRecord.mock.calls[0][1] as { labwareId: string }
    expect(payload.labwareId).toBe('LBW-EXISTING')
    expect(res.instanceIds).toHaveLength(1)
    expect(res.warnings).toEqual([])
  })

  it('c) two placed labwares -> exactly two instances, one per placement, never two per placement', async () => {
    const createRecord = vi.fn(async (_schemaId: string, _payload: Record<string, unknown>) => undefined)
    const res = await mintPlacedLabwareInstances({
      previewLabwares: { P1: mkLabware('P1'), P2: mkLabware('P2') },
      materialized: [created('P1', 'LBW-A'), created('P2', 'LBW-B')],
      createRecord,
    })
    expect(createRecord).toHaveBeenCalledTimes(2)
    const targets = createRecord.mock.calls.map((c) => (c[1] as { labwareId: string }).labwareId)
    expect(targets).toEqual(['LBW-A', 'LBW-B'])
    expect(res.instanceIds).toHaveLength(2)
    expect(new Set(res.instanceIds).size).toBe(2) // distinct mints — one per placement
    expect(res.warnings).toEqual([])
  })

  it('d) unresolvable definition id -> ZERO createRecord calls and a warning naming the key (visible gap, never a guess)', async () => {
    const createRecord = vi.fn(async (_schemaId: string, _payload: Record<string, unknown>) => undefined)
    const res = await mintPlacedLabwareInstances({
      previewLabwares: { P1: mkLabware('P1') },
      materialized: [],
      createRecord,
    })
    expect(createRecord).toHaveBeenCalledTimes(0)
    expect(res.instanceIds).toEqual([])
    expect(res.warnings).toHaveLength(1)
    expect(res.warnings[0]).toContain('P1')
    expect(res.warnings[0]).toContain('without a resolvable labware definition record id')
  })

  it('e) definition recordId on the Labware (no materialized creation) -> the instance references it', async () => {
    const createRecord = vi.fn(async (_schemaId: string, _payload: Record<string, unknown>) => undefined)
    const res = await mintPlacedLabwareInstances({
      previewLabwares: { P1: mkLabware('P1', { recordId: 'LBW-ONVESSEL' }) },
      materialized: [],
      createRecord,
    })
    expect(createRecord).toHaveBeenCalledTimes(1)
    const payload = createRecord.mock.calls[0][1] as { labwareId: string }
    expect(payload.labwareId).toBe('LBW-ONVESSEL')
    expect(res.instanceIds).toHaveLength(1)
  })

  it('u4seedref f) a SEEDED vessel (producer sets sourceRecordId, no recordId) resolves the definition id to sourceRecordId', async () => {
    // The producer (labwareRecordToEditorLabware) sets `labwareId` AND
    // `sourceRecordId` to the record id and NO `recordId`; the deck key is
    // `lbw-seed-*`, which isResolvableDeckKey rejects.
    const createRecord = vi.fn(async (_schemaId: string, _payload: Record<string, unknown>) => undefined)
    const res = await mintPlacedLabwareInstances({
      previewLabwares: {
        'lbw-seed-plate-96-flat': mkLabware('lbw-seed-plate-96-flat', {
          name: '96-Well Plate',
          sourceRecordId: 'lbw-seed-plate-96-flat',
        }),
      },
      materialized: [],
      createRecord,
    })
    expect(createRecord).toHaveBeenCalledTimes(1)
    const payload = createRecord.mock.calls[0][1] as { labwareId: string }
    // The instance points at the DEFINITION the lab already owns, by record id.
    expect(payload.labwareId).toBe('lbw-seed-plate-96-flat')
    expect(res.instanceIds).toHaveLength(1)
    expect(res.skipped).toEqual([])
  })

  it('u4seedref g) a manual vessel (random lw-* labwareId, no sourceRecordId) does NOT resolve through labwareId', async () => {
    const createRecord = vi.fn(async (_schemaId: string, _payload: Record<string, unknown>) => undefined)
    const res = await mintPlacedLabwareInstances({
      previewLabwares: { 'lbw-proposed-mwhmtzke-96wellplate': mkLabware('lbw-proposed-mwhmtzke-96wellplate') },
      materialized: [],
      createRecord,
    })
    expect(createRecord).toHaveBeenCalledTimes(0)
    expect(res.skipped).toEqual(['lbw-proposed-mwhmtzke-96wellplate'])
  })

  it('a deck key that is itself a labware record id resolves even without a materialized creation', async () => {
    const createRecord = vi.fn(async (_schemaId: string, _payload: Record<string, unknown>) => undefined)
    const res = await mintPlacedLabwareInstances({
      previewLabwares: { 'LW-1A2B3C4D': mkLabware('LW-1A2B3C4D') },
      materialized: [],
      createRecord,
    })
    expect(createRecord).toHaveBeenCalledTimes(1)
    const payload = createRecord.mock.calls[0][1] as { labwareId: string }
    expect(payload.labwareId).toBe('LW-1A2B3C4D')
    expect(res.instanceIds).toHaveLength(1)
  })

  it('tolerates an empty materialized list (a placement with no creation resolves via the vessel id or is a named gap)', async () => {
    const createRecord = vi.fn(async (_schemaId: string, _payload: Record<string, unknown>) => undefined)
    const res = await mintPlacedLabwareInstances({
      previewLabwares: { P1: mkLabware('P1', { recordId: 'LBW-SET' }) },
      materialized: [],
      createRecord,
    })
    expect(createRecord).toHaveBeenCalledTimes(1)
    const payload = createRecord.mock.calls[0][1] as { labwareId: string }
    expect(payload.labwareId).toBe('LBW-SET')
    expect(res.warnings).toEqual([])
  })

  it('defaults to apiClient.createRecord (same pattern as acceptedRecordCreations) and exposes the schema id', async () => {
    // Fresh module evaluation against a mocked apiClient (the static import
    // above already holds the real instance for the other tests).
    const apiClientMock = { createRecord: vi.fn(async (_schemaId: string, _payload: Record<string, unknown>) => undefined) }
    vi.resetModules()
    vi.doMock('../../shared/api/client', () => ({ apiClient: apiClientMock }))
    const {
      mintPlacedLabwareInstances: realMint,
      LABWARE_INSTANCE_SCHEMA: sid,
    } = await import('./labwareInstanceMint')
    expect(sid).toBe(INSTANCE_SCHEMA)
    const res = await realMint({
      previewLabwares: { P1: mkLabware('P1') },
      materialized: [created('P1', 'LBW-WIRED')],
    })
    expect(apiClientMock.createRecord).toHaveBeenCalledTimes(1)
    const [schemaId, payload] = apiClientMock.createRecord.mock.calls[0] as [string, { labwareId: string }]
    expect(schemaId).toBe(sid)
    expect(payload.labwareId).toBe('LBW-WIRED')
    expect(res.instanceIds).toHaveLength(1)
    vi.resetModules()
  })
})
