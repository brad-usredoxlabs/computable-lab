/**
 * LabwarePicker - Search and select labware from local records or vendor/web search.
 * 
 * This component provides a search interface that:
 * 1. Searches local labware records via /ai/search-records
 * 2. Falls back to vendor/web search when local results are empty
 * 3. On local selection: adds the labware directly from the record
 * 4. On vendor selection: precompiles the record, persists it, then adds it
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { apiClient } from '../../shared/api/client'
import { searchRecords } from '../../shared/api/treeClient'
import type { LabwareRecordPayload } from '../../types/labware'

interface LabwareSearchResult {
  recordId: string
  title: string
  kind: string
  source: 'local' | 'web'
  snippet?: string
  url?: string
  schemaId?: string
  // Labware-specific fields (for local results)
  labwareType?: string
  format?: { rows?: number; cols?: number; wellCount?: number; wellNaming?: string }
  manufacturer?: { name?: string; catalogNumber?: string; url?: string }
  tags?: string[]
}

export interface LabwarePickerProps {
  open: boolean
  onClose: () => void
  onPick: (record: LabwareRecordPayload) => void
}

export function LabwarePicker({ open, onClose, onPick }: LabwarePickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LabwareSearchResult[]>([])
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
      // Search local labware records
      const { records: localRecords } = await apiClient.searchRecordsByKind(searchQuery, 'labware', 10)

      // Fetch full record details for each result to get labware-specific fields
      const localResults: LabwareSearchResult[] = []
      for (const r of localRecords) {
        try {
          const fullRecord = await apiClient.getRecord(r.recordId)
          const payload = fullRecord.payload as Record<string, unknown>
          
          // Extract labware-specific fields with proper typing
          const labwareType = payload.labwareType as string | undefined
          const format = payload.format as { rows?: number; cols?: number; wellCount?: number; wellNaming?: string } | undefined
          const manufacturer = payload.manufacturer as { name?: string; catalogNumber?: string; url?: string } | undefined
          const tags = payload.tags as string[] | undefined
          
          localResults.push({
            recordId: r.recordId,
            title: (payload.name || payload.title || r.title || r.recordId) as string,
            kind: (payload.kind || 'labware') as string,
            source: 'local' as const,
            snippet: [
              typeof (manufacturer as any)?.name === 'string' ? (manufacturer as any).name : undefined,
              labwareType,
              format?.rows ? `${format.rows}x${format.cols}` : undefined
            ].filter(Boolean).join(' — '),
            labwareType,
            format,
            manufacturer,
            tags,
          })
        } catch (err) {
          console.warn(`Failed to fetch full record ${r.recordId}:`, err)
          // Fallback to basic info
          localResults.push({
            recordId: r.recordId,
            title: r.title || r.recordId,
            kind: r.kind || 'labware',
            source: 'local' as const,
            snippet: '',
          })
        }
      }

      // If no local results and query is long enough, try web search
      let webResults: LabwareSearchResult[] = []
      if (localResults.length === 0 && searchQuery.trim().length >= 3) {
        try {
          const webResult = await searchRecords(searchQuery, { kind: 'labware', limit: 10 })
          webResults = webResult.records.map((r) => ({
            recordId: r.recordId,
            title: r.title || r.recordId,
            kind: r.kind || 'labware',
            source: 'web' as const,
            snippet: (r as any).description || (r as any).snippet,
            url: (r as any).url,
          }))
        } catch (webError) {
          console.warn('Web search failed:', webError)
        }
      }

      // Combine: local first, then web
      const allResults = [...localResults, ...webResults].slice(0, 15)
      setResults(allResults)
      setShowDropdown(allResults.length > 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
      setResults([])
      setShowDropdown(false)
    } finally {
      setSearching(false)
    }
  }, [])

  // Auto-search when query changes (debounced)
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setShowDropdown(false)
      return
    }
    
    const timer = setTimeout(() => {
      if (query.trim().length >= 2) {
        performSearch(query.trim())
      }
    }, 300)
    
    return () => clearTimeout(timer)
  }, [query, performSearch])

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

  const handleSelectResult = async (result: LabwareSearchResult) => {
    if (result.source === 'local') {
      // For local results, use the stored payload data from the search result
      const payload: LabwareRecordPayload = {
        kind: 'labware',
        recordId: result.recordId,
        name: result.title,
        labwareType: (result as any).labwareType as string | undefined,
        format: (result as any).format as { rows?: number; cols?: number; wellCount?: number; wellNaming?: string } | undefined,
        manufacturer: (result as any).manufacturer as { name?: string; catalogNumber?: string; url?: string } | undefined,
        tags: (result as any).tags as string[] | undefined,
      }
      onPick(payload)
      setQuery('')
      setShowDropdown(false)
      setResults([])
    } else {
      // For web/vendor results, precompile first
      setPrecompiling(result.recordId)
      setError(null)

      try {
        const precompileResult = await apiClient.precompileRecord(
          'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
          result.title,
          result.snippet || result.title,
          result.url
        )

        if (precompileResult.success && precompileResult.payload) {
          // Create the record in the backend
          const createResult = await apiClient.createRecord(
            'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
            precompileResult.payload
          )

          // Now construct the LabwareRecordPayload from the created record
          const payload: LabwareRecordPayload = {
            kind: 'labware',
            recordId: (createResult.record?.recordId || precompileResult.payload.id || '') as string,
            name: (precompileResult.payload.name || result.title) as string,
            labwareType: precompileResult.payload.labwareType as string | undefined,
            format: precompileResult.payload.format as { rows?: number; cols?: number; wellCount?: number; wellNaming?: string } | undefined,
            manufacturer: precompileResult.payload.manufacturer as { name?: string; catalogNumber?: string; url?: string } | undefined,
            tags: precompileResult.payload.tags as string[] | undefined,
          }

          onPick(payload)
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

  if (!open) return null

  // Separate local and web results for display
  const localResults = results.filter((r) => r.source === 'local')
  const webResults = results.filter((r) => r.source === 'web')

  return (
    <div className="labware-picker-overlay" onClick={onClose}>
      <div className="labware-picker" onClick={(e) => e.stopPropagation()}>
        <div className="labware-picker__header">
          <h4>Add Labware</h4>
          <button className="labware-picker__close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="labware-picker__search">
          <div className="labware-picker__search-input-wrapper">
            <svg className="labware-picker__search-icon" viewBox="0 0 24 24" fill="none">
              <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search labware (e.g., Corning 96-Well, Integra reservoir...)"
              className="labware-picker__input"
              autoFocus
            />
            {searching && (
              <div className="labware-picker__spinner" />
            )}
          </div>
        </div>

        {error && (
          <div className="labware-picker__error">
            {error}
          </div>
        )}

        {showDropdown && results.length > 0 && (
          <div className="labware-picker__results" ref={dropdownRef}>
            {localResults.length > 0 && (
              <>
                <div className="labware-picker__section-header">
                  Local Results
                </div>
                {localResults.map((result, index) => (
                  <div
                    key={`local-${result.recordId}`}
                    onClick={() => handleSelectResult(result)}
                    className={`labware-picker__result ${
                      index === highlightedIndex ? 'labware-picker__result--highlighted' : ''
                    } ${precompiling === result.recordId ? 'labware-picker__result--disabled' : ''}`}
                  >
                    <span className="labware-picker__badge labware-picker__badge--local">
                      Local
                    </span>
                    <div className="labware-picker__result-content">
                      <div className="labware-picker__result-title">
                        {result.title}
                      </div>
                      {result.snippet && (
                        <div className="labware-picker__result-snippet">
                          {result.snippet}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}

            {localResults.length > 0 && webResults.length > 0 && (
              <div className="labware-picker__separator">— or —</div>
            )}

            {webResults.length > 0 && (
              <>
                <div className="labware-picker__section-header">
                  Web Results
                </div>
                {webResults.map((result, index) => (
                  <div
                    key={`web-${result.recordId}-${index}`}
                    onClick={() => handleSelectResult(result)}
                    className={`labware-picker__result ${
                      index + localResults.length === highlightedIndex ? 'labware-picker__result--highlighted' : ''
                    } ${precompiling === result.recordId ? 'labware-picker__result--disabled' : ''}`}
                  >
                    <span className="labware-picker__badge labware-picker__badge--web">
                      Web
                    </span>
                    <div className="labware-picker__result-content">
                      <div className="labware-picker__result-title">
                        {result.title}
                      </div>
                      {result.snippet && (
                        <div className="labware-picker__result-snippet">
                          {result.snippet}
                        </div>
                      )}
                      {precompiling === result.recordId && (
                        <div className="labware-picker__precompiling">
                          Pre-compiling...
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {showDropdown && results.length === 0 && !searching && (
          <div className="labware-picker__no-results">
            No results found
          </div>
        )}

        <style>{`
          .labware-picker-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
          }

          .labware-picker {
            background: white;
            border-radius: 8px;
            width: 100%;
            max-width: 500px;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          }

          .labware-picker__header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem;
            border-bottom: 1px solid #e9ecef;
          }

          .labware-picker__header h4 {
            margin: 0;
            font-size: 1.125rem;
          }

          .labware-picker__close {
            background: none;
            border: none;
            font-size: 1.5rem;
            cursor: pointer;
            color: #868e96;
            padding: 0;
            line-height: 1;
          }

          .labware-picker__close:hover {
            color: #495057;
          }

          .labware-picker__search {
            padding: 1rem;
            border-bottom: 1px solid #e9ecef;
          }

          .labware-picker__search-input-wrapper {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 6px;
            padding: 0.5rem 0.75rem;
          }

          .labware-picker__search-icon {
            width: 1.25rem;
            height: 1.25rem;
            color: #868e96;
            flex-shrink: 0;
          }

          .labware-picker__input {
            flex: 1;
            border: none;
            outline: none;
            font-size: 0.875rem;
            background: transparent;
          }

          .labware-picker__input::placeholder {
            color: #adb5bd;
          }

          .labware-picker__spinner {
            width: 1rem;
            height: 1rem;
            border: 2px solid #dee2e6;
            border-top-color: #339af0;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }

          @keyframes spin {
            to { transform: rotate(360deg); }
          }

          .labware-picker__error {
            margin: 0.5rem 1rem;
            padding: 0.75rem;
            background: #fff5f5;
            border: 1px solid #ffc9c9;
            border-radius: 4px;
            color: #c92a2a;
            font-size: 0.875rem;
          }

          .labware-picker__results {
            flex: 1;
            overflow-y: auto;
            padding: 0.5rem;
          }

          .labware-picker__section-header {
            font-size: 0.75rem;
            font-weight: 600;
            color: #868e96;
            text-transform: uppercase;
            padding: 0.5rem 0.75rem;
            background: #f8f9fa;
            border-radius: 4px;
            margin-bottom: 0.25rem;
          }

          .labware-picker__separator {
            text-align: center;
            color: #adb5bd;
            font-size: 0.75rem;
            padding: 0.5rem;
          }

          .labware-picker__result {
            display: flex;
            align-items: flex-start;
            gap: 0.5rem;
            padding: 0.75rem;
            border-radius: 4px;
            cursor: pointer;
            margin-bottom: 0.25rem;
          }

          .labware-picker__result:hover {
            background: #f1f3f4;
          }

          .labware-picker__result--highlighted {
            background: #e7f5ff;
          }

          .labware-picker__result--disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .labware-picker__badge {
            font-size: 0.625rem;
            font-weight: 600;
            padding: 0.125rem 0.375rem;
            border-radius: 3px;
            text-transform: uppercase;
            flex-shrink: 0;
          }

          .labware-picker__badge--local {
            background: #d3f9d8;
            color: #2b8a3e;
          }

          .labware-picker__badge--web {
            background: #d0ebff;
            color: #1864ab;
          }

          .labware-picker__result-content {
            flex: 1;
            min-width: 0;
          }

          .labware-picker__result-title {
            font-size: 0.875rem;
            font-weight: 500;
            color: #212529;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .labware-picker__result-snippet {
            font-size: 0.75rem;
            color: #868e96;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-top: 0.125rem;
          }

          .labware-picker__precompiling {
            font-size: 0.625rem;
            color: #339af0;
            margin-top: 0.25rem;
          }

          .labware-picker__no-results {
            padding: 1.5rem;
            text-align: center;
            color: #868e96;
            font-size: 0.875rem;
          }
        `}</style>
      </div>
    </div>
  )
}
