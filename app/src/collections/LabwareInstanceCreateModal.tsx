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

import { useState } from 'react'
import type { RecordEnvelope } from '../types/kernel'
import { apiClient } from '../shared/api/client'

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
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

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
        ...(locationLabel.trim() ? { location: { kind: 'other', label: locationLabel.trim() } } : {}),
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
            <label className="lab-modal__label" htmlFor="lbi-location">
              Location label
            </label>
            <input
              id="lbi-location"
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
      <style>{modalStyles}</style>
    </div>
  )
}

const modalStyles = `
.lab-modal__backdrop {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.lab-modal {
  background: var(--cl-bg-elev); color: var(--cl-text);
  border: 1px solid var(--cl-border); border-radius: 8px;
  width: min(480px, 96vw); display: flex; flex-direction: column;
  box-shadow: 0 16px 48px rgba(0,0,0,0.4);
}
.lab-modal__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid var(--cl-border);
}
.lab-modal__header h2 { margin: 0; font-size: 1rem; }
.lab-modal__close {
  margin-left: auto; background: transparent; border: 1px solid var(--cl-border);
  color: var(--cl-text-dim); border-radius: 4px; width: 26px; height: 26px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.lab-modal__body { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
.lab-modal__row { display: flex; flex-direction: column; gap: 4px; }
.lab-modal__label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--cl-text-faint); }
.lab-modal__row select, .lab-modal__row input {
  font: inherit; background: var(--cl-bg-elev-2); color: var(--cl-text);
  border: 1px solid var(--cl-border); border-radius: 4px; padding: 6px 8px;
}
.lab-modal__row input:focus, .lab-modal__row select:focus {
  outline: none; border-color: var(--cl-accent);
}
.lab-modal__error { margin: 0; color: var(--cl-danger); font-size: 0.85rem; }
.lab-modal__footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 12px 16px; border-top: 1px solid var(--cl-border);
}
.lab-modal__save {
  background: var(--cl-accent); color: var(--cl-on-accent);
  border: none; border-radius: 6px; padding: 6px 14px; cursor: pointer; font: inherit;
}
.lab-modal__save:disabled { opacity: 0.6; cursor: default; }
.lab-modal__cancel {
  background: transparent; color: var(--cl-text);
  border: 1px solid var(--cl-border); border-radius: 6px; padding: 6px 14px;
  cursor: pointer; font: inherit;
}
`
