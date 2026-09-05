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

export interface BiologicalOrganismSeed {
  label: string
  id: string
  aliases: string[]
  curie?: string
  domain?: string
}

export interface BiologicalStrainSeed {
  label: string
  id: string
  strain: string
  species: string
  aliases: string[]
}

export interface BiologicalConditionSeed {
  label: string
  id: string
  aliases: string[]
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
  organisms: BiologicalOrganismSeed[]
  strains: BiologicalStrainSeed[]
  conditions: BiologicalConditionSeed[]
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

/** Culture conditions come from the DECLARATIVE registry (data), never a TS
 *  constant. The registry's `conditions` are the lab's declared condition terms
 *  (kind: condition), each with a deterministic TERM id. */
export function registryConditions(
  registry: BiologicalTypesRegistry | null | undefined,
): BiologicalConditionSeed[] {
  return registry?.conditions ?? []
}

/**
 * Infer a material domain from a selected material Ref for gating biological-vs-
 * chemical. Ontology/local-term refs carry `domain` (or namespace); record refs
 * need a fetch (handled by the form hook via apiClient.getRecord). Accepts the
 * wider ResolveRef shape (which adds `domain`/`termKind`) as well as the core
 * Ref union.
 */
export function refMaterialDomain(ref: { kind?: string; domain?: string; namespace?: string; label?: string; id?: string } | null | undefined): string | undefined {
  if (!ref) return undefined
  if (ref.kind === 'ontology') {
    if (ref.domain) return ref.domain
    return inferDomainFromNamespace(ref.namespace ?? '')
  }
  return undefined
}

/** Convenience: does the ref resolve to a biological material (cell_line/organism)? */
export function isBiologicalRef(ref: Ref | null | undefined): boolean {
  return isBiologicalDomain(refMaterialDomain(ref))
}