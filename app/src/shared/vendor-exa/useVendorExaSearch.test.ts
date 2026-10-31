import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useVendorExaSearch } from './useVendorExaSearch'
import { apiClient } from '../api/client'
import { resetIntegrationFlagCacheForTests } from '../lib/integrationFlags'

// GC-17: the hook gates every fire on the DECLARED capability read
// (integrationFlags.exaVendorEnabled — the same once-per-page cached flag the
// slash-menu resolvers use). integrationFlags is REAL here (the sticky-negative
// seam under test lives in its cache); only the API client is mocked, so the
// declared flag is driven through `getConfig` exactly like in the browser.
const searchVendorExa = vi.hoisted(() => vi.fn())
const getConfig = vi.hoisted(() => vi.fn())
vi.mock('../api/client', () => ({
  apiClient: {
    searchVendorExa,
    getConfig,
  },
}))

// The declared capability is ON by default (the server default: absent config
// = enabled) — individual tests declare it off for the gate legs.
function declareExaEnabled(enabled: boolean) {
  getConfig.mockResolvedValue({ integrations: { exa: { enabled } } })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  resetIntegrationFlagCacheForTests()
})

function hit(title: string) {
  return {
    id: `exa-${title}`,
    title,
    url: `https://example.com/${title}`,
    category: 'catalog' as const,
    source: 'exa' as const,
  }
}

describe('useVendorExaSearch', () => {
  it('returns no results below the min query length', () => {
    const { result } = renderHook(() => useVendorExaSearch())
    expect(result.current.exaResults).toEqual([])
    expect(result.current.loading).toBe(false)
    expect(apiClient.searchVendorExa).not.toHaveBeenCalled()
  })

  it('searches Exa (debounced) with the category and surfaces hits', async () => {
    declareExaEnabled(true)
    vi.mocked(apiClient.searchVendorExa).mockResolvedValue({
      configured: true,
      query: 'cayman',
      items: [hit('Cayman DMSO')],
    })
    const { result } = renderHook(() => useVendorExaSearch({ category: 'catalog' }))

    act(() => result.current.setQuery('cayman'))

    await waitFor(() => {
      expect(apiClient.searchVendorExa).toHaveBeenCalledWith({
        q: 'cayman',
        category: 'catalog',
        limit: 8,
      })
    })
    await waitFor(() => {
      expect(result.current.exaResults).toHaveLength(1)
      expect(result.current.exaResults[0].title).toBe('Cayman DMSO')
    })
    expect(result.current.configured).toBe(true)
  })

  /**
   * GC-17 T6 (RED, tightened in fix1 D3): the capability gate. When the
   * declared flag says enabled:false, NO request fires — pinned by CALL COUNT
   * === 0 (not by empty results: an errored request also yields empty results
   * — the whole defect). Same idiom as the slash-menu resolvers.
   *
   * FIX1 D3: the gate-denial path must ALSO report the capability honestly —
   * a declared-off / sticky-negative capability is NOT configured, so the hook
   * reports `configured: false` (quietly: no error string). Before this
   * tightening the gate-off path left `configured` at its initial true, which
   * is an un-honest capability read in an honesty item.
   */
  it('T6: declared enabled:false → ZERO requests (fetch count pinned at exactly 0) and configured reports false (honest capability read)', async () => {
    declareExaEnabled(false)
    const { result } = renderHook(() => useVendorExaSearch({ category: 'catalog' }))

    act(() => result.current.setQuery('cayman'))

    // Past the debounce window the legacy hook would have fired.
    await new Promise((r) => setTimeout(r, 500))
    expect(apiClient.searchVendorExa).toHaveBeenCalledTimes(0)
    expect(result.current.exaResults).toEqual([])
    // Gate-off is quiet (no error string) but HONEST: the capability is
    // declared off (or already honestly refused this page load) → the hook
    // reports configured: false. (T6 RED leg at fix1 start: the gate-denial
    // path returned early without setConfigured(false), so this pin failed
    // while the count pin already passed.)
    expect(result.current.error).toBeNull()
    expect(result.current.configured).toBe(false)
  })

  /**
   * GC-17 T7 (RED): honest refusal → quiet + sticky. A `configured:false`
   * response (no key / key rejected — server 200) surfaces as configured=false
   * with NO error string, and the negative sticks for the page load (through
   * the existing integrationFlags cache) so the next query fires ZERO
   * additional requests.
   */
  it('T7: configured:false response → configured=false, error null, empty results; a SECOND query fires ZERO additional requests (sticky-negative)', async () => {
    declareExaEnabled(true)
    vi.mocked(apiClient.searchVendorExa).mockResolvedValue({
      configured: false,
      query: 'rot',
      items: [],
      reason: 'key_rejected',
    })
    const { result } = renderHook(() => useVendorExaSearch())

    act(() => result.current.setQuery('rot'))
    await waitFor(() => expect(result.current.configured).toBe(false))
    expect(result.current.error).toBeNull()
    expect(result.current.exaResults).toEqual([])
    expect(apiClient.searchVendorExa).toHaveBeenCalledTimes(1)

    // A second query (fresh keystroke) must NOT re-probe on this page load.
    act(() => result.current.setQuery('rotenone'))
    await new Promise((r) => setTimeout(r, 500))
    expect(apiClient.searchVendorExa).toHaveBeenCalledTimes(1)
  })

  /**
   * GC-17 T8 (RED inversion — reworks the former 'surfaces configured=false
   * and an error when the search fails' test): a 502-class REJECTION is a
   * genuine outage behind a valid key. Today's throw→error path is KEPT
   * (typed visibility), and the outage is NOT sticky — the next query still
   * fires (a blip must not silently kill the tier for the session).
   */
  it('T8: 502-class rejection → configured=false + typed error set (visibility kept) and the NEXT query still fires (outage is NOT sticky)', async () => {
    declareExaEnabled(true)
    vi.mocked(apiClient.searchVendorExa).mockRejectedValue(
      new Error('EXA_SEARCH_FAILED: Exa search failed: HTTP 502: upstream exploded'),
    )
    const { result } = renderHook(() => useVendorExaSearch())

    act(() => result.current.setQuery('rot'))
    await waitFor(() => expect(result.current.error).toContain('EXA_SEARCH_FAILED'))
    expect(result.current.configured).toBe(false)
    expect(result.current.exaResults).toEqual([])
    expect(apiClient.searchVendorExa).toHaveBeenCalledTimes(1)

    // NOT sticky: the next query re-fires (contrast with T7's sticky refusal).
    act(() => result.current.setQuery('rotenone'))
    await new Promise((r) => setTimeout(r, 500))
    expect(apiClient.searchVendorExa).toHaveBeenCalledTimes(2)
  })
})
