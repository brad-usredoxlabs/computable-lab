/**
 * Form input components for editable settings rows.
 *
 * EditRow — text / number / password input
 * SelectRow — dropdown select
 * CheckboxRow — boolean toggle
 *
 * All match the InfoRow layout style from SettingsPage.
 */

import { useState, type ReactNode } from 'react'
import { REDACTED } from '../../types/config'

// ---------------------------------------------------------------------------
// EditRow
// ---------------------------------------------------------------------------

interface EditRowProps {
  label: string
  value: string | number
  onChange: (value: string) => void
  type?: 'text' | 'number' | 'password'
  placeholder?: string
  disabled?: boolean
  mono?: boolean
}

export function EditRow({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  disabled,
  mono,
}: EditRowProps) {
  return (
    <div className="info-row edit-row">
      <label className="info-row__label">{label}</label>
      <input
        className={`edit-row__input ${mono ? 'edit-row__input--mono' : ''}`}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// SecretRow — password field for secret values
// ---------------------------------------------------------------------------

interface SecretRowProps {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

/**
 * Secret field: in read mode shows "Configured" badge, in edit mode shows
 * an empty password input with a show/hide toggle.
 * Empty on save → send REDACTED to preserve existing.
 */
export function SecretRow({ label, value, onChange, disabled }: SecretRowProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="info-row edit-row">
      <label className="info-row__label">{label}</label>
      <div style={{ display: 'flex', gap: '0.25rem', flex: 1 }}>
        <input
          className="edit-row__input edit-row__input--mono"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Leave blank to keep existing"
          disabled={disabled}
          autoComplete="off"
          style={{ flex: 1 }}
        />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setVisible((v) => !v)}
          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
          tabIndex={-1}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  )
}

/**
 * Display a secret field in read mode. Shows "Configured" or "Not set".
 */
export function SecretDisplay({ label, configured }: { label: string; configured: boolean }) {
  return (
    <div className="info-row">
      <span className="info-row__label">{label}</span>
      <span className="info-row__value">
        {configured ? (
          <span className="secret-badge secret-badge--set">Configured</span>
        ) : (
          <span className="secret-badge secret-badge--empty">Not set</span>
        )}
      </span>
    </div>
  )
}

/**
 * Resolve a secret edit value for the PATCH payload.
 * Empty string → send REDACTED (preserve existing); non-empty → send the new value.
 */
export function resolveSecret(editValue: string): string {
  return editValue.trim() === '' ? REDACTED : editValue
}

// ---------------------------------------------------------------------------
// SelectRow
// ---------------------------------------------------------------------------

interface SelectRowProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  disabled?: boolean
}

export function SelectRow({ label, value, onChange, options, disabled }: SelectRowProps) {
  return (
    <div className="info-row edit-row">
      <label className="info-row__label">{label}</label>
      <select
        className="edit-row__select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CheckboxRow
// ---------------------------------------------------------------------------

interface CheckboxRowProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function CheckboxRow({ label, checked, onChange, disabled }: CheckboxRowProps) {
  return (
    <div className="info-row edit-row">
      <label className="info-row__label">{label}</label>
      <div className="edit-row__checkbox-wrapper">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// InfoRow (read-only, re-exported for convenience in section components)
// ---------------------------------------------------------------------------

interface InfoRowProps {
  label: string
  value: ReactNode
  mono?: boolean
}

export function InfoRow({ label, value, mono = false }: InfoRowProps) {
  return (
    <div className="info-row">
      <span className="info-row__label">{label}</span>
      <span className={`info-row__value ${mono ? 'info-row__value--mono' : ''}`}>{value}</span>
    </div>
  )
}
