/**
 * useBrowserState — URL-search-param backed state for `/browser`.
 *
 * Per the plan §8, type/query/selection are URL params so deep links are
 * stable and the back button moves through prior selections:
 *
 *   /browser?type=material&q=tris&id=MAT-7&facet.vendor=Sigma&cursor=…
 *
 * The hook returns the parsed state plus setters that update `?` params
 * without remounting the route.
 */

import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { FacetValue } from '../shared/api/jsonLdSearchClient'

const FACET_PREFIX = 'facet.'

export interface BrowserState {
  /** Active type filter; absent means "all types". */
  type: string | null
  /** Free-text search; empty string is treated as absent. */
  q: string
  /** Selected record id; the detail pane reads from this. */
  selectedId: string | null
  /** Facet equality filters, keyed by ui.yaml column path (e.g. "$.vendor"). */
  facets: Record<string, FacetValue[]>
  /** Opaque cursor for pagination. */
  cursor: string | null
}

export interface BrowserStateUpdaters {
  setType: (type: string | null) => void
  setQ: (q: string) => void
  setSelectedId: (id: string | null) => void
  setFacet: (field: string, values: FacetValue[] | null) => void
  setCursor: (cursor: string | null) => void
  /** Atomic replace — useful for slash-menu mention navigation. */
  setMany: (next: Partial<BrowserState>) => void
}

export function useBrowserState(): BrowserState & BrowserStateUpdaters {
  const [params, setParams] = useSearchParams()

  const state = useMemo<BrowserState>(() => {
    const facets: Record<string, FacetValue[]> = {}
    for (const [key, value] of params.entries()) {
      if (!key.startsWith(FACET_PREFIX)) continue
      const field = key.slice(FACET_PREFIX.length)
      if (!field) continue
      const list = facets[field] ?? []
      list.push(decodeFacet(value))
      facets[field] = list
    }
    return {
      type: params.get('type'),
      q: params.get('q') ?? '',
      selectedId: params.get('id'),
      facets,
      cursor: params.get('cursor'),
    }
  }, [params])

  const writeParam = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          mutate(next)
          return next
        },
        { replace: false },
      )
    },
    [setParams],
  )

  const setType = useCallback(
    (type: string | null) =>
      writeParam((p) => {
        if (type) p.set('type', type)
        else p.delete('type')
        p.delete('cursor')
        p.delete('id')
      }),
    [writeParam],
  )

  const setQ = useCallback(
    (q: string) =>
      writeParam((p) => {
        if (q) p.set('q', q)
        else p.delete('q')
        p.delete('cursor')
      }),
    [writeParam],
  )

  const setSelectedId = useCallback(
    (id: string | null) =>
      writeParam((p) => {
        if (id) p.set('id', id)
        else p.delete('id')
      }),
    [writeParam],
  )

  const setFacet = useCallback(
    (field: string, values: FacetValue[] | null) =>
      writeParam((p) => {
        const key = `${FACET_PREFIX}${field}`
        p.delete(key)
        p.delete('cursor')
        if (values && values.length > 0) {
          for (const v of values) p.append(key, encodeFacet(v))
        }
      }),
    [writeParam],
  )

  const setCursor = useCallback(
    (cursor: string | null) =>
      writeParam((p) => {
        if (cursor) p.set('cursor', cursor)
        else p.delete('cursor')
      }),
    [writeParam],
  )

  const setMany = useCallback(
    (next: Partial<BrowserState>) =>
      writeParam((p) => {
        if (next.type !== undefined) {
          if (next.type) p.set('type', next.type)
          else p.delete('type')
        }
        if (next.q !== undefined) {
          if (next.q) p.set('q', next.q)
          else p.delete('q')
        }
        if (next.selectedId !== undefined) {
          if (next.selectedId) p.set('id', next.selectedId)
          else p.delete('id')
        }
        if (next.facets !== undefined) {
          for (const key of Array.from(p.keys())) {
            if (key.startsWith(FACET_PREFIX)) p.delete(key)
          }
          for (const [field, values] of Object.entries(next.facets)) {
            for (const v of values) p.append(`${FACET_PREFIX}${field}`, encodeFacet(v))
          }
        }
        if (next.cursor !== undefined) {
          if (next.cursor) p.set('cursor', next.cursor)
          else p.delete('cursor')
        }
      }),
    [writeParam],
  )

  return {
    ...state,
    setType,
    setQ,
    setSelectedId,
    setFacet,
    setCursor,
    setMany,
  }
}

/** Decoders / encoders for FacetValue — keep numbers and bools typed across
 *  the URL round-trip rather than collapsing them to strings. */
function decodeFacet(raw: string): FacetValue {
  if (raw === 'true') return true
  if (raw === 'false') return false
  // Match a number that is finite and round-trips to the same string. This
  // avoids accidentally numifying things like `001` or `1.0`.
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) {
    const n = Number(raw)
    if (Number.isFinite(n) && String(n) === raw) return n
  }
  return raw
}

function encodeFacet(value: FacetValue): string {
  return String(value)
}
