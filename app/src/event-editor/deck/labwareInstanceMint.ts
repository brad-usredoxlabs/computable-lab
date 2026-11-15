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
import type { AiRecordCreation } from '../../types/ai'
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
 *  labware definition record id present in the materialized creations.
 *  Exported — findUnplaceableLabware shares the exact rule with the mint. */
export function isResolvableDeckKey(
  key: string,
  materialized: Array<MaterializedDefinitionCreation>,
): boolean {
  return (
    /^(LAB|LW)-[0-9A-Fa-f]+$/.test(key) ||
    materialized.some((c) => c.kind === 'labware' && c.recordId === key)
  )
}

/** The resolved DEFINITION record id for one placed labware, by record id
 *  only (an instance that cannot name its definition by record id is not a
 *  valid instance): (1) the records-first creation for this placement
 *  (created or reused definition); (2) the definition id the vessel carries;
 *  (3) a deck key that is itself a labware record id. Undefined = unresolvable. */
function resolveLabwareDefinitionId(
  key: string,
  labware: Labware,
  materialized: Array<MaterializedDefinitionCreation>,
): string | undefined {
  const creation = materialized.find((c) => c.key === key && c.kind === 'labware')
  return (
    creation?.recordId ??
    (typeof labware.recordId === 'string' && labware.recordId.length > 0
      ? labware.recordId
      : isResolvableDeckKey(key, materialized)
        ? key
        : undefined)
  )
}

/**
 * PURE pre-check (L2-P1-LABWARE-INSTANCE-RECORD-1 u2ghostgate; gate r10
 * defect 4): the deck keys of the placed labwares for which NO definition
 * record id CAN EVER resolve. A labware resolves only one of three ways — a
 * records-first creation for it, the definition id its vessel carries, or a
 * deck key that is itself a record id — so the check keys off the PROPOSED
 * recordCreations (the only source of the materialized list) and refuses
 * BEFORE step 2 runs: persisting the preview's labware without an instance
 * behind it is a ghost labware (a visible gap, never a guess). A non-empty
 * list means the accept is refused before ANY write.
 */
export function findUnplaceableLabware(
  previewLabwares: Record<string, Labware>,
  recordCreations?: AiRecordCreation[],
): string[] {
  // The deck keys a records-first pass would materialize a labware definition
  // for (creation.handle ?? creation.name — the real module's key rule).
  const creatable = new Set(
    (recordCreations ?? [])
      .filter((c) => c.kind === 'labware')
      .map((c) => c.handle ?? c.name),
  )
  return Object.keys(previewLabwares).filter(
    (key) =>
      !creatable.has(key) &&
      !(typeof previewLabwares[key]?.recordId === 'string' && previewLabwares[key]?.recordId.length > 0) &&
      !isResolvableDeckKey(key, []),
  )
}

/**
 * Mint exactly one labware-instance per placed labware, in preview insertion
 * order. Returns the minted ids (no id when no definition resolves), the
 * named-gap warnings, and `skipped` — the deck keys with no resolvable
 * definition record id (the machine-readable gap; a non-empty list means the
 * adopter must refuse before any write, u2ghostgate).
 */
export async function mintPlacedLabwareInstances(opts: {
  previewLabwares: Record<string, Labware>
  materialized: Array<MaterializedDefinitionCreation>
  createRecord?: (schemaId: string, payload: Record<string, unknown>) => Promise<unknown>
}): Promise<{ instanceIds: string[]; warnings: string[]; skipped: string[] }> {
  const { previewLabwares, materialized } = opts
  const createRecord = opts.createRecord ?? apiClient.createRecord
  const instanceIds: string[] = []
  const warnings: string[] = []
  const skipped: string[] = []

  for (const [key, labware] of Object.entries(previewLabwares)) {
    // Record id only: (1) the records-first creation for this placement
    // (created or reused definition); (2) the definition id the vessel
    // carries; (3) a deck key that is itself a labware record id.
    const definitionId = resolveLabwareDefinitionId(key, labware, materialized)

    if (!definitionId) {
      // A visible gap, never a guess: no instance, no silent substitution.
      skipped.push(key)
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

  return { instanceIds, warnings, skipped }
}
