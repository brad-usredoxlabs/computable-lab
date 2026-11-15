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
import { localRecordIdFor, sameEntity } from './acceptedRecordCreations'

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
 *  (created or reused definition); (2) the definition id the vessel carries
 *  (step 2 stamps it there by NAME); (3) a deck key that is itself a labware
 *  record id. Undefined = unresolvable.
 *
 *  THE ONE RULE: the mint and the pre-check both call this — they differ only
 *  in what they pass as `materialized` (the mint: what step 2 actually
 *  produced; the pre-check: the projection of what it WILL produce). */
export function resolveLabwareDefinitionId(
  key: string,
  labware: Labware,
  materialized: Array<MaterializedDefinitionCreation>,
): string | undefined {
  const creation = materialized.find((c) => c.key === key && c.kind === 'labware')
  if (creation?.recordId) return creation.recordId
  if (typeof labware.recordId === 'string' && labware.recordId.length > 0) return labware.recordId
  return isResolvableDeckKey(key, materialized) ? key : undefined
}

/**
 * PURE pre-check (L2-P1-LABWARE-INSTANCE-RECORD-1 u2ghostgate; gate r10
 * defect 4): the deck keys of the placed labwares for which NO definition
 * record id CAN EVER resolve. A non-empty list means the accept is refused
 * before ANY write: persisting the preview's labware without an instance
 * behind it is a ghost labware (a visible gap, never a guess).
 *
 * u3ghostfix D1: it is the MINT's own rule (resolveLabwareDefinitionId), fed
 * with a PROJECTION of step 2. The records-first materializer creates one
 * definition per labware creation and stamps that record id onto the ghost
 * whose NAME matches (`sameEntity`) — the creation's own key is
 * `handle ?? name` and the producer mints deck keys as `lbw-proposed-*`
 * (draftPreview.ts:219), so creation-key/deck-key equality NEVER matches and
 * must not be used as the test.
 */
export function findUnplaceableLabware(
  previewLabwares: Record<string, Labware>,
  recordCreations?: AiRecordCreation[],
): string[] {
  const creations = (recordCreations ?? []).filter(
    (c) => c.kind === 'labware' && !!c.name?.trim(),
  )
  // The DEFINITION creations step 2 will materialize for THIS vessel: the ones
  // whose name the materializer will recognize as the same entity.
  const project = (key: string, vessel: Labware): MaterializedDefinitionCreation[] =>
    creations
      .filter((c) => !!vessel.name?.trim() && sameEntity(vessel.name, c.name))
      .map((c) => ({
        key,
        kind: 'labware',
        recordId: localRecordIdFor('labware', c.name.trim(), c.curie),
      }))
  return Object.keys(previewLabwares).filter(
    (key) =>
      resolveLabwareDefinitionId(
        key,
        previewLabwares[key],
        project(key, previewLabwares[key]),
      ) === undefined,
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
