/**
 * DeviationRecorder - Modal dialog for capturing and recording deviations
 * during protocol execution.
 *
 * Auto-detects deviations by comparing a current event against its planned
 * original, renders a diff-style change summary, and captures the operator's
 * reason alongside full provenance metadata.
 */

import { useState, useCallback, useEffect, useMemo, type FormEvent, type KeyboardEvent } from 'react'
import type { PlateEvent, EventDetails } from '../../types/events'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single detected difference between two events. */
export interface DetectedChange {
  /** Field / key name. */
  field: string
  /** Value in the planned (original) event. */
  originalValue: string
  /** Value in the executed (current) event. */
  actualValue: string
}

/** Callback payload when the operator confirms the deviation. */
export interface DeviationSavePayload {
  /** All fields from the API deviation type. */
  eventId: string
  deviationType: 'remediation' | 'operator' | 'runtime'
  deviationCode: string
  expectedValue?: string
  actualValue?: string
  notes?: string
  severity?: 'info' | 'warning' | 'error'
  reportedBy: string
  reportedAt: string
  /** Free-text reason provided by the operator. */
  reason: string
  /** Auto-detected field-level changes. */
  changes: DetectedChange[]
}

export interface DeviationRecorderProps {
  /** The event as it was actually executed. */
  event: PlateEvent
  /** The event as it was planned. */
  originalEvent: PlateEvent
  /** Called with full provenance data on save. */
  onSave: (payload: DeviationSavePayload) => void
  /** Called when the user dismisses without saving. */
  onCancel: () => void
  /** Whether the recorder is visible. */
  isOpen: boolean
}

// ---------------------------------------------------------------------------
// Deviation detection
// ---------------------------------------------------------------------------

/** Keys in `EventDetails` that carry actionable values worth diffing. */
const DIFFABLE_DETAIL_KEYS = new Set([
  'wells',
  'source_wells',
  'dest_wells',
  'volume',
  'reagent',
  'reagentId',
  'concentration',
  'source',
  'target',
  'finalTargets',
  'path',
  'mapping',
  'plateId',
  'sourcePlateId',
  'destPlateId',
  'labwareId',
  'instrumentId',
  'material_ref',
  'volume_uL',
])

/** Return the human-readable string for an event's top-level fields. */
function eventFieldSummary(event: PlateEvent, key: string): string | undefined {
  switch (key) {
    case 'event_type':
      return event.event_type
    case 'at':
      return event.at ?? '<not executed>'
    case 't_offset':
      return event.t_offset ?? '<not planned>'
    case 'notes':
      return event.notes ?? '<no notes>'
    default:
      return undefined
  }
}

/** Serialize the `EventDetails` object to a comparable map. */
function detailEntries(details: EventDetails): Map<string, string> {
  const entries = new Map<string, string>()
  for (const [key, value] of Object.entries(details)) {
    const serial =
      typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)
    entries.set(key, serial)
  }
  return entries
}

/**
 * Compare two events and return a list of fields whose values differ.
 */
