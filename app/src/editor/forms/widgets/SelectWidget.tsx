import type { WidgetProps } from './types'
import type { FieldOption } from '../../../types/uiSpec'

function resolveOptions(field: { options?: FieldOption[] }, schema?: Record<string, unknown>): FieldOption[] {
  if (field.options?.length) return field.options
  const schemaEnum = schema?.enum as unknown[] | undefined
  if (schemaEnum) {
    return schemaEnum.map((v) => ({ value: String(v), label: String(v) }))
  }
  return []
}

export function SelectWidget({ field, value, onChange, readOnly, disabled, errors, schema, compact }: WidgetProps) {
  const options = resolveOptions(field, schema)
  const strVal = value == null ? '' : String(value)

  if (readOnly) {
    const matched = options.find((o) => String(o.value) === strVal)
    const display = matched?.label || strVal
    return display
      ? <span className={`inline-block bg-gray-100 text-gray-800 rounded px-1.5 py-0.5 ${compact ? 'text-[11px]' : 'text-xs'} font-medium`}>{display}</span>
      : <span className="text-gray-300 italic text-sm">—</span>
  }

  if (field.widget === 'radio') {
    return (
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <label key={String(opt.value)} className={`inline-flex items-center gap-1 ${compact ? 'text-xs' : 'text-sm'}`}>
            <input
              type="radio"
              checked={strVal === String(opt.value)}
              onChange={() => onChange(opt.value)}
              disabled={disabled || opt.disabled}
              className="accent-blue-500"
            />
            {opt.label}
          </label>
        ))}
      </div>
    )
  }

  if (field.widget === 'multiselect') {
    const selected = Array.isArray(value) ? (value as string[]) : []
    return (
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const checked = selected.includes(String(opt.value))
          return (
            <label key={String(opt.value)} className={`inline-flex items-center gap-1 ${compact ? 'text-xs' : 'text-sm'}`}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => {
                  const next = checked
                    ? selected.filter((v) => v !== String(opt.value))
                    : [...selected, String(opt.value)]
                  onChange(next)
                }}
                disabled={disabled || opt.disabled}
                className="accent-blue-500"
              />
              {opt.label}
            </label>
          )
        })}
      </div>
    )
  }

  return (
    <select
      value={strVal}
      onChange={(e) => onChange(e.target.value || undefined)}
      disabled={disabled}
      className={`w-full border rounded outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-400 ${
        errors?.length ? 'border-red-300' : 'border-gray-300'
      } ${disabled ? 'bg-gray-50 text-gray-500' : ''} ${compact ? 'text-xs py-1 px-2' : 'text-sm py-1.5 px-2.5'}`}
    >
      <option value="">— Select —</option>
      {options.map((opt) => (
        <option key={String(opt.value)} value={String(opt.value)} disabled={opt.disabled}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}
