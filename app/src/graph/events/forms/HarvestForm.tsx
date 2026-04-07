/**
 * HarvestForm - Form for harvest event type.
 */

import type { EventDetails, HarvestDetails } from '../../../types/events'
import { WellsSelector } from '../EventEditor'

interface FormProps {
  details: EventDetails
  onChange: (details: EventDetails) => void
}

export function HarvestForm({ details, onChange }: FormProps) {
  const d = details as HarvestDetails

  return (
    <div className="event-form harvest-form">
      <WellsSelector
        label="Wells to Harvest"
        value={d.wells || []}
        onChange={(wells) => onChange({ ...d, wells })}
      />

      <div className="form-field">
        <label>Harvest Method</label>
        <select
          value={d.method || ''}
          onChange={(e) => onChange({ ...d, method: e.target.value || undefined })}
        >
          <option value="">Select method...</option>
          <option value="aspirate">Aspirate</option>
          <option value="scrape">Scrape</option>
          <option value="trypsinize">Trypsinize</option>
          <option value="enzymatic">Enzymatic</option>
          <option value="manual">Manual</option>
        </select>
      </div>

      <div className="form-field">
        <label>Destination</label>
        <input
          type="text"
          value={d.destination || ''}
          onChange={(e) => onChange({ ...d, destination: e.target.value || undefined })}
          placeholder="e.g., Tube A1, Collection plate"
        />
      </div>
    </div>
  )
}
