/**
 * Mint one labware-instance record per PLACED labware at Accept time
 * (L2-P1-LABWARE-INSTANCE-RECORD-1 u1inst; gate r10 defect 2,
 * PROMPT1-GATE-20261115T044528Z: the instance count went 6 -> 6 and the
 * graph's labwareId WAS the definition id — definition-as-instance).
 *
 * Ruling LABWARE-INSTANCE-DEFINITION-IDENTITY-l2-20261113: identity is the
 * record id — an instance that cannot name its definition by record id is
 * not a valid instance. Each placement gets its OWN instance whose
 * `labwareId` names the resolved DEFINITION record id, by record id only (a
 * name is a hint, never identity — NO name matching). An unresolvable id
 * mints nothing and is named in the warnings: a visible gap, never a guess.
 * Payload mirrors LabwareInstanceCreateModal.
 */
import { apiClient } from '../../shared/api/client'
import type { Labware } from '../../types/labware'

export const LABWARE_INSTANCE_SCHEMA =
  'https://computable-lab.com/schema/computable-lab/labware-instance.schema.yaml'

/** A materialized labware DEFINITION creation (created or reused). */
export interface MaterializedDefinitionCreation {
  key: string
  kind: string
  recordId: string
}

/** Mint a LAB-INST-<8 hex uppercase> record id. */
function mintRecordId(): string {
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join('')
  return `LAB-INST-${hex}`
}

/** The deck key is itself a labware record id: the durable id shape, or a
 *  labware definition record id present in the materialized creations. */
function isResolvableDeckKey(
  key: string,
  materialized: Array<MaterializedDefinitionCreation>,
): boolean {
  return (
    /^(LAB|LW)-[0-9A-Fa-f]+$/.test(key) ||
    materialized.some((c) => c.kind === 'labware' && c.recordId === key)
  )
}

/**
 * Mint exactly one labware-instance per placed labware, in preview insertion
 * order. Returns the minted ids (no id when no definition resolves) and the
 * named-gap warnings.
 */
export async function mintPlacedLabwareInstances(opts: {
  previewLabwares: Record<string, Labware>
  materialized: Array<MaterializedDefinitionCreation>
  createRecord?: (schemaId: string, payload: Record<string, unknown>) => Promise<unknown>
}): Promise<{ instanceIds: string[]; warnings: string[] }> {
  const { previewLabwares, materialized } = opts
  const createRecord = opts.createRecord ?? apiClient.createRecord
  const instanceIds: string[] = []
  const warnings: string[] = []

  for (const [key, labware] of Object.entries(previewLabwares)) {
    // Record id only: (1) the records-first creation for this placement
    // (created or reused definition); (2) the definition id the vessel
    // carries; (3) a deck key that is itself a labware record id.
    const creation = materialized.find((c) => c.key === key && c.kind === 'labware')
    const definitionId =
      creation?.recordId ??
      (typeof labware.recordId === 'string' && labware.recordId.length > 0
        ? labware.recordId
        : isResolvableDeckKey(key, materialized)
          ? key
          : undefined)

    if (!definitionId) {
      // A visible gap, never a guess: no instance, no silent substitution.
      warnings.push(
        `${key} was placed without a resolvable labware definition record id — no instance was minted; pick or create the definition.`,
      )
      continue
    }

    const recordId = mintRecordId()
    await createRecord(LABWARE_INSTANCE_SCHEMA, {
      kind: 'labware-instance',
      recordId,
      labwareId: definitionId,
    })
    instanceIds.push(recordId)
  }

  return { instanceIds, warnings }
}
