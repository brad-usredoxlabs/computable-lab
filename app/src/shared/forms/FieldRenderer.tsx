import type { FieldHint } from '../../types/uiSpec'
import { getWidget } from '../../editor/forms/widgets'
import { isFieldHidden, isFieldReadonly, inferLabel } from '../lib/formHelpers'

interface FieldRendererProps {
  field: FieldHint
  value: unknown
  onChange: (value: unknown) => void
  readOnly?: boolean
  disabled?: boolean
  errors?: string[]
  schema?: Record<string, unknown>
  compact?: boolean
}

export function FieldRenderer({
  field,
  value,
  onChange,
  readOnly = false,
  disabled = false,
  errors,
  schema,
  compact = false,
}: FieldRendererProps) {
  if (isFieldHidden(field)) return null

  const fieldReadOnly = readOnly || isFieldReadonly(field)
  const Widget = getWidget(field.widget)
  const label = field.label || inferLabel(field.path)
  const hasErrors = errors && errors.length > 0

  // Checkbox: label rendered inside the widget
  if (field.widget === 'checkbox' && !fieldReadOnly) {
    return (
      <div className={compact ? 'py-px' : 'py-0.5'}>
        <Widget
          field={field}
          value={value}
          onChange={onChange}
          readOnly={fieldReadOnly}
          disabled={disabled}
          errors={errors}
          schema={schema}
          compact={compact}
        />
        {hasErrors && errors.map((err, i) => (
          <p key={i} className="text-red-500 text-xs mt-0.5">{err}</p>
        ))}
      </div>
    )
  }

  // Read-only: inline label-value row
  if (fieldReadOnly) {
    return (
      <div className={`flex items-baseline gap-2 ${compact ? 'py-px' : 'py-0.5'} min-h-[24px]`}>
        <span className={`${compact ? 'text-[11px]' : 'text-xs'} font-medium text-gray-400 shrink-0`} style={{ minWidth: compact ? '60px' : '80px' }}>
          {label}
        </span>
        <div className="flex-1 min-w-0">
          <Widget
            field={field}
            value={value}
            onChange={onChange}
            readOnly
            disabled={disabled}
            errors={errors}
            schema={schema}
            compact={compact}
          />
        </div>
      </div>
    )
  }

  // Edit mode: stacked label + input
  return (
    <div className={compact ? 'py-0.5' : 'py-1'}>
      <label className={`block ${compact ? 'text-[11px]' : 'text-xs'} font-medium text-gray-500 ${compact ? 'mb-0.5' : 'mb-0.5'}`}>
        {label}
        {field.required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <Widget
        field={field}
        value={value}
        onChange={onChange}
        readOnly={false}
        disabled={disabled}
        errors={errors}
        schema={schema}
        compact={compact}
      />
      {field.help && !compact && (
        <p className="text-gray-400 text-[11px] mt-0.5">{field.help}</p>
      )}
      {hasErrors && errors.map((err, i) => (
        <p key={i} className="text-red-500 text-xs mt-0.5">{err}</p>
      ))}
    </div>
  )
}
