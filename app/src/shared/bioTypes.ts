/**
 * Biological Types & Culture Systems — frontend mirror of the declarative
 * measure registry.
 *
 * The registry DATA lives in schema/registry/biological-types/biological-types.yaml
 * and is served by GET /api/biological-types. This module carries the client
 * types + a tiny pure `resolveBiologicalRule` mirror so the add-material form
 * can resolve synchronously during render (the small lookup logic is mirrored
 * from the server loader; the RULE itself stays data, single-sourced to YAML).
 */
import type { Ref } from '../shared/ref'
import { inferDomainFromNamespace } from '../types/material'

export type BiologicalMeasureKey = 'count' | 'volume' | 'counterDensity' | 'od600' | 'cfu'

export interface BiologicalTypeField {
  key: BiologicalMeasureKey
  label: string
  required: boolean
}

export interface BiologicalTypeMeasures {
  primary: string
  units: string[]
  concentrationBasis: string
  alternative?: string[]
}

export interface BiologicalTypeVerification {
  method?: string
  readModality?: string
}

export interface BiologicalTypeMatch {
  labels: string[]
  curies: string[]
}

export interface BiologicalTypeRule {
  id: string
  label: string
  domains: string[]
  termKinds: string[]
  match: BiologicalTypeMatch
  measures: BiologicalTypeMeasures
  verification?: BiologicalTypeVerification
  fields: BiologicalTypeField[]
}

export interface BiologicalTypesRegistry {
  version: number
  title?: string
  description?: string
  default: BiologicalTypeRule
  types: Record<string, BiologicalTypeRule>
}

export interface BiologicalTypeLookupInput {
  domain?: string
  label?: string
  curie?: string
}

function norm(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

/**
 * Mirror of the server BiologicalTypesRegistry.lookup. A coarse domain gates
 * biological-vs-chemical; the SPECIFIC type label/curie picks the rule; an
 * unknown biological type falls back to the generic count+volume default.
 */
export function resolveBiologicalRule(
  registry: BiologicalTypesRegistry | null | undefined,
  input: BiologicalTypeLookupInput,
): BiologicalTypeRule | null {
  if (!registry) return null
  const label = norm(input.label)
  const curie = norm(input.curie)
  const domain = norm(input.domain)
  const all = Object.values(registry.types ?? {})
  if (label || curie) {
    for (const rule of all) {
      const labelHit = label && rule.match.labels.some((l) => norm(l).includes(label) || label.includes(norm(l)))
      const curieHit = curie && rule.match.curies.some((c) => norm(c).includes(curie) || curie.includes(norm(c)))
      if (labelHit || curieHit) return rule
    }
  }
  if (domain === 'cell_line') {
    const cellLine = all.find((rule) => rule.domains.includes('cell_line'))
    if (cellLine) return cellLine
  }
  return registry.default ?? null
}

/** Coarse gate: is this material domain a biological/count-based type? */
export function isBiologicalDomain(domain: string | undefined): boolean {
  return domain === 'cell_line' || domain === 'organism'
}

/** Available condition terms are NOT local here — they are seeded terms. Kept
 *  as a small vocabulary so the form can label the condition multiselect. */
export const BIOLOGICAL_CONDITIONS: readonly { id: string; label: string }[] = [
  { id: 'anoxic', label: 'Anoxic' },
  { id: 'hypoxic', label: 'Hypoxic' },
  { id: 'hyperoxic', label: 'Hyperoxic' },
  { id: 'tissue-culture-in-a-tube', label: 'TC in a tube' },
  { id: 'organ-on-a-chip', label: 'Organ-on-a-chip' },
  { id: '2D-plate', label: '2D plate' },
  { id: 'spheroid', label: 'Spheroid' },
  { id: 'low-saline', label: 'Low saline' },
  { id: 'high-saline', label: 'High saline' },
  { id: 'low-temp', label: 'Low temp' },
  { id: 'high-temp', label: 'High temp' },
  { id: 'high-microplastics', label: 'High microplastics' },
] as const

/**
 * Infer a material domain from a selected material Ref for gating biological-vs-
 * chemical. Ontology/local-term refs carry `domain` (or namespace); record refs
 * need a fetch (handled by the form hook via apiClient.getRecord).
 */
export function refMaterialDomain(ref: Ref | null | undefined): string | undefined {
  if (!ref) return undefined
  if (ref.kind === 'ontology') {
    const domain = (ref as { domain?: string }).domain
    if (domain) return domain
    return inferDomainFromNamespace((ref as { namespace?: string }).namespace ?? '')
  }
  return undefined
}

/** Convenience: does the ref resolve to a biological material (cell_line/organism)? */
export function isBiologicalRef(ref: Ref | null | undefined): boolean {
  return isBiologicalDomain(refMaterialDomain(ref))
}