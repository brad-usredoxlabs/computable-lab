/**
 * SettingsPanel — Editable panel for step-level protocol parameters.
 *
 * Renders a settings form with type-aware inputs (number, string, boolean,
 * duration, temperature, volume, select). Tracks pending edits and fires
 * onSave only when the user explicitly confirms changes.
 *
 * Usage:
 *   <SettingsPanel
 *     stepId="step-1"
 *     settings={[...]}
 *     onSave={(stepId, changes) => { ... }}
 *   />
 */

import { useCallback, useEffect, useState } from 'react'

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

/** The supported input types for a step-level setting. */
export type SettingType =
  | 'number'
  | 'string'
  | 'boolean'
  | 'duration'
  | 'temperature'
  | 'volume'
  | 'select'

/** A single editable setting for a protocol step. */
export interface StepSetting {
  /** Stable identifier within the step. */
  id: string
  /** Human-readable label shown in the UI. */
  name: string
  /** Input type that determines the rendered widget. */
  type: SettingType
  /** Default / current value. */
  defaultValue?: any
  /** Options for `select`-type settings. */
  options?: string[]
  /** Unit hint displayed alongside the value (e.g. "°C", "mL", "min"). */
  unit?: string
  /** Minimum value for numeric inputs. */
  min?: number
  /** Maximum value for numeric inputs. */
  max?: number
  /** Whether this setting may be edited at all (locked settings are read-only). */
  readOnly?: boolean
}

/** Shape of the changes object passed to onSave. */
export type SettingChanges = Record<string, any>

/** Props for the SettingsPanel component. */
export interface SettingsPanelProps {
  /** The step this panel belongs to. */
  stepId: string
  /** Array of settings to render. */
  settings: StepSetting[]
  /** Called when the user confirms changes. Receives { stepId, changes }. */
  onSave: (stepId: string, changes: SettingChanges) => void
  /** Optional className override for the root element. */
  className?: string
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/**
 * Map a setting's abstract type to the appropriate HTML input type.
 */
function getInputType(settingType: SettingType): 'text' | 'number' | 'checkbox' | 'select' {
  if (settingType === 'boolean') return 'checkbox'
  if (settingType === 'select') return 'select'
  if (
    settingType === 'number' ||
    settingType === 'temperature' ||
    settingType === 'volume' ||
    settingType === 'duration'
  ) {
    return 'number'
  }
  return 'text'
}

/**
 * Get a human-readable placeholder based on the setting type.
 */
function getTypePlaceholder(type: SettingType): string {
  switch (type) {
    case 'number':
      return 'Enter a number'
    case 'duration':
      return 'e.g. 30'
    case 'temperature':
      return 'e.g. 37'
    case 'volume':
      return 'e.g. 100'
    case 'boolean':
      return ''
    case 'select':
      return 'Choose...'
    default:
      return ''
  }
}

/**
 * Validate a value against a setting's constraints.
 * Returns an error message or null if valid.
 *
 * @deprecated Use internal validation in SettingsPanel; exported for testing.
 */
export function validateSetting(setting: StepSetting, value: any): string | null {
  const inputType = getInputType(setting.type)

  // Booleans are always valid
  if (setting.type === 'boolean') return null

  // Select values must be in the options list
  if (setting.type === 'select' && setting.options) {
    if (value === '' || value == null) {
      if (setting.options.length === 0) return null
      return 'Please select an option'
    }
    if (!setting.options.includes(value)) return `Invalid option: ${value}`
    return null
  }

  // Numeric types must be valid numbers
  if (inputType === 'number') {
    const num = Number(value)
    if (value === '' || value == null) return null // empty is allowed
    if (isNaN(num)) return `Invalid number: "${value}"`
    if (setting.min !== undefined && num < setting.min) return `Must be >= ${setting.min}`
    if (setting.max !== undefined && num > setting.max) return `Must be <= ${setting.max}`
    return null
  }

  // Strings are always valid
  return null
}

/**
 * Determine whether the settings have been modified from their defaults.
 */
function hasChanges(settings: StepSetting[], values: Record<string, any>): boolean {
  return settings.some((s) => values[s.id] !== undefined && values[s.id] !== s.defaultValue)
}

/* ------------------------------------------------------------------ */
/* Icons                                                                */
/* ------------------------------------------------------------------ */

function SaveIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  )
}

function ResetIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4l5 5M4 4v6h6M20 20l-5-5M20 20v-6h-6"
      />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

export function SettingsPanel({ stepId, settings, onSave, className = '' }: SettingsPanelProps) {
  // Pending values keyed by setting id
  const [values, setValues] = useState<Record<string, any>>({})
  // Validation errors keyed by setting id
  const [errors, setErrors] = useState<Record<string, string | null>>({})

  // Initialize values from defaults when settings change
  useEffect(() => {
    const initial: Record<string, any> = {}
    settings.forEach((s) => {
      initial[s.id] = s.defaultValue
    })
    setValues(initial)
    setErrors({})
  }, [settings])

  // Update a single setting's value
  const handleChange = useCallback(
    (settingId: string, rawValue: string) => {
      setValues((prev) => {
        const next = { ...prev, [settingId]: rawValue }
        // Validate the changed setting immediately
        const setting = settings.find((s) => s.id === settingId)
        if (setting) {
          const inputType = getInputType(setting.type)
          const parsed = inputType === 'number' ? rawValue : rawValue
          const err = validateSetting(setting, parsed)
          setErrors((prevErr) => ({ ...prevErr, [settingId]: err }))
        }
        return next
      })
    },
    [settings],
  )

  // Handle checkbox toggle
  const handleToggle = useCallback(
    (settingId: string, checked: boolean) => {
      setValues((prev) => ({ ...prev, [settingId]: checked }))
    },
    [],
  )

  // Save confirmed changes
  const handleSave = useCallback(() => {
    // Collect only changed values that pass validation
    const changes: SettingChanges = {}
    let hasValidationError = false

    settings.forEach((s) => {
      const val = values[s.id]
      const defaultValue = s.defaultValue
      // Only include settings that differ from default
      if (val !== undefined && val !== defaultValue) {
        const err = validateSetting(s, val)
        if (err) {
          hasValidationError = true
          setErrors((prev) => ({ ...prev, [s.id]: err }))
        } else {
          changes[s.id] = val
        }
      }
    })

    if (hasValidationError) return

    if (Object.keys(changes).length > 0) {
      onSave(stepId, changes)
    }
  }, [stepId, settings, values, onSave])

  // Reset all settings to defaults
  const handleReset = useCallback(() => {
    const initial: Record<string, any> = {}
    settings.forEach((s) => {
      initial[s.id] = s.defaultValue
    })
    setValues(initial)
    setErrors({})
  }, [settings])

  // Check if there are unsaved changes
  const hasUnsavedChanges = hasChanges(settings, values)

  return (
    <div
      className={`settings-panel ${className}`}
      data-testid="settings-panel"
      style={{
        background: 'var(--cl-bg-elev, #1e1e2e)',
        border: '1px solid var(--cl-border, #333)',
        borderRadius: '8px',
        padding: '16px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          paddingBottom: 8,
          borderBottom: '1px solid var(--cl-border, #333)',
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--cl-text, #e0e0e0)',
          }}
        >
          Step Settings
          <span
            style={{
              fontSize: '12px',
              fontWeight: 400,
              color: 'var(--cl-text-dim, #888)',
              marginLeft: 8,
            }}
          >
            ({settings.length})
          </span>
        </h3>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {hasUnsavedChanges && (
            <button
              type="button"
              onClick={handleReset}
              data-testid="reset-button"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                fontSize: '12px',
                background: 'transparent',
                border: '1px solid var(--cl-border, #333)',
                borderRadius: '4px',
                color: 'var(--cl-text-dim, #888)',
                cursor: 'pointer',
              }}
            >
              <ResetIcon />
              Reset
            </button>
          )}

          <button
            type="button"
            onClick={handleSave}
            data-testid="save-button"
            disabled={!hasUnsavedChanges}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 12px',
              fontSize: '12px',
              fontWeight: 500,
              background: hasUnsavedChanges
                ? 'var(--cl-accent, #6366f1)'
                : 'var(--cl-border, #333)',
              border: 'none',
              borderRadius: '4px',
              color: hasUnsavedChanges ? '#fff' : 'var(--cl-text-faint, #555)',
              cursor: hasUnsavedChanges ? 'pointer' : 'not-allowed',
            }}
          >
            <SaveIcon />
            Save
          </button>
        </div>
      </div>

      {/* Settings list */}
      {settings.length === 0 ? (
        <p
          data-testid="empty-settings"
          style={{
            margin: 0,
            padding: '20px 0',
            textAlign: 'center',
            color: 'var(--cl-text-faint, #666)',
            fontSize: '13px',
          }}
        >
          No settings configured for this step.
        </p>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {settings.map((setting) => {
            const inputType = getInputType(setting.type)
            const currentValue = values[setting.id] ?? setting.defaultValue
            const error = errors[setting.id]
            const hasError = !!error

            return (
              <div key={setting.id} data-testid={`setting-${setting.id}`}>
                {/* Label */}
                <label
                  htmlFor={`setting-input-${setting.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: '12px',
                    fontWeight: 500,
                    color: 'var(--cl-text, #e0e0e0)',
                    marginBottom: 4,
                  }}
                >
                  {setting.name}
                  {setting.unit && (
                    <span
                      style={{
                        color: 'var(--cl-text-faint, #666)',
                        fontWeight: 400,
                      }}
                    >
                      ({setting.unit})
                    </span>
                  )}
                  {setting.readOnly && (
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '1px 4px',
                        background: 'rgba(99, 102, 241, 0.15)',
                        color: 'var(--cl-accent, #6366f1)',
                        borderRadius: '3px',
                      }}
                    >
                      locked
                    </span>
                  )}
                </label>

                {/* Error message */}
                {hasError && (
                  <div
                    data-testid={`error-${setting.id}`}
                    style={{
                      fontSize: '11px',
                      color: 'var(--cl-danger, #f85149)',
                      marginBottom: 4,
                    }}
                    role="alert"
                  >
                    {error}
                  </div>
                )}

                {/* Input widget */}
                {inputType === 'checkbox' ? (
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: setting.readOnly ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!currentValue}
                      onChange={(e) => handleToggle(setting.id, e.target.checked)}
                      disabled={setting.readOnly}
                      data-testid={`checkbox-${setting.id}`}
                      style={{
                        width: 16,
                        height: 16,
                        accentColor: 'var(--cl-accent, #6366f1)',
                      }}
                    />
                    <span
                      style={{
                        fontSize: '13px',
                        color: 'var(--cl-text-dim, #aaa)',
                      }}
                    >
                      {currentValue ? 'Yes' : 'No'}
                    </span>
                  </label>
                ) : inputType === 'select' ? (
                  <select
                    id={`setting-input-${setting.id}`}
                    value={currentValue ?? ''}
                    onChange={(e) => handleChange(setting.id, e.target.value)}
                    disabled={setting.readOnly}
                    data-testid={`select-${setting.id}`}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      fontSize: '13px',
                      background: 'var(--cl-bg, #181825)',
                      border: `1px solid ${
                        hasError ? 'var(--cl-danger, #f85149)' : 'var(--cl-border, #333)'
                      }`,
                      borderRadius: '4px',
                      color: 'var(--cl-text, #e0e0e0)',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  >
                    {setting.options?.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`setting-input-${setting.id}`}
                    type={inputType}
                    value={currentValue ?? ''}
                    placeholder={getTypePlaceholder(setting.type)}
                    onChange={(e) => handleChange(setting.id, e.target.value)}
                    disabled={setting.readOnly}
                    min={setting.min}
                    max={setting.max}
                    data-testid={`input-${setting.id}`}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      fontSize: '13px',
                      background: 'var(--cl-bg, #181825)',
                      border: `1px solid ${
                        hasError ? 'var(--cl-danger, #f85149)' : 'var(--cl-border, #333)'
                      }`,
                      borderRadius: '4px',
                      color: 'var(--cl-text, #e0e0e0)',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default SettingsPanel
