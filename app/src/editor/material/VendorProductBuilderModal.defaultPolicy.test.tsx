/**
 * D2 (MAJOR) — browser gate review L2-BROWSER-l2t0136.
 *
 * The approved vendor-product builder asks the "is this the lab's default
 * <material> product?" question and, when answered yes, writes ONE
 * `material-selection-policy` record (selection: default) pointing at the
 * material concept the modal resolved and the just-saved vendor product.
 * Unticked means no policy record at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { apiClient } from '../../shared/api/client'
import {
  MATERIAL_SCHEMA_ID,
  VENDOR_PRODUCT_SCHEMA_ID,
  generateMaterialSelectionPolicyId,
} from '../../types/material'
import { VendorProductBuilderModal } from './VendorProductBuilderModal'

const POLICY_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material-selection-policy.schema.yaml'
const DEFAULT_QUESTION = "Make this the lab's default product for this material"
const REASON_QUESTION = /why is this the default product/i
const SEED = { vendor: 'sigma' as const, name: 'Vendor Product X', catalogNumber: 'CAT-1' }

const createCallsFor = (schemaId: string) =>
  vi.mocked(apiClient.createRecord).mock.calls.filter(([id]) => id === schemaId)

function renderModal(onSave: () => void = () => {}) {
  return render(
    <VendorProductBuilderModal isOpen onClose={() => {}} ontologyRef={null}
      initialSearchResult={SEED} onSave={onSave} />,
  )
}

beforeEach(() => {
  vi.spyOn(apiClient, 'listRecordsByKind').mockImplementation(async () => ({ records: [], total: 0 }))
  // Material + vendor-product lookups miss, so the first save creates both.
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

describe('VendorProductBuilderModal default-material question (D2)', () => {
  it('writes exactly one default material-selection-policy for the resolved concept + saved product', async () => {
    renderModal()
    fireEvent.click(screen.getByLabelText(DEFAULT_QUESTION))
    fireEvent.change(screen.getByLabelText(REASON_QUESTION), { target: { value: 'Kept in stock for routine work' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Vendor Product' }))

    await waitFor(() => expect(createCallsFor(POLICY_SCHEMA_ID)).toHaveLength(1))

    const [, payload] = createCallsFor(POLICY_SCHEMA_ID)[0]
    const materialCreate = createCallsFor(MATERIAL_SCHEMA_ID)[0]
    const vendorCreate = createCallsFor(VENDOR_PRODUCT_SCHEMA_ID)[0]
    expect(materialCreate).toBeTruthy()
    expect(vendorCreate).toBeTruthy()

    expect(payload.kind).toBe('material-selection-policy')
    expect(payload.selection).toBe('default')
    expect(payload.reason).toBe('Kept in stock for routine work')
    // The concept ref is the one ensureMaterialRecord() resolved, not a literal.
    expect(payload.material_ref).toEqual(expect.objectContaining({
      kind: 'record', id: materialCreate[1].id, type: 'material',
    }))
    // The product ref is the id upsertVendorProductRecord() just persisted.
    expect(payload.vendor_product_ref).toEqual({
      kind: 'record', id: vendorCreate[1].id, type: 'vendor-product',
    })
    expect(payload.recordId).toMatch(/^MSPOL-[A-Z0-9][A-Z0-9_-]*$/)
    expect(payload.since).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('writes no policy record when the default question is left unticked', async () => {
    const onSave = vi.fn()
    renderModal(onSave)
    fireEvent.click(screen.getByRole('button', { name: 'Save Vendor Product' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(createCallsFor(VENDOR_PRODUCT_SCHEMA_ID)).toHaveLength(1)
    expect(createCallsFor(POLICY_SCHEMA_ID)).toHaveLength(0)
  })

  it('refuses to write a default policy without the scientist-supplied reason', async () => {
    const onSave = vi.fn()
    renderModal(onSave)
    fireEvent.click(screen.getByLabelText(DEFAULT_QUESTION))
    fireEvent.click(screen.getByRole('button', { name: 'Save Vendor Product' }))

    await waitFor(() => expect(screen.getByText(/reason/i)).toBeTruthy())
    expect(onSave).not.toHaveBeenCalled()
    expect(createCallsFor(POLICY_SCHEMA_ID)).toHaveLength(0)
  })
})

describe('generateMaterialSelectionPolicyId', () => {
  it('still matches the schema pattern when the label has no alphanumerics', () => {
    expect(generateMaterialSelectionPolicyId('!!!')).toMatch(/^MSPOL-[A-Z0-9][A-Z0-9_-]*$/)
    expect(generateMaterialSelectionPolicyId('Vendor Product X')).toMatch(/^MSPOL-[A-Z0-9][A-Z0-9_-]*$/)
  })
})
