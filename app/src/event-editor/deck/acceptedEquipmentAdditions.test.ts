/**
 * Accept-time materialization of AI-proposed equipment — the ADD.
 *
 * Rules under test: records-first (never a duplicate copy; reuse + warn — O19),
 * attribution carried onto the record, nothing asserted about settings that no
 * source stated, and the ghosted entity gaining its recordId so the committed
 * placement stops pointing at a mint id.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  localEquipmentIdFor,
  materializeAcceptedEquipmentAdditions,
} from './acceptedEquipmentAdditions'
import type { Equipment } from '../../types/equipment'

function ghost(name: string, equipmentId = 'eqp-1'): Equipment {
  return {
    equipmentId,
    name,
    instrumentKind: 'heater_shaker',
    equipmentClassRef: { kind: 'ontology', id: 'CL:heater_shaker', namespace: 'CL', label: 'Heater-shaker' },
    proposedRecord: true,
  }
}

const EQUIPMENT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/equipment.schema.yaml'

describe('materializeAcceptedEquipmentAdditions', () => {
  it('creates the record with its attribution and stamps the ghosted entity', async () => {
    const createRecord = vi.fn().mockResolvedValue({})
    const searchRecords = vi.fn().mockResolvedValue({ results: [] })
    const entity = ghost('Benchmark Incu-Mixer MP4')

    const result = await materializeAcceptedEquipmentAdditions(
      [
        {
          name: 'Benchmark Incu-Mixer MP4',
          classKind: 'equipment:heater_shaker',
          source: 'exa:https://benchmarkscientific.com/incu-mixer-mp4',
          settings: { rpm: 1200 },
        },
      ],
      { 'eqp-1': entity },
      { createRecord, searchRecords },
    )

    expect(createRecord).toHaveBeenCalledTimes(1)
    const [schemaId, payload] = createRecord.mock.calls[0] as [string, Record<string, unknown>]
    expect(schemaId).toBe(EQUIPMENT_SCHEMA_ID)
    expect(payload).toMatchObject({
      kind: 'equipment',
      name: 'Benchmark Incu-Mixer MP4',
      id: 'EQP-BENCHMARK-INCU-MIXER-MP4',
      status: 'active',
      settings: { rpm: 1200 },
    })
    expect(String(payload.notes)).toContain('exa:https://benchmarkscientific.com/incu-mixer-mp4')
    expect(result.materialized).toEqual([
      { key: 'Benchmark Incu-Mixer MP4', recordId: 'EQP-BENCHMARK-INCU-MIXER-MP4', name: 'Benchmark Incu-Mixer MP4' },
    ])
    // The ghost is no longer a ghost: the committed placement has a record behind it.
    expect(entity.recordId).toBe('EQP-BENCHMARK-INCU-MIXER-MP4')
    expect(entity.proposedRecord).toBeUndefined()
  })

  it('reuses an existing instrument instead of creating a duplicate (records-first)', async () => {
    const createRecord = vi.fn().mockResolvedValue({})
    const searchRecords = vi.fn().mockResolvedValue({
      results: [{ recordId: 'EQP-EPPENDORF-THERMOMIXER-C-3776', label: 'Eppendorf ThermoMixer® C' }],
    })
    const entity = ghost('the lab ThermoMixer')

    const result = await materializeAcceptedEquipmentAdditions(
      [{ name: 'Eppendorf ThermoMixer C' }],
      { 'eqp-1': entity },
      { createRecord, searchRecords },
    )

    expect(createRecord).not.toHaveBeenCalled()
    expect(result.materialized[0]?.existingRecordId).toBe('EQP-EPPENDORF-THERMOMIXER-C-3776')
    expect(result.warnings.join(' ')).toContain('already exists as EQP-EPPENDORF-THERMOMIXER-C-3776')
  })

  it('flags an ungrounded addition instead of dressing it up as evidence', async () => {
    const createRecord = vi.fn().mockResolvedValue({})
    const searchRecords = vi.fn().mockResolvedValue({ results: [] })

    const result = await materializeAcceptedEquipmentAdditions(
      [{ name: 'Mystery Mixer' }],
      {},
      { createRecord, searchRecords },
    )

    const payload = createRecord.mock.calls[0]?.[1] as Record<string, unknown>
    expect(String(payload.notes)).toContain('no stated source')
    expect(payload.settings).toBeUndefined()
    expect(result.warnings.join(' ')).toContain('no stated source')
  })

  it('survives a failed duplicate check (creates, and cannot silently skip the check)', async () => {
    const createRecord = vi.fn().mockResolvedValue({})
    const searchRecords = vi.fn().mockRejectedValue(new Error('offline'))

    const result = await materializeAcceptedEquipmentAdditions(
      [{ name: 'Bench Mixer' }],
      {},
      { createRecord, searchRecords },
    )
    expect(createRecord).toHaveBeenCalledTimes(1)
    expect(result.materialized).toHaveLength(1)
  })

  it('reports a failed create rather than pretending the add happened', async () => {
    const createRecord = vi.fn().mockRejectedValue(new Error('500'))
    const result = await materializeAcceptedEquipmentAdditions(
      [{ name: 'Broken Mixer' }],
      {},
      { createRecord, searchRecords: vi.fn().mockResolvedValue({ results: [] }) },
    )
    expect(result.materialized).toEqual([])
    expect(result.warnings.join(' ')).toContain('no record behind it')
  })

  it('mints a stable, readable record id', () => {
    expect(localEquipmentIdFor('Benchmark Incu-Mixer MP4')).toBe('EQP-BENCHMARK-INCU-MIXER-MP4')
    expect(localEquipmentIdFor('  ')).toBe('EQP-UNNAMED-EQUIPMENT')
  })
})
