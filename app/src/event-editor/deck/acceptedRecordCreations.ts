/**
 * Materialize AI-proposed RECORDS at Accept time — the "add" half, for all three kinds.
 *
 * One creation shape (equipment | material | labware), one review, one materializer.
 * The draft may propose records the lab does not have; nothing is written while it is
 * a ghost (draft-first, O3), and this is what turns an approved proposal into durable
 * records:
 *
 *   1. RECORDS-FIRST (O19): if the lab already has it, do NOT create a second copy —
 *      return the existing record (so the placement points at it) and a warning the
 *      user sees.
 *   2. ATTRIBUTION: every record carries where the specification came from
 *      (`user-description`, `exa:<url>`, `record:<id>`). An ungrounded creation is
 *      recorded as such and flagged; nothing is dressed up as evidence.
 *
 * Material payloads mirror the ontology-mint path (acceptedOntologyBindings) so a
 * material created here is the same record shape as one minted from a CURIE.
 */
import { apiClient } from '../../shared/api/client'
import { MATERIAL_SCHEMA_ID } from '../../types/material'
import type { Equipment } from '../../types/equipment'
import type { Labware } from '../../types/labware'
import type { AiRecordCreation, AiRecordCreationKind } from '../../types/ai'

const EQUIPMENT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/equipment.schema.yaml'
const LABWARE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml'

export interface MaterializedRecordCreation {
  /** The proposal this materializes (its handle, else its name). */
  key: string
  kind: AiRecordCreationKind
  recordId: string
  name: string
  /** Set when the lab already had a matching record — nothing was created. */
  existingRecordId?: string
}

export interface RecordMaterializationResult {
  materialized: MaterializedRecordCreation[]
  /** User-facing notices: duplicates reused, attributions missing, creates that failed. */
  warnings: string[]
}

type CreateRecordFn = (schemaId: string, payload: Record<string, unknown>) => Promise<unknown>
type SearchRecordsFn = (query: string, kinds?: string[]) => Promise<unknown>

export interface RecordMaterializationDeps {
  createRecord?: CreateRecordFn
  searchRecords?: SearchRecordsFn
}

/** Stable record id for a name (`EQP-…`, `MAT-…`, `LBW-…`). */
export function localRecordIdFor(kind: AiRecordCreationKind, name: string, curie?: string): string {
  const slug = (curie ? curie.split(':').pop() ?? name : name)
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase()
  const prefix = kind === 'equipment' ? 'EQP' : kind === 'material' ? 'MAT' : 'LBW'
  const fallback = kind === 'equipment' ? 'UNNAMED-EQUIPMENT' : kind === 'material' ? 'UNNAMED-MATERIAL' : 'UNNAMED-LABWARE'
  return curie && kind === 'material' ? `MAT-${slug || fallback}` : `${prefix}-${slug || fallback}`
}

/** Compare names loosely enough to catch "the lab bath" vs "Water Bath". */
function sameEntity(a: string, b: string): boolean {
  const normalize = (value: string): string =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\b(the|our|lab|s)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  const left = normalize(a)
  const right = normalize(b)
  if (!left || !right) return false
  return left === right || left.includes(right) || right.includes(left)
}

/** The equipment-class ref the proposal asked for, if any. */
function classRefFor(creation: AiRecordCreation): Equipment['equipmentClassRef'] | undefined {
  if (creation.classRecordId) {
    return { kind: 'record', type: 'equipment-class', id: creation.classRecordId }
  }
  const token = creation.classKind
  if (!token) return undefined
  if (/^EQ[PC]-/i.test(token)) {
    return { kind: 'record', type: 'equipment-class', id: token }
  }
  const kind = token.replace(/^equipment:/i, '').trim()
  const label = kind.replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase())
  return { kind: 'ontology', id: `CL:${kind}`, namespace: 'CL', label }
}

function attributionNote(creation: AiRecordCreation): string {
  const source = creation.source?.trim()
  const base = source
    ? `Added by the AI assistant; specification attributed to ${source}.`
    : 'Added by the AI assistant with no stated source — the specification still needs grounding.'
  return creation.reason ? `${base} ${creation.reason}` : base
}

