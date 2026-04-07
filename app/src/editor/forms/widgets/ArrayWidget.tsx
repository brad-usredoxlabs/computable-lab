import { useState } from 'react'
import type { WidgetProps } from './types'

export function ArrayWidget({ value, onChange, readOnly, disabled, errors, compact }: WidgetProps) {
  const items = Array.isArray(value) ? (value as string[]) : []
  const [inputVal, setInputVal] = useState('')

  if (readOnly) {
    if (items.length === 0) {
      return <span className="text-gray-300 italic text-sm">—</span>
    }
    return (
      <div className="flex flex-wrap gap-1">
        {items.map((item, i) => (
          <span key={i} className={`inline-block bg-blue-50 text-blue-700 rounded px-1.5 py-0.5 ${compact ? 'text-[11px]' : 'text-xs'} font-medium`}>
            {item}
          </span>
        ))}
      </div>
    )
  }

  const addItem = () => {
    const trimmed = inputVal.trim()
    if (!trimmed) return
    onChange([...items, trimmed])
    setInputVal('')
  }

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index))
  }

  return (
    <div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {items.map((item, i) => (
            <span key={i} className={`inline-flex items-center gap-0.5 bg-blue-50 text-blue-700 rounded px-1.5 py-0.5 ${compact ? 'text-[11px]' : 'text-xs'} font-medium`}>
              {item}
              <button
                type="button"
                onClick={() => removeItem(i)}
                disabled={disabled}
                className="text-blue-400 hover:text-blue-600"
                aria-label={`Remove ${item}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
          placeholder="Type + Enter"
          disabled={disabled}
          className={`flex-1 border rounded outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-400 ${
            errors?.length ? 'border-red-300' : 'border-gray-300'
          } ${compact ? 'text-xs py-1 px-2' : 'text-sm py-1.5 px-2.5'}`}
        />
        <button
          type="button"
          onClick={addItem}
          disabled={disabled || !inputVal.trim()}
          className={`rounded border text-xs font-medium ${
            disabled || !inputVal.trim()
              ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
              : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
          } ${compact ? 'py-1 px-2' : 'py-1.5 px-2.5'}`}
        >
          Add
        </button>
      </div>
    </div>
  )
}
