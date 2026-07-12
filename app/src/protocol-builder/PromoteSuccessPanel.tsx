/**
 * PromoteSuccessPanel — shown after successful promotion.
 * Displays event count, record ID, and navigation options.
 */

import { useNavigate } from 'react-router-dom'

export interface PromoteSuccessPanelProps {
  eventCount: number
  recordId: string
  onStartNew: () => void
}

export function PromoteSuccessPanel({ eventCount, recordId, onStartNew }: PromoteSuccessPanelProps) {
  const navigate = useNavigate()

  return (
    <div className="promote-success-panel" data-testid="promote-success-panel">
      <div className="promote-success-panel__icon" aria-hidden>
        {'✓'}
      </div>
      <h3 className="promote-success-panel__title">Protocol Promoted</h3>
      <p className="promote-success-panel__event-count">
        {eventCount} event{eventCount !== 1 ? 's' : ''} committed
      </p>
      <p className="promote-success-panel__record-id" data-testid="promoted-record-id">
        Record: {recordId}
      </p>
      <div className="promote-success-panel__actions">
        <button
          type="button"
          className="promote-success-panel__btn promote-success-panel__btn--primary"
          onClick={onStartNew}
          data-testid="start-new-protocol-btn"
        >
          Start New Protocol
        </button>
        <button
          type="button"
          className="promote-success-panel__btn promote-success-panel__btn--secondary"
          onClick={() => navigate(`/project/${recordId}`)}
          data-testid="view-event-editor-btn"
        >
          View in Event Editor
        </button>
      </div>
    </div>
  )
}
