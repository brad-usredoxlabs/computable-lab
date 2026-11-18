/**
 * VendorProductCreateModal — create a vendor-product record.
 *
 * Per the product-identity ruling (Brad 2026-11-16): a product realises EXACTLY
 * one referent — a labware DEFINITION (labware_definition_ref) for a physical
 * consumable such as a plate, or a material concept (material_ref) for a
 * substance. A labware-definition-backed product is a `vendor-product` record
 * (schema/lab/vendor-product.schema.yaml), NOT a bare labware: the labware
 * schema rejects labware_definition_ref (unevaluatedProperties:false), and the
 * definition stays the single authority for geometry — this record adds the
 * purchased identity (seller, catalogue number) on top of it.
 *
 * Catalog number is stored verbatim — only leading/trailing space is trimmed,
 * case and punctuation are never rewritten.
 */

import { useState } from 'react'
import type { RecordEnvelope } from '../types/kernel'
import { apiClient } from '../shared/api/client'
import { labModalStyles } from './labModalStyles'

const VENDOR_PRODUCT_SCHEMA =
  'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml'

/** Mint a VPR-<8 hex uppercase> recordId (the vendor-product's stable id). */
function mintRecordId(): string {
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join('')
  return `VPR-${hex}`
}

interface Props {
  definitions: RecordEnvelope[]
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function VendorProductCreateModal({
  definitions,
  isOpen,
  onClose,
  onSuccess,
}: Props) {
  const [vendor, setVendor] = useState('')
  const [catalogNumber, setCatalogNumber] = useState('')
  const [definitionId, setDefinitionId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async () => {
    setError(null)
    const trimmedVendor = vendor.trim()
    const trimmedCatalog = catalogNumber.trim()
    if (!trimmedVendor) {
      setError('Vendor name is required')
      return
    }
    if (!trimmedCatalog) {
      setError('Catalog number is required')
      return
    }
    if (!definitionId) {
      setError('Select a definition to point at')
      return
    }
    const picked = definitions.find((d) => d.recordId === definitionId)
    if (!picked) {
      setError('Select a definition to point at')
      return
    }

    setSaving(true)
    try {
      // A labware-definition-backed product. It realises the picked DEFINITION
      // by record id (the definition stays the single authority for geometry);
      // this record adds the purchased identity (seller + verbatim catalogue).
      // One referent only — a material_ref is NEVER added here (the schema's
      // oneOf forbids both). The definition's own labwareType is NOT needed —
      // never fabricated.
      const payload: Record<string, unknown> = {
        kind: 'vendor-product',
        id: mintRecordId(),
        name: `${trimmedVendor} ${trimmedCatalog}`,
        vendor: trimmedVendor,
        catalog_number: trimmedCatalog,
        labware_definition_ref: {
          kind: 'record',
          id: definitionId,
          type: 'labware',
        },
      }
      await apiClient.createRecord(VENDOR_PRODUCT_SCHEMA, payload)
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="lab-modal__backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="lab-modal" role="dialog" aria-modal="true" data-testid="vendor-product-create-modal">
        <header className="lab-modal__header">
          <h2>New Product</h2>
          <button
            type="button"
            className="lab-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="lab-modal__body">
          {error && <p className="lab-modal__error" data-testid="vendor-product-create-error">{error}</p>}

          <div className="lab-modal__row">
            <label className="lab-modal__label" htmlFor="vp-vendor">
              Vendor name *
            </label>
            <input
              id="vp-vendor"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="e.g., Thermo Fisher Scientific"
              data-testid="vendor-product-vendor-input"
            />
          </div>

          <div className="lab-modal__row">
            <label className="lab-modal__label" htmlFor="vp-catalog">
              Catalog number *
            </label>
            <input
              id="vp-catalog"
              value={catalogNumber}
              onChange={(e) => setCatalogNumber(e.target.value)}
              placeholder="e.g., A58941"
              data-testid="vendor-product-catalog-input"
            />
          </div>

          <div className="lab-modal__row">
            <label className="lab-modal__label" htmlFor="vp-definition">
              Points at definition *
            </label>
            <select
              id="vp-definition"
              value={definitionId}
              onChange={(e) => setDefinitionId(e.target.value)}
              data-testid="vendor-product-definition-select"
            >
              <option value="">Select a definition…</option>
              {definitions.map((def) => {
                const payload = def.payload as Record<string, unknown>
                const name = (typeof payload.name === 'string' && payload.name) || def.recordId
                return (
                  <option key={def.recordId} value={def.recordId}>
                    {name} ({def.recordId})
                  </option>
                )
              })}
            </select>
          </div>
        </div>

        <footer className="lab-modal__footer">
          <button
            type="button"
            className="lab-modal__cancel"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="lab-modal__save"
            onClick={handleSubmit}
            disabled={saving}
            data-testid="vendor-product-create-submit"
          >
            {saving ? 'Saving…' : 'Create product'}
          </button>
        </footer>
      </div>
      <style>{labModalStyles}</style>
    </div>
  )
}
