/**
 * RefPicker - Combobox/autocomplete component for selecting Refs.
 *
 * Supports searching the backend resolve() spine (POST /api/resolve) which
 * implements a 5-tier resolution strategy (local records → OAK → OLS4 → vendor → mint).
 */

import { useState, useRef, useEffect } from 'react'
import { useResolveSearch } from '../hooks/useResolveSearch'
import { resolveCandidateToRef, tierBadge, type ResolveRef } from '../api/resolveUtil'
import { RefBadge, type Ref } from './RefBadge'
import { apiClient } from '../api/client'

/**
 * RefPicker props
 */
export interface RefPickerProps {
  /** Current selected value */
  value?: Ref | null
  /** Called when value changes */
  onChange: (ref: Ref | null) => void
  /** Legacy ontology scope. Backend resolve config is authoritative. */
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

/** Tier badge style helper */
function tierBadgeStyle(variant: string) {
  switch (variant) {
    case 'canonical':
      return 'bg-teal-50 text-teal-700'
    case 'local':
      return 'bg-emerald-50 text-emerald-600'
    case 'new':
      return 'bg-orange-50 text-orange-600'
    default:
      return 'bg-purple-50 text-purple-600'
  }
}

/**
 * RefPicker component
 */
export function RefPicker({
  value,
  onChange,
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

  // Resolve-spine search hook (replaces direct OLS4 calls)
  const {
    results: resolveResults,
    loading: resolveLoading,
  } = useResolveSearch({
    query,
    enabled: query.length >= minQueryLength,
    minQueryLength,
    maxResults,
  })

  const selectableResults = resolveResults.filter(
    (candidate) => candidate.source !== 'mint' && candidate.curie,
  )

  // Tier-5 mint affordance: the resolve() spine always appends a
  // `source: 'mint'` candidate (curie empty, carries { label }). Surface it as
  // a pinned-bottom "Create local term" row instead of discarding it, so a
  // user can explicitly mint a new local-namespace term when nothing matches —
  // matching the slash-menu resolver's tier-5 floor. Selecting it creates a
  // draft material record server-side and returns the minted record ref.
  const mintCandidate = resolveResults.find((candidate) => candidate.source === 'mint' && candidate.mint?.label)

  // Convert resolve results to refs
  const suggestions: ResolveRef[] = selectableResults.map((c) => resolveCandidateToRef(c))

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

  // The mint row is keyboard-reachable as one extra item after the suggestion
  // list. -1 = nothing focused; [0, suggestions.length-1] = suggestion rows;
  // mintIndex (=== suggestions.length) = the mint row, when present.
  const mintIndex = mintCandidate ? suggestions.length : -1
  const lastFocusable = mintCandidate ? suggestions.length : suggestions.length - 1

  // Handle keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex((i) => Math.min(i + 1, lastFocusable))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (focusedIndex >= 0 && suggestions[focusedIndex]) {
        selectRef(suggestions[focusedIndex])
      } else if (focusedIndex === mintIndex && mintCandidate) {
        void selectMint(mintCandidate.mint!.label)
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

  // Mint a new local-namespace term (tier 5): create a draft material record
  // server-side, then emit it as a local record ref. Mirrors the slash-menu
  // resolver's mint — tier-1 finds it on the next search.
  const [minting, setMinting] = useState(false)
  async function selectMint(label: string) {
    if (minting) return
    setMinting(true)
    try {
      const res = await apiClient.mintLocalTerm('material', label, label)
      selectRef({ kind: 'record', id: res.recordId, type: 'material', label: res.label })
    } catch (e) {
      console.error('[RefPicker] failed to mint local term', e)
      setIsOpen(false)
      setFocusedIndex(-1)
    } finally {
      setMinting(false)
    }
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
          {resolveLoading ? (
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
          {selectableResults.length === 0 && !resolveLoading && !mintCandidate && (
            <li style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '0.875rem' }}>
              No results found
            </li>
          )}

          {resolveLoading && selectableResults.length === 0 && (
            <li style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <SpinnerIcon size={16} />
              Searching ontologies...
            </li>
          )}

          {selectableResults.map((candidate, index) => {
            const ref = suggestions[index]
            const badge = tierBadge(candidate)
            const definition = candidate.definition || null

            return (
              <li
                key={candidate.curie}
                role="option"
                aria-selected={focusedIndex === index}
                title={definition || undefined}
                style={{
                  padding: '10px 16px',
                  cursor: 'pointer',
                  backgroundColor: focusedIndex === index ? '#eff6ff' : 'white',
                  borderBottom: index < selectableResults.length - 1 ? '1px solid #f1f5f9' : 'none',
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
                  {candidate.label}
                </div>

                {/* CURIE ID + tier badge */}
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
                    {candidate.curie}
                  </span>
                  <span style={{
                    fontSize: '0.7rem',
                    color: '#9ca3af',
                    textTransform: 'uppercase',
                    letterSpacing: '0.025em',
                  }}>
                    {candidate.namespace}
                  </span>
                  <span className={`text-[9px] ${tierBadgeStyle(badge.variant)} rounded px-1 py-0.5`}>
                    {badge.label}
                  </span>
                </div>

                {/* Definition preview - truncated */}
                {definition && (
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
                    {definition}
                  </div>
                )}
              </li>
            )
          })}
          {mintCandidate && (
            <li
              role="option"
              aria-selected={focusedIndex === mintIndex}
              onClick={() => selectMint(mintCandidate.mint!.label)}
              onMouseEnter={() => setFocusedIndex(mintIndex)}
              style={{
                padding: '10px 16px',
                cursor: minting ? 'wait' : 'pointer',
                borderTop: '1px solid #f1f5f9',
                backgroundColor: focusedIndex === mintIndex ? '#ffedd5' : '#fffbeb',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#b45309' }}>
                ＋ Create local term &quot;{mintCandidate.mint!.label}&quot;
              </div>
              <div style={{ fontSize: '0.75rem', color: '#92400e', marginTop: '2px' }}>
                {minting ? 'Creating…' : 'Mint a draft term into the lab namespace (tier 5 — last resort)'}
              </div>
            </li>
          )}
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
