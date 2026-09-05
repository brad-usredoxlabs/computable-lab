import { apiClient } from '../../shared/api/client'
import { ApiError } from '../../shared/api/errors'
import { MATERIAL_SCHEMA_ID } from '../../types/material'
import type { DraftOntologyBinding } from '../../types/ai'
import type { PlateEvent } from '../../types/events'

export interface MaterializedOntologyBinding {
  curie: string
  recordId: string
  label: string
}

/**
 * A user sign-off decision for one AI-proposed ontology term.
 * - `approved`: keep the AI's CURIE exactly as proposed (materialize under it).
 * - `replaced`: the user chose a different term; materialize under that CURIE /
 *   label instead of the AI's best-guess.
 */
export type TermDecision =
  | { status: 'approved' }
  | { status: 'replaced'; curie: string; label: string; recordId?: string }

type CreateRecordFn = (schemaId: string, payload: Record<string, unknown>) => Promise<unknown>

export function inferDomainFromCurie(curie: string): string {
  const namespace = curie.split(':')[0]?.toUpperCase() ?? ''
  switch (namespace) {
    case 'CHEBI':
      return 'chemical'
    case 'CL':
    case 'CLO':
      return 'cell_line'
    case 'NCBITAXON':
      return 'organism'
    case 'PR':
      return 'reagent'
    default:
      return 'other'
  }
}

export function localMaterialIdForCurie(curie: string): string {
  const slug = curie
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase()
  return `MAT-${slug || 'ONTOLOGY-TERM'}`
}

function draftOnlyBindings(bindings: DraftOntologyBinding[] | undefined): DraftOntologyBinding[] {
  const unique = new Map<string, DraftOntologyBinding>()
  for (const binding of bindings ?? []) {
    if (!binding.draftOnly || !binding.curie) continue
    if (!unique.has(binding.curie)) unique.set(binding.curie, binding)
  }
  return [...unique.values()]
}

/** Resolve the effective CURIE/label to materialize a binding under, honoring
 *  the user's sign-off decision (approved → as-proposed; replaced → the choice). */
function effectiveTarget(
  binding: DraftOntologyBinding,
  decisions: Record<string, TermDecision> | undefined,
): { curie: string; label: string; recordId?: string } {
  const decision = decisions?.[binding.curie]
  if (decision && decision.status === 'replaced') {
    return { curie: decision.curie, label: decision.label, recordId: decision.recordId }
  }
  return { curie: binding.curie, label: binding.label || binding.curie, recordId: binding.recordId }
}

export async function materializeAcceptedOntologyBindings(
  bindings: DraftOntologyBinding[] | undefined,
  createRecord: CreateRecordFn = apiClient.createRecord,
  decisions?: Record<string, TermDecision>,
): Promise<MaterializedOntologyBinding[]> {
  const materialized: MaterializedOntologyBinding[] = []
  const seen = new Set<string>()
  for (const binding of draftOnlyBindings(bindings)) {
    const { curie, label, recordId } = effectiveTarget(binding, decisions)
    const namespace = curie.split(':')[0] ?? ''
    // When the user replaced a term with an EXISTING local record (resolver
    // matched tier-0/tier-1), reuse it — no material mint needed.
    if (recordId && !/^[A-Z][A-Z0-9_]*:/.test(recordId)) {
      if (!seen.has(recordId)) {
        materialized.push({ curie, recordId, label })
        seen.add(recordId)
      }
      continue
    }
    const targetRecordId = localMaterialIdForCurie(curie)
    if (seen.has(targetRecordId)) continue
    seen.add(targetRecordId)
    try {
      await createRecord(MATERIAL_SCHEMA_ID, {
        kind: 'material',
        id: targetRecordId,
        name: label,
        domain: inferDomainFromCurie(curie),
        status: 'proposed',
        lifecycleId: 'lab-vocabulary-control',
        provenance: {
          source: 'ai_mention',
          sourceCurie: curie,
          sourceLabel: label,
          createdBy: 'human_accept',
          createdAt: new Date().toISOString(),
          note: 'Created when a human accepted an AI-drafted event graph containing this ontology-grounded term.',
        },
        class: [{ kind: 'ontology', id: curie, namespace, label }],
      })
    } catch (error) {
      if (!(ApiError.isApiError(error) && error.status === 409)) throw error
    }
    materialized.push({ curie, recordId: targetRecordId, label })
  }
  return materialized
}

function materializedIndex(materialized: MaterializedOntologyBinding[]): Map<string, MaterializedOntologyBinding> {
  const out = new Map<string, MaterializedOntologyBinding>()
  for (const binding of materialized) out.set(binding.curie, binding)
  return out
}

function recordRef(binding: MaterializedOntologyBinding): Record<string, unknown> {
  return {
    kind: 'record',
    id: binding.recordId,
    type: 'material',
    label: binding.label,
  }
}

function rewriteValue(value: unknown, byCurie: Map<string, MaterializedOntologyBinding>, keyHint?: string): unknown {
  if (typeof value === 'string') {
    const binding = byCurie.get(value)
    if (!binding) return value
    return keyHint && /(?:^|_)material(?:_|$)|(?:^|_)ref$/.test(keyHint)
      ? recordRef(binding)
      : binding.recordId
  }

  if (Array.isArray(value)) {
    return value.map((entry) => rewriteValue(entry, byCurie, keyHint))
  }

  if (!value || typeof value !== 'object') return value
  const input = value as Record<string, unknown>
  const id = typeof input.id === 'string' ? input.id : undefined
  if (id) {
    const binding = byCurie.get(id)
    if (binding && input.kind === 'ontology') return recordRef(binding)
  }

  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(input)) {
    if (key === 'recordId' && typeof child === 'string') {
      out[key] = byCurie.get(child)?.recordId ?? child
      continue
    }
    if (key === 'id' && typeof child === 'string' && input.kind === 'ontology') {
      out[key] = byCurie.get(child)?.recordId ?? child
      continue
    }
    if (key === 'kind' && input.kind === 'ontology' && id && byCurie.has(id)) {
      out[key] = 'record'
      out.type = 'material'
      continue
    }
    out[key] = rewriteValue(child, byCurie, key)
  }
  return out
}

export function rewriteAcceptedOntologyRefs(
  events: PlateEvent[],
  materialized: MaterializedOntologyBinding[],
): PlateEvent[] {
  if (materialized.length === 0) return events
  const byCurie = materializedIndex(materialized)
  return events.map((event) => ({
    ...event,
    details: rewriteValue(event.details, byCurie, 'details') as PlateEvent['details'],
  }))
}
