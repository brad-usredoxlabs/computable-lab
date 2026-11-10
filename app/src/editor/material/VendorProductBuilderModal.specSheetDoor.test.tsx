/**
 * uD1door — spec-sheet door: the vendor-builder's spec-sheet button calls
 * the SHARED engine (POST /ingestion/spec-sheet/extract) and renders
 * proposals read-only with citation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { apiClient, type SpecSheetExtractResult } from '../../shared/api/client'
import { VendorProductBuilderModal } from './VendorProductBuilderModal'

const SEED = { vendor: 'sigma' as const, name: 'Sigma-Aldrich D6429', catalogNumber: 'D6429-500ML' }
const TEST_URL = 'https://www.sigmaaldrich.com/spec-sheet'

function renderModal() {
  return render(
    <VendorProductBuilderModal isOpen onClose={() => {}} ontologyRef={null}
      initialSearchResult={SEED} onSave={() => {}} />,
  )
}

const successResult: SpecSheetExtractResult = {
  configured: true,
  proposals: [
    {
      targetField: 'catalog_number',
      value: 'D6429',
      sourceUrl: TEST_URL,
      passage: 'Catalog Number: D6429',
      specId: 'XSPEC-VENDOR-PRODUCT',
    },
  ],
}

const notConfiguredResult: SpecSheetExtractResult = {
  configured: false,
  reason: 'not_configured',
  proposals: [],
}

const blockedResult: SpecSheetExtractResult = {
  configured: true,
  proposals: [],
  blocked: { url: TEST_URL, reason: 'exa_fetch_blocked' },
}

beforeEach(() => {
  vi.spyOn(apiClient, 'listRecordsByKind').mockImplementation(async () => ({
    records: [], total: 0,
  }))
  vi.spyOn(apiClient, 'getRecord').mockImplementation(async () => {
    throw new Error('not found')
  })
  vi.spyOn(apiClient, 'createRecord').mockResolvedValue({} as Awaited<ReturnType<typeof apiClient.createRecord>>)
  vi.spyOn(apiClient, 'updateRecord').mockResolvedValue({} as Awaited<ReturnType<typeof apiClient.updateRecord>>)
  vi.spyOn(apiClient, 'searchVendorProducts').mockResolvedValue({ items: [], vendors: [] })
  vi.spyOn(apiClient, 'extractSpecSheetProposals').mockResolvedValue(successResult)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('uD1door — spec-sheet door', () => {
  it('calls extractSpecSheetProposals with the typed URL and vendor-product recordKind', async () => {
    renderModal()
    const urlInput = screen.getByPlaceholderText(/sigmaaldrich/)
    fireEvent.change(urlInput, { target: { value: TEST_URL } })
    fireEvent.click(screen.getByRole('button', { name: 'Extract Spec Sheet' }))

    await waitFor(() => {
      expect(apiClient.extractSpecSheetProposals).toHaveBeenCalledTimes(1)
      expect(apiClient.extractSpecSheetProposals).toHaveBeenCalledWith({
        url: TEST_URL,
        recordKind: 'vendor-product',
      })
    })
  })

  it('renders passage and sourceUrl for each success proposal', async () => {
    renderModal()
    const urlInput = screen.getByPlaceholderText(/sigmaaldrich/)
    fireEvent.change(urlInput, { target: { value: TEST_URL } })
    fireEvent.click(screen.getByRole('button', { name: 'Extract Spec Sheet' }))

    await waitFor(() => {
      expect(screen.getByText(/passage: Catalog Number: D6429/)).toBeTruthy()
      expect(screen.getByText(new RegExp('sourceUrl: ' + TEST_URL))).toBeTruthy()
    })
  })

  it('shows a not-configured notice and zero proposals when configured is false', async () => {
    vi.mocked(apiClient.extractSpecSheetProposals).mockResolvedValueOnce(notConfiguredResult)
    renderModal()
    const urlInput = screen.getByPlaceholderText(/sigmaaldrich/)
    fireEvent.change(urlInput, { target: { value: TEST_URL } })
    fireEvent.click(screen.getByRole('button', { name: 'Extract Spec Sheet' }))

    await waitFor(() => {
      expect(screen.getByText(/not configured/)).toBeTruthy()
    })
    // Ensure no proposal rows rendered
    expect(screen.queryByText(/XSPEC-/)).toBeFalsy()
  })

  it('renders the block reason and zero proposals when blocked', async () => {
    vi.mocked(apiClient.extractSpecSheetProposals).mockResolvedValueOnce(blockedResult)
    renderModal()
    const urlInput = screen.getByPlaceholderText(/sigmaaldrich/)
    fireEvent.change(urlInput, { target: { value: TEST_URL } })
    fireEvent.click(screen.getByRole('button', { name: 'Extract Spec Sheet' }))

    await waitFor(() => {
      expect(screen.getByText(/exa_fetch_blocked/)).toBeTruthy()
    })
    // Ensure no proposal rows rendered
    expect(screen.queryByText(/XSPEC-/)).toBeFalsy()
  })
})
