/**
 * StepExecutionModal — Dialog for capturing step-level execution metadata
 * including timestamps, settings changes, and deviations.
 *
 * Opens when the user clicks "Play" on a step in ProtocolTabPanel.
 * Renders via createPortal for proper z-index handling outside the right pane.
 *
 * Fields:
 *   - Start Time (required, datetime-local)
 *   - End Time (optional, datetime-local)
 *   - Settings (editable parameters with isControlled indicators)
 *   - Deviations (optional, with code/message/severity)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DeviationRecorder } from './DeviationRecorder'
import type { PlateEvent } from '../types/events'

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

/** Deviation codes predefined for protocol step execution. */
export type DeviationCode =
  | 'insufficient_volume'
  | 'contamination_suspected'
  | 'step_skipped'
  | 'manual_intervention'
  | 'timing_deviation'
  | 'equipment_malfunction'
  | 'sample_lost'
  | 'other'

/** Severity levels for deviations. */
export type DeviationSeverity = 'info' | 'warning' | 'error'

/** A single deviation entry. */
export interface DeviationEntry {
  code: DeviationCode | ''
  message: string
  severity: DeviationSeverity
}

/** A step setting that can be edited during execution. */
export interface StepSetting {
  settingId: string
  label: string
  /** Input type hint: string | number | temperature | volume | boolean | select */
  type: string
  defaultValue?: any
  /** Whether this setting is a controlled parameter (regulated). */
  isControlled: boolean
  /** Options for select-type settings. */
  options?: string[]
  /** Unit hint displayed alongside the value. */
  unit?: string
}

/** Step metadata passed from the parent (e.g. ProtocolTabPanel). */
export interface StepInfo {
  stepId: string
  label: string
  settings?: StepSetting[]
}

/** Data submitted on form completion. */
export interface StepExecutionData {
  stepId: string
  startedAt: string
  completedAt?: string
  settings?: Record<string, any>
  deviations?: Array<{
    code: DeviationCode
    message: string
    severity: DeviationSeverity
  }>
}

/** Props for the modal. */
export interface StepExecutionModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: StepExecutionData) => void
  step: StepInfo
  /** Optional: planned event for auto-diff comparison */
  plannedEvent?: PlateEvent
  /** Optional: executed event for auto-diff comparison */
  executedEvent?: PlateEvent
}

/* ------------------------------------------------------------------ */
/* Deviation code labels                                                */
/* ------------------------------------------------------------------ */

const DEVIATION_CODES: Array<{ value: DeviationCode; label: string }> = [
  { value: 'insufficient_volume', label: 'Insufficient volume' },
  { value: 'contamination_suspected', label: 'Contamination suspected' },
  { value: 'step_skipped', label: 'Step skipped' },
  { value: 'manual_intervention', label: 'Manual intervention' },
  { value: 'timing_deviation', label: 'Timing deviation' },
  { value: 'equipment_malfunction', label: 'Equipment malfunction' },
  { value: 'sample_lost', label: 'Sample lost' },
  { value: 'other', label: 'Other' },
]

const SEVERITY_LEVELS: Array<{ value: DeviationSeverity; label: string; color: string }> = [
  { value: 'info', label: 'Info', color: 'var(--cl-accent)' },
  { value: 'warning', label: 'Warning', color: 'var(--cl-warn)' },
  { value: 'error', label: 'Error', color: 'var(--cl-danger)' },
]

/* ------------------------------------------------------------------ */
/* Icons                                                                */
/* ------------------------------------------------------------------ */

function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function RemoveIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg className="w-3 h-3 inline-block" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 17a2 2 0 100-4 2 2 0 000 4zm6-9h-1V6a5 5 0 00-10 0v2H5v14h14V8zM7 6a5 5 0 0110 0v2H7V6z" />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/**
 * Get a human-readable datetime-local value. Defaults to now if empty.
 */
