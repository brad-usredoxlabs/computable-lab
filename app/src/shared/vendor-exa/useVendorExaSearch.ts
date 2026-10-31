import { useCallback, useEffect, useRef, useState } from 'react'
import { apiClient, type VendorExaCategory, type VendorExaHit } from '../api/client'
import { exaVendorEnabled, noteExaUnavailable } from '../lib/integrationFlags'

/**
 * useVendorExaSearch — debounced Exa web search for vendor products, shared by
 * the event-editor Add-material / Add-labware flows and any rich surface that
 * wants to discover vendor products off the web.
 *
 * Mirrors the shape of `event-editor/material/useMaterialSearch.ts` (debounce +
 * stale-response guard) so callers render results the same way. Results arrive
 * as `VendorExaHit`s carrying the provenance the server needs to mint a local
 * record via `createFromVendorExa`.
 *
 * ## GC-17 capability gate + sticky-negative
 *
 * Every fire is gated on the DECLARED capability read (`exaVendorEnabled` —
 * the same once-per-page cached flag the slash-menu resolvers use): declared
 * off, or already honestly refused this page load, → ZERO requests AND an
 * honest `configured: false` read (quietly — no error string; a declared-off
 * capability is not "configured", so the hook must not report the initial
 * true). A
 * `configured:false` response (no key / key rejected — the server answers the
 * capability question as an honest 200) surfaces quietly (no error string) and
 * marks the negative STICKY for the page load (`noteExaUnavailable`) so the
 * other run-page surfaces don't re-probe. A 502-class rejection (valid key,
 * genuine outage) keeps the throw→error path — typed, and NOT sticky (a blip
 * must not silently kill the tier for the session).
 *
 * ## Controlled vs owned query
 *
 * By default the hook owns its input state (exposes `query` / `setQuery`), which
 * suits a standalone widget. Pass `controlled: { query }` to drive it from an
 * external query instead — `useMaterialSearch` does this so one keystroke
 * updates local + ontology + vendor-Exa results together. In controlled mode
 * `setQuery` is a no-op; bind the external `query` to the input.
 */

const DEBOUNCE_MS = 350
const MIN_QUERY_LENGTH = 2
const DEFAULT_LIMIT = 8

export interface UseVendorExaSearchOptions {
  category?: VendorExaCategory
  /** Drive results from an external query instead of the hook's own input state. */
  controlled?: { query: string }
}

export interface UseVendorExaSearchResult {
  /** Current query (the hook's own state in owned mode; the controlled query otherwise). */
  query: string
  /** Set the query — a no-op in controlled mode. */
  setQuery: (value: string) => void
  /** Exa vendor-product hits — empty until a search completes. */
  exaResults: VendorExaHit[]
  /** True while a fetch is in-flight. */
  loading: boolean
  /** Latest error message, if any. */
  error: string | null
  /** Whether Exa is configured (server returned `configured: false` / 503). */
  configured: boolean
}

function effectiveQuery(ownedQuery: string, controlled?: { query: string }): string {
  return controlled?.query ?? ownedQuery
}

export function useVendorExaSearch(options?: UseVendorExaSearchOptions): UseVendorExaSearchResult {
  const { category, controlled } = options ?? ({} as UseVendorExaSearchOptions)
  const [ownedQuery, setOwnedQuery] = useState('')
  const [exaResults, setExaResults] = useState<VendorExaHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [configured, setConfigured] = useState(true)

  const query = effectiveQuery(ownedQuery, controlled)

  // Track the latest query so an outdated network response doesn't overwrite
  // the results for a newer query.
  const latestQueryRef = useRef('')
  latestQueryRef.current = query

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setExaResults([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    const handle = window.setTimeout(async () => {
      try {
        // GC-17 capability gate: await the once-per-page cached declared flag
        // (same idiom as the slash-menu resolvers). Declared off, or already
        // honestly refused this page load (sticky-negative) → ZERO requests.
        const enabled = await exaVendorEnabled()
        if (!enabled) {
          // FIX1 D3: a declared-off / sticky-negative capability is NOT
          // configured — report the capability honestly (quietly: no error
          // string; this is a capability READ, not a failed search) instead of
          // leaving `configured` at its initial true.
          if (latestQueryRef.current === query) setConfigured(false)
          return
        }
        const response = await apiClient.searchVendorExa({
          q: trimmed,
          ...(category ? { category } : {}),
          limit: DEFAULT_LIMIT,
        })
        if (latestQueryRef.current !== query) return
        setConfigured(response.configured)
        setExaResults(response.items ?? [])
        if (!response.configured) {
          // Honest refusal (no key / key rejected — the server answers the
          // capability question as a 200, never an HTTP failure): quiet — no
          // error string — and sticky for the page load so the other
          // run-page surfaces don't re-probe. A 502-class outage (the catch
          // path) is NOT sticky.
          noteExaUnavailable()
        }
      } catch (err) {
        if (latestQueryRef.current !== query) return
        // A genuine upstream outage behind a valid key (502-class) keeps
        // today's typed throw→error visibility; it is NOT sticky — a blip
        // must not silently kill the tier for the session.
        setConfigured(false)
        setError(err instanceof Error ? err.message : 'Vendor Exa search failed')
      } finally {
        if (latestQueryRef.current === query) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
    // `category` + `controlled` are stable per-mount scope — intentionally not in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const setQuery = useCallback((value: string) => {
    if (controlled) return
    setOwnedQuery(value)
  }, [controlled])

  return { query, setQuery, exaResults, loading, error, configured }
}