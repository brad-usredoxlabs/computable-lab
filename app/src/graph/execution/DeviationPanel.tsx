/**
 * DeviationPanel - Modal for reporting deviations during execution.
 */

import { useState, type FormEvent } from 'react'
import type { PlateEvent } from '../../types/events'

export interface DeviationPanelProps {
  eventId: string
  event: PlateEvent | undefined
  onSubmit: (deviationId: string) => void
  onCancel: () => void
}

export function DeviationPanel({
  eventId,
  event,
  onSubmit,
  onCancel,
}: DeviationPanelProps) {
  const [deviationNote, setDeviationNote] = useState('')
  const [deviationDetails, setDeviationDetails] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    // Generate a simple deviation ID
    const deviationId = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    onSubmit(deviationId)
  }

  return (
    <div className="deviation-panel" data-testid="deviation-panel">
      <div className="deviation-panel__overlay">
        <div className="deviation-panel__content">
          <h3 className="deviation-panel__title">Report Deviation</h3>
          
          <div className="deviation-panel__event-info">
            <strong>Event:</strong> {event?.eventId || eventId}
            {event?.notes && (
              <p>{event.notes}</p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="deviation-panel__form">
            <div className="deviation-panel__field">
              <label htmlFor="deviation-note">Deviation Note *</label>
              <textarea
                id="deviation-note"
                value={deviationNote}
                onChange={(e) => setDeviationNote(e.target.value)}
                placeholder="Describe what went wrong or differed from the plan..."
                required
                rows={4}
              />
            </div>

            <div className="deviation-panel__field">
              <label htmlFor="deviation-details">Additional Details (optional)</label>
              <textarea
                id="deviation-details"
                value={deviationDetails}
                onChange={(e) => setDeviationDetails(e.target.value)}
                placeholder="Any additional context, measurements, or observations..."
                rows={3}
              />
            </div>

            <div className="deviation-panel__actions">
              <button
                type="button"
                className="deviation-panel__button"
                onClick={onCancel}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="deviation-panel__button deviation-panel__button--primary"
                disabled={!deviationNote.trim()}
              >
                Submit Deviation
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
