import type { WidgetProps } from './types'
import { normalizeRefFieldValue } from '../../taptab/refValue'

export function RefWidget({ value, onChange, readOnly, disabled, errors, compact }: WidgetProps) {
  const strVal = value == null ? '' : String(value)

  if (readOnly) {
    return (
      <span className={`text-gray-900 font-mono ${compact ? 'text-[11px]' : 'text-xs'}`}>
        {strVal || <span className="text-gray-300 italic font-sans text-sm">—</span>}
      </span>
    )
  }

  return (
    <input
      type="text"
      value={strVal}
      onChange={(e) =>
        // Ref value-emission contract (QMS-6E D3b): an emptied ref field
        // commits the TRUE empty (null → omitted from the payload), never an
        // empty string or display glyph into a `type: object` slot.
        onChange(normalizeRefFieldValue(e.target.value, 'ref'))
      }
      disabled={disabled}
      className={`w-full border rounded outline-none font-mono focus:ring-1 focus:ring-blue-300 focus:border-blue-400 ${
        errors?.length ? 'border-red-300' : 'border-gray-300'
      } ${disabled ? 'bg-gray-50 text-gray-500' : ''} ${compact ? 'text-xs py-1 px-2' : 'text-sm py-1.5 px-2.5'}`}
    />
  )
}
