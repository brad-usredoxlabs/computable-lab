/**
 * OtherForm - Form for other (freeform) event type.
 */

import type { EventDetails, OtherDetails } from '../../../types/events'
import { WellsSelector } from '../EventEditor'

interface FormProps {
  details: EventDetails
  onChange: (details: EventDetails) => void
}

export function OtherForm({ details, onChange }: FormProps) {
  const d = details as OtherDetails

  return (
    <div className="event-form other-form">
      <WellsSelector
        label="Affected Wells (optional)"
        value={d.wells || []}
        onChange={(wells) => onChange({ ...d, wells })}
      />

      <div className="form-field">
        <label>Description</label>
        <textarea
          value={d.description || ''}
          onChange={(e) => onChange({ ...d, description: e.target.value || undefined })}
          placeholder="Describe the event..."
          rows={4}
        />
      </div>
    </div>
  )
}
