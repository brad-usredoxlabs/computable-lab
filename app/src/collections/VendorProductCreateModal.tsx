/**
 * VendorProductCreateModal — create a vendor-product record.
 *
 * Per the architect ruling (L2-P1-PRODUCT-DOOR-1): a product and a definition
 * are the SAME existing kind `labware` (schema/lab/labware.schema.yaml),
 * distinguished by the manufacturer block plus an optional definitionRecordId
 * pointer. This door reuses the existing record-create path — one
 * apiClient.createRecord call against the labware schemaId. No new record kind.
 *
 * Catalog number is stored verbatim — only leading/trailing space is trimmed,
 * case and punctuation are never rewritten.
 */

import { useState } from 'react'
import type { RecordEnvelope } from '../types/kernel'
import { apiClient } from '../shared/api/client'
import { labModalStyles } from './labModalStyles'

const LABWARE_SCHEMA =
  'https://computable-lab.com/schema/computable-lab/labware.schema.yaml'

/** Mint an LW-<8 hex uppercase> recordId */
function mintRecordId(): string {
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join('')
  return `LW-${hex}`
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
    const pickedLabwareType = (picked?.payload as Record<string, unknown> | undefined)?.labwareType
    if (!picked || typeof pickedLabwareType !== 'string') {
      // Never fabricate a labwareType — the server's Ajv is the sole validator
      // (schema/lab/labware.schema.yaml requires it).
      setError('Selected definition has no labwareType; refusing to fabricate one')
      return
    }

    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        recordId: mintRecordId(),
        kind: 'labware',
        name: `${trimmedVendor} ${trimmedCatalog}`,
        labwareType: pickedLabwareType,
        manufacturer: {
          name: trimmedVendor,
          catalogNumber: trimmedCatalog,
        },
        definitionRecordId: definitionId,
      }
      await apiClient.createRecord(LABWARE_SCHEMA, payload)
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