function toLocalDatetime(date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Determine the HTML input type from a setting's type hint.
 */
function getInputType(type: string): 'text' | 'number' | 'checkbox' | 'select' {
  if (type === 'boolean') return 'checkbox'
  if (type === 'select') return 'select'
  if (type === 'number' || type === 'temperature' || type === 'volume') return 'number'
  return 'text'
}

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

export function StepExecutionModal({ isOpen, onClose, onSubmit, step, plannedEvent, executedEvent }: StepExecutionModalProps) {
  // Portal mount point — use document.body so the modal renders above everything
  const mountRef = useRef<HTMLElement | null>(null)

  // Form state
  const [startedAt, setStartedAt] = useState('')
  const [completedAt, setCompletedAt] = useState('')
  const [settings, setSettings] = useState<Record<string, any>>({})
  const [deviations, setDeviations] = useState<DeviationEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showAutoDiff, setShowAutoDiff] = useState(false)

  // Mount portal container
  useEffect(() => {
    mountRef.current = document.body
    return () => { mountRef.current = null }
  }, [])

  // Reset state whenever the modal opens
  useEffect(() => {
    if (isOpen) {
      setStartedAt(toLocalDatetime())
      setCompletedAt('')
      setSettings(
        step.settings?.reduce((acc, s) => {
          acc[s.settingId] = s.defaultValue ?? ''
          return acc
        }, {} as Record<string, any>) ?? {},
      )
      setDeviations([])
      setError(null)
      setIsSubmitting(false)
    }
  }, [isOpen, step.settings])

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // --- Handlers ---

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  const updateSetting = useCallback((settingId: string, value: any) => {
    setSettings(prev => ({ ...prev, [settingId]: value }))
  }, [])

  const addDeviation = useCallback(() => {
    setDeviations(prev => [...prev, { code: '', message: '', severity: 'info' }])
  }, [])

  const removeDeviation = useCallback((index: number) => {
    setDeviations(prev => prev.filter((_, i) => i !== index))
  }, [])

  const updateDeviation = useCallback((index: number, field: keyof DeviationEntry, value: string) => {
    setDeviations(prev => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }, [])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()

    // Validate: start time is required
    if (!startedAt.trim()) {
      setError('Start time is required')
      return
    }

    // Validate: deviations must have code + message
    const filteredDeviations = deviations
      .filter(d => d.code && d.message.trim())
      .map(d => ({
        code: d.code as DeviationCode,
        message: d.message.trim(),
        severity: d.severity,
      }))

    setIsSubmitting(true)
    setError(null)

    const data: StepExecutionData = {
      stepId: step.stepId,
      startedAt,
      completedAt: completedAt || undefined,
      settings: Object.keys(settings).length > 0 ? settings : undefined,
      deviations: filteredDeviations.length > 0 ? filteredDeviations : undefined,
    }

    onSubmit(data)
  }, [startedAt, completedAt, settings, deviations, step.stepId, onSubmit])

  // Determine submit button label
  const submitLabel = completedAt ? 'Complete Step' : 'Start Step'

  if (!isOpen) return null

  // Portal content — renders above the app shell
  const portalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="step-execution-modal-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Modal card */}
      <div
        style={{
          background: 'var(--cl-bg)',
          border: '1px solid var(--cl-border)',
          borderRadius: '8px',
          width: '600px',
          maxWidth: '90%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderBottom: '1px solid var(--cl-border)',
          }}
        >
          <h2
            id="step-execution-modal-title"
            style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--cl-text)' }}
          >
            Execute Step: {step.label}
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              color: 'var(--cl-text-dim)',
            }}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px' }}>
          {/* Error banner */}
          {error && (
            <div
              style={{
                padding: '8px 12px',
                marginBottom: 16,
                background: 'rgba(248, 81, 73, 0.1)',
                border: '1px solid var(--cl-danger)',
                borderRadius: '6px',
                color: 'var(--cl-danger)',
                fontSize: '13px',
              }}
              role="alert"
            >
              {error}
            </div>
          )}

          {/* Timestamps section */}
          <fieldset style={{ marginBottom: 20, border: 'none', padding: 0, margin: 0 }}>
            <legend style={{ fontSize: '12px', fontWeight: 600, color: 'var(--cl-text-dim)', marginBottom: 8 }}>
              Timestamps
            </legend>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label
                  htmlFor="step-start-time"
                  style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--cl-text)', marginBottom: 4 }}
                >
                  Start Time <span style={{ color: 'var(--cl-danger)' }}>*</span>
                </label>
                <input
                  id="step-start-time"
                  type="datetime-local"
                  value={startedAt}
                  onChange={(e) => setStartedAt(e.target.value)}
                  required
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    fontSize: '13px',
                    background: 'var(--cl-bg-elev)',
                    border: '1px solid var(--cl-border)',
                    borderRadius: '4px',
                    color: 'var(--cl-text)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label
                  htmlFor="step-end-time"
                  style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--cl-text)', marginBottom: 4 }}
                >
                  End Time <span style={{ color: 'var(--cl-text-faint)' }}>(optional)</span>
                </label>
                <input
                  id="step-end-time"
                  type="datetime-local"
                  value={completedAt}
                  onChange={(e) => setCompletedAt(e.target.value)}
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    fontSize: '13px',
                    background: 'var(--cl-bg-elev)',
                    border: '1px solid var(--cl-border)',
                    borderRadius: '4px',
                    color: 'var(--cl-text)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
          </fieldset>

          {/* Settings section */}
          {step.settings && step.settings.length > 0 && (
            <fieldset style={{ marginBottom: 20, border: 'none', padding: 0, margin: 0 }}>
              <legend style={{ fontSize: '12px', fontWeight: 600, color: 'var(--cl-text-dim)', marginBottom: 8 }}>
                Settings
              </legend>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {step.settings.map((setting) => {
                  const inputType = getInputType(setting.type)
                  const currentValue = settings[setting.settingId] ?? setting.defaultValue ?? ''

                  return (
                    <div key={setting.settingId}>
                      <label
                        htmlFor={`setting-${setting.settingId}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '12px', fontWeight: 500, color: 'var(--cl-text)', marginBottom: 4 }}
                      >
                        {setting.label}
                        {setting.isControlled && (
                          <span style={{ color: 'var(--cl-danger)', display: 'inline-flex', alignItems: 'center', gap: 2 }} title="Controlled parameter">
                            <LockIcon /> Controlled
                          </span>
                        )}
                        {setting.unit && (
                          <span style={{ color: 'var(--cl-text-faint)', fontWeight: 400 }}>({setting.unit})</span>
                        )}
                      </label>

                      {inputType === 'checkbox' ? (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={!!currentValue}
                            onChange={(e) => updateSetting(setting.settingId, e.target.checked)}
                            disabled={isSubmitting}
                            style={{ width: 16, height: 16, accentColor: 'var(--cl-accent)' }}
                          />
                          <span style={{ fontSize: '13px', color: 'var(--cl-text-dim)' }}>
                            {currentValue ? 'Yes' : 'No'}
                          </span>
                        </label>
                      ) : inputType === 'select' ? (
                        <select
                          id={`setting-${setting.settingId}`}
                          value={currentValue ?? ''}
                          onChange={(e) => updateSetting(setting.settingId, e.target.value)}
                          disabled={isSubmitting}
                          style={{
                            width: '100%',
                            padding: '6px 10px',
                            fontSize: '13px',
                            background: 'var(--cl-bg-elev)',
                            border: '1px solid var(--cl-border)',
                            borderRadius: '4px',
                            color: 'var(--cl-text)',
                            boxSizing: 'border-box',
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
                          id={`setting-${setting.settingId}`}
                          type={inputType}
                          value={currentValue ?? ''}
                          onChange={(e) =>
                            updateSetting(setting.settingId, inputType === 'number' ? Number(e.target.value) : e.target.value)
                          }
                          disabled={isSubmitting}
                          style={{
                            width: '100%',
                            padding: '6px 10px',
                            fontSize: '13px',
                            background: 'var(--cl-bg-elev)',
                            border: '1px solid var(--cl-border)',
                            borderRadius: '4px',
                            color: 'var(--cl-text)',
                            boxSizing: 'border-box',
                          }}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </fieldset>
          )}

          {/* Deviations section */}
          <fieldset style={{ marginBottom: 20, border: 'none', padding: 0, margin: 0 }}>
            <legend style={{ fontSize: '12px', fontWeight: 600, color: 'var(--cl-text-dim)', marginBottom: 8 }}>
              Deviations <span style={{ color: 'var(--cl-text-faint)' }}>(optional)</span>
            </legend>

            {deviations.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                {deviations.map((dev, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 2fr auto',
                      gap: 8,
                      alignItems: 'start',
                    }}
                  >
                    {/* Code select */}
                    <select
                      value={dev.code}
                      onChange={(e) => updateDeviation(idx, 'code', e.target.value)}
                      disabled={isSubmitting}
                      style={{
                        padding: '6px 8px',
                        fontSize: '12px',
                        background: 'var(--cl-bg-elev)',
                        border: '1px solid var(--cl-border)',
                        borderRadius: '4px',
                        color: 'var(--cl-text)',
                      }}
                    >
                      <option value="">Code…</option>
                      {DEVIATION_CODES.map((dc) => (
                        <option key={dc.value} value={dc.value}>
                          {dc.label}
                        </option>
                      ))}
                    </select>

                    {/* Message input */}
                    <input
                      type="text"
                      value={dev.message}
                      onChange={(e) => updateDeviation(idx, 'message', e.target.value)}
                      placeholder="Description"
                      disabled={isSubmitting}
                      style={{
                        padding: '6px 8px',
                        fontSize: '12px',
                        background: 'var(--cl-bg-elev)',
                        border: '1px solid var(--cl-border)',
                        borderRadius: '4px',
                        color: 'var(--cl-text)',
                      }}
                    />

                    {/* Severity + Remove */}
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <select
                        value={dev.severity}
                        onChange={(e) => updateDeviation(idx, 'severity', e.target.value)}
                        disabled={isSubmitting}
                        style={{
                          padding: '6px 8px',
                          fontSize: '12px',
                          background: 'var(--cl-bg-elev)',
                          border: '1px solid var(--cl-border)',
                          borderRadius: '4px',
                          color: SEVERITY_LEVELS.find(s => s.value === dev.severity)?.color ?? 'var(--cl-text)',
                          minWidth: 72,
                        }}
                      >
                        {SEVERITY_LEVELS.map((sl) => (
                          <option key={sl.value} value={sl.value}>
                            {sl.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeDeviation(idx)}
                        disabled={isSubmitting}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--cl-text-faint)',
                          padding: 4,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        title="Remove deviation"
                      >
                        <RemoveIcon />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={addDeviation}
              disabled={isSubmitting}
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 500,
                background: 'var(--cl-bg-elev)',
                color: 'var(--cl-text-dim)',
                border: '1px solid var(--cl-border)',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              + Add Deviation
            </button>
          </fieldset>

          {/* Auto-diff deviation detection */}
          {plannedEvent && executedEvent ? (
            <fieldset style={{ marginBottom: 20, border: 'none', padding: 0, margin: 0 }}>
              <legend style={{ fontSize: '12px', fontWeight: 600, color: 'var(--cl-text-dim)', marginBottom: 8 }}>
                Auto-detected Changes
              </legend>
              <button
                type="button"
                onClick={() => setShowAutoDiff(!showAutoDiff)}
                style={{
                  padding: '4px 12px', fontSize: '12px', fontWeight: 600,
                  background: 'var(--cl-bg-elev-2)', color: 'var(--cl-text)',
                  border: '1px solid var(--cl-border)', borderRadius: '4px', cursor: 'pointer',
                }}
              >
                {showAutoDiff ? 'Hide' : 'Compare with Plan'}
              </button>
              {showAutoDiff ? (
                <DeviationRecorder
                  event={executedEvent}
                  originalEvent={plannedEvent}
                  isOpen={showAutoDiff}
                  onSave={(payload) => {
                    setDeviations(prev => [...prev, {
                      code: 'other' as DeviationCode,
                      message: payload.reason || 'Auto-detected deviation',
                      severity: payload.severity as DeviationSeverity,
                    }])
                    setShowAutoDiff(false)
                  }}
                  onCancel={() => setShowAutoDiff(false)}
                />
              ) : null}
            </fieldset>
          ) : null}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 8 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 500,
                background: 'var(--cl-bg-elev)',
                color: 'var(--cl-text)',
                border: '1px solid var(--cl-border)',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600,
                background: isSubmitting ? 'var(--cl-bg-elev-2)' : 'var(--cl-accent)',
                color: isSubmitting ? 'var(--cl-text-faint)' : 'var(--cl-on-accent)',
                border: 'none',
                borderRadius: '6px',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? 'Submitting…' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )

  // Render via portal to the document body
  return mountRef.current ? createPortal(portalContent, mountRef.current) : null
}
