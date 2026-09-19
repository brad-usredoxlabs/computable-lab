import { INSTRUMENT_KIND_LABELS, inferInstrumentKind, type InstrumentKind } from './labware'
import type { Equipment } from './equipment'
import type { Ref } from '../shared/ref'

/**
 * Mint a first-class bench Equipment entity from an AI/deck requirement.
 * Equipment is NEVER labware — no wells, no geometry. `instrumentKind` drives only
 * the silhouette glyph; the class ref + `settings` carry the capability.
 *
 * Class identity follows Brad's 2026-09-19 ruling ("use CURIEs in general", `CL:`
 * for the generic computable-lab entries): a *generic* item points at
 * `CL:water_bath` / `CL:heat_block` / `CL:orbital_shaker`, an ontology-style ref;
 * a specific evidenced model (QuantStudio 5, a Thermo catalog number) points at an
 * `EQC-` equipment-class record. `EquipmentFocus.fetchEquipmentClass` already
 * handles both — it treats a ref id containing `:` as a CURIE and anything else as
 * a record id.
 */

/** Local computable-lab class namespace — matches the existing `CL:96_well_plate`. */
export const LOCAL_CLASS_NAMESPACE = 'CL'

/**
 * Normalize any equipment requirement token to its canonical class identity:
 *   `equipment:water_bath` | `water_bath` | `CL:water_bath` → `CL:water_bath`
 *   `EQC-WATER-BATH` (or any non-CURIE record id)          → `EQC-WATER-BATH`
 */
export function normalizeEquipmentClassToken(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return trimmed
  if (trimmed.startsWith('EQC-')) return trimmed
  const prefixStripped = trimmed.replace(/^equipment:/i, '').replace(/^CL:/i, '')
  const snake = prefixStripped
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
  return snake ? `${LOCAL_CLASS_NAMESPACE}:${snake}` : trimmed
}

/**
 * Build the class ref for a requirement token: an ontology-style ref for the
 * generic `CL:` entries, a record ref for an `EQC-` id.
 */
export function equipmentClassRefForRequirement(classCurie: string): Ref | undefined {
  const trimmed = classCurie.trim()
  if (!trimmed) return undefined

  if (trimmed.startsWith('EQC-')) {
    return { kind: 'record', type: 'equipment-class', id: trimmed }
  }
  // Only `equipment:`-prefixed kind CURIEs and bare `CL:`/kind tokens are generic
  // class requirements; anything else (a vendor record id, a label) is not a class.
  if (!/^(equipment:|CL:|cl:)/.test(trimmed)) return undefined

  const id = normalizeEquipmentClassToken(trimmed)
  const kind = inferInstrumentKind(id)
  return {
    kind: 'ontology',
    id,
    namespace: LOCAL_CLASS_NAMESPACE,
    label: INSTRUMENT_KIND_LABELS[kind],
  }
}

export function createEquipmentFromRequirement(
  classCurie: string,
  name?: string,
  settings?: Record<string, unknown>,
): Equipment {
  const kind = inferInstrumentKind(classCurie) as InstrumentKind
  const classRef = equipmentClassRefForRequirement(classCurie)
  const classId = classRef?.id ?? classCurie.trim()
  return {
    equipmentId: `eqp:${classId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
    name: name && name.trim().length > 0 ? name.trim() : INSTRUMENT_KIND_LABELS[kind],
    instrumentKind: kind,
    settings: settings ?? {},
    ...(classRef ? { equipmentClassRef: classRef } : {}),
  }
}
