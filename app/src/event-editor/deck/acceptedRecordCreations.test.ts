/**
 * Accept-time materialization for the third intent: one creation shape, three kinds.
 *
 * Equipment is covered by acceptedEquipmentAdditions.test.ts (the thin adapter); this
 * pins materials and labware, the dispatch, and the two rules that must never soften:
 * records-first (reuse + warn, never a second copy) and attribution on the record.
 */
import { describe, expect, it, vi } from 'vitest'
import { localRecordIdFor, materializeAcceptedRecordCreations } from './acceptedRecordCreations'
import { MATERIAL_SCHEMA_ID } from '../../types/material'
import type { Equipment } from '../../types/equipment'
import type { Labware } from '../../types/labware'

const LABWARE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml'

describe('materializeAcceptedRecordCreations', () => {
  it('creates a material with the same shape the ontology mint uses', async () => {
    const createRecord = vi.fn().mockResolvedValue({})
    const result = await materializeAcceptedRecordCreations(
      [{ kind: 'material', name: 'fenofibrate', domain: 'chemical', source: 'user-description' }],
      {},
      { createRecord, searchRecords: vi.fn().mockResolvedValue({ results: [] }) },
    )
    expect(createRecord).toHaveBeenCalledTimes(1)
    const [schemaId, payload] = createRecord.mock.calls[0] as [string, Record<string, unknown>]
    expect(schemaId).toBe(MATERIAL_SCHEMA_ID)
    expect(payload).toMatchObject({
      kind: 'material',
      id: 'MAT-FENOFIBRATE',
      name: 'fenofibrate',
      domain: 'chemical',
      status: 'proposed',
      lifecycleId: 'lab-vocabulary-control',
    })
    expect(String((payload.provenance as Record<string, unknown>).note)).toContain('user-description')
    expect(result.materialized[0]).toMatchObject({ kind: 'material', recordId: 'MAT-FENOFIBRATE' })
  })

  it('grounds a material on its CURIE when the draft gave one', async () => {
    const createRecord = vi.fn().mockResolvedValue({})
    await materializeAcceptedRecordCreations(
      [{ kind: 'material', name: 'clofibrate', domain: 'chemical', curie: 'CHEBI:3750', source: 'exa:https://pubchem.example' }],
      {},
      { createRecord, searchRecords: vi.fn().mockResolvedValue({ results: [] }) },
    )
    const payload = createRecord.mock.calls[0]?.[1] as Record<string, unknown>
    expect(payload.id).toBe('MAT-3750')
    expect(payload.class).toEqual([{ kind: 'ontology', id: 'CHEBI:3750', namespace: 'CHEBI', label: 'clofibrate' }])
  })

  it('creates a labware record with its type and layout, and stamps the ghost', async () => {
    const createRecord = vi.fn().mockResolvedValue({})
    const ghost = { labwareId: 'lbw-proposed-1', name: '96-well low-binding plate', labwareType: 'plate', proposedRecord: true } as unknown as Labware
    const result = await materializeAcceptedRecordCreations(
      [{ kind: 'labware', name: '96-well low-binding plate', labwareType: 'plate', format: { rows: 8, cols: 12, wellCount: 96 }, source: 'user-description' }],
      { labwares: { 'lbw-proposed-1': ghost } },
      { createRecord, searchRecords: vi.fn().mockResolvedValue({ results: [] }) },
    )
    const [schemaId, payload] = createRecord.mock.calls[0] as [string, Record<string, unknown>]
    expect(schemaId).toBe(LABWARE_SCHEMA_ID)
    expect(payload).toMatchObject({
      kind: 'labware',
      recordId: 'LBW-96-WELL-LOW-BINDING-PLATE',
      labwareType: 'plate',
      format: { rows: 8, cols: 12, wellCount: 96 },
    })
    expect(result.materialized[0]?.kind).toBe('labware')
    expect(ghost.recordId).toBe('LBW-96-WELL-LOW-BINDING-PLATE')
    expect(ghost.proposedRecord).toBeUndefined()
  })

  it('never creates a second copy of something the lab has', async () => {
    const createRecord = vi.fn().mockResolvedValue({})
    const searchRecords = vi.fn().mockResolvedValue({
      results: [{ recordId: 'MAT-ETHANOL', label: 'ethanol' }],
    })
    const result = await materializeAcceptedRecordCreations(
      [{ kind: 'material', name: 'Ethanol', domain: 'chemical', source: 'user-description' }],
      {},
      { createRecord, searchRecords },
    )
    expect(createRecord).not.toHaveBeenCalled()
    expect(result.materialized[0]?.existingRecordId).toBe('MAT-ETHANOL')
    expect(result.warnings.join(' ')).toContain('already exists as MAT-ETHANOL')
  })

  it('dispatches every kind in one pass', async () => {
    const createRecord = vi.fn().mockResolvedValue({})
    const equipment = { equipmentId: 'eqp-1', name: 'Incu-Mixer', proposedRecord: true } as unknown as Equipment
    const result = await materializeAcceptedRecordCreations(
      [
        { kind: 'equipment', name: 'Incu-Mixer', source: 'user-description' },
        { kind: 'material', name: 'fenofibrate', domain: 'chemical', source: 'user-description' },
        { kind: 'labware', name: 'low-binding plate', labwareType: 'plate', source: 'user-description' },
      ],
      { equipments: { 'eqp-1': equipment } },
      { createRecord, searchRecords: vi.fn().mockResolvedValue({ results: [] }) },
    )
    expect(result.materialized.map((item) => item.kind)).toEqual(['equipment', 'material', 'labware'])
    expect(equipment.recordId).toBe('EQP-INCU-MIXER')
    expect(result.warnings).toEqual([])
  })

  it('reads a stable, readable id for each kind', () => {
    expect(localRecordIdFor('equipment', 'Benchmark Incu-Mixer MP4')).toBe('EQP-BENCHMARK-INCU-MIXER-MP4')
    expect(localRecordIdFor('material', 'fenofibrate')).toBe('MAT-FENOFIBRATE')
    expect(localRecordIdFor('labware', '96-well low-binding plate')).toBe('LBW-96-WELL-LOW-BINDING-PLATE')
    expect(localRecordIdFor('material', 'clofibrate', 'CHEBI:3750')).toBe('MAT-3750')
  })
})
