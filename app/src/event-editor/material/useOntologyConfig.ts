import { useMemo } from 'react'
import { useLabSettings } from '../../graph/hooks/useLabSettings'
import { MATERIAL_OLS_ONTOLOGIES } from '../../types/material'

/**
 * Resolves the active OLS ontology list for material search. Reads
 * `searchOntologies` from `LabSettings` when present and falls back to
 * `MATERIAL_OLS_ONTOLOGIES` (the historical default).
 *
 * Every consumer (search, multi-ref list, builders) goes through this
 * so a per-project override flips them in one place — Phase 6 of the
 * Add-Material modal plan. Phase 7's server-side ontology mirror will
 * also key off the same list.
 */
export interface OntologyConfig {
  ontologies: string[]
  isDefault: boolean
}

export function useOntologyConfig(): OntologyConfig {
  const { settings } = useLabSettings()
  return useMemo(() => {
    const override = settings.searchOntologies
    if (override && override.length > 0) {
      return { ontologies: override, isDefault: false }
    }
    return { ontologies: MATERIAL_OLS_ONTOLOGIES, isDefault: true }
  }, [settings])
}
