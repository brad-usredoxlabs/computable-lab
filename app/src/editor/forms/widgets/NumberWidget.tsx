import type { WidgetProps } from './types'

export function NumberWidget({ value, onChange, readOnly, disabled, errors, schema, compact }: WidgetProps) {
  const numVal = value == null ? '' : String(value)

  if (readOnly) {
    return (
      <span className={`text-gray-900 ${compact ? 'text-xs' : 'text-sm'} tabular-nums`}>
        {numVal || <span className="text-gray-300 italic">—</span>}
      </span>
    )
  }

  return (
    <input
      type="number"
      value={numVal}
      onChange={(e) => {
        const raw = e.target.value
        onChange(raw === '' ? undefined : Number(raw))
      }}
      min={schema?.minimum as number | undefined}
      max={schema?.maximum as number | undefined}
      disabled={disabled}
      className={`w-full border rounded outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-400 ${
        errors?.length ? 'border-red-300' : 'border-gray-300'
      } ${disabled ? 'bg-gray-50 text-gray-500' : ''} ${compact ? 'text-xs py-1 px-2' : 'text-sm py-1.5 px-2.5'}`}
    />
  )
}
