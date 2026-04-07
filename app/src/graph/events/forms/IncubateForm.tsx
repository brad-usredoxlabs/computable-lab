/**
 * IncubateForm - Form for incubate event type.
 */

import type { EventDetails, IncubateDetails } from '../../../types/events'
import { WellsSelector, DurationInput, TemperatureInput } from '../EventEditor'

interface FormProps {
  details: EventDetails
  onChange: (details: EventDetails) => void
}

export function IncubateForm({ details, onChange }: FormProps) {
  const d = details as IncubateDetails

  return (
    <div className="event-form incubate-form">
      <WellsSelector
        label="Wells to Incubate"
        value={d.wells || []}
        onChange={(wells) => onChange({ ...d, wells })}
      />

      <DurationInput
        label="Duration"
        value={d.duration}
        onChange={(duration) => onChange({ ...d, duration })}
      />

      <TemperatureInput
        value={d.temperature}
        onChange={(temperature) => onChange({ ...d, temperature })}
      />
    </div>
  )
}
