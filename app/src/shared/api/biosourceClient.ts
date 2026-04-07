/**
 * Bio-source API client — search & fetch against proxy endpoints.
 */

import type { BioSourceId, BioSourceResult } from '../../types/biosource'
import { API_BASE } from './base'

/**
 * Search a bio-source.
 */
export async function searchBioSource(
  source: BioSourceId,
  query: string,
  limit = 10,
): Promise<{ results: BioSourceResult[]; total: number; raw: unknown }> {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  const response = await fetch(`${API_BASE}/biosource/${source}/search?${params}`)

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Search failed (${response.status}): ${body || response.statusText}`)
  }

  const raw = await response.json()
  const results = normalizeBioSourceResults(source, raw)
  return { results, total: results.length, raw }
}

/**
 * Fetch a single bio-source record by ID.
 */
export async function fetchBioSourceDetail(
  source: BioSourceId,
  id: string,
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({ id })
  const response = await fetch(`${API_BASE}/biosource/${source}/fetch?${params}`)

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Fetch failed (${response.status}): ${body || response.statusText}`)
  }

  return await response.json()
}

// =============================================================================
// Normalizers — map raw API shapes to BioSourceResult[]
// =============================================================================

function normalizeBioSourceResults(
  source: BioSourceId,
  raw: unknown,
): BioSourceResult[] {
  if (!raw || typeof raw !== 'object') return []

  switch (source) {
    case 'pubmed':
      return normalizePubmed(raw)
    case 'europepmc':
      return normalizeEuropePmc(raw)
    case 'uniprot':
      return normalizeUniprot(raw)
    case 'pdb':
      return normalizePdb(raw)
    case 'chebi':
      return normalizeChebi(raw)
    case 'reactome':
      return normalizeReactome(raw)
    case 'ncbi_gene':
      return normalizeNcbiGene(raw)
    default:
      return []
  }
}

function getArray(obj: unknown, key: string): unknown[] {
  if (obj && typeof obj === 'object' && key in obj) {
    const val = (obj as Record<string, unknown>)[key]
    return Array.isArray(val) ? val : []
  }
  return []
}

function str(val: unknown): string {
  return typeof val === 'string' ? val : ''
}

/** Strip HTML tags (e.g. Reactome search highlighting spans). */
function stripHtml(val: unknown): string {
  return typeof val === 'string' ? val.replace(/<[^>]*>/g, '') : ''
}

function normalizePubmed(raw: unknown): BioSourceResult[] {
  const results = getArray(raw, 'results')
  return results.map((r: unknown) => {
    const item = r as Record<string, unknown>
    const pmid = str(item.pmid || item.uid)
    return {
      source: 'pubmed' as const,
      sourceId: pmid,
      title: str(item.title),
      subtitle: str(item.authors),
      description: str(item.abstract || item.snippet),
      date: str(item.pubDate || item.pubdate),
      url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : undefined,
      badges: pmid ? [{ label: `PMID:${pmid}`, color: '#1971c2' }] : [],
      raw: item,
    }
  })
}

function normalizeEuropePmc(raw: unknown): BioSourceResult[] {
  const results = getArray(raw, 'results')
  return results.map((r: unknown) => {
    const item = r as Record<string, unknown>
    const pmid = str(item.pmid)
    const pmcid = str(item.pmcid)
    const doi = str(item.doi)
    const badges: BioSourceResult['badges'] = []
    if (pmid) badges.push({ label: `PMID:${pmid}`, color: '#1971c2' })
    if (pmcid) badges.push({ label: pmcid, color: '#5f3dc4' })
    if (doi) badges.push({ label: 'DOI', color: '#868e96' })
    return {
      source: 'europepmc' as const,
      sourceId: pmid || pmcid || doi || str(item.id),
      title: str(item.title),
      subtitle: str(item.authorString),
      description: str(item.abstractText),
      date: str(item.firstPublicationDate || item.pubYear),
      url: doi ? `https://doi.org/${doi}` : pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : undefined,
      badges,
      raw: item,
    }
  })
}

function normalizeUniprot(raw: unknown): BioSourceResult[] {
  const results = getArray(raw, 'results')
  return results.map((r: unknown) => {
    const item = r as Record<string, unknown>
    const accession = str(item.accession || item.primaryAccession)
    return {
      source: 'uniprot' as const,
      sourceId: accession,
      title: str(item.proteinName || item.recommendedName || item.id),
      subtitle: str(item.organism || item.organismName),
      description: str(item.function),
      url: accession ? `https://www.uniprot.org/uniprot/${accession}` : undefined,
      badges: accession ? [{ label: accession, color: '#2b8a3e' }] : [],
      raw: item,
    }
  })
}

function normalizePdb(raw: unknown): BioSourceResult[] {
  const results = getArray(raw, 'results')
  return results.map((r: unknown) => {
    const item = r as Record<string, unknown>
    const pdbId = str(item.pdbId || item.identifier || item.rcsb_id)
    return {
      source: 'pdb' as const,
      sourceId: pdbId,
      title: str(item.title || item.struct_title),
      subtitle: str(item.experimentalMethod || item.method),
      description: str(item.citation_title || item.description),
      date: str(item.releaseDate || item.deposit_date),
      url: pdbId ? `https://www.rcsb.org/structure/${pdbId}` : undefined,
      badges: pdbId ? [{ label: `PDB:${pdbId}`, color: '#e67700' }] : [],
      raw: item,
    }
  })
}

function normalizeChebi(raw: unknown): BioSourceResult[] {
  const results = getArray(raw, 'results')
  return results.map((r: unknown) => {
    const item = r as Record<string, unknown>
    const chebiId = str(item.chebiId || item.id)
    return {
      source: 'chebi' as const,
      sourceId: chebiId,
      title: str(item.chebiName || item.name),
      subtitle: str(item.formula),
      description: str(item.definition),
      url: chebiId ? `https://www.ebi.ac.uk/chebi/searchId.do?chebiId=${chebiId}` : undefined,
      badges: chebiId ? [{ label: chebiId, color: '#c92a2a' }] : [],
      raw: item,
    }
  })
}

function normalizeReactome(raw: unknown): BioSourceResult[] {
  const results = getArray(raw, 'results')
  return results.map((r: unknown) => {
    const item = r as Record<string, unknown>
    const stId = str(item.stId || item.dbId || item.identifier)
    return {
      source: 'reactome' as const,
      sourceId: stId,
      title: stripHtml(item.displayName || item.name),
      subtitle: stripHtml(item.species || item.speciesName),
      description: stripHtml(item.summation),
      url: stId ? `https://reactome.org/content/detail/${stId}` : undefined,
      badges: stId ? [{ label: stId, color: '#0b7285' }] : [],
      raw: item,
    }
  })
}

function normalizeNcbiGene(raw: unknown): BioSourceResult[] {
  const results = getArray(raw, 'results')
  return results.map((r: unknown) => {
    const item = r as Record<string, unknown>
    const geneId = str(item.geneId || item.uid)
    const symbol = str(item.symbol || item.name)
    return {
      source: 'ncbi_gene' as const,
      sourceId: geneId,
      title: symbol || str(item.description),
      subtitle: str(item.organism || item.orgname),
      description: str(item.summary || item.description),
      url: geneId ? `https://www.ncbi.nlm.nih.gov/gene/${geneId}` : undefined,
      badges: [
        ...(geneId ? [{ label: `Gene:${geneId}`, color: '#364fc7' }] : []),
        ...(symbol ? [{ label: symbol, color: '#4c6ef5' }] : []),
      ],
      raw: item,
    }
  })
}
