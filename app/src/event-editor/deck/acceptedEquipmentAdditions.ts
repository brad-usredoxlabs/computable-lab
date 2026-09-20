/**
 * Deprecated: equipment creation is now one kind of RECORD creation.
 *
 * Kept as a thin adapter so equipment-only callers and their tests keep working; new
 * code goes through `materializeAcceptedRecordCreations` (all three kinds, one
 * review, one materializer). The input type is declared here because the retired
 * `AiEquipmentAddition` no longer exists in the AI contract — authoring is
 * `create_record` with `records: [{kind, name, …}]`.
 */
import type { Equipment } from '../../types/equipment'
import { localRecordIdFor, materializeAcceptedRecordCreations } from './acceptedRecordCreations'

/** The equipment-only shape the retired `equipmentAdditions` field used. */
export interface AiEquipmentAddition {
  name: string
  handle?: string
  classKind?: string
  classRecordId?: string
  settings?: Record<string, unknown>
  source?: string
  reason?: string
}

export interface MaterializedEquipmentAddition {
  key: string
  recordId: string
  name: string
  existingRecordId?: string
}

export interface EquipmentMaterializationResult {
  materialized: MaterializedEquipmentAddition[]
  warnings: string[]
}

interface MaterializationDeps {
  createRecord?: (schemaId: string, payload: Record<string, unknown>) => Promise<unknown>
  searchRecords?: (query: string, kinds?: string[]) => Promise<unknown>
}

/** Stable record id for an instrument name (`EQP-BENCHMARK-INCU-MIXER-MP4`). */
export function localEquipmentIdFor(name: string): string {
  return localRecordIdFor('equipment', name)
}

export async function materializeAcceptedEquipmentAdditions(
  additions: AiEquipmentAddition[] | undefined,
  equipment: Record<string, Equipment>,
  deps: MaterializationDeps = {},
): Promise<EquipmentMaterializationResult> {
  const result = await materializeAcceptedRecordCreations(
    (additions ?? []).map((addition) => ({
      kind: 'equipment' as const,
      name: addition.name,
      ...(addition.handle ? { handle: addition.handle } : {}),
      ...(addition.classKind ? { classKind: addition.classKind } : {}),
      ...(addition.classRecordId ? { classRecordId: addition.classRecordId } : {}),
      ...(addition.settings ? { settings: addition.settings } : {}),
      ...(addition.source ? { source: addition.source } : {}),
      ...(addition.reason ? { reason: addition.reason } : {}),
    })),
    { equipments: equipment },
    deps,
  )
  return {
    materialized: result.materialized.map((item) => ({
      key: item.key,
      recordId: item.recordId,
      name: item.name,
      ...(item.existingRecordId ? { existingRecordId: item.existingRecordId } : {}),
    })),
    warnings: result.warnings,
  }
}
