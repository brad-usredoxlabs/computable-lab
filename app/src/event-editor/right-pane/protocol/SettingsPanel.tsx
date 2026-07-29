/**
 * SettingsPanel — Inline settings editor for a protocol step.
 *
 * Renders below the selected step chip in ProtocolTabPanel.
 * Displays editable setting rows with label, value, unit, and
 * controlled-parameter indicator. Saves changes via PATCH to
 * /api/protocols/:protocolId/steps/:stepId/settings.
 *
 * Controlled component — parent manages settings state via the
 * `settings` prop. Use the `onSave` callback to persist changes.
 */

import { useCallback, useEffect, useState } from 'react'

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export interface Setting {
  settingId: string
  label: string
  type: string
  description?: string
  defaultValue?: unknown
  isControlled?: boolean
  isVariable?: boolean
  unit?: string
  enum?: unknown[]
  constraints?: Record<string, unknown>
}

export interface SettingsPanelProps {
  /** Protocol ID (same as runId in this context). */
  protocolId: string
  /** Step ID for saving settings. */
  stepId: string
  /** Settings array provided by the parent. */
  settings: Setting[]
  /** Optional callback fired when settings are successfully saved. */
  onSave?: (settings: Setting[]) => void
}

/* ------------------------------------------------------------------ */
/* Icons                                                                */
/* ------------------------------------------------------------------ */

function LockIcon() {
  return (
    <svg className="w-3 h-3 inline-block" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 17a2 2 0 100-4 2 2 0 000 4zm6-9h-1V6a5 5 0 00-10 0v2H5v14h14V8zM7 6a5 5 0 0110 0v2H7V6z" />
    </svg>
  )
}

function SaveIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function LoadingIcon() {
  return (
    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

/** Component */
export function SettingsPanel({ protocolId, stepId, settings, onSave }: SettingsPanelProps) {
  const [draftValues, setDraftValues] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Sync draft values when settings prop changes (new step selected)
  useEffect(() => {
    const initial: Record<string, string> = {}
    for (const s of settings) {
      initial[s.settingId] = String(s.defaultValue ?? '')
    }
    setDraftValues(initial)
    setHasChanges(false)
  }, [settings]);

  const handleValueChange = useCallback((settingId: string, value: string) => {
    setDraftValues(prev => ({ ...prev, [settingId]: value }))
    setHasChanges(true)
  }, [])

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      // Build settings array with updated values
      const updated = settings.map(s => ({
        ...s,
        defaultValue: draftValues[s.settingId] ?? s.defaultValue,
      }))

      const res = await fetch(`/api/protocols/${protocolId}/steps/${stepId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: updated }),
      })

      if (!res.ok) {
        throw new Error(`Failed to save settings: ${res.status}`)
      }

      const data = await res.json()
      const saved = data?.settings ?? updated
      // Update draft values from saved
      const newDraft: Record<string, string> = {}
      for (const s of saved) {
        newDraft[s.settingId] = String(s.defaultValue ?? '')
      }
      setDraftValues(newDraft)
      setHasChanges(false)
      onSave?.(saved)
    } catch (err) {
      console.error('Error saving step settings:', err)
    } finally {
      setIsSaving(false)
    }
  }, [protocolId, stepId, settings, draftValues, onSave])

  if (settings.length === 0) {
    return null
  }

  return (
    <div
      style={{
        marginTop: '4px',
        padding: '8px',
        background: 'var(--cl-bg)',
        borderRadius: '4px',
        border: '1px solid var(--cl-border)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '6px',
        }}
      >
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--cl-text-dim)',
          }}
        >
          Settings
        </span>
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              padding: '2px 8px',
              fontSize: '10px',
              fontWeight: 600,
              background: 'var(--cl-accent)',
              color: '#fff',
              border: 'none',
              borderRadius: '3px',
              cursor: isSaving ? 'default' : 'pointer',
              opacity: isSaving ? 0.5 : 1,
            }}
          >
            {isSaving ? <LoadingIcon /> : <SaveIcon />}
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {settings.map((setting) => (
          <div
            key={setting.settingId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
            }}
          >
            {/* Label */}
            <span
              style={{
                color: 'var(--cl-text-dim)',
                minWidth: '80px',
                flexShrink: 0,
              }}
              title={setting.description ?? setting.label}
            >
              {setting.label}
              {setting.isControlled && (
                <span style={{ marginLeft: '3px', color: 'var(--cl-warn)' }} title="Controlled parameter">
                  <LockIcon />
                </span>
              )}
            </span>

            {/* Value input */}
            <input
              type="text"
              value={draftValues[setting.settingId] ?? String(setting.defaultValue ?? '')}
              onChange={(e) => handleValueChange(setting.settingId, e.target.value)}
              style={{
                flex: 1,
                fontSize: '12px',
                padding: '2px 6px',
                background: 'var(--cl-bg-elev)',
                border: '1px solid var(--cl-border)',
                borderRadius: '3px',
                color: 'var(--cl-text)',
                outline: 'none',
              }}
            />

            {/* Unit */}
            {setting.unit && (
              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--cl-text-faint)',
                  flexShrink: 0,
                }}
              >
                {setting.unit}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
