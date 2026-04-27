/**
 * ProtocolIdeLabContextPanel — side panel showing resolved lab context
 * with editable values and provenance badges.
 *
 * Displays labwareKind, plateCount, sampleCount with their resolved values
 * and source badges (default / directive / manual).
 *
 * Manual overrides take precedence over directive-driven overrides take
 * precedence over defaults.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import './ProtocolIdeLabContextPanel.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LabContextSource = 'default' | 'directive' | 'manual'

export interface LabContextPanelProps {
  labContext: {
    labwareKind: string
    plateCount: number
    sampleCount: number
    source: {
      labwareKind: LabContextSource
      plateCount: LabContextSource
      sampleCount: LabContextSource
    }
  }
  onOverride: (
    overrides: { labwareKind?: string; plateCount?: number; sampleCount?: number },
  ) => Promise<void>
}

// ---------------------------------------------------------------------------
// Source badge — small colored label indicating provenance
// ---------------------------------------------------------------------------

function SourceBadge({ source }: { source: LabContextSource }) {
  const styles: Record<LabContextSource, { color: string; label: string }> = {
    default: { color: 'gray', label: 'default' },
    directive: { color: '#2563eb', label: 'from directive' },
    manual: { color: '#16a34a', label: 'manual' },
  }
  const { color, label } = styles[source]
  return (
    <span
      className="lab-context-source-badge"
      data-testid={`lab-context-source-${source}`}
      style={{ color, fontSize: '0.75em', fontWeight: 500 }}
    >
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Single row — label + editable input + source badge
// ---------------------------------------------------------------------------

function LabContextRow({
  label,
  value,
  type,
  source,
  onChange,
}: {
  label: string
  value: string | number
  type: 'text' | 'number'
  source: LabContextSource
  onChange: (newValue: string | number) => void
}) {
  const [localValue, setLocalValue] = useState(String(value))
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync localValue when the prop value changes
  useEffect(() => {
    setLocalValue(String(value))
  }, [value])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      setLocalValue(raw)

      // Debounce 500ms before calling onChange
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        if (type === 'number') {
          const num = parseInt(raw, 10)
          if (!isNaN(num) && num > 0) {
            onChange(num)
          }
        } else {
          onChange(raw)
        }
      }, 500)
    },
    [type, onChange],
  )

  return (
    <div className="lab-context-row" data-testid={`lab-context-row-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <span className="lab-context-label">{label}</span>
      <input
        type={type}
        value={localValue as string}
        onChange={handleChange}
        className="lab-context-input"
        data-testid={`lab-context-input-${label.toLowerCase().replace(/\s+/g, '-')}`}
      />
      <SourceBadge source={source} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function ProtocolIdeLabContextPanel({
  labContext,
  onOverride,
}: LabContextPanelProps): JSX.Element {
  const handleOverride = useCallback(
    (field: string, newValue: string | number) => {
      const overrides: { labwareKind?: string; plateCount?: number; sampleCount?: number } = {}
      if (field === 'labwareKind') {
        overrides.labwareKind = newValue as string
      } else if (field === 'plateCount') {
        overrides.plateCount = newValue as number
      } else if (field === 'sampleCount') {
        overrides.sampleCount = newValue as number
      }
      onOverride(overrides)
    },
    [onOverride],
  )

  return (
    <div className="lab-context-panel" data-testid="lab-context-panel">
      <h3 className="lab-context-panel-title" data-testid="lab-context-panel-title">
        Lab Context
      </h3>
      <div className="lab-context-rows">
        <LabContextRow
          label="Labware Kind"
          value={labContext.labwareKind}
          type="text"
          source={labContext.source.labwareKind}
          onChange={(v) => handleOverride('labwareKind', v)}
        />
        <LabContextRow
          label="Plate Count"
          value={labContext.plateCount}
          type="number"
          source={labContext.source.plateCount}
          onChange={(v) => handleOverride('plateCount', v)}
        />
        <LabContextRow
          label="Sample Count"
          value={labContext.sampleCount}
          type="number"
          source={labContext.source.sampleCount}
          onChange={(v) => handleOverride('sampleCount', v)}
        />
      </div>
    </div>
  )
}
