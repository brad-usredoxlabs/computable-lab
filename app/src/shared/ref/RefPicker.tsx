/**
 * RefPicker - Combobox/autocomplete component for selecting Refs.
 * 
 * Supports searching both local records and OLS ontologies based on config.
 */

import { useState, useRef, useEffect } from 'react'
import { useOLSSearch } from '../hooks/useOLSSearch'
import { olsResultToRef, type OLSSearchResult } from '../api/olsClient'
import { RefBadge, type Ref, type OntologyRef } from './RefBadge'

/**
 * RefPicker props
 */
export interface RefPickerProps {
  /** Current selected value */
  value?: Ref | null
  /** Called when value changes */
  onChange: (ref: Ref | null) => void
  /** OLS ontologies to search */
  olsOntologies?: string[]
  /** Placeholder text */
  placeholder?: string
  /** Label for the field */
  label?: string
  /** Whether the picker is disabled */
  disabled?: boolean
  /** Minimum query length to trigger search */
  minQueryLength?: number
  /** Maximum results to show */
  maxResults?: number
  /** Error message */
  error?: string
  /** Additional class names */
  className?: string
}

/**
 * Search icon SVG
 */
function SearchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

/**
 * Spinner icon SVG
 */
function SpinnerIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )
}

/**
 * RefPicker component
 */
export function RefPicker({
  value,
  onChange,
  olsOntologies = [],
  placeholder = 'Search...',
  label,
  disabled = false,
  minQueryLength = 2,
  maxResults = 10,
  error,
  className = '',
}: RefPickerProps) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  
  // OLS search hook
  const {
    results: olsResults,
    loading: olsLoading,
    fromCache,
  } = useOLSSearch({
    query,
    ontologies: olsOntologies,
    enabled: query.length >= minQueryLength && olsOntologies.length > 0,
    minQueryLength,
    maxResults,
  })
  
  // Convert OLS results to refs
  const suggestions: Ref[] = olsResults.map((r: OLSSearchResult) => olsResultToRef(r) as OntologyRef)
  
  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (inputRef.current && !inputRef.current.contains(target) && 
          listRef.current && !listRef.current.contains(target)) {
        setIsOpen(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[focusedIndex] as HTMLElement
      item?.scrollIntoView({ block: 'nearest' })
    }
  }, [focusedIndex])
  
  // Handle keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (focusedIndex >= 0 && suggestions[focusedIndex]) {
        selectRef(suggestions[focusedIndex])
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }
  
  // Select a ref
  function selectRef(ref: Ref) {
    onChange(ref)
    setQuery('')
    setIsOpen(false)
    setFocusedIndex(-1)
  }
  
  // Clear selection
  function clearSelection() {
    onChange(null)
    setQuery('')
    inputRef.current?.focus()
  }
  
  const showDropdown = isOpen && query.length >= minQueryLength
  
  return (
    <div className={`relative ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      
      {/* Selected value display */}
      {value && (
        <div className="mb-2">
          <RefBadge value={value} onRemove={clearSelection} />
        </div>
      )}
      
      {/* Search input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ color: '#9ca3af' }}>
          {olsLoading ? (
            <SpinnerIcon size={16} />
          ) : (
            <SearchIcon size={16} />
          )}
        </div>
        
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsOpen(true)
            setFocusedIndex(-1)
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`
            block w-full pl-10 pr-3 py-2 
            border rounded-md shadow-sm
            text-sm
            ${error ? 'border-red-300' : 'border-gray-300'}
            ${disabled ? 'bg-gray-100' : 'bg-white'}
            focus:outline-none focus:ring-1 
            ${error ? 'focus:ring-red-500 focus:border-red-500' : 'focus:ring-blue-500 focus:border-blue-500'}
          `}
        />
        
        {fromCache && query.length >= minQueryLength && (
          <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-gray-400">
            cached
          </span>
        )}
      </div>
      
      {/* Error message */}
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
      
      {/* Dropdown */}
      {showDropdown && (
        <ul
          ref={listRef}
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 1000,
            marginTop: '4px',
            width: '100%',
            minWidth: '280px',
            backgroundColor: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
            maxHeight: '300px',
            overflowY: 'auto',
            padding: '4px 0',
          }}
        >
          {olsResults.length === 0 && !olsLoading && (
            <li style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '0.875rem' }}>
              No results found
            </li>
          )}
          
          {olsLoading && olsResults.length === 0 && (
            <li style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <SpinnerIcon size={16} />
              Searching ontologies...
            </li>
          )}
          
          {olsResults.map((result, index) => {
            const ref = suggestions[index]
            const description = result.description?.[0] || null
            
            return (
              <li
                key={result.obo_id}
                role="option"
                aria-selected={focusedIndex === index}
                title={description || undefined}
                style={{
                  padding: '10px 16px',
                  cursor: 'pointer',
                  backgroundColor: focusedIndex === index ? '#eff6ff' : 'white',
                  borderBottom: index < olsResults.length - 1 ? '1px solid #f1f5f9' : 'none',
                  transition: 'background-color 0.1s ease',
                }}
                onMouseEnter={() => setFocusedIndex(index)}
                onClick={() => selectRef(ref)}
              >
                {/* Term label - bold and colored */}
                <div style={{ 
                  fontWeight: 600, 
                  fontSize: '0.9rem', 
                  color: '#1e40af',
                  marginBottom: '2px',
                }}>
                  {result.label}
                </div>
                
                {/* CURIE ID - styled badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    backgroundColor: '#f0fdf4',
                    color: '#166534',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    borderRadius: '4px',
                    border: '1px solid #bbf7d0',
                  }}>
                    {result.obo_id}
                  </span>
                  <span style={{
                    fontSize: '0.7rem',
                    color: '#9ca3af',
                    textTransform: 'uppercase',
                    letterSpacing: '0.025em',
                  }}>
                    {result.ontology_name}
                  </span>
                </div>
                
                {/* Description preview - truncated */}
                {description && (
                  <div style={{
                    fontSize: '0.75rem',
                    color: '#64748b',
                    marginTop: '6px',
                    lineHeight: '1.4',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}>
                    {description}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default RefPicker
