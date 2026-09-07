import { act, cleanup, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useVendorExaSearch } from './useVendorExaSearch'
import { apiClient } from '../api/client'

// Mock the whole client module — only `searchVendorExa` is exercised. Types
// (`VendorExaHit`, `VendorExaCategory`) are compile-time only, so the mock
// needs no shape beyond the two values the hook touches.
vi.mock('../api/client', () => ({
  apiClient: {
    searchVendorExa: vi.fn(),
  },
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
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
    vi.mocked(apiClient.searchVendorExa).mockResolvedValue({
      configured: true,
      query: 'cayman',
      items: [hit('Cayman DMSO')],
    })
    const { result } = renderHook(() => useVendorExaSearch('catalog'))

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

  it('surfaces configured=false and an error when the search fails', async () => {
    vi.mocked(apiClient.searchVendorExa).mockRejectedValue(new Error('Exa is not configured'))
    const { result } = renderHook(() => useVendorExaSearch())

    act(() => result.current.setQuery('rotenone'))

    await waitFor(() => {
      expect(result.current.configured).toBe(false)
      expect(result.current.error).toContain('Exa is not configured')
    })
  })
})