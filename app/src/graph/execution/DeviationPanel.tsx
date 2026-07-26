/**
 * DeviationPanel - Inline form for capturing deviations during execution.
 * Minimal form with fields: deviation type, expected value, actual value, notes.
 */

import { useState } from 'react'
import { captureDeviation, type DeviationData } from '../../shared/api/execution'

export interface DeviationPanelProps {
  runId: string
  eventId: string
  event?: {
    notes?: string
    event_type: string
  }
  onSubmit: (deviationId: string) => void
  onCancel: () => void
}

const DEVIATION_CODES = [
  { code: 'timing_deviation', label: 'Timing Deviation', description: 'Step took longer or shorter than expected' },
  { code: 'volume_deviation', label: 'Volume Deviation', description: 'Actual volume differs from expected' },
  { code: 'temperature_deviation', label: 'Temperature Deviation', description: 'Temperature outside expected range' },
  { code: 'equipment_issue', label: 'Equipment Issue', description: 'Equipment malfunction or error' },
  { code: 'material_issue', label: 'Material Issue', description: 'Material quality or quantity issue' },
  { code: 'procedure_change', label: 'Procedure Change', description: 'Modified the procedure during execution' },
  { code: 'environmental_factor', label: 'Environmental Factor', description: 'Environmental conditions affected execution' },
  { code: 'other', label: 'Other', description: 'Other deviation not listed above' },
]

const SEVERITY_LEVELS = [
  { value: 'info', label: 'Info', color: '#3b82f6' },
  { value: 'warning', label: 'Warning', color: '#f59e0b' },
  { value: 'error', label: 'Error', color: '#ef4444' },
]

