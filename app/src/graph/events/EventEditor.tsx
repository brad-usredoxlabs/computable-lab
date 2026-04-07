/**
 * EventEditor component - Dynamic form for editing event parameters.
 * Renders type-specific form based on event_type.
 */

import { useState, useCallback, useEffect } from 'react'
import type { PlateEvent, EventType, EventDetails } from '../../types/events'
import { EVENT_TYPE_LABELS, EVENT_TYPE_ICONS } from '../../types/events'
import type { WellId } from '../../types/plate'
import { useSelection } from '../../shared/context/SelectionContext'
import { formatWellList } from '../../shared/utils/wellUtils'

// Form components for each event type
import { AddMaterialForm } from './forms/AddMaterialForm'
import { TransferForm } from './forms/TransferForm'
import { MultiDispenseForm } from './forms/MultiDispenseForm'
import { MixForm } from './forms/MixForm'
import { WashForm } from './forms/WashForm'
import { IncubateForm } from './forms/IncubateForm'
import { ReadForm } from './forms/ReadForm'
import { HarvestForm } from './forms/HarvestForm'
import { OtherForm } from './forms/OtherForm'

interface EventEditorProps {
  event: PlateEvent
  onSave: (event: PlateEvent) => void
  onCancel: () => void
}

/**
 * Wells selector with integration to plate selection
 */
export function WellsSelector({
  value,
  onChange,
  label = 'Wells',
}: {
  value: WellId[]
  onChange: (wells: WellId[]) => void
  label?: string
}) {
  const { state } = useSelection()
  
  const handleUseSelection = useCallback(() => {
    if (state.selectedWells.size > 0) {
      onChange(Array.from(state.selectedWells))
    }
  }, [state.selectedWells, onChange])

  const displayValue = formatWellList(value)

  return (
    <div className="form-field wells-selector">
      <label>{label}</label>
      <div className="wells-selector__input">
        <input
          type="text"
          value={displayValue}
          onChange={(e) => {
            // Parse comma-separated well IDs
            const wells = e.target.value
              .split(',')
              .map((w) => w.trim().toUpperCase())
              .filter((w) => w.length > 0)
            onChange(wells)
          }}
          placeholder="A1, A2, B1, ..."
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={handleUseSelection}
          disabled={state.selectedWells.size === 0}
          title={state.selectedWells.size > 0 
            ? `Use ${state.selectedWells.size} selected wells` 
            : 'Select wells on plate first'}
        >
          Use Selection ({state.selectedWells.size})
        </button>
      </div>
      <style>{`
        .wells-selector__input {
          display: flex;
          gap: 0.5rem;
        }
        .wells-selector__input input {
          flex: 1;
        }
      `}</style>
    </div>
  )
}

/**
 * Volume input with unit selector
 */
export function VolumeInput({
  value,
  onChange,
  label = 'Volume',
}: {
  value?: { value: number; unit: string }
  onChange: (volume: { value: number; unit: string } | undefined) => void
  label?: string
}) {
  return (
    <div className="form-field volume-input">
      <label>{label}</label>
      <div className="volume-input__fields">
        <input
          type="number"
          value={value?.value ?? ''}
          onChange={(e) => {
            const num = parseFloat(e.target.value)
            if (!isNaN(num)) {
              onChange({ value: num, unit: value?.unit || 'µL' })
            } else if (e.target.value === '') {
              onChange(undefined)
            }
          }}
          placeholder="0"
          min="0"
          step="any"
        />
        <select
          value={value?.unit || 'µL'}
          onChange={(e) => {
            if (value) {
              onChange({ ...value, unit: e.target.value })
            }
          }}
        >
          <option value="µL">µL</option>
          <option value="mL">mL</option>
          <option value="L">L</option>
          <option value="nL">nL</option>
        </select>
      </div>
      <style>{`
        .volume-input__fields {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }
        .volume-input__fields input {
          flex: 1;
          min-width: 80px;
          max-width: 180px;
          font-size: 1rem;
          padding: 0.5rem 0.75rem;
        }
        .volume-input__fields select {
          width: 70px;
          font-size: 1rem;
          padding: 0.5rem;
        }
      `}</style>
    </div>
  )
}

