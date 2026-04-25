/**
 * MaterialPicker — Local-first search dropdown for selecting materials.
 *
 * Defaults to biologist-facing choices:
 *   - Saved stocks / formulations first
 *   - Existing prepared materials only when explicitly expanded
 *   - Concept-only fallback after that
 */

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { RefBadge } from '../../shared/ref'
import type { Ref, OntologyRef, RecordRef } from '../../shared/ref'
import { olsResultToRef } from '../../shared/api/olsClient'
import { apiClient } from '../../shared/api/client'
import { useMaterialSearch } from '../hooks/useMaterialSearch'
import type { MaterialSearchItem, MaterialSmartSearchResult, VendorSearchResult, VendorName } from '../../shared/api/client'
import { formatConcentration } from '../../types/material'
import { MaterialBuilderModal } from './MaterialBuilderModal'
import { MaterialIntentModal } from './MaterialIntentModal'
import { VendorProductBuilderModal } from './VendorProductBuilderModal'
import { MaterialInstanceBuilderModal } from './MaterialInstanceBuilderModal'
import { BiologicalMaterialBuilderModal } from './BiologicalMaterialBuilderModal'
import { DerivedMaterialBuilderModal } from './DerivedMaterialBuilderModal'

const VENDOR_DISPLAY_NAMES: Record<VendorName, string> = {
  thermo: 'Thermo Fisher',
  sigma: 'Sigma-Aldrich',
  fisher: 'Fisher Scientific',
  vwr: 'VWR',
  cayman: 'Cayman Chemical',
  thomas: 'Thomas Scientific',
}

const VENDOR_SEARCH_VENDORS: VendorName[] = ['thermo', 'sigma', 'fisher', 'vwr', 'cayman', 'thomas']

export interface MaterialPickerProps {
  value?: Ref | null
  onChange: (ref: Ref | null) => void
  placeholder?: string
  disabled?: boolean
  minQueryLength?: number
  maxResults?: number
  localKinds?: string[]
  className?: string
  allowCreateLocal?: boolean
  focusKey?: number
  primaryKinds?: string[]
  preparedKinds?: string[]
  secondaryKinds?: string[]
  primarySectionLabel?: string
  secondarySectionLabel?: string
  preparedSectionLabel?: string
  ontologySelectionMode?: 'create-material' | 'route'
  onCreateFormulationFromOntology?: (ref: OntologyRef) => void
}

function orderLocalResults(entries: MaterialSearchItem[]): MaterialSearchItem[] {
  const rank = new Map([
    ['saved-stock', 0],
    ['vendor-reagent', 1],
    ['prepared-material', 2],
    ['biological-derived', 3],
    ['concept-only', 4],
  ])
  return [...entries].sort((a, b) => {
    const aRank = rank.get(a.category) ?? 10
    const bRank = rank.get(b.category) ?? 10
    if (aRank !== bRank) return aRank - bRank
    return (a.title || a.recordId).localeCompare(b.title || b.recordId)
  })
}

function kindBadgeLabel(kind?: string): string {
  if (kind === 'material-spec') return 'Saved Stock'
  if (kind === 'vendor-product') return 'Vendor Reagent'
  if (kind === 'material-instance') return 'Prepared Tube/Plate'
  if (kind === 'aliquot') return 'Prepared Tube/Plate'
  if (kind === 'material') return 'Concept Only'
  return kind || 'Record'
}

function kindSubtitle(kind?: string): string | null {
  if (kind === 'material-spec') return 'Saved stock or formulation'
  if (kind === 'vendor-product') return 'Commercial reagent linked to a material concept'
  if (kind === 'material-instance') return 'Existing prepared material'
  if (kind === 'aliquot') return 'Existing prepared material'
  if (kind === 'material') return 'Bare concept record'
  return null
}

function isImplicitAliquot(entry: MaterialSearchItem): boolean {
  if (entry.kind !== 'aliquot' && entry.kind !== 'material-instance') return false
  const title = (entry.title || '').trim().toLowerCase()
  const recordId = entry.recordId.trim().toLowerCase()
  return title.startsWith('ad hoc instance of ')
    || title.includes('implicit')
    || recordId.startsWith('alq-implicit-')
    || recordId.startsWith('minst-implicit-')
}

function SearchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function SpinnerIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ animation: 'mat-picker-spin 1s linear infinite' }}>
      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )
}

function DatabaseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14a9 3 0 0018 0V5" />
      <path d="M3 12a9 3 0 0018 0" />
    </svg>
  )
}

function PlusCircleIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  )
}

function ResultRow({
  entry,
  focused,
  index,
  onSelect,
  onFocus,
  borderColor,
  badgeBackground,
  badgeColor,
  subtitleOverride,
}: {
  entry: MaterialSearchItem
  focused: boolean
  index: number
  onSelect: (entry: MaterialSearchItem) => void
  onFocus: (index: number) => void
  borderColor: string
  badgeBackground: string
  badgeColor: string
  subtitleOverride?: string | null
}) {
  return (
    <div
      data-option
      role="option"
      aria-selected={focused}
      onClick={() => onSelect(entry)}
      onMouseEnter={() => onFocus(index)}
      style={{
        padding: '8px 12px',
        cursor: 'pointer',
        backgroundColor: focused ? '#f8fafc' : 'white',
        borderLeft: `3px solid ${borderColor}`,
        transition: 'background-color 0.1s',
      }}
    >
      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#334155' }}>
        {entry.title ?? entry.recordId}
      </div>
      {(subtitleOverride ?? kindSubtitle(entry.kind)) && (
        <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: '1px' }}>
          {subtitleOverride ?? kindSubtitle(entry.kind)}
        </div>
      )}
      <div
        style={{
          fontSize: '0.7rem',
          color: '#64748b',
          display: 'flex',
          gap: '6px',
          alignItems: 'center',
          marginTop: '1px',
        }}
      >
        <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
          {entry.recordId}
        </span>
        {entry.kind && (
          <span
            style={{
              padding: '1px 6px',
              borderRadius: '999px',
              backgroundColor: badgeBackground,
              color: badgeColor,
              fontSize: '0.62rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {kindBadgeLabel(entry.kind)}
          </span>
        )}
      </div>
    </div>
  )
}

