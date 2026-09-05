/**
 * useBiologicalContext — resolve whether a selected material is biological and
 * which measure rule the form should ask for.
 *
 * A coarse material.domain gates biological-vs-chemical (cell_line | organism →
 * count-first; else chemical/volume-first). Within biological, the resolved
 * SPECIFIC type (term label / CURIE) picks the rule from the declarative
 * registry; an unknown biological type falls back to the generic count+volume
 * default. The registry is fetched once and cached.
 */
import { useEffect, useState } from 'react'
import { apiClient } from '../../../shared/api/client'
import type { Ref } from '../../../shared/ref'
import {
  isBiologicalDomain,
  refMaterialDomain,
  resolveBiologicalRule,
  type BiologicalTypeRule,
  type BiologicalTypesRegistry,
} from '../../../shared/bioTypes'

export interface BiologicalContext {
  /** Registry loaded (null until first fetch, keeps loading=false when empty). */
  registry: BiologicalTypesRegistry | null
  /** coarse material.domain for the current ref (cell_line | organism | ...). */
  domain?: string
  /** whether the current selection is biological (count-first). */
  isBiological: boolean
  /** resolved measure rule (specific type, or generic default). */
  rule: BiologicalTypeRule | null
  /** label of the specific biological type (for the rule lookup). */
  bioLabel?: string
  /** CURIE of the specific biological type (for the rule lookup — NCBITaxon). */
  bioCurie?: string
  /** true while resolving domain of a local record ref. */
  loading: boolean
}

let cachedRegistry: BiologicalTypesRegistry | null | undefined

async function ensureRegistry(): Promise<BiologicalTypesRegistry | null> {
  if (cachedRegistry !== undefined) return cachedRegistry
  try {
    const res = await apiClient.getBiologicalTypesRegistry()
    cachedRegistry = res.registry ?? null
  } catch {
    cachedRegistry = null
  }
  return cachedRegistry
}

async function resolveDomainForRef(ref: Ref | null): Promise<{ domain?: string; label?: string; curie?: string }> {
  if (!ref) return {}
  if (ref.kind === 'ontology') {
    const domain = refMaterialDomain(ref)
    const curie = (ref as { id?: string }).id?.startsWith('local:')
      ? undefined // local terms have no NCBITaxon CURIE on the ref itself
      : (ref as { id?: string }).id
    return { ...(domain ? { domain } : {}), label: ref.label, ...(curie ? { curie } : {}) }
  }
  // Record ref — fetch the record to read domain (material-instance/spec/term).
  try {
    const env = await apiClient.getRecord(ref.id)
    const payload = (env?.payload ?? {}) as Record<string, unknown>
    const domain = typeof payload.domain === 'string' ? payload.domain : undefined
    const name = typeof payload.name === 'string' ? payload.name : undefined
    const preferredLabel = typeof payload.preferredLabel === 'string' ? payload.preferredLabel : undefined
    const label = name ?? preferredLabel ?? ref.label
    // If a record points at a biological term (ncbi_taxon linkouts), expose the
    // first NCBITaxon curie for the rule lookup.
    let curie: string | undefined
    const linkouts = Array.isArray((payload as Record<string, unknown>).linkouts)
      ? (payload as Record<string, unknown>).linkouts as Array<{ curie?: string; namespace?: string }>
      : []
    for (const lo of linkouts) {
      if (lo?.namespace === 'NCBITaxon' && lo.curie) { curie = lo.curie; break }
    }
    return { ...(domain ? { domain } : {}), ...(label ? { label } : {}), ...(curie ? { curie } : {}) }
  } catch {
    return { label: ref.label }
  }
}

/**
 * Boolean snapshot of whether the ref carries domain on the ontology ref itself,
 * so the hook can decide whether to wait for a record fetch before concluding.
 */
function hasInlineDomain(ref: Ref | null | undefined): boolean {
  if (!ref) return false
  return ref.kind === 'ontology' && Boolean(refMaterialDomain(ref))
}

export function useBiologicalContext(materialRef: Ref | null | undefined): BiologicalContext {
  const [registry, setRegistry] = useState<BiologicalTypesRegistry | null>(null)
  const [domain, setDomain] = useState<string | undefined>(undefined)
  const [bioLabel, setBioLabel] = useState<string | undefined>(undefined)
  const [bioCurie, setBioCurie] = useState<string | undefined>(undefined)
  const [resolution, setResolution] = useState<{ label?: string; curie?: string }>({})
  const [loading, setLoading] = useState(false)
  const refKey = materialRef ? `${materialRef.kind}:${materialRef.id}` : ''

  useEffect(() => {
    let cancelled = false
    void ensureRegistry().then((reg) => {
      if (!cancelled) setRegistry(reg)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    setLoading(false)
    setResolution({})
    if (!materialRef) {
      setDomain(undefined)
      setBioLabel(undefined)
      setBioCurie(undefined)
      return
    }
    const inline = hasInlineDomain(materialRef)
    if (inline) {
      const d = refMaterialDomain(materialRef)
      setDomain(d)
      setBioLabel(materialRef.label)
      const curie = (materialRef as { id?: string }).id?.startsWith('local:')
        ? undefined
        : (materialRef as { id?: string }).id
      setBioCurie(curie)
      return
    }
    if (materialRef.kind === 'ontology') {
      setDomain(undefined)
      setBioLabel(materialRef.label)
      setBioCurie((materialRef as { id?: string }).id)
      return
    }
    // Record ref — async fetch for domain.
    let cancelledInner = false
    setLoading(true)
    void resolveDomainForRef(materialRef).then((res) => {
      if (cancelledInner) return
      setDomain(res.domain)
      setBioLabel(res.label)
      setBioCurie(res.curie)
      setResolution({ ...(res.label ? { label: res.label } : {}), ...(res.curie ? { curie: res.curie } : {}) })
      setLoading(false)
    })
    return () => { cancelledInner = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refKey, materialRef])

  const isBiological = isBiologicalDomain(domain)

  const rule = registry
    ? resolveBiologicalRule(registry, {
        ...(domain ? { domain } : {}),
        label: bioLabel || resolution.label,
        curie: bioCurie || resolution.curie,
      })
    : null

  return {
    registry,
    ...(domain !== undefined ? { domain } : {}),
    isBiological,
    rule,
    ...(bioLabel || resolution.label ? { bioLabel: bioLabel || resolution.label } : {}),
    ...((bioCurie || resolution.curie) ? { bioCurie: bioCurie || resolution.curie } : {}),
    loading,
  }
}