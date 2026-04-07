import type { WidgetProps } from './types'

export function CheckboxWidget({ field, value, onChange, readOnly, disabled, compact }: WidgetProps) {
  const checked = Boolean(value)

  if (readOnly) {
    return (
      <span className={`text-gray-900 ${compact ? 'text-xs' : 'text-sm'}`}>
        {checked ? 'Yes' : 'No'}
      </span>
    )
  }

  return (
    <label className={`inline-flex items-center gap-1.5 ${compact ? 'text-xs' : 'text-sm'}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="accent-blue-500 w-3.5 h-3.5"
      />
      {field.label && <span className="text-gray-700">{field.label}</span>}
    </label>
  )
}
