/**
 * ComboboxWidget — Autocomplete array input backed by local tag suggestions
 * and optional OLS ontology search.
 *
 * Config comes from field.props:
 *   sources: ['local'] | ['local', 'ols']
 *   ontologies: ['efo', 'chebi', 'go']   (only when ols in sources)
 *   field: 'keywords' | 'tags'
 */

import { useState, useRef, useEffect } from 'react'
import type { WidgetProps } from './types'
import { useTagSuggestions, type TagSuggestion } from '../../../shared/hooks/useTagSuggestions'
import { useOLSSearch } from '../../../shared/hooks/useOLSSearch'

interface DropdownItem {
  value: string
  label: string
  source: 'local' | 'ols'
  count?: number
  namespace?: string
}

export function ComboboxWidget({ field, value, onChange, readOnly, disabled, errors, compact }: WidgetProps) {
  const items = Array.isArray(value) ? (value as string[]) : []
  const [inputVal, setInputVal] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Extract props from field spec
  const sources: string[] = (field.props?.sources as string[] | undefined) ?? ['local']
  const ontologies: string[] = (field.props?.ontologies as string[] | undefined) ?? []
  const fieldName = (field.props?.field as string | undefined) ?? 'tags'
  const useOls = sources.includes('ols')

  // Local suggestions
  const { suggestions: localSuggestions } = useTagSuggestions({
    query: inputVal,
    field: fieldName as 'keywords' | 'tags',
    enabled: inputVal.length >= 1,
  })

  // OLS suggestions (only if configured)
  const { results: olsResults } = useOLSSearch({
    query: inputVal,
    ontologies,
    enabled: useOls && inputVal.length >= 2,
    debounceMs: 400,
    maxResults: 8,
  })

  // Merge into dropdown items, excluding already-selected values
  const selectedSet = new Set(items.map((s) => s.toLowerCase()))

  const localItems: DropdownItem[] = localSuggestions
    .filter((s: TagSuggestion) => !selectedSet.has(s.value.toLowerCase()))
    .map((s: TagSuggestion) => ({
      value: s.value,
      label: s.value,
      source: 'local' as const,
      count: s.count,
    }))

  const olsItems: DropdownItem[] = useOls
    ? olsResults
        .filter((r) => !selectedSet.has(r.label.toLowerCase()))
        .map((r) => ({
          value: r.label,
          label: r.label,
          source: 'ols' as const,
          namespace: r.ontology_name,
        }))
    : []

  const allItems = [...localItems, ...olsItems]

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Reset highlight when items change
  useEffect(() => {
    setHighlightIdx(-1)
  }, [allItems.length])

  // Read-only: same pill rendering as ArrayWidget
  if (readOnly) {
    if (items.length === 0) {
      return <span className="text-gray-300 italic text-sm">&mdash;</span>
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

  const addItem = (val: string) => {
    const trimmed = val.trim()
    if (!trimmed) return
    if (!items.includes(trimmed)) {
      onChange([...items, trimmed])
    }
    setInputVal('')
    setOpen(false)
    setHighlightIdx(-1)
    inputRef.current?.focus()
  }

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open && allItems.length > 0) setOpen(true)
      setHighlightIdx((prev) => Math.min(prev + 1, allItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightIdx >= 0 && highlightIdx < allItems.length) {
        addItem(allItems[highlightIdx].value)
      } else {
        addItem(inputVal)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setHighlightIdx(-1)
    }
  }

  const showDropdown = open && allItems.length > 0

  return (
    <div ref={wrapperRef} className="relative">
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
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={(e) => {
            setInputVal(e.target.value)
            if (e.target.value.length >= 1) setOpen(true)
            else setOpen(false)
          }}
          onFocus={() => { if (inputVal.length >= 1 && allItems.length > 0) setOpen(true) }}
          onKeyDown={handleKeyDown}
          placeholder="Type to search..."
          disabled={disabled}
          className={`flex-1 border rounded outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-400 ${
            errors?.length ? 'border-red-300' : 'border-gray-300'
          } ${compact ? 'text-xs py-1 px-2' : 'text-sm py-1.5 px-2.5'}`}
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
        />
        <button
          type="button"
          onClick={() => addItem(inputVal)}
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

      {showDropdown && (
        <ul
          className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded border border-gray-200 bg-white shadow-lg"
          role="listbox"
        >
          {localItems.length > 0 && (
            <>
              <li className="px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide bg-gray-50">
                Existing
              </li>
              {localItems.map((item, rawIdx) => {
                const idx = rawIdx
                return (
                  <li
                    key={`local-${item.value}`}
                    role="option"
                    aria-selected={highlightIdx === idx}
                    className={`px-2.5 py-1.5 text-sm cursor-pointer flex items-center justify-between ${
                      highlightIdx === idx ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
                    }`}
                    onMouseEnter={() => setHighlightIdx(idx)}
                    onMouseDown={(e) => { e.preventDefault(); addItem(item.value) }}
                  >
                    <span>{item.label}</span>
                    {item.count != null && (
                      <span className="text-[10px] text-gray-400 ml-2">{item.count}x</span>
                    )}
                  </li>
                )
              })}
            </>
          )}
          {olsItems.length > 0 && (
            <>
              <li className="px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide bg-gray-50">
                Ontology
              </li>
              {olsItems.map((item, rawIdx) => {
                const idx = localItems.length + rawIdx
                return (
                  <li
                    key={`ols-${item.value}-${item.namespace}`}
                    role="option"
                    aria-selected={highlightIdx === idx}
                    className={`px-2.5 py-1.5 text-sm cursor-pointer flex items-center gap-2 ${
                      highlightIdx === idx ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
                    }`}
                    onMouseEnter={() => setHighlightIdx(idx)}
                    onMouseDown={(e) => { e.preventDefault(); addItem(item.value) }}
                  >
                    <span>{item.label}</span>
                    {item.namespace && (
                      <span className="text-[10px] bg-purple-50 text-purple-600 rounded px-1 py-0.5 font-mono">
                        {item.namespace}
                      </span>
                    )}
                  </li>
                )
              })}
            </>
          )}
        </ul>
      )}
    </div>
  )
}
