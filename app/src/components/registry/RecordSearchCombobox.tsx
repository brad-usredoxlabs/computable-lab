import { useState, useRef, useEffect, useCallback } from 'react'
import { apiClient } from '../../shared/api/client'
import { searchRecords } from '../../shared/api/treeClient'

export interface RecordSearchComboboxProps {
  kinds: string[]           // record kinds to search (e.g., ['equipment', 'equipment-class'])
  schemaId: string          // schema ID for pre-compilation of web results
  placeholder?: string      // e.g., "Search equipment (e.g., Eppendorf 5810R)..."
  onSelect: (record: {
    recordId: string
    schemaId: string
    payload: Record<string, unknown>
    isNew: boolean          // true for web results (not yet saved)
  }) => void
  disabled?: boolean
}

interface SearchResult {
  recordId: string
  title: string
  kind: string
  source: 'local' | 'web'
  snippet?: string
  url?: string
  schemaId?: string
}

export function RecordSearchCombobox({
  kinds,
  schemaId,
  placeholder = 'Search records...',
  onSelect,
  disabled = false,
}: RecordSearchComboboxProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [precompiling, setPrecompiling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)
  const [showDropdown, setShowDropdown] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!showDropdown) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightedIndex((prev) => Math.min(prev + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIndex((prev) => Math.max(prev - 1, -1))
      } else if (e.key === 'Enter' && highlightedIndex >= 0) {
        e.preventDefault()
        handleSelectResult(results[highlightedIndex])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setShowDropdown(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [showDropdown, results, highlightedIndex])

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([])
      setShowDropdown(false)
      return
    }

    setSearching(true)
    setError(null)
    setHighlightedIndex(-1)

    try {
      // Search local records for each kind
      const localPromises = kinds.map((kind) =>
        apiClient.searchRecordsByKind(searchQuery, kind, 5)
      )
      const localResults = await Promise.all(localPromises)

      const localRecords: SearchResult[] = []
      for (const { records } of localResults) {
        localRecords.push(
          ...records.map((r) => ({
            recordId: r.recordId,
            title: r.title,
            kind: r.kind,
            source: 'local' as const,
          }))
        )
      }

      // Search web results (using the generic search endpoint)
      let webRecords: SearchResult[] = []
      try {
        const webResult = await searchRecords(searchQuery, { limit: 10 })
        webRecords = webResult.records.map((r) => ({
          recordId: r.recordId,
          title: r.title || r.recordId,
          kind: r.kind || 'unknown',
          source: 'web' as const,
          snippet: (r as any).description || r.title,
        }))
      } catch (webError) {
        // Web search is optional - don't fail if it doesn't work
        console.warn('Web search failed:', webError)
      }

      // Combine results: local first, then web
      const allResults = [...localRecords, ...webRecords].slice(0, 10)
      setResults(allResults)
      setShowDropdown(allResults.length > 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
      setResults([])
      setShowDropdown(false)
    } finally {
      setSearching(false)
    }
  }, [kinds])

  const handleSearch = () => {
    if (query.trim() && !searching) {
      performSearch(query.trim())
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSearch()
    }
  }

  const handleSelectResult = async (result: SearchResult) => {
    if (result.source === 'local') {
      // For local results, emit the record ID and let parent load full record
      onSelect({
        recordId: result.recordId,
        schemaId: result.schemaId || schemaId,
        payload: {},
        isNew: false,
      })
      setQuery('')
      setShowDropdown(false)
      setResults([])
    } else {
      // For web results, precompile first
      setPrecompiling(result.recordId)
      setError(null)

      try {
        const precompileResult = await apiClient.precompileRecord(
          schemaId,
          result.title,
          result.snippet || result.title,
          result.url
        )

        if (precompileResult.success && precompileResult.payload) {
          onSelect({
            recordId: '',
            schemaId,
            payload: precompileResult.payload,
            isNew: true,
          })
          setQuery('')
          setShowDropdown(false)
          setResults([])
        } else if (precompileResult.error) {
          setError(precompileResult.error)
        } else {
          setError('Pre-compilation failed')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Pre-compilation failed')
      } finally {
        setPrecompiling(null)
      }
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <svg className="w-5 h-5 text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="none">
          <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (query.trim()) {
              performSearch(query.trim())
            }
          }}
          placeholder={placeholder}
          className="flex-1 bg-transparent border-none outline-none text-sm text-gray-700 placeholder-gray-400"
          disabled={searching || disabled}
        />
        {searching && (
          <div className="w-4 h-4 animate-spin border-2 border-gray-300 border-t-blue-500 rounded-full" />
        )}
      </div>

      {/* Results Dropdown */}
      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {results.map((result, index) => (
            <div
              key={`${result.source}-${result.recordId}`}
              onClick={() => handleSelectResult(result)}
              className={`px-4 py-3 cursor-pointer border-b border-gray-100 last:border-b-0 ${
                index === highlightedIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
              } ${precompiling === result.recordId ? 'opacity-50' : ''}`}
            >
              <div className="flex items-start gap-2">
                {/* Origin badge */}
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                    result.source === 'local'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {result.source === 'local' ? 'Local' : 'Web'}
                </span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-900 truncate">
                    {result.title}
                  </div>
                  {result.snippet && (
                    <div className="text-xs text-gray-500 truncate mt-0.5">
                      {result.snippet}
                    </div>
                  )}
                  {precompiling === result.recordId && (
                    <div className="text-xs text-blue-600 mt-1">
                      Pre-compiling...
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}
