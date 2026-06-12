import type { Labware } from '../types/labware'
import { LABWARE_TYPE_LABELS } from '../types/labware'

function normalizedName(name: string | undefined): string {
  return (name ?? '').trim().toLowerCase()
}

export function labwareHandlePrefix(labware: Labware): string {
  const haystack = `${labware.labwareType} ${labware.name} ${labware.definitionId ?? ''} ${labware.renderProfile ?? ''}`.toLowerCase()
  if (haystack.includes('tiprack') || haystack.includes('tip rack')) return 'tiprack'
  if (haystack.includes('reservoir')) return 'res'
  if (haystack.includes('deepwell') || haystack.includes('deep well')) return 'dw'
  if (haystack.includes('tube') || haystack.includes('tubeset')) return haystack.includes('rack') || haystack.includes('set') ? 'rack' : 'tube'
  if (haystack.includes('plate')) return 'plate'
  return 'labware'
}

function looksLikeAutoHandle(name: string): boolean {
  return /^(plate|res|dw|tube|rack|tiprack|labware)\d+$/.test(name.trim().toLowerCase())
}

function looksGeneric(labware: Labware): boolean {
  const name = normalizedName(labware.name)
  if (!name) return true
  if (looksLikeAutoHandle(name)) return false
  const typeLabel = normalizedName(LABWARE_TYPE_LABELS[labware.labwareType])
  if (typeLabel && name === typeLabel) return true
  const definitionLabel = normalizedName(labware.definitionId)
  if (definitionLabel && name === definitionLabel) return true
  return /\b\d+[- ]?well\b.*\bplate\b/.test(name)
    || /\bplate\b.*\b\d+[- ]?well\b/.test(name)
    || /\breservoir\b/.test(name)
    || /\btip\s*rack\b/.test(name)
    || /\btube\s*(rack|set)?\b/.test(name)
}

export function nextLabwareHandle(labware: Labware, existing: Iterable<Labware>): string {
  const prefix = labwareHandlePrefix(labware)
  const used = new Set(Array.from(existing, (item) => normalizedName(item.name)).filter(Boolean))
  let n = 1
  while (used.has(`${prefix}${n}`)) n += 1
  return `${prefix}${n}`
}

export function assignVisibleLabwareHandle(labware: Labware, existing: Iterable<Labware>): Labware {
  const existingNames = new Set(Array.from(existing, (item) => normalizedName(item.name)).filter(Boolean))
  const name = normalizedName(labware.name)
  const needsHandle = looksGeneric(labware) || (name.length > 0 && existingNames.has(name))
  if (!needsHandle) return labware
  return { ...labware, name: nextLabwareHandle(labware, existing) }
}

/**
 * Find an existing labware whose name collides with `name` (case-insensitive,
 * trimmed). `excludeLabwareId` skips the labware being renamed so changing
 * only the casing of its own name ("plate1" → "Plate1") is not a conflict.
 * Duplicate display names are rejected because the AI's loose labware-ref
 * repair requires a unique name match.
 */
export function findLabwareNameConflict(
  name: string,
  existing: Iterable<Labware>,
  excludeLabwareId?: string,
): Labware | null {
  const needle = normalizedName(name)
  if (!needle) return null
  for (const labware of existing) {
    if (excludeLabwareId !== undefined && labware.labwareId === excludeLabwareId) continue
    if (normalizedName(labware.name) === needle) return labware
  }
  return null
}

export function assignVisibleLabwareHandles(
  labwares: Record<string, Labware>,
  existing: Iterable<Labware>,
): Record<string, Labware> {
  const assigned: Record<string, Labware> = {}
  const seen = Array.from(existing)
  for (const [id, labware] of Object.entries(labwares)) {
    const handled = assignVisibleLabwareHandle(labware, seen)
    assigned[id] = handled
    seen.push(handled)
  }
  return assigned
}
