/**
 * LabwareInstanceCreateModal — create a labware-instance record.
 *
 * Reads labware definitions from the list view; the user picks one and
 * provides a label (+ optional barcode, optional location label).
 * Mints an LBI-<8 hex upper> recordId.  Geometry is NOT typed by hand —
 * it is read from the definition on the server side.
 *
 * REVIEWER BAIT 1 honoured: optional fields are absent (not undefined)
 * via conditional spreads.
 */

import { useState, useEffect } from 'react'
import type { RecordEnvelope, JsonSchema } from '../types/kernel'
import { apiClient } from '../shared/api/client'
import { labModalStyles } from './labModalStyles'

const LABWARE_INSTANCE_SCHEMA =
  'https://computable-lab.com/schema/computable-lab/labware-instance.schema.yaml'

/** Mint an LBI-<8 hex uppercase> recordId */
function mintRecordId(): string {
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join('')
  return `LBI-${hex}`
}

interface Props {
  definitions: RecordEnvelope[]
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function LabwareInstanceCreateModal({
  definitions,
  isOpen,
  onClose,
  onSuccess,
}: Props) {
  const [selectedDefId, setSelectedDefId] = useState('')
  const [label, setLabel] = useState('')
  const [barcode, setBarcode] = useState('')
  const [locationLabel, setLocationLabel] = useState('')
  const [locationKind, setLocationKind] = useState('')
  const [locationKinds, setLocationKinds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    apiClient.getSchema(LABWARE_INSTANCE_SCHEMA).then((info) => {
      if (cancelled) return
      const schema = info.schema as JsonSchema | undefined
      const kindDef = schema?.properties?.location?.properties?.kind
      const enumVals = Array.isArray(kindDef?.enum) ? kindDef.enum.filter((v) => typeof v === 'string') as string[] : []
      setLocationKinds(enumVals)
    }).catch(() => { /* schema not available — location kind stays empty */ })
    return () => { cancelled = true }
  }, [])

  if (!isOpen) return null

  const handleSubmit = async () => {
    setError(null)
    if (!selectedDefId) {
      setError('Select a labware definition')
      return
    }

    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        kind: 'labware-instance',
        recordId: mintRecordId(),
        labwareId: selectedDefId,
        ...(label.trim() ? { label: label.trim() } : {}),
        ...(barcode.trim() ? { barcode: barcode.trim() } : {}),
        ...(locationKind ? { location: { kind: locationKind, ...(locationLabel.trim() ? { label: locationLabel.trim() } : {}) } } : {}),
      }
      await apiClient.createRecord(LABWARE_INSTANCE_SCHEMA, payload)
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
      <div className="lab-modal" role="dialog" aria-modal="true">
        <header className="lab-modal__header">
          <h2>New Labware Instance</h2>
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
          {error && <p className="lab-modal__error" data-testid="labware-instance-create-error">{error}</p>}

          <div className="lab-modal__row">
            <label className="lab-modal__label" htmlFor="lbi-definition">
              Definition *
            </label>
            <select
              id="lbi-definition"
              value={selectedDefId}
              onChange={(e) => setSelectedDefId(e.target.value)}
              data-testid="labware-instance-definition-select"
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

          <div className="lab-modal__row">
            <label className="lab-modal__label" htmlFor="lbi-label">
              Label
            </label>
            <input
              id="lbi-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Plate A (RUN-000041)"
              data-testid="labware-instance-label-input"
            />
          </div>

          <div className="lab-modal__row">
            <label className="lab-modal__label" htmlFor="lbi-barcode">
              Barcode
            </label>
            <input
              id="lbi-barcode"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Optional barcode"
              data-testid="labware-instance-barcode-input"
            />
          </div>

          <div className="lab-modal__row">
            <label className="lab-modal__label" htmlFor="lbi-location-kind">
              Location kind
            </label>
            <select
              id="lbi-location-kind"
              value={locationKind}
              onChange={(e) => setLocationKind(e.target.value)}
              data-testid="labware-instance-location-kind"
            >
              <option value="">Select a kind…</option>
              {locationKinds.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>

          <div className="lab-modal__row">
            <label className="lab-modal__label" htmlFor="lbi-location-label">
              Location label
            </label>
            <input
              id="lbi-location-label"
              value={locationLabel}
              onChange={(e) => setLocationLabel(e.target.value)}
              placeholder="e.g. Bench 3, Incubator A"
              data-testid="labware-instance-location-input"
            />
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
            data-testid="labware-instance-create-submit"
          >
            {saving ? 'Saving…' : 'Create instance'}
          </button>
        </footer>
      </div>
      <style>{labModalStyles}</style>
    </div>
  )
}