export function MaterialPicker({
  value,
  onChange,
  placeholder = 'Search saved stocks, prepared tubes, or concepts...',
  disabled = false,
  minQueryLength = 2,
  maxResults = 10,
  localKinds = ['material'],
  className = '',
  allowCreateLocal = false,
  focusKey,
  primarySectionLabel = 'Saved Stocks / Formulations',
  secondarySectionLabel = 'Concept Only',
  preparedSectionLabel = 'Existing Prepared Tubes / Plates',
  ontologySelectionMode = 'create-material',
  onCreateFormulationFromOntology,
}: MaterialPickerProps) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [modalRef, setModalRef] = useState<OntologyRef | null>(null)
  const [localCreateName, setLocalCreateName] = useState('')
  const [intentRef, setIntentRef] = useState<OntologyRef | null>(null)
  const [vendorProductSeed, setVendorProductSeed] = useState<{ ontologyRef: OntologyRef | null; result: VendorSearchResult | null } | null>(null)
  const [preparedMaterialRef, setPreparedMaterialRef] = useState<OntologyRef | null>(null)
  const [biologicalMaterialRef, setBiologicalMaterialRef] = useState<OntologyRef | null>(null)
  const [derivedMaterialRef, setDerivedMaterialRef] = useState<OntologyRef | null>(null)
  const [showPreparedMaterials, setShowPreparedMaterials] = useState(false)
  const [showConcepts, setShowConcepts] = useState(false)
  const [liveVendorResults, setLiveVendorResults] = useState<VendorSearchResult[]>([])
  const [liveVendorLoading, setLiveVendorLoading] = useState(false)
  const [aiSearchResults, setAiSearchResults] = useState<MaterialSmartSearchResult[]>([])
  const [aiSearchLoading, setAiSearchLoading] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const { localResults, olsResults, olsLoading, loading, olsFromCache } = useMaterialSearch({
    query,
    enabled: query.length >= minQueryLength,
    minQueryLength,
    maxResults,
    localKinds,
  })

  const orderedLocalResults = orderLocalResults(localResults)
  const formulationResults = orderedLocalResults.filter((entry) => entry.category === 'saved-stock')
  const vendorResults = orderedLocalResults.filter((entry) => entry.category === 'vendor-reagent')
  const preparedResults = orderedLocalResults.filter((entry) => entry.category === 'prepared-material')
  const biologicalDerivedResults = orderedLocalResults.filter((entry) => entry.category === 'biological-derived')
  const conceptResults = orderedLocalResults.filter((entry) => entry.category === 'concept-only')
  const visiblePreparedResults = showPreparedMaterials ? preparedResults : []
  const visibleConceptResults = showConcepts || (formulationResults.length === 0 && preparedResults.length === 0 && vendorResults.length === 0 && biologicalDerivedResults.length === 0 && olsResults.length === 0)
    ? conceptResults
    : []
  const visibleLocalResults = [
    ...formulationResults,
    ...vendorResults,
    ...visiblePreparedResults,
    ...biologicalDerivedResults,
    ...visibleConceptResults,
  ]
  const totalItems = visibleLocalResults.length + liveVendorResults.length + olsResults.length

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (containerRef.current && !containerRef.current.contains(target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-option]')
      const el = items[focusedIndex] as HTMLElement | undefined
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [focusedIndex])

  useEffect(() => {
    if (focusKey === undefined || value) return
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [focusKey, value])

  useEffect(() => {
    if (!isOpen || query.length < minQueryLength) {
      setLiveVendorResults([])
      setLiveVendorLoading(false)
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      setLiveVendorLoading(true)
      try {
        const response = await apiClient.searchVendorProducts({ q: query.trim(), vendors: ['thermo', 'sigma', 'fisher', 'vwr', 'cayman', 'thomas'], limit: Math.min(maxResults, 6) })
        if (!cancelled) setLiveVendorResults(response.items)
      } catch {
        if (!cancelled) setLiveVendorResults([])
      } finally {
        if (!cancelled) setLiveVendorLoading(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [isOpen, maxResults, minQueryLength, query])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex((i) => Math.min(i + 1, totalItems - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (focusedIndex >= 0) selectByIndex(focusedIndex)
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  function selectByIndex(index: number) {
    if (index < visibleLocalResults.length) {
      selectLocal(visibleLocalResults[index])
    } else {
      const liveVendorIndex = index - visibleLocalResults.length
      if (liveVendorIndex >= 0 && liveVendorIndex < liveVendorResults.length) {
        selectLiveVendor(liveVendorResults[liveVendorIndex])
        return
      }
      const olsIndex = index - visibleLocalResults.length - liveVendorResults.length
      if (olsIndex < olsResults.length) selectOLS(olsResults[olsIndex])
    }
  }

  function selectLocal(entry: MaterialSearchItem) {
    const ref: RecordRef = {
      kind: 'record',
      id: entry.recordId,
      type: entry.kind || 'material',
      label: entry.title ?? entry.recordId,
    }
    onChange(ref)
    setQuery('')
    setIsOpen(false)
    setFocusedIndex(-1)
  }

  function selectOLS(result: typeof olsResults[number]) {
    const ref = olsResultToRef(result) as OntologyRef
    if (ontologySelectionMode === 'route') {
      setIntentRef(ref)
    } else {
      setModalRef(ref)
    }
    setLocalCreateName('')
    setQuery('')
    setIsOpen(false)
    setFocusedIndex(-1)
  }

  function openLocalCreate(name: string) {
    setLocalCreateName(name.trim())
    setModalRef(null)
    setQuery('')
    setIsOpen(false)
    setFocusedIndex(-1)
  }

  function selectLiveVendor(result: VendorSearchResult) {
    const ontologyRef = olsResults.length > 0 ? (olsResultToRef(olsResults[0]) as OntologyRef) : null
    setVendorProductSeed({ ontologyRef, result })
    setLocalCreateName('')
    setQuery('')
    setIsOpen(false)
    setFocusedIndex(-1)
  }

  function handleModalSave(ref: RecordRef) {
    onChange(ref)
    setModalRef(null)
    setLocalCreateName('')
    setIntentRef(null)
    setVendorProductSeed(null)
  }

  function clearSelection() {
    onChange(null)
    setQuery('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const showDropdown = isOpen && query.length >= minQueryLength
  const showCreateLocal = allowCreateLocal && query.trim().length >= minQueryLength
  const hasVisibleResults = visibleLocalResults.length > 0 || liveVendorResults.length > 0 || olsResults.length > 0

  return (
    <div ref={containerRef} className={`relative ${className}`} style={{ minWidth: 0 }}>
      {value ? (
        <RefBadge value={value} size="sm" onRemove={clearSelection} showExternalLink={false} />
      ) : (
        <div className="relative">
          <div
            style={{
              position: 'absolute',
              inset: '0 auto 0 0',
              width: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              color: '#9ca3af',
            }}
          >
            {loading ? <SpinnerIcon size={14} /> : <SearchIcon size={14} />}
          </div>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setIsOpen(true)
              setFocusedIndex(-1)
              setShowPreparedMaterials(false)
              setShowConcepts(false)
            }}
            onFocus={() => {
              if (query.length >= minQueryLength) setIsOpen(true)
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            style={{
              height: '28px',
              width: '100%',
              paddingLeft: '28px',
              paddingRight: '6px',
              border: '1px solid #dee2e6',
              borderRadius: '4px',
              fontSize: '0.85rem',
              outline: 'none',
              background: disabled ? '#f1f3f5' : 'white',
            }}
          />

          {olsFromCache && query.length >= minQueryLength && (
            <span
              style={{
                position: 'absolute',
                right: '6px',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '0.65rem',
                color: '#adb5bd',
              }}
            >
              cached
            </span>
          )}
        </div>
      )}

      {showDropdown && (
        <div
          ref={listRef}
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 1000,
            marginTop: '4px',
            width: '320px',
            backgroundColor: 'white',
            border: '1px solid #d0d5dd',
            borderRadius: '8px',
            boxShadow: '0 12px 28px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)',
            maxHeight: '360px',
            overflowY: 'auto',
          }}
        >
          {!hasVisibleResults && !loading && !liveVendorLoading && !showCreateLocal && preparedResults.length === 0 && aiSearchResults.length === 0 && (
            <div style={{ padding: '16px', color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center' }}>
              No results found
              <div style={{ marginTop: '8px' }}>
                <button
                  onClick={async () => {
                    setAiSearchLoading(true)
                    try {
                      const response = await apiClient.smartSearchMaterials({ query, includeOntology: true, includeVendor: true })
                      setAiSearchResults(response.results)
                    } catch { /* ignore */ } finally { setAiSearchLoading(false) }
                  }}
                  disabled={aiSearchLoading}
                  style={{
                    padding: '4px 12px', fontSize: '0.75rem', fontWeight: 500,
                    borderRadius: '4px', border: '1px solid #93c5fd', backgroundColor: '#eff6ff',
                    color: '#2563eb', cursor: aiSearchLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {aiSearchLoading ? 'Searching...' : 'Try AI Search'}
                </button>
              </div>
            </div>
          )}

          {aiSearchResults.length > 0 && (
            <div style={{ borderBottom: '2px solid #e2e8f0' }}>
              <div style={{ padding: '6px 12px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#7c3aed', backgroundColor: '#f5f3ff' }}>
                AI Search Results
              </div>
              {aiSearchResults.map((r, i) => {
                const name = typeof r.record.name === 'string' ? r.record.name : typeof r.record.label === 'string' ? r.record.label : 'Unknown'
                return (
                  <div
                    key={i}
                    style={{ padding: '8px 12px', cursor: 'pointer', borderLeft: '3px solid #7c3aed', fontSize: '0.8rem' }}
                    onClick={() => {
                      if (r.source === 'local' && typeof r.record.recordId === 'string') {
                        onChange({ kind: 'record', id: r.record.recordId, type: String(r.record.kind || 'material'), label: name })
                        setIsOpen(false)
                        setQuery('')
                        setAiSearchResults([])
                      } else if (r.source === 'ontology') {
                        const ref: OntologyRef = {
                          kind: 'ontology',
                          id: String(r.record.id || r.record.obo_id || ''),
                          namespace: String(r.record.namespace || r.record.ontology_name || ''),
                          label: name,
                        }
                        if (ontologySelectionMode === 'route') {
                          setIntentRef(ref)
                        } else {
                          setModalRef(ref)
                        }
                        setIsOpen(false)
                        setQuery('')
                        setAiSearchResults([])
                      } else if (r.source === 'vendor') {
                        setVendorProductSeed({ ontologyRef: null, result: null })
                        setLocalCreateName(name)
                        setIsOpen(false)
                        setQuery('')
                        setAiSearchResults([])
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 600, color: '#334155' }}>{name}</span>
                      <span style={{
                        padding: '1px 6px', borderRadius: '999px', fontSize: '0.6rem', fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                        backgroundColor: r.source === 'local' ? '#ecfdf5' : r.source === 'ontology' ? '#eff6ff' : '#faf5ff',
                        color: r.source === 'local' ? '#047857' : r.source === 'ontology' ? '#1d4ed8' : '#7c3aed',
                      }}>
                        {r.source === 'local' ? 'Local' : r.source === 'ontology' ? 'Ontology' : 'Vendor'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#7c3aed', marginTop: '2px' }}>{r.matchReason}</div>
                  </div>
                )
              })}
            </div>
          )}

          {!hasVisibleResults && (loading || liveVendorLoading) && (
            <div style={{ padding: '16px', color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <SpinnerIcon size={16} />
              Searching...
            </div>
          )}

          {formulationResults.length > 0 && (
            <div style={{ borderBottom: '2px solid #e2e8f0' }}>
              <div style={{
                padding: '6px 12px',
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#3b82f6',
                backgroundColor: '#eff6ff',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}>
                <DatabaseIcon size={12} />
                {primarySectionLabel}
              </div>
              {formulationResults.map((entry, index) => (
                <ResultRow
                  key={entry.recordId}
                  entry={entry}
                  index={index}
                  focused={focusedIndex === index}
                  onSelect={selectLocal}
                  onFocus={setFocusedIndex}
                  borderColor="#3b82f6"
                  badgeBackground="#eff6ff"
                  badgeColor="#1d4ed8"
                />
              ))}
            </div>
          )}

          {vendorResults.length > 0 && (
            <div style={{ borderBottom: visiblePreparedResults.length > 0 || biologicalDerivedResults.length > 0 || visibleConceptResults.length > 0 || olsResults.length > 0 || olsLoading || showCreateLocal ? '2px solid #e2e8f0' : 'none' }}>
              <div style={{
                padding: '6px 12px',
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#047857',
                backgroundColor: '#ecfdf5',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}>
                <DatabaseIcon size={12} />
                Vendor Reagents
              </div>
              {vendorResults.map((entry, index) => (
                <ResultRow
                  key={entry.recordId}
                  entry={entry}
                  index={formulationResults.length + index}
                  focused={focusedIndex === formulationResults.length + index}
                  onSelect={selectLocal}
                  onFocus={setFocusedIndex}
                  borderColor="#10b981"
                  badgeBackground="#ecfdf5"
                  badgeColor="#047857"
                />
              ))}
            </div>
          )}

          {(liveVendorResults.length > 0 || liveVendorLoading) && (
            <div style={{ borderBottom: visiblePreparedResults.length > 0 || biologicalDerivedResults.length > 0 || visibleConceptResults.length > 0 || olsResults.length > 0 || olsLoading || showCreateLocal ? '2px solid #e2e8f0' : 'none' }}>
              <div style={{
                padding: '6px 12px',
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#047857',
                backgroundColor: '#ecfdf5',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}>
                <PlusCircleIcon size={12} />
                Live Vendor Matches
              </div>
              {liveVendorLoading && liveVendorResults.length === 0 ? (
                <div style={{ padding: '10px 12px', color: '#047857', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <SpinnerIcon size={14} />
                  Searching vendor catalogs...
                </div>
              ) : liveVendorResults.map((result, index) => {
                const combinedIndex = visibleLocalResults.length + index
                return (
                  <div
                    key={`${result.vendor}-${result.catalogNumber}-${index}`}
                    data-option
                    role="option"
                    aria-selected={focusedIndex === combinedIndex}
                    onClick={() => selectLiveVendor(result)}
                    onMouseEnter={() => setFocusedIndex(combinedIndex)}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      backgroundColor: focusedIndex === combinedIndex ? '#ecfdf5' : 'white',
                      borderLeft: '3px solid #10b981',
                      borderBottom: index < liveVendorResults.length - 1 ? '1px solid #f1f5f9' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#065f46' }}>{result.name}</span>
                      <span style={{
                        padding: '1px 6px',
                        borderRadius: '999px',
                        backgroundColor: result.vendor === 'thermo' ? '#fef2f2' : result.vendor === 'sigma' ? '#eff6ff' : result.vendor === 'fisher' ? '#f5f3ff' : result.vendor === 'vwr' ? '#fff7ed' : result.vendor === 'cayman' ? '#f0fdfa' : '#eef2ff',
                        color: result.vendor === 'thermo' ? '#b91c1c' : result.vendor === 'sigma' ? '#1d4ed8' : result.vendor === 'fisher' ? '#7c3aed' : result.vendor === 'vwr' ? '#c2410c' : result.vendor === 'cayman' ? '#0f766e' : '#4338ca',
                        fontSize: '0.62rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}>
                        {VENDOR_DISPLAY_NAMES[result.vendor]}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: '1px' }}>
                      Catalog {result.catalogNumber}{result.grade ? ` · ${result.grade}` : ''}
                    </div>
                    {result.declaredConcentration && (
                      <div style={{ fontSize: '0.7rem', color: '#047857', marginTop: '1px' }}>
                        Declared {formatConcentration(result.declaredConcentration)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {preparedResults.length > 0 && !showPreparedMaterials && (
            <div style={{ borderBottom: conceptResults.length > 0 || olsResults.length > 0 || biologicalDerivedResults.length > 0 || olsLoading || showCreateLocal ? '2px solid #e2e8f0' : 'none' }}>
              <button
                type="button"
                onClick={() => setShowPreparedMaterials(true)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 12px',
                  border: 'none',
                  backgroundColor: '#f8fafc',
                  color: '#334155',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Show existing prepared tubes/plates ({preparedResults.length})
              </button>
            </div>
          )}

          {visiblePreparedResults.length > 0 && (
            <div style={{ borderBottom: conceptResults.length > 0 || biologicalDerivedResults.length > 0 || olsResults.length > 0 || olsLoading || showCreateLocal ? '2px solid #e2e8f0' : 'none' }}>
              <div style={{
                padding: '6px 12px',
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#475569',
                backgroundColor: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}>
                <span>{preparedSectionLabel}</span>
                <button
                  type="button"
                  onClick={() => setShowPreparedMaterials(false)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#64748b',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Hide
                </button>
              </div>
              {visiblePreparedResults.map((entry, index) => {
                const combinedIndex = formulationResults.length + vendorResults.length + index
                return (
                  <ResultRow
                    key={entry.recordId}
                    entry={entry}
                    index={combinedIndex}
                    focused={focusedIndex === combinedIndex}
                    onSelect={selectLocal}
                    onFocus={setFocusedIndex}
                    borderColor="#94a3b8"
                    badgeBackground="#f1f5f9"
                    badgeColor="#475569"
                    subtitleOverride={isImplicitAliquot(entry) ? 'Ad hoc prepared material from prior event use' : undefined}
                  />
                )
              })}
            </div>
          )}

          {biologicalDerivedResults.length > 0 && (
            <div style={{ borderTop: formulationResults.length > 0 || vendorResults.length > 0 || visiblePreparedResults.length > 0 || olsResults.length > 0 || olsLoading || showCreateLocal ? '2px solid #e2e8f0' : 'none' }}>
              <div style={{
                padding: '6px 12px',
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#7c3aed',
                backgroundColor: '#f5f3ff',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}>
                <DatabaseIcon size={12} />
                Biological / Derived Materials
              </div>
              {biologicalDerivedResults.map((entry, idx) => {
                const combinedIndex = formulationResults.length + vendorResults.length + visiblePreparedResults.length + idx
                return (
                  <ResultRow
                    key={entry.recordId}
                    entry={entry}
                    index={combinedIndex}
                    focused={focusedIndex === combinedIndex}
                    onSelect={selectLocal}
                    onFocus={setFocusedIndex}
                    borderColor="#8b5cf6"
                    badgeBackground="#f5f3ff"
                    badgeColor="#6d28d9"
                  />
                )
              })}
            </div>
          )}

          {conceptResults.length > 0 && !visibleConceptResults.length && (
            <div style={{ borderTop: formulationResults.length > 0 || vendorResults.length > 0 || visiblePreparedResults.length > 0 || biologicalDerivedResults.length > 0 || olsResults.length > 0 || olsLoading || showCreateLocal ? '2px solid #e2e8f0' : 'none' }}>
              <button
                type="button"
                onClick={() => setShowConcepts(true)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 12px',
                  border: 'none',
                  backgroundColor: '#f8fafc',
                  color: '#475569',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {secondarySectionLabel} ({conceptResults.length})
              </button>
            </div>
          )}

          {visibleConceptResults.length > 0 && (
            <div style={{ borderTop: formulationResults.length > 0 || vendorResults.length > 0 || visiblePreparedResults.length > 0 || biologicalDerivedResults.length > 0 || olsResults.length > 0 || olsLoading || showCreateLocal ? '2px solid #e2e8f0' : 'none' }}>
              {(showConcepts || formulationResults.length > 0 || vendorResults.length > 0 || preparedResults.length > 0 || biologicalDerivedResults.length > 0 || olsResults.length > 0) && (
                <div style={{
                  padding: '6px 12px',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: '#475569',
                  backgroundColor: '#f8fafc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}>
                  <span>{secondarySectionLabel}</span>
                  {showConcepts && (
                    <button
                      type="button"
                      onClick={() => setShowConcepts(false)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: '#64748b',
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      Hide
                    </button>
                  )}
                </div>
              )}
              {visibleConceptResults.map((entry, idx) => {
                const combinedIndex = formulationResults.length + vendorResults.length + visiblePreparedResults.length + biologicalDerivedResults.length + idx
                return (
                  <ResultRow
                    key={entry.recordId}
                    entry={entry}
                    index={combinedIndex}
                    focused={focusedIndex === combinedIndex}
                    onSelect={selectLocal}
                    onFocus={setFocusedIndex}
                    borderColor="#94a3b8"
                    badgeBackground="#f1f5f9"
                    badgeColor="#475569"
                  />
                )
              })}
            </div>
          )}

          {showCreateLocal && (
            <div style={{ borderTop: hasVisibleResults ? '2px solid #e2e8f0' : 'none' }}>
              <div style={{
                padding: '6px 12px',
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#0f766e',
                backgroundColor: '#ecfeff',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}>
                <PlusCircleIcon size={12} />
                Create Local Material
              </div>
              <div
                data-option
                role="option"
                onClick={() => openLocalCreate(query)}
                style={{
                  padding: '10px 12px',
                  cursor: 'pointer',
                  borderLeft: '3px solid #0f766e',
                  backgroundColor: 'white',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#115e59' }}>
                  Create local material "{query.trim()}"
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                  Use when this ingredient is specific to your lab or not represented in an ontology.
                </div>
              </div>
            </div>
          )}

          {hasVisibleResults && totalItems < 3 && !aiSearchLoading && aiSearchResults.length === 0 && query.trim().length >= minQueryLength && (
            <div style={{ padding: '8px 12px', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
              <button
                onClick={async () => {
                  setAiSearchLoading(true)
                  try {
                    const response = await apiClient.smartSearchMaterials({ query: query.trim(), includeOntology: true, includeVendor: true })
                    setAiSearchResults(response.results)
                  } catch { /* ignore */ } finally { setAiSearchLoading(false) }
                }}
                style={{
                  padding: '4px 12px', fontSize: '0.75rem', fontWeight: 500,
                  borderRadius: '4px', border: '1px solid #93c5fd', backgroundColor: '#eff6ff',
                  color: '#2563eb', cursor: 'pointer',
                }}
              >
                Try AI Search for more results
              </button>
            </div>
          )}

          {olsResults.length > 0 && (
            <div>
              <div style={{
                padding: '6px 12px',
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#7c3aed',
                backgroundColor: '#f5f3ff',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}>
                <PlusCircleIcon size={12} />
                Create from Ontology
              </div>
              {olsResults.map((result, olsIdx) => {
                const combinedIndex = visibleLocalResults.length + liveVendorResults.length + olsIdx
                const description = result.description?.[0] ?? null
                return (
                  <div
                    key={result.obo_id}
                    data-option
                    role="option"
                    aria-selected={focusedIndex === combinedIndex}
                    title={description ?? undefined}
                    onClick={() => selectOLS(result)}
                    onMouseEnter={() => setFocusedIndex(combinedIndex)}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      backgroundColor: focusedIndex === combinedIndex ? '#ede9fe' : 'white',
                      borderLeft: '3px solid #7c3aed',
                      borderBottom: olsIdx < olsResults.length - 1 ? '1px solid #f1f5f9' : 'none',
                      transition: 'background-color 0.1s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#5b21b6' }}>
                        {result.label}
                      </span>
                      <span style={{
                        padding: '1px 6px',
                        backgroundColor: '#f0fdf4',
                        color: '#166534',
                        fontSize: '0.65rem',
                        fontWeight: 500,
                        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                        borderRadius: '3px',
                        border: '1px solid #bbf7d0',
                        flexShrink: 0,
                      }}>
                        {result.obo_id}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                      <span style={{
                        fontSize: '0.65rem',
                        color: '#a78bfa',
                        textTransform: 'uppercase',
                        letterSpacing: '0.03em',
                        fontWeight: 600,
                      }}>
                        {result.ontology_name}
                      </span>
                      {description && (
                        <span style={{
                          fontSize: '0.7rem',
                          color: '#94a3b8',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {description}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {visibleLocalResults.length > 0 && olsLoading && olsResults.length === 0 && (
            <>
              <div style={{
                padding: '6px 12px',
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#7c3aed',
                backgroundColor: '#f5f3ff',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}>
                <PlusCircleIcon size={12} />
                Create from Ontology
              </div>
              <div style={{ padding: '10px 12px', color: '#a78bfa', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <SpinnerIcon size={14} />
                Searching ontologies...
              </div>
            </>
          )}
        </div>
      )}

      {(modalRef || localCreateName) && createPortal(
        <MaterialBuilderModal
          isOpen={true}
          onClose={() => {
            setModalRef(null)
            setLocalCreateName('')
          }}
          primaryRef={modalRef}
          initialName={localCreateName}
          onSave={handleModalSave}
        />,
        document.body,
      )}

      {intentRef && createPortal(
        <MaterialIntentModal
          isOpen={true}
          ontologyRef={intentRef}
          onClose={() => setIntentRef(null)}
          onCreateFormulation={() => {
            if (onCreateFormulationFromOntology) onCreateFormulationFromOntology(intentRef)
            setIntentRef(null)
          }}
          onAddVendorProduct={() => {
            setVendorProductSeed({ ontologyRef: intentRef, result: null })
            setIntentRef(null)
          }}
          onCreatePreparedMaterial={() => {
            setPreparedMaterialRef(intentRef)
            setIntentRef(null)
          }}
          onCreateBiologicalMaterial={() => {
            setBiologicalMaterialRef(intentRef)
            setIntentRef(null)
          }}
          onCreateDerivedMaterial={() => {
            setDerivedMaterialRef(intentRef)
            setIntentRef(null)
          }}
          onCreateLocalConcept={() => {
            setModalRef(intentRef)
            setIntentRef(null)
          }}
          onUseBareConcept={() => {
            onChange(intentRef)
            setIntentRef(null)
          }}
        />,
        document.body,
      )}

      {preparedMaterialRef && createPortal(
        <MaterialInstanceBuilderModal
          isOpen={true}
          sourceRef={preparedMaterialRef}
          onClose={() => setPreparedMaterialRef(null)}
          onSave={(ref) => {
            onChange(ref)
            setPreparedMaterialRef(null)
          }}
        />,
        document.body,
      )}

      {biologicalMaterialRef && createPortal(
        <BiologicalMaterialBuilderModal
          isOpen={true}
          primaryRef={biologicalMaterialRef}
          onClose={() => setBiologicalMaterialRef(null)}
          onSave={(ref) => {
            onChange(ref)
            setBiologicalMaterialRef(null)
          }}
        />,
        document.body,
      )}

      {derivedMaterialRef && createPortal(
        <DerivedMaterialBuilderModal
          isOpen={true}
          primaryRef={derivedMaterialRef}
          onClose={() => setDerivedMaterialRef(null)}
          onSave={(ref) => {
            onChange(ref)
            setDerivedMaterialRef(null)
          }}
        />,
        document.body,
      )}

      {vendorProductSeed && createPortal(
        <VendorProductBuilderModal
          isOpen={true}
          ontologyRef={vendorProductSeed.ontologyRef}
          initialSearchResult={vendorProductSeed.result}
          onClose={() => setVendorProductSeed(null)}
          onSave={(ref) => {
            onChange(ref)
            setVendorProductSeed(null)
          }}
        />,
        document.body,
      )}

      <style>{`
        @keyframes mat-picker-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
