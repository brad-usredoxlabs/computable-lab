import { useEffect, useState } from 'react'
import type { Labware } from '../../types/labware'
import { LABWARE_TYPE_LABELS } from '../../types/labware'
import { apiClient } from '../../shared/api/client'

/**
 * InstrumentFocus — the zoomed-in detail pane for a bench instrument tile.
 *
 * A bench instrument (minted from an Exa equipment record) is NOT well-addressable,
 * so the standard `LabwareFocus` well-grid makes little sense for it. This compact
 * pane shows the instrument's identity (name, source `EQP-…` record, any notes) plus
 * manufacturer/model pulled best-effort from the source equipment record. The
 * `EQP-…` record stays the canonical equipment; the tile is the bench view of it.
 *
 * This is the forward-compatible anchor for the future "move a plate onto the
 * shaker/instrument" deck flow — an instrument focus can later list what sits on it.
 */

const EQUIPMENT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/equipment.schema.yaml'

interface InstrumentFocusProps {
  labware: Labware
  locationLabel: string
  onClose: () => void
}

export function InstrumentFocus({ labware, locationLabel, onClose }: InstrumentFocusProps) {
  // Best-effort: pull manufacturer / model from the source EQP record so the
  // biologist sees the real instrument identity. Absent/failed → the pane still
  // shows name + id + notes and stays coherent.
  const [source, setSource] = useState<{ manufacturer?: string; model?: string } | null>(null)
  useEffect(() => {
    if (!labware.sourceRecordId) return
    let cancelled = false
    void apiClient
      .getRecord(labware.sourceRecordId)
      .then((envelope) => {
        if (cancelled) return
        const payload = envelope.payload as { manufacturer?: unknown; model?: unknown }
        const supplier: { manufacturer?: string; model?: string } = {}
        if (typeof payload.manufacturer === 'string') supplier.manufacturer = payload.manufacturer
        if (typeof payload.model === 'string') supplier.model = payload.model
        setSource(Object.keys(supplier).length > 0 ? supplier : null)
      })
      .catch(() => {
        if (!cancelled) setSource(null)
      })
    return () => {
      cancelled = true
    }
  }, [labware.sourceRecordId])

  return (
    <div className="focus focus--instrument" data-testid="focus-instrument">
      <div className="focus__canvas" onClick={(e) => e.stopPropagation()}>
        <header className="focus__header">
          <span className="focus__icon" aria-hidden>⚙️</span>
          <div className="focus__title-block">
            <div className="focus__name">{labware.name}</div>
            <div className="focus__meta">
              {LABWARE_TYPE_LABELS[labware.labwareType]} · {locationLabel} · instrument
            </div>
          </div>
          <button
            type="button"
            className="focus__btn"
            onClick={() => onClose()}
            title="Close (Esc)"
          >Close</button>
        </header>
        <div className="focus__body focus__body--instrument">
          <div className="focus__instrument-id" data-testid="focus-instrument-id">
            {labware.sourceRecordId ? `Equipment record: ${labware.sourceRecordId}` : 'Bench instrument (no equipment record linked)'}
          </div>
          {source?.manufacturer ? (
            <div className="focus__instrument-meta">Manufacturer: {source.manufacturer}</div>
          ) : null}
          {source?.model ? (
            <div className="focus__instrument-meta">Model: {source.model}</div>
          ) : null}
          {labware.notes ? (
            <div className="focus__instrument-notes">{labware.notes}</div>
          ) : null}
          <div className="focus__instrument-hint">
            An instrument is bench equipment, not well-addressable labware — there are no wells
            to inspect. Its identity links to the canonical equipment record ({EQUIPMENT_SCHEMA_ID}).
          </div>
        </div>
      </div>
    </div>
  )
}