import type { LabwareDefinition } from './labwareDefinition'

/**
 * Resolve a legacy labware type string (e.g., 'plate_96') to the
 * best-matching LabwareDefinition. Prefers concrete over generic,
 * then opentrons/integra-sourced over other, then by ascending id
 * for determinism.
 *
 * Pure function — no module-level state, no caching. Callers that
 * need O(1) lookup should build their own Map keyed by legacy type
 * using this function as the tie-breaker.
 */
export function resolveByLegacyType(
  defs: LabwareDefinition[],
  legacyType: string,
): LabwareDefinition | undefined {
  const candidates = defs.filter((d) =>
    (d.legacy_labware_types ?? []).includes(legacyType),
  )
  if (candidates.length === 0) return undefined
  if (candidates.length === 1) return candidates[0]

  const specificityRank = (s: LabwareDefinition['specificity']): number => {
    if (s === 'concrete') return 0
    if (s === 'generic') return 1
    return 2
  }
  const sourceRank = (s: LabwareDefinition['source']): number => {
    if (s === 'opentrons') return 0
    if (s === 'integra') return 1
    return 2
  }

  const sorted = [...candidates].sort((a, b) => {
    const specDelta = specificityRank(a.specificity) - specificityRank(b.specificity)
    if (specDelta !== 0) return specDelta
    const srcDelta = sourceRank(a.source) - sourceRank(b.source)
    if (srcDelta !== 0) return srcDelta
    return a.id.localeCompare(b.id)
  })

  return sorted[0]
}
