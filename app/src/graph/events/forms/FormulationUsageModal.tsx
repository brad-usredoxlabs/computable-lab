import { useEffect, useState } from 'react'
import type { Ref } from '../../../types/ref'

export interface FormulationInstanceLotDraft {
  vendor?: string
  catalog_number?: string
  lot_number?: string
}

export interface PreferredSourceSummary {
  roleLabel: string
  vendor?: string
  catalogNumber?: string
}

interface FormulationUsageModalProps {
  isOpen: boolean
  formulationRef: Ref | null
  preferredSources?: PreferredSourceSummary[]
  trackingMode?: 'relaxed' | 'tracked'
  allowAdHocEventInstances?: boolean
  onCancel: () => void
  onSkip: () => void
  onSave: (lot: FormulationInstanceLotDraft) => void
}

export function FormulationUsageModal({
  isOpen,
  formulationRef,
  preferredSources = [],
  trackingMode = 'relaxed',
  allowAdHocEventInstances = true,
  onCancel,
  onSkip,
  onSave,
}: FormulationUsageModalProps) {
  const [vendor, setVendor] = useState('')
  const [catalogNumber, setCatalogNumber] = useState('')
  const [lotNumber, setLotNumber] = useState('')

  useEffect(() => {
    if (!isOpen) return
    const meaningfulSources = preferredSources.filter((source) => source.vendor || source.catalogNumber)
    const uniqueVendors = Array.from(new Set(meaningfulSources.map((source) => source.vendor).filter(Boolean)))
    const prefilledVendor = meaningfulSources.length === 1
      ? meaningfulSources[0]?.vendor || ''
      : uniqueVendors.length === 1
        ? uniqueVendors[0] || ''
        : ''
    const prefilledCatalog = meaningfulSources.length === 1
      ? meaningfulSources[0]?.catalogNumber || ''
      : ''
    setVendor(prefilledVendor)
    setCatalogNumber(prefilledCatalog)
    setLotNumber('')
  }, [isOpen, preferredSources])

  if (!isOpen || !formulationRef) return null

  const lotDraft = {
    ...(vendor.trim() ? { vendor: vendor.trim() } : {}),
    ...(catalogNumber.trim() ? { catalog_number: catalogNumber.trim() } : {}),
    ...(lotNumber.trim() ? { lot_number: lotNumber.trim() } : {}),
  }
  const requireProvenance = trackingMode === 'tracked' && !allowAdHocEventInstances
  const hasLotData = Object.keys(lotDraft).length > 0

  return (
    <div className="formulations-modal-backdrop" onClick={onCancel}>
      <div className="formulations-modal formulations-modal--compact" onClick={(e) => e.stopPropagation()}>
        <div className="formulations-modal__head">
          <div>
            <p className="formulations-section-head__eyebrow">Use Saved Stock</p>
            <h2>{formulationRef.label || formulationRef.id}</h2>
            <p className="formulations-modal__copy">
              {requireProvenance
                ? 'This lab requires source details before this saved stock can be used without a specific pre-tracked prepared tube or plate.'
                : 'Using this saved stock/formulation is the normal path. Add vendor, catalog, or lot details only if you need to record a specific prepared tube or plate for this experimental use.'}
            </p>
            <p className="formulations-modal__copy">
              Concentration comes from the saved stock by default after selection. You can still override it in the event form if this use needs an exception.
            </p>
          </div>
          <button className="btn btn-secondary" onClick={onCancel} type="button">
            Close
          </button>
        </div>

        <div className="formulations-modal__body">
          {preferredSources.length > 0 && (
            <div className="formulations-preferred-summary">
              <div className="formulations-preferred-summary__title">Preferred recipe sources</div>
              <div className="formulations-preferred-summary__list">
                {preferredSources.map((source) => (
                  <div key={source.roleLabel} className="formulations-preferred-summary__row">
                    <span>{source.roleLabel}</span>
                    <span>{source.vendor || 'Vendor not set'}</span>
                    <span>{source.catalogNumber || 'Catalog not set'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="formulations-form-grid">
            <label className="formulations-field">
              <span>Vendor</span>
              <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Sigma, Thermo, internal prep" />
            </label>
            <label className="formulations-field">
              <span>Product / catalog number</span>
              <input value={catalogNumber} onChange={(e) => setCatalogNumber(e.target.value)} placeholder="Optional" />
            </label>
            <label className="formulations-field">
              <span>Lot code</span>
              <input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} placeholder="Optional" />
            </label>
          </div>
        </div>

        <div className="formulations-modal__footer">
          {!requireProvenance && (
            <button className="btn btn-secondary" type="button" onClick={onSkip}>
              Use Saved Stock
            </button>
          )}
          <button
            className="btn btn-primary"
            type="button"
            disabled={requireProvenance && !hasLotData}
            onClick={() => onSave(lotDraft)}
          >
            Save Source Details
          </button>
        </div>
      </div>
    </div>
  )
}