/**
 * Temperature input with unit selector
 */
export function TemperatureInput({
  value,
  onChange,
  label = 'Temperature',
}: {
  value?: { value: number; unit: string }
  onChange: (temp: { value: number; unit: string } | undefined) => void
  label?: string
}) {
  return (
    <div className="form-field temperature-input">
      <label>{label}</label>
      <div className="temperature-input__fields">
        <input
          type="number"
          value={value?.value ?? ''}
          onChange={(e) => {
            const num = parseFloat(e.target.value)
            if (!isNaN(num)) {
              onChange({ value: num, unit: value?.unit || '°C' })
            } else if (e.target.value === '') {
              onChange(undefined)
            }
          }}
          placeholder="37"
          step="0.1"
        />
        <select
          value={value?.unit || '°C'}
          onChange={(e) => {
            if (value) {
              onChange({ ...value, unit: e.target.value })
            }
          }}
        >
          <option value="°C">°C</option>
          <option value="°F">°F</option>
          <option value="K">K</option>
        </select>
      </div>
      <style>{`
        .temperature-input__fields {
          display: flex;
          gap: 0.5rem;
        }
        .temperature-input__fields input {
          flex: 1;
          max-width: 100px;
        }
        .temperature-input__fields select {
          width: 60px;
        }
      `}</style>
    </div>
  )
}

/**
 * Duration input (ISO 8601 duration)
 */
export function DurationInput({
  value,
  onChange,
  label = 'Duration',
}: {
  value?: string
  onChange: (duration: string | undefined) => void
  label?: string
}) {
  // Parse ISO duration to hours/minutes
  const parseIsoDuration = (iso: string | undefined): { hours: number; minutes: number } => {
    if (!iso) return { hours: 0, minutes: 0 }
    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
    return {
      hours: match?.[1] ? parseInt(match[1]) : 0,
      minutes: match?.[2] ? parseInt(match[2]) : 0,
    }
  }

  const toIsoDuration = (hours: number, minutes: number): string => {
    const parts = ['PT']
    if (hours > 0) parts.push(`${hours}H`)
    if (minutes > 0 || hours === 0) parts.push(`${minutes}M`)
    return parts.join('')
  }

  const parsed = parseIsoDuration(value)

  return (
    <div className="form-field duration-input">
      <label>{label}</label>
      <div className="duration-input__fields">
        <input
          type="number"
          value={parsed.hours || ''}
          onChange={(e) => {
            const h = parseInt(e.target.value) || 0
            onChange(toIsoDuration(h, parsed.minutes))
          }}
          placeholder="0"
          min="0"
        />
        <span>h</span>
        <input
          type="number"
          value={parsed.minutes || ''}
          onChange={(e) => {
            const m = parseInt(e.target.value) || 0
            onChange(toIsoDuration(parsed.hours, m))
          }}
          placeholder="0"
          min="0"
          max="59"
        />
        <span>m</span>
      </div>
      <style>{`
        .duration-input__fields {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }
        .duration-input__fields input {
          width: 60px;
        }
        .duration-input__fields span {
          color: #666;
        }
      `}</style>
    </div>
  )
}

/**
 * EventEditor - Main editor component
 */
