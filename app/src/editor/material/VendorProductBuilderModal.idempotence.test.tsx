/**
 * D1 (MAJOR) — browser gate review L2-BROWSER-l2t0136.
 *
 * Adding the SAME (vendor, catalog number) a second time must UPDATE the
 * existing vendor-product record instead of writing a duplicate with a new id.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { apiClient } from '../../shared/api/client'
import type { RecordEnvelope } from '../../types/kernel'
import { VENDOR_PRODUCT_SCHEMA_ID } from '../../types/material'
import { VendorProductBuilderModal } from './VendorProductBuilderModal'

const SEED = { vendor: 'sigma' as const, name: 'Sigma-Aldrich D6429', catalogNumber: 'D6429-500ML' }
let stored: RecordEnvelope[] = []

const vendorCreateCalls = () =>
  vi.mocked(apiClient.createRecord).mock.calls.filter(([schemaId]) => schemaId === VENDOR_PRODUCT_SCHEMA_ID)

function renderModal() {
  return render(
    <VendorProductBuilderModal isOpen onClose={() => {}} ontologyRef={null}
      initialSearchResult={SEED} onSave={() => {}} />,
  )
}

beforeEach(() => {
  stored = []
  vi.spyOn(apiClient, 'listRecordsByKind').mockImplementation(async () => ({
    records: stored.slice(), total: stored.length,
  }))
  // Material lookup misses; so does a direct vendor-product id lookup pre-fix.
  vi.spyOn(apiClient, 'getRecord').mockImplementation(async () => {
    throw new Error('not found')
  })
  vi.spyOn(apiClient, 'createRecord').mockResolvedValue({} as Awaited<ReturnType<typeof apiClient.createRecord>>)
  vi.spyOn(apiClient, 'updateRecord').mockResolvedValue({} as Awaited<ReturnType<typeof apiClient.updateRecord>>)
  vi.spyOn(apiClient, 'searchVendorProducts').mockResolvedValue({ items: [], vendors: [] })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('VendorProductBuilderModal vendor-product idempotence (D1)', () => {
  it('updates the existing record for the same vendor + catalog number instead of creating a second', async () => {
    const first = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Save Vendor Product' }))
    await waitFor(() => expect(vendorCreateCalls()).toHaveLength(1))
    const createdId = vendorCreateCalls()[0][1].id as string
    expect(createdId).toMatch(/^VPR-/)

    // The record now lives in the workspace; reopening the modal (fresh state)
    // is exactly the reviewer's "add the same product again" path.
    stored = [{
      recordId: createdId,
      schemaId: VENDOR_PRODUCT_SCHEMA_ID,
      // Deliberately different casing from the form's 'Sigma-Aldrich'.
      payload: { vendor: 'SIGMA-ALDRICH', catalog_number: 'D6429-500ML' },
    }]
    first.unmount()

    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Save Vendor Product' }))
    await waitFor(() =>
      expect(apiClient.updateRecord).toHaveBeenCalledWith(
        createdId, expect.objectContaining({ id: createdId }),
      ),
    )
    expect(vendorCreateCalls()).toHaveLength(1)
  })

  it('mints a fresh VPR- id when no record matches the catalog number', async () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Save Vendor Product' }))
    await waitFor(() => expect(vendorCreateCalls()).toHaveLength(1))
    const [, payload] = vendorCreateCalls()[0]
    expect(payload.id).toMatch(/^VPR-/)
    expect(payload.catalog_number).toBe('D6429-500ML')
    expect(apiClient.updateRecord).not.toHaveBeenCalled()
  })
})