export function DeviationPanel({
  runId,
  eventId,
  event,
  onSubmit,
  onCancel,
}: DeviationPanelProps) {
  const [deviationCode, setDeviationCode] = useState('')
  const [expectedValue, setExpectedValue] = useState('')
  const [actualValue, setActualValue] = useState('')
  const [notes, setNotes] = useState('')
  const [severity, setSeverity] = useState('warning')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!deviationCode) {
      setError('Please select a deviation type')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const deviationData: DeviationData = {
        deviationType: 'operator',
        eventId,
        deviationCode,
        expectedValue: expectedValue || undefined,
        actualValue: actualValue || undefined,
        notes: notes || undefined,
        severity: severity as 'info' | 'warning' | 'error',
        reportedBy: 'current-user', // TODO: Get from auth context
        reportedAt: new Date().toISOString(),
      }

      const result = await captureDeviation(runId, deviationData)
      onSubmit(result.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to capture deviation')
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectedDeviation = DEVIATION_CODES.find(d => d.code === deviationCode)

  return (
    <div className="deviation-panel-overlay">
      <div className="deviation-panel">
        <div className="deviation-panel__header">
          <h3>Report Deviation</h3>
          {event?.notes && (
            <p className="deviation-panel__event-info">
              Deviation for: <strong>{event.notes}</strong> ({event.event_type})
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="deviation-panel__form">
          {error && (
            <div className="deviation-panel__error">
              {error}
            </div>
          )}

          <div className="deviation-panel__field">
            <label className="deviation-panel__label">
              Deviation Type <span className="deviation-panel__required">*</span>
            </label>
            <select
              className="deviation-panel__select"
              value={deviationCode}
              onChange={(e) => setDeviationCode(e.target.value)}
              required
            >
              <option value="">Select deviation type...</option>
              {DEVIATION_CODES.map(option => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
            {deviationCode && (
              <p className="deviation-panel__help">
                {selectedDeviation?.description}
              </p>
            )}
          </div>

          <div className="deviation-panel__field">
            <label className="deviation-panel__label">Expected Value</label>
            <input
              type="text"
              className="deviation-panel__input"
              value={expectedValue}
              onChange={(e) => setExpectedValue(e.target.value)}
              placeholder="What was expected?"
            />
          </div>

          <div className="deviation-panel__field">
            <label className="deviation-panel__label">Actual Value</label>
            <input
              type="text"
              className="deviation-panel__input"
              value={actualValue}
              onChange={(e) => setActualValue(e.target.value)}
              placeholder="What actually happened?"
            />
          </div>

          <div className="deviation-panel__field">
            <label className="deviation-panel__label">Severity</label>
            <div className="deviation-panel__severity">
              {SEVERITY_LEVELS.map(level => (
                <label
                  key={level.value}
                  className={`deviation-panel__severity-option ${severity === level.value ? 'deviation-panel__severity-option--selected' : ''}`}
                  style={{ borderColor: level.color }}
                >
                  <input
                    type="radio"
                    name="severity"
                    value={level.value}
                    checked={severity === level.value}
                    onChange={(e) => setSeverity(e.target.value)}
                  />
                  <span style={{ color: level.color }}>{level.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="deviation-panel__field">
            <label className="deviation-panel__label">Notes</label>
            <textarea
              className="deviation-panel__textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional details about the deviation..."
              rows={4}
            />
          </div>

          <div className="deviation-panel__actions">
            <button
              type="button"
              className="deviation-panel__button deviation-panel__button--secondary"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="deviation-panel__button deviation-panel__button--primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Deviation'}
            </button>
          </div>
        </form>

        <style>{`
          .deviation-panel-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 1rem;
          }

          .deviation-panel {
            background: white;
            border-radius: 12px;
            max-width: 600px;
            width: 100%;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          }

          .deviation-panel__header {
            padding: 1.5rem;
            border-bottom: 1px solid #e5e7eb;
            background: #f9fafb;
          }

          .deviation-panel__header h3 {
            margin: 0 0 0.5rem 0;
            font-size: 1.25rem;
            font-weight: 600;
            color: #111827;
          }

          .deviation-panel__event-info {
            margin: 0;
            font-size: 0.875rem;
            color: #6b7280;
          }

          .deviation-panel__form {
            padding: 1.5rem;
          }

          .deviation-panel__error {
            padding: 0.75rem;
            background: #fef2f2;
            border: 1px solid #fecaca;
            border-radius: 6px;
            color: #991b1b;
            margin-bottom: 1rem;
            font-size: 0.875rem;
          }

          .deviation-panel__field {
            margin-bottom: 1.25rem;
          }

          .deviation-panel__label {
            display: block;
            font-size: 0.875rem;
            font-weight: 500;
            color: #374151;
            margin-bottom: 0.5rem;
          }

          .deviation-panel__required {
            color: #ef4444;
          }

          .deviation-panel__input,
          .deviation-panel__select,
          .deviation-panel__textarea {
            width: 100%;
            padding: 0.625rem;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 0.875rem;
            font-family: inherit;
            transition: border-color 0.15s ease;
          }

          .deviation-panel__input:focus,
          .deviation-panel__select:focus,
          .deviation-panel__textarea:focus {
            outline: none;
            border-color: #2563eb;
            box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
          }

          .deviation-panel__help {
            margin-top: 0.5rem;
            font-size: 0.75rem;
            color: #6b7280;
          }

          .deviation-panel__severity {
            display: flex;
            gap: 1rem;
          }

          .deviation-panel__severity-option {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem 1rem;
            border: 2px solid #e5e7eb;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.15s ease;
          }

          .deviation-panel__severity-option--selected {
            background: #f9fafb;
          }

          .deviation-panel__severity-option input {
            display: none;
          }

          .deviation-panel__textarea {
            resize: vertical;
            min-height: 80px;
          }

          .deviation-panel__actions {
            display: flex;
            justify-content: flex-end;
            gap: 0.75rem;
            margin-top: 1.5rem;
            padding-top: 1.5rem;
            border-top: 1px solid #e5e7eb;
          }

          .deviation-panel__button {
            padding: 0.625rem 1.5rem;
            border-radius: 6px;
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
            border: none;
          }

          .deviation-panel__button--primary {
            background: #2563eb;
            color: white;
          }

          .deviation-panel__button--primary:hover:not(:disabled) {
            background: #1d4ed8;
          }

          .deviation-panel__button--secondary {
            background: white;
            color: #374151;
            border: 1px solid #d1d5db;
          }

          .deviation-panel__button--secondary:hover:not(:disabled) {
            background: #f3f4f6;
          }

          .deviation-panel__button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
        `}</style>
      </div>
    </div>
  )
}
