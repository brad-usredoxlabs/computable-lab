/**
 * SearchBar — Search input for finding records across the repository.
 */

import { useState, useEffect, useRef } from 'react'
import { useBrowser } from '../../shared/context/BrowserContext'
import { searchRecords } from '../../shared/api/treeClient'
import type { IndexEntry } from '../../types/tree'

// Simple cn utility
const cn = (...classes: (string | boolean | undefined | null)[]): string =>
  classes.filter(Boolean).join(' ')

interface SearchBarProps {
  className?: string
}

// Search icon
const SearchIcon = () => (
  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
)

// Clear icon
const ClearIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

/**
 * Get color class for kind badge.
 */
function getKindColor(kind?: string): string {
  switch (kind) {
    case 'event-graph':
      return 'bg-purple-100 text-purple-700'
    case 'plate':
      return 'bg-pink-100 text-pink-700'
    case 'study':
      return 'bg-blue-100 text-blue-700'
    case 'experiment':
      return 'bg-amber-100 text-amber-700'
    case 'run':
      return 'bg-green-100 text-green-700'
    case 'context':
      return 'bg-cyan-100 text-cyan-700'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

/**
 * Debounce hook.
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

/**
 * Search bar with dropdown results.
 */
export function SearchBar({ className }: SearchBarProps) {
  const { setSelectedRecordId, selectNode } = useBrowser()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<IndexEntry[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  
  const debouncedQuery = useDebounce(query, 300)

  // Search when query changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([])
      return
    }

    setIsLoading(true)
    searchRecords(debouncedQuery)
      .then(response => {
        setResults(response.records)
        setSelectedIndex(-1)
      })
      .catch(err => {
        console.error('Search failed:', err)
        setResults([])
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [debouncedQuery])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Handle keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, -1))
        break
      case 'Enter':
        event.preventDefault()
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          handleSelectResult(results[selectedIndex])
        }
        break
      case 'Escape':
        event.preventDefault()
        setIsOpen(false)
        inputRef.current?.blur()
        break
    }
  }

  // Handle selecting a result
  const handleSelectResult = (record: IndexEntry) => {
    // For study/experiment/run nodes, select them in the tree
    if (record.kind === 'study' || record.kind === 'experiment' || record.kind === 'run') {
      selectNode({ type: record.kind, recordId: record.recordId })
    } else {
      // For other records, select them for preview
      setSelectedRecordId(record.recordId)
    }
    
    // Clear and close
    setQuery('')
    setResults([])
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
          <SearchIcon />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search records..."
          className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-md bg-gray-50 focus:bg-white focus:border-blue-300 focus:ring-1 focus:ring-blue-200 outline-none transition-colors"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setResults([])
              inputRef.current?.focus()
            }}
            className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400 hover:text-gray-600"
          >
            <ClearIcon />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (query.trim() || isLoading) && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="px-3 py-2 text-sm text-gray-500">Searching...</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">No results found</div>
          ) : (
            <ul className="py-1">
              {results.map((record, index) => (
                <li key={record.recordId}>
                  <button
                    type="button"
                    onClick={() => handleSelectResult(record)}
                    className={cn(
                      'w-full px-3 py-2 text-left text-sm hover:bg-gray-50',
                      index === selectedIndex && 'bg-blue-50'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900 truncate">
                        {record.title || record.recordId}
                      </span>
                      {record.kind && (
                        <span className={cn('text-xs px-1.5 py-0.5 rounded ml-2 flex-shrink-0', getKindColor(record.kind))}>
                          {record.kind}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 truncate mt-0.5">
                      {record.recordId}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
