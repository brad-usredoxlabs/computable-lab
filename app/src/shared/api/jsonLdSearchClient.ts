/**
 * Frontend client for the JSON-LD search index — substrate behind `/browser`
 * advanced search (Phase 3) and the shared slash menu (Phase 2). The DSL on
 * the wire mirrors the server's `JsonLdQuery` exactly; this file is the only
 * place the frontend touches that DSL, so any future tweak lives here.
 */

import { API_BASE } from './base'

export type FacetValue = string | number | boolean

export interface JsonLdQuery {
  /** Full-text query. Sent through FTS5 with prefix matching on each token. */
  q?: string
  /** One or more record kinds (e.g. ["material"] or ["material", "labware"]). */
  type?: string | string[]
  /** Facet equality filters. `{vendor: 'Sigma'}` or `{pH: [6.8, 7.4]}`. */
  facets?: Record<string, FacetValue | FacetValue[]>
  /** Limit hits to records that reference one of these record ids. */
  refs?: string[]
  /** Page size. Server caps at 500; default is 50. */
  limit?: number
  /** Opaque cursor returned from a prior response. */
  cursor?: string
}

export interface JsonLdHit {
  recordId: string
  jsonLdId: string
  kind: string
  label: string
  /** FTS5 snippet with `<mark>...</mark>` around matches; only present when `q` is set. */
  snippet?: string
  facets: Record<string, FacetValue[]>
  updatedAt: string | null
}

export interface JsonLdSearchResponse {
  hits: JsonLdHit[]
  total: number
  facetCounts: Record<string, Array<{ value: FacetValue; count: number }>>
  nextCursor?: string
}

export interface JsonLdReindexResponse {
  ok: boolean
  count: number
  elapsedMs: number
}

export async function searchJsonLd(query: JsonLdQuery): Promise<JsonLdSearchResponse> {
  const res = await fetch(`${API_BASE}/search/jsonld`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  })
  if (!res.ok) {
    const detail = await safeJson(res)
    throw new Error(detail?.error ?? `search failed: ${res.status}`)
  }
  return (await res.json()) as JsonLdSearchResponse
}

/** Admin endpoint — drops and rebuilds the index from the record store. */
export async function reindexJsonLd(): Promise<JsonLdReindexResponse> {
  const res = await fetch(`${API_BASE}/search/jsonld/reindex`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    const detail = await safeJson(res)
    throw new Error(detail?.error ?? `reindex failed: ${res.status}`)
  }
  return (await res.json()) as JsonLdReindexResponse
}

async function safeJson(res: Response): Promise<{ error?: string } | null> {
  try {
    return (await res.json()) as { error?: string }
  } catch {
    return null
  }
}