export function detectDeviations(
  current: PlateEvent,
  original: PlateEvent,
): DetectedChange[] {
  const changes: DetectedChange[] = []

  // Compare top-level event fields
  const topKeys = ['event_type', 'at', 't_offset', 'notes'] as const
  for (const key of topKeys) {
    const cur = eventFieldSummary(current, key)
    const orig = eventFieldSummary(original, key)
    if (cur !== undefined && orig !== undefined && cur !== orig) {
      changes.push({ field: key, originalValue: orig, actualValue: cur })
    }
  }

  // Compare EventDetails
  const curDetails = detailEntries(current.details)
  const origDetails = detailEntries(original.details)
  const allDetailKeys = new Set([...curDetails.keys(), ...origDetails.keys()])

  for (const key of allDetailKeys) {
    if (!DIFFABLE_DETAIL_KEYS.has(key)) continue
    const cur = curDetails.get(key)
    const orig = origDetails.get(key)
    if (cur !== orig) {
      changes.push({
        field: `details.${key}`,
        originalValue: orig ?? '<missing>',
        actualValue: cur ?? '<missing>',
      })
    }
  }

  return changes
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeviationRecorder({
  event,
  originalEvent,
  onSave,
  onCancel,
  isOpen,
}: DeviationRecorderProps) {
  const [reason, setReason] = useState('')

  const changes = useMemo(() => detectDeviations(event, originalEvent), [event, originalEvent])

  // Reset form when the modal opens
  useEffect(() => {
    if (isOpen) {
      setReason('')
    }
  }, [isOpen])

  // Escape handler
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    const wrapped = handler as unknown as EventListener
    window.addEventListener('keydown', wrapped)
    return () => window.removeEventListener('keydown', wrapped)
  }, [isOpen, onCancel])

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      if (!reason.trim()) return

      const payload: DeviationSavePayload = {
        eventId: event.eventId,
        deviationType: 'operator',
        deviationCode: 'detected',
        expectedValue: changes.map((c) => c.originalValue).join(' | '),
        actualValue: changes.map((c) => c.actualValue).join(' | '),
        notes: reason.trim(),
        severity: 'warning',
        reportedBy: 'current-operator',
        reportedAt: new Date().toISOString(),
        reason: reason.trim(),
        changes,
      }

      onSave(payload)
    },
    [event, changes, reason, onSave],
  )

  if (!isOpen) return null

  const hasDeviations = changes.length > 0

  return (
    <div className="deviation-recorder" data-testid="deviation-recorder" role="dialog" aria-modal="true" aria-labelledby="deviation-recorder-title">
      {/* Overlay */}
      <div
        className="deviation-recorder__overlay"
        onClick={onCancel}
        data-testid="deviation-recorder-overlay"
      />

      {/* Card */}
      <div className="deviation-recorder__card">
        <h3 id="deviation-recorder-title" className="deviation-recorder__title">
          Record Deviation
        </h3>

        {/* Event identifier */}
        <div className="deviation-recorder__event-id">
          Event <code>{event.eventId}</code>
        </div>

        {/* Detected changes */}
        {hasDeviations ? (
          <div className="deviation-recorder__changes" data-testid="deviation-recorder-changes">
            <div className="deviation-recorder__changes-header">
              Detected changes ({changes.length})
            </div>
            <ul className="deviation-recorder__change-list">
              {changes.map((change) => (
                <li key={change.field} className="deviation-recorder__change-item" data-testid="deviation-recorder-change-item">
                  <span className="deviation-recorder__change-field">{change.field}</span>
                  <div className="deviation-recorder__change-values">
                    <span className="deviation-recorder__value-original" data-testid="original-value">
                      {change.originalValue}
                    </span>
                    <span className="deviation-recorder__change-arrow">{'→'}</span>
                    <span className="deviation-recorder__value-actual" data-testid="actual-value">
                      {change.actualValue}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="deviation-recorder__no-changes" data-testid="deviation-recorder-no-changes">
            No automatic deviations detected. Use the field below to document manually.
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="deviation-recorder__form">
          <div className="deviation-recorder__field">
            <label htmlFor="deviation-reason" className="deviation-recorder__label">
              Reason <span className="deviation-recorder__required">*</span>
            </label>
            <textarea
              id="deviation-reason"
              className="deviation-recorder__textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why did this deviation occur?"
              rows={4}
              required
              data-testid="deviation-recorder-reason"
            />
          </div>

          <div className="deviation-recorder__actions">
            <button
              type="button"
              className="deviation-recorder__btn deviation-recorder__btn--secondary"
              onClick={onCancel}
              data-testid="deviation-recorder-cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="deviation-recorder__btn deviation-recorder__btn--primary"
              disabled={!reason.trim()}
              data-testid="deviation-recorder-save"
            >
              Save Deviation
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .deviation-recorder {
          position: fixed;
          inset: 0;
          z-index: 60;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .deviation-recorder__overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
        }

        .deviation-recorder__card {
          position: relative;
          z-index: 1;
          background: var(--cl-bg-elev, #161b22);
          border: 1px solid var(--cl-border, #2b3340);
          border-radius: 12px;
          padding: 1.5rem;
          width: 100%;
          max-width: 560px;
          max-height: 90vh;
          overflow-y: auto;
          color: var(--cl-text, #e6edf3);
        }

        .deviation-recorder__title {
          font-size: 1.125rem;
          font-weight: 600;
          margin: 0 0 0.75rem;
          color: var(--cl-text, #e6edf3);
        }

        .deviation-recorder__event-id {
          padding: 0.5rem 0.75rem;
          margin-bottom: 1rem;
          background: var(--cl-accent-soft, rgba(88, 166, 255, 0.12));
          border-radius: 6px;
          font-size: 0.8125rem;
          color: var(--cl-text-dim, #8a93a0);
        }

        .deviation-recorder__event-id code {
          color: var(--cl-accent, #58a6ff);
          font-weight: 500;
        }

        .deviation-recorder__changes {
          margin-bottom: 1.25rem;
        }

        .deviation-recorder__changes-header {
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--cl-text-dim, #8a93a0);
          margin-bottom: 0.5rem;
        }

        .deviation-recorder__change-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .deviation-recorder__change-item {
          padding: 0.5rem 0.75rem;
          background: var(--cl-bg-elev-2, #1c232c);
          border-radius: 6px;
          border-left: 3px solid var(--cl-warn, #d29922);
        }

        .deviation-recorder__change-field {
          display: block;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--cl-warn, #d29922);
          text-transform: uppercase;
          letter-spacing: 0.025em;
          margin-bottom: 0.25rem;
        }

        .deviation-recorder__change-values {
          display: flex;
          align-items: baseline;
          gap: 0.5rem;
          flex-wrap: wrap;
          font-size: 0.875rem;
        }

        .deviation-recorder__value-original {
          text-decoration: line-through;
          color: var(--cl-danger, #f85149);
          opacity: 0.8;
        }

        .deviation-recorder__change-arrow {
          color: var(--cl-text-faint, #5a6270);
          font-size: 0.75rem;
        }

        .deviation-recorder__value-actual {
          color: var(--cl-accent, #58a6ff);
          font-weight: 500;
          background: var(--cl-accent-soft, rgba(88, 166, 255, 0.12));
          padding: 0.125rem 0.375rem;
          border-radius: 4px;
        }

        .deviation-recorder__no-changes {
          margin-bottom: 1.25rem;
          padding: 0.75rem;
          background: var(--cl-bg-elev-2, #1c232c);
          border-radius: 6px;
          font-size: 0.875rem;
          color: var(--cl-text-dim, #8a93a0);
          border-left: 3px solid var(--cl-accent, #58a6ff);
        }

        .deviation-recorder__form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .deviation-recorder__field {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }

        .deviation-recorder__label {
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--cl-text, #e6edf3);
        }

        .deviation-recorder__required {
          color: var(--cl-danger, #f85149);
        }

        .deviation-recorder__textarea {
          padding: 0.5rem 0.75rem;
          border: 1px solid var(--cl-border, #2b3340);
          border-radius: 6px;
          font-family: inherit;
          font-size: 0.875rem;
          color: var(--cl-text, #e6edf3);
          background: var(--cl-bg, #0e1116);
          resize: vertical;
          line-height: 1.5;
        }

        .deviation-recorder__textarea:focus {
          outline: none;
          border-color: var(--cl-accent, #58a6ff);
          box-shadow: 0 0 0 2px var(--cl-accent-soft, rgba(88, 166, 255, 0.12));
        }

        .deviation-recorder__actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
        }

        .deviation-recorder__btn {
          padding: 0.5rem 1rem;
          border-radius: 6px;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
        }

        .deviation-recorder__btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .deviation-recorder__btn--secondary {
          background: transparent;
          border: 1px solid var(--cl-border, #2b3340);
          color: var(--cl-text, #e6edf3);
        }

        .deviation-recorder__btn--secondary:hover:not(:disabled) {
          background: var(--cl-bg-elev-2, #1c232c);
        }

        .deviation-recorder__btn--primary {
          background: var(--cl-accent, #58a6ff);
          border: 1px solid var(--cl-accent, #58a6ff);
          color: var(--cl-on-accent, #0e1116);
        }

        .deviation-recorder__btn--primary:hover:not(:disabled) {
          filter: brightness(1.1);
        }
      `}</style>
    </div>
  )
}

export default DeviationRecorder