/** The record payload for one creation, per kind. */
function payloadFor(creation: AiRecordCreation, recordId: string): { schemaId: string; payload: Record<string, unknown> } {
  if (creation.kind === 'material') {
    const namespace = creation.curie?.split(':')[0]
    return {
      schemaId: MATERIAL_SCHEMA_ID,
      payload: {
        kind: 'material',
        id: recordId,
        name: creation.name,
        domain: creation.domain ?? 'other',
        status: 'proposed',
        lifecycleId: 'lab-vocabulary-control',
        provenance: {
          source: 'ai_record_creation',
          ...(creation.curie ? { sourceCurie: creation.curie } : {}),
          sourceLabel: creation.name,
          createdBy: 'human_accept',
          createdAt: new Date().toISOString(),
          note: attributionNote(creation),
        },
        ...(creation.curie && namespace
          ? { class: [{ kind: 'ontology', id: creation.curie, namespace, label: creation.name }] }
          : {}),
      },
    }
  }
  if (creation.kind === 'labware') {
    return {
      schemaId: LABWARE_SCHEMA_ID,
      payload: {
        kind: 'labware',
        recordId,
        name: creation.name,
        labwareType: creation.labwareType ?? 'plate',
        ...(creation.format ? { format: creation.format } : {}),
        notes: attributionNote(creation),
      },
    }
  }
  const classRef = classRefFor(creation)
  return {
    schemaId: EQUIPMENT_SCHEMA_ID,
    payload: {
      kind: 'equipment',
      id: recordId,
      name: creation.name,
      status: 'active',
      ...(classRef ? { equipmentClassRef: classRef } : {}),
      ...(creation.settings && Object.keys(creation.settings).length > 0 ? { settings: creation.settings } : {}),
      notes: attributionNote(creation),
    },
  }
}

/**
 * Create the records the user approved. `ghosts` lets each creation be mapped back
 * onto the entity the deck is ghosting, so a committed placement still points at it —
 * now with a `recordId` — and Accept never leaves a placement pointing at a mint id.
 */
export async function materializeAcceptedRecordCreations(
  creations: AiRecordCreation[] | undefined,
  ghosts: { equipments?: Record<string, Equipment>; labwares?: Record<string, Labware> } = {},
  deps: RecordMaterializationDeps = {},
): Promise<RecordMaterializationResult> {
  const createRecord = deps.createRecord ?? apiClient.createRecord
  const searchRecords = deps.searchRecords ?? apiClient.searchRecords
  const materialized: MaterializedRecordCreation[] = []
  const warnings: string[] = []

  for (const creation of creations ?? []) {
    const name = creation.name?.trim()
    if (!name) continue
    const key = creation.handle ?? name

    // 1. Records-first: never create a second copy of something the lab owns.
    let existing: { recordId: string; label: string } | null = null
    try {
      const found = (await searchRecords(name, [creation.kind])) as {
        results?: Array<{ recordId?: string; label?: string; title?: string }>
      } | null
      const hit = (found?.results ?? []).find((candidate) => {
        const label = candidate.label ?? candidate.title ?? ''
        return !!candidate.recordId && sameEntity(name, label)
      })
      if (hit?.recordId) existing = { recordId: hit.recordId, label: hit.label ?? hit.title ?? name }
    } catch {
      // A failed lookup must not block the create: the user still gets their record,
      // and the warning below records that we could not check.
    }

    if (existing) {
      warnings.push(
        `${name} already exists as ${existing.recordId} (${existing.label}) — reusing it instead of creating a duplicate.`,
      )
      materialized.push({ key, kind: creation.kind, recordId: existing.recordId, name, existingRecordId: existing.recordId })
      continue
    }

    // 2. Create it, with its attribution.
    const recordId = localRecordIdFor(creation.kind, name, creation.curie)
    const { schemaId, payload } = payloadFor(creation, recordId)
    try {
      await createRecord(schemaId, payload)
      materialized.push({ key, kind: creation.kind, recordId, name })
      if (!creation.source?.trim()) {
        warnings.push(`${name} was created with no stated source — record where its specification came from.`)
      }
    } catch (error) {
      warnings.push(
        `${name} could not be created (${error instanceof Error ? error.message : String(error)}) — its placement has no record behind it.`,
      )
    }
  }

  // Point the approved ghosts at their records.
  for (const item of materialized) {
    if (item.kind === 'equipment') {
      for (const entity of Object.values(ghosts.equipments ?? {})) {
        if (entity.recordId || !sameEntity(entity.name, item.name)) continue
        entity.recordId = item.recordId
        delete entity.proposedRecord
      }
    }
    if (item.kind === 'labware') {
      for (const vessel of Object.values(ghosts.labwares ?? {})) {
        if (vessel.recordId || !sameEntity(vessel.name, item.name)) continue
        vessel.recordId = item.recordId
        delete vessel.proposedRecord
      }
    }
  }

  return { materialized, warnings }
}