export function EventEditor({ event, onSave, onCancel }: EventEditorProps) {
  const [editedEvent, setEditedEvent] = useState<PlateEvent>({ ...event })

  // Reset when event changes
  useEffect(() => {
    setEditedEvent({ ...event })
  }, [event])

  const handleTypeChange = useCallback((newType: EventType) => {
    setEditedEvent((prev) => ({
      ...prev,
      event_type: newType,
      details: (newType === 'transfer' || newType === 'multi_dispense')
        ? { source_wells: [], dest_wells: [] }
        : { wells: [] },
    }))
  }, [])

  const handleDetailsChange = useCallback((details: EventDetails) => {
    setEditedEvent((prev) => ({ ...prev, details }))
  }, [])

  const handleSave = useCallback(() => {
    onSave(editedEvent)
  }, [editedEvent, onSave])

  // Render type-specific form
  const renderForm = () => {
    const props = {
      details: editedEvent.details,
      onChange: handleDetailsChange,
    }

    switch (editedEvent.event_type) {
      case 'add_material':
        return <AddMaterialForm {...props} />
      case 'transfer':
        return <TransferForm {...props} />
      case 'multi_dispense':
        return <MultiDispenseForm {...props} />
      case 'mix':
        return <MixForm {...props} />
      case 'wash':
        return <WashForm {...props} />
      case 'incubate':
        return <IncubateForm {...props} />
      case 'read':
        return <ReadForm {...props} />
      case 'harvest':
        return <HarvestForm {...props} />
      case 'other':
        return <OtherForm {...props} />
      default:
        return <p>Unknown event type</p>
    }
  }

  return (
    <div className="event-editor">
      <div className="event-editor__header">
        <h3>Edit Event</h3>
      </div>

      <div className="event-editor__form">
        {/* Event Type Selector */}
        <div className="form-field">
          <label>Event Type</label>
          <select
            value={editedEvent.event_type}
            onChange={(e) => handleTypeChange(e.target.value as EventType)}
          >
            {Object.entries(EVENT_TYPE_LABELS).map(([type, label]) => (
              <option key={type} value={type}>
                {EVENT_TYPE_ICONS[type as EventType]} {label}
              </option>
            ))}
          </select>
        </div>

        {/* Time Offset */}
        <DurationInput
          label="Time Offset"
          value={editedEvent.t_offset}
          onChange={(duration) => setEditedEvent((prev) => ({ 
            ...prev, 
            t_offset: duration 
          }))}
        />

        {/* Notes */}
        <div className="form-field">
          <label>Notes</label>
          <textarea
            value={editedEvent.notes || ''}
            onChange={(e) => setEditedEvent((prev) => ({ 
              ...prev, 
              notes: e.target.value || undefined 
            }))}
            placeholder="Optional notes..."
            rows={2}
          />
        </div>

        <hr />

        {/* Type-specific form */}
        <div className="event-editor__details">
          {renderForm()}
        </div>
      </div>

      <div className="event-editor__actions">
        <button onClick={onCancel} className="btn btn-secondary">
          Cancel
        </button>
        <button onClick={handleSave} className="btn btn-primary">
          Save
        </button>
      </div>

      <style>{`
        .event-editor {
          background: white;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .event-editor__header {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid #e9ecef;
        }
        .event-editor__header h3 {
          margin: 0;
          font-size: 1rem;
        }
        .event-editor__form {
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
        }
        .event-editor__details {
          margin-top: 1rem;
        }
        .event-editor__actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          border-top: 1px solid #e9ecef;
        }
        .form-field {
          margin-bottom: 1rem;
        }
        .form-field label {
          display: block;
          margin-bottom: 0.25rem;
          font-weight: 500;
          font-size: 0.875rem;
          color: #495057;
        }
        .form-field input,
        .form-field select,
        .form-field textarea {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 1px solid #ced4da;
          border-radius: 4px;
          font-size: 1rem;
        }
        .form-field input:focus,
        .form-field select:focus,
        .form-field textarea:focus {
          outline: none;
          border-color: #228be6;
          box-shadow: 0 0 0 2px rgba(34, 139, 230, 0.2);
        }
        hr {
          border: none;
          border-top: 1px solid #e9ecef;
          margin: 1rem 0;
        }
      `}</style>
    </div>
  )
}
