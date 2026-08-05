/**
 * Mode toggle component for switching between Protocol Planning, Design (plan)
 * and Execute modes. Persists the mode in the URL query parameter
 * (?mode=protocol-planning|execute).
 */

import { useSearchParams } from 'react-router-dom'

export type RunMode = 'protocol-planning' | 'plan' | 'execute'

export interface ModeToggleProps {
  mode: RunMode
  onChange: (mode: RunMode) => void
}

const MODES: Array<{ value: RunMode; label: string }> = [
  { value: 'protocol-planning', label: 'Protocol Planning' },
  { value: 'plan', label: 'Design' },
  { value: 'execute', label: 'Execute' },
]

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="mode-toggle" data-testid="mode-toggle">
      {MODES.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          className={`mode-toggle__button ${mode === value ? 'mode-toggle__button--active' : ''}`}
          onClick={() => onChange(value)}
          aria-pressed={mode === value}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/**
 * Hook to read and update the mode from URL query params.
 * Returns current mode and a function to change it.
 */
export function useModeToggle() {
  const [searchParams, setSearchParams] = useSearchParams()

  const raw = searchParams.get('mode')
  const mode: RunMode = raw === 'execute' ? 'execute' : raw === 'protocol-planning' ? 'protocol-planning' : 'plan'

  const setMode = (newMode: RunMode) => {
    const params = new URLSearchParams(searchParams)
    if (newMode === 'plan') {
      params.delete('mode')
    } else {
      params.set('mode', newMode)
    }
    setSearchParams(params)
  }

  return { mode, setMode }
}
