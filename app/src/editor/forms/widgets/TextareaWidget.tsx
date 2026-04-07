import type { WidgetProps } from './types'

export function TextareaWidget({ field, value, onChange, readOnly, disabled, errors, compact }: WidgetProps) {
  const strVal = value == null ? '' : String(value)

  if (readOnly) {
    return (
      <p className={`text-gray-900 whitespace-pre-wrap ${compact ? 'text-xs' : 'text-sm'} leading-snug`}>
        {strVal || <span className="text-gray-300 italic">—</span>}
      </p>
    )
  }

  return (
    <textarea
      value={strVal}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      disabled={disabled}
      rows={compact ? 2 : 3}
      className={`w-full border rounded outline-none resize-y focus:ring-1 focus:ring-blue-300 focus:border-blue-400 ${
        errors?.length ? 'border-red-300' : 'border-gray-300'
      } ${disabled ? 'bg-gray-50 text-gray-500' : ''} ${compact ? 'text-xs py-1 px-2' : 'text-sm py-1.5 px-2.5'}`}
    />
  )
}
