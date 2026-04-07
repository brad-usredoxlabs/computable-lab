/**
 * MixForm - Form for mix event type.
 */

import type { EventDetails, MixDetails } from '../../../types/events'
import { WellsSelector } from '../EventEditor'

interface FormProps {
  details: EventDetails
  onChange: (details: EventDetails) => void
}

export function MixForm({ details, onChange }: FormProps) {
  const d = details as MixDetails

  return (
    <div className="event-form mix-form">
      <WellsSelector
        label="Wells to Mix"
        value={d.wells || []}
        onChange={(wells) => onChange({ ...d, wells })}
      />

      <div className="form-field">
        <label>Mix Count</label>
        <input
          type="number"
          value={d.mix_count ?? ''}
          onChange={(e) => {
            const num = parseInt(e.target.value)
            onChange({ ...d, mix_count: isNaN(num) ? undefined : num })
          }}
          placeholder="e.g., 3"
          min="1"
        />
      </div>

      <div className="form-field">
        <label>Speed</label>
        <select
          value={d.speed || 'medium'}
          onChange={(e) => onChange({ ...d, speed: e.target.value || undefined })}
        >
          <option value="">Select speed...</option>
          <option value="slow">Slow</option>
          <option value="medium">Medium</option>
          <option value="fast">Fast</option>
        </select>
      </div>
    </div>
  )
}
