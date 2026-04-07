/**
 * Compact input components for ribbon-style event editor.
 * Designed to be ~60-80px wide with inline labels.
 */

import type { WellId } from '../../../../types/plate'
import { CONCENTRATION_UNITS, withInferredConcentrationBasis, type ConcentrationValue } from '../../../../types/material'
import { formatWellList } from '../../../../shared/utils/wellUtils'

/**
 * Compact volume input with inline unit selector
 */
export function CompactVolumeInput({
  value,
  onChange,
}: {
  value?: { value: number; unit: string }
  onChange: (volume: { value: number; unit: string } | undefined) => void
}) {
  return (
    <div className="compact-field">
      <span className="compact-field__label">Vol</span>
      <div className="compact-input compact-volume">
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
            } else {
              onChange({ value: 0, unit: e.target.value })
            }
          }}
        >
          <option value="µL">µL</option>
          <option value="mL">mL</option>
          <option value="nL">nL</option>
        </select>
      </div>
    </div>
  )
}

/**
 * Compact concentration input
 */
export function CompactConcentrationInput({
  value,
  onChange,
}: {
  value?: ConcentrationValue
  onChange: (conc: ConcentrationValue | undefined) => void
}) {
  return (
    <div className="compact-field">
      <span className="compact-field__label">Conc</span>
      <div className="compact-input compact-concentration">
        <input
          type="number"
          value={value?.value ?? ''}
          onChange={(e) => {
            const num = parseFloat(e.target.value)
            if (!isNaN(num)) {
              onChange(withInferredConcentrationBasis({ value: num, unit: value?.unit || 'uM' }))
            } else if (e.target.value === '') {
              onChange(undefined)
            }
          }}
          placeholder="0"
          min="0"
          step="any"
        />
        <select
          value={value?.unit || 'uM'}
          onChange={(e) => {
            const next = withInferredConcentrationBasis({ value: value?.value ?? 0, unit: e.target.value })
            if (value) onChange(next)
          }}
        >
          {CONCENTRATION_UNITS.map((unit) => (
            <option key={unit.value} value={unit.value}>{unit.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

/**
 * Compact duration input (hours + minutes)
 */
export function CompactDurationInput({
  value,
  onChange,
}: {
  value?: string
  onChange: (duration: string | undefined) => void
}) {
  // Parse ISO duration
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
    <div className="compact-field">
      <span className="compact-field__label">Time</span>
      <div className="compact-input compact-duration">
        <input
          type="number"
          value={parsed.hours || ''}
          onChange={(e) => {
            const h = parseInt(e.target.value) || 0
            onChange(toIsoDuration(h, parsed.minutes))
          }}
          placeholder="0"
          min="0"
          title="Hours"
        />
        <span className="compact-duration__unit">h</span>
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
          title="Minutes"
        />
        <span className="compact-duration__unit">m</span>
      </div>
    </div>
  )
}

/**
 * Compact temperature input
 */
export function CompactTemperatureInput({
  value,
  onChange,
}: {
  value?: { value: number; unit: string }
  onChange: (temp: { value: number; unit: string } | undefined) => void
}) {
  return (
    <div className="compact-field">
      <span className="compact-field__label">Temp</span>
      <div className="compact-input compact-temperature">
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
    </div>
  )
}

/**
 * Compact wells display with button to use selection
 */
export function CompactWellsDisplay({
  wells,
  onChange,
  selectionCount,
  onUseSelection,
  label = 'Wells',
}: {
  wells: WellId[]
  onChange: (wells: WellId[]) => void
  selectionCount?: number
  onUseSelection?: () => void
  label?: string
}) {
  const displayValue = formatWellList(wells)
  const wellCount = wells.length

  return (
    <div className="compact-field compact-wells">
      <span className="compact-field__label">{label}</span>
      <div className="compact-input">
        <input
          type="text"
          value={displayValue}
          onChange={(e) => {
            const newWells = e.target.value
              .split(',')
              .map((w) => w.trim().toUpperCase())
              .filter((w) => w.length > 0)
            onChange(newWells)
          }}
          placeholder="A1, A2..."
          title={`${wellCount} wells: ${displayValue}`}
        />
        {onUseSelection && (
          <button
            type="button"
            className="compact-wells__btn"
            onClick={onUseSelection}
            disabled={!selectionCount || selectionCount === 0}
            title={selectionCount ? `Use ${selectionCount} selected wells` : 'Select wells first'}
          >
            ← {selectionCount || 0}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Compact speed/RPM input
 */
export function CompactSpeedInput({
  value,
  onChange,
}: {
  value?: number
  onChange: (speed: number | undefined) => void
}) {
  return (
    <div className="compact-field">
      <span className="compact-field__label">RPM</span>
      <div className="compact-input">
        <input
          type="number"
          value={value ?? ''}
          onChange={(e) => {
            const num = parseInt(e.target.value)
            onChange(!isNaN(num) ? num : undefined)
          }}
          placeholder="300"
          min="0"
          step="10"
        />
      </div>
    </div>
  )
}

/**
 * Compact cycles input
 */
export function CompactCyclesInput({
  value,
  onChange,
}: {
  value?: number
  onChange: (cycles: number | undefined) => void
}) {
  return (
    <div className="compact-field">
      <span className="compact-field__label">×</span>
      <div className="compact-input">
        <input
          type="number"
          value={value ?? ''}
          onChange={(e) => {
            const num = parseInt(e.target.value)
            onChange(!isNaN(num) ? num : undefined)
          }}
          placeholder="3"
          min="1"
          style={{ width: 76 }}
        />
      </div>
    </div>
  )
}

/**
 * Compact dead volume / overage input for multi-dispense transfers
 */
export function CompactDeadVolumeInput({
  value,
  onChange,
}: {
  value?: { value: number; unit: 'uL' | 'mL' | '%' }
  onChange: (deadVol: { value: number; unit: 'uL' | 'mL' | '%' } | undefined) => void
}) {
  return (
    <div className="compact-field">
      <span className="compact-field__label" title="Dead volume / overage (extra volume aspirated and discarded)">+Extra</span>
      <div className="compact-input compact-dead-volume">
        <input
          type="number"
          value={value?.value ?? ''}
          onChange={(e) => {
            const num = parseFloat(e.target.value)
            if (!isNaN(num)) {
              onChange({ value: num, unit: value?.unit || 'uL' })
            } else if (e.target.value === '') {
              onChange(undefined)
            }
          }}
          placeholder="0"
          min="0"
          step="any"
          title="Extra volume aspirated for pipette accuracy"
        />
        <select
          value={value?.unit || 'uL'}
          onChange={(e) => {
            const unit = e.target.value as 'uL' | 'mL' | '%'
            if (value) {
              onChange({ ...value, unit })
            } else {
              onChange({ value: 0, unit })
            }
          }}
          title="Unit: µL, mL, or % of total transfer"
        >
          <option value="uL">µL</option>
          <option value="mL">mL</option>
          <option value="%">%</option>
        </select>
      </div>
    </div>
  )
}

/**
 * Shared styles for compact inputs
 */
export function CompactInputStyles() {
  return (
    <style>{`
      .compact-field {
        display: flex;
        align-items: center;
        gap: 0.375rem;
      }

      .compact-field__label {
        font-size: 0.7rem;
        color: #868e96;
        text-transform: uppercase;
        font-weight: 500;
        white-space: nowrap;
        min-width: 28px;
      }

      .compact-input {
        display: flex;
        align-items: center;
        gap: 0.125rem;
      }

      .compact-input input {
        width: 76px;
        height: 28px;
        padding: 0.25rem 0.375rem;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        font-size: 0.85rem;
        text-align: right;
        font-variant-numeric: tabular-nums;
      }

      .compact-input input[type="number"] {
        min-width: 5.5ch;
      }

      .compact-input input:focus {
        outline: none;
        border-color: #339af0;
        box-shadow: 0 0 0 2px rgba(51, 154, 240, 0.2);
      }

      .compact-input select {
        height: 28px;
        padding: 0.125rem 0.25rem;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        font-size: 0.8rem;
        background: white;
        cursor: pointer;
      }

      .compact-input select:focus {
        outline: none;
        border-color: #339af0;
      }

      .compact-volume input {
        width: 76px;
      }

      .compact-volume select {
        width: 45px;
      }

      .compact-concentration input {
        width: 76px;
      }

      .compact-concentration select {
        width: 60px;
      }

      .compact-duration input {
        width: 56px;
        text-align: center;
      }

      .compact-duration__unit {
        font-size: 0.75rem;
        color: #868e96;
        margin: 0 0.125rem;
      }

      .compact-temperature input {
        width: 76px;
      }

      .compact-temperature select {
        width: 40px;
      }

      .compact-wells input {
        width: 100px;
        text-align: left;
      }

      .compact-input--note input {
        width: 150px;
        text-align: left;
      }

      .compact-wells__btn {
        height: 28px;
        padding: 0 0.5rem;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        background: #f8f9fa;
        font-size: 0.75rem;
        cursor: pointer;
        white-space: nowrap;
      }

      .compact-wells__btn:hover:not(:disabled) {
        background: #e9ecef;
        border-color: #adb5bd;
      }

      .compact-wells__btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `}</style>
  )
}
